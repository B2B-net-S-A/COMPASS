import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
    BUNDLE_SPEC,
    ExportError,
    IN_CHUNK,
    PAGE_SIZE,
    exportBundle,
    formatReport,
    insideGitRepo,
    parseArgs,
    resolveTables,
    writeBundle,
} from '../../../scripts/export-nexus-bundle.mjs'

// Eksport paczki `compass-bundle` v1 dla NEXUSA. Fałszywy klient Supabase, fikcyjne dane.

type Row = Record<string, unknown>
interface SelectCall { table: string; columns: string; filters: string[]; range?: [number, number] }

/** Minimalny PostgREST: projekcja kolumn, like/in, sortowanie, range. */
function fakeClient(tables: Record<string, Row[]>, opts: { missing?: string[]; nullData?: string[] } = {}) {
    const calls: SelectCall[] = []
    return {
        calls,
        from(table: string) {
            return {
                select(columns: string) {
                    const call: SelectCall = { table, columns, filters: [] }
                    calls.push(call)
                    let rows = [...(tables[table] ?? [])]
                    const orderKeys: string[] = []
                    const builder = {
                        like(column: string, pattern: string) {
                            call.filters.push(`like:${column}:${pattern}`)
                            const prefix = pattern.replace(/%$/, '')
                            rows = rows.filter((row) => String(row[column] ?? '').startsWith(prefix))
                            return builder
                        },
                        in(column: string, values: unknown[]) {
                            call.filters.push(`in:${column}:${values.length}`)
                            rows = rows.filter((row) => values.includes(row[column]))
                            return builder
                        },
                        order(column: string) {
                            orderKeys.push(column)
                            return builder
                        },
                        async range(from: number, to: number) {
                            call.range = [from, to]
                            if (opts.missing?.includes(table)) {
                                return { data: null, error: { code: 'PGRST205', message: `Could not find the table 'public.${table}'` } }
                            }
                            if (opts.nullData?.includes(table)) return { data: null, error: null }
                            const sorted = [...rows].sort((a, b) => {
                                for (const key of orderKeys) {
                                    const x = String(a[key]); const y = String(b[key])
                                    if (x !== y) return x < y ? -1 : 1
                                }
                                return 0
                            })
                            const picked = columns.split(',').map((c) => c.trim())
                            const data = sorted.slice(from, to + 1).map((row) => Object.fromEntries(picked.map((c) => [c, row[c] ?? null])))
                            return { data, error: null }
                        },
                    }
                    return builder
                },
            }
        },
    }
}

const id = (prefix: string, n: number) => `${prefix}-${String(n).padStart(5, '0')}`

/** Parsuje tabele z docs/nexus-bundle-v1.md (kopia BUNDLE.md z NEXUSA). */
function specFromDocs(): Map<string, string[]> {
    const doc = fs.readFileSync(path.resolve(__dirname, '../../../docs/nexus-bundle-v1.md'), 'utf8')
    const spec = new Map<string, string[]>()
    for (const line of doc.split('\n')) {
        const cells = line.split('|').map((c) => c.trim())
        if (cells.length < 4 || !cells[1].startsWith('`')) continue
        const table = cells[1].match(/`([^`]+)`/)?.[1]
        // Tekst po myślniku to uwaga („— tylko kategorie `inbox_%`”), nie kolumna.
        const columnsCell = cells[2].split(' — ')[0]
        const columns = [...columnsCell.matchAll(/`([^`]+)`/g)].map((m) => m[1])
        if (table && columns.length > 0) spec.set(table, columns)
    }
    return spec
}

const tmpDirs: string[] = []
function tmpDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'compass-bundle-test-'))
    tmpDirs.push(dir)
    return dir
}
afterEach(() => {
    for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

describe('specyfikacja', () => {
    it('ma dokładnie tabele i kolumny z BUNDLE.md — w tej samej kolejności', () => {
        const docs = specFromDocs()
        expect(docs.size).toBeGreaterThan(20)
        expect(BUNDLE_SPEC.map((s) => s.table).sort()).toEqual([...docs.keys()].sort())
        for (const spec of BUNDLE_SPEC) {
            expect({ table: spec.table, columns: spec.columns }).toEqual({ table: spec.table, columns: docs.get(spec.table) })
        }
    })
})

describe('exportBundle', () => {
    it('czyta każdą tabelę jawną listą kolumn ze specyfikacji, bez `*` i bez nadmiarowych pól', async () => {
        const tables: Record<string, Row[]> = {
            profiles: [{ id: 'u1', email: 'osoba@example.test', role: 'internal', full_name: 'Fikcyjna Osoba', loyalty_points: 7, manager_id: null }],
            exit_interviews: [{ id: 'x1', user_id: 'u1', status: 'scheduled', exit_reason_detail: 'tekst wolny', nps_score: 3 }],
            support_categories: [{ id: 'c-inbox', slug: 'inbox_inne' }, { id: 'c-help', slug: 'it_help' }],
            support_tickets: [{ id: 't1', category_id: 'c-inbox', subject: 'Sprawa', body_md: 'x', is_internal: true }],
            support_ticket_comments: [{ id: 'k1', ticket_id: 't1', author_id: 'u1', body_md: 'y', is_internal: true }],
        }
        const client = fakeClient(tables)
        const { bundle } = await exportBundle(client)

        const specByTable = new Map(BUNDLE_SPEC.map((s) => [s.table, s.columns.join(', ')]))
        for (const call of client.calls) {
            expect(call.columns).not.toContain('*')
            // Zapytania pomocnicze (id kategorii i spraw skrzynki) czytają wyłącznie `id`.
            expect([specByTable.get(call.table), 'id']).toContain(call.columns)
        }
        for (const spec of BUNDLE_SPEC) {
            for (const row of (bundle.tables as Record<string, Row[]>)[spec.table] ?? []) {
                expect(Object.keys(row)).toEqual(spec.columns)
            }
        }
        expect(bundle).toMatchObject({ format: 'compass-bundle', version: 1 })
        expect(typeof bundle.exported_at).toBe('string')
        const raw = JSON.stringify(bundle)
        for (const forbidden of ['Fikcyjna Osoba', 'loyalty_points', 'exit_reason_detail', 'nps_score', 'is_internal']) {
            expect(raw).not.toContain(forbidden)
        }
    })

    it('stronicuje po PAGE_SIZE wierszy po stałym kluczu i niczego nie gubi', async () => {
        const total = PAGE_SIZE * 2 + 500
        const rows = Array.from({ length: total }, (_, n) => ({ id: id('e', total - n), timesheet_id: 'ts', hours: 8 }))
        const client = fakeClient({ timesheet_entries: rows })
        const { bundle, counts } = await exportBundle(client, { tables: ['timesheet_entries'] })
        const ranges = client.calls.filter((c) => c.table === 'timesheet_entries').map((c) => c.range)
        expect(ranges).toEqual([[0, PAGE_SIZE - 1], [PAGE_SIZE, PAGE_SIZE * 2 - 1], [PAGE_SIZE * 2, PAGE_SIZE * 3 - 1]])
        expect(counts.timesheet_entries).toBe(total)
        const ids = (bundle.tables as Record<string, Row[]>).timesheet_entries.map((r) => r.id)
        expect(new Set(ids).size).toBe(total)
        expect(ids).toEqual([...ids].sort())
    })

    it('eksportuje tylko sprawy skrzynki (`inbox_%`) i ich dane podrzędne, paczkami po 60 id', async () => {
        const inbox = Array.from({ length: IN_CHUNK * 2 + 10 }, (_, n) => ({ id: id('t', n), category_id: 'c-inbox' }))
        const tables: Record<string, Row[]> = {
            support_categories: [
                { id: 'c-inbox', slug: 'inbox_onboarding' },
                { id: 'c-help', slug: 'it_helpdesk' },
                { id: 'c-contr', slug: 'contractor_rozmowa' },
            ],
            support_tickets: [...inbox, { id: 'help-1', category_id: 'c-help' }, { id: 'contr-1', category_id: 'c-contr' }],
            support_ticket_comments: [
                { id: 'k1', ticket_id: inbox[0].id }, { id: 'k2', ticket_id: 'help-1' }, { id: 'k3', ticket_id: 'contr-1' },
            ],
            support_inbox_meta: [{ ticket_id: inbox[1].id }, { ticket_id: 'help-1' }],
            support_inbox_email_archive: [{ ticket_id: 'contr-1' }],
        }
        const client = fakeClient(tables)
        const { bundle, counts } = await exportBundle(client, {
            tables: ['support_categories', 'support_tickets', 'support_inbox_meta', 'support_ticket_comments', 'support_inbox_email_archive'],
        })
        const out = bundle.tables as Record<string, Row[]>
        expect(out.support_categories.map((r) => r.slug)).toEqual(['inbox_onboarding'])
        expect(counts.support_tickets).toBe(inbox.length)
        expect(out.support_tickets.some((r) => r.id === 'help-1' || r.id === 'contr-1')).toBe(false)
        expect(out.support_ticket_comments.map((r) => r.id)).toEqual(['k1'])
        expect(out.support_inbox_meta.map((r) => r.ticket_id)).toEqual([inbox[1].id])
        expect(out.support_inbox_email_archive).toEqual([])
        const childCalls = client.calls.filter((c) => c.table === 'support_ticket_comments')
        expect(childCalls).toHaveLength(3)
        for (const call of childCalls) {
            const size = Number(call.filters[0].split(':')[2])
            expect(size).toBeLessThanOrEqual(IN_CHUNK)
        }
    })

    it('podrzędne tabele skrzynki działają też bez eksportu samych spraw (`--tables`)', async () => {
        const client = fakeClient({
            support_categories: [{ id: 'c-inbox', slug: 'inbox_inne' }, { id: 'c-help', slug: 'it' }],
            support_tickets: [{ id: 't1', category_id: 'c-inbox' }, { id: 't2', category_id: 'c-help' }],
            support_ticket_comments: [{ id: 'k1', ticket_id: 't1' }, { id: 'k2', ticket_id: 't2' }],
        })
        const { bundle } = await exportBundle(client, { tables: ['support_ticket_comments'] })
        expect(Object.keys(bundle.tables)).toEqual(['support_ticket_comments'])
        expect((bundle.tables as Record<string, Row[]>).support_ticket_comments.map((r) => r.id)).toEqual(['k1'])
    })

    it('`documentation_url` jedzie jako „czy jest”, bez ścieżki do pliku', async () => {
        const client = fakeClient({
            leave_requests: [
                { id: 'l1', documentation_url: 'leave-proofs/u1/zaswiadczenie.pdf' },
                { id: 'l2', documentation_url: null },
            ],
        })
        const { bundle } = await exportBundle(client, { tables: ['leave_requests'] })
        const rows = (bundle.tables as Record<string, Row[]>).leave_requests
        expect(rows.map((r) => r.documentation_url)).toEqual([true, null])
        expect(JSON.stringify(bundle)).not.toContain('leave-proofs')
    })

    it('pomija brakujące lustro (exit_cases), ale nie brakującą tabelę źródłową', async () => {
        const client = fakeClient({ exit_interviews: [{ id: 'x1' }] }, { missing: ['exit_cases', 'onboarding_cases'] })
        const result = await exportBundle(client, { tables: ['exit_interviews', 'exit_cases', 'onboarding_cases'] })
        expect(result.skipped).toEqual(['exit_cases', 'onboarding_cases'])
        expect(Object.keys(result.bundle.tables)).toEqual(['exit_interviews'])

        await expect(exportBundle(fakeClient({}, { missing: ['exit_interviews'] }), { tables: ['exit_interviews'] }))
            .rejects.toBeInstanceOf(ExportError)
    })

    it('odpowiedź bez wierszy (null) przerywa eksport zamiast udawać pustą tabelę', async () => {
        await expect(exportBundle(fakeClient({}, { nullData: ['profiles'] }), { tables: ['profiles'] }))
            .rejects.toThrow(/null/)
    })
})

describe('zapis i wyjście', () => {
    const bundle = { format: 'compass-bundle', version: 1, exported_at: '2026-11-13T17:05:00.000Z', tables: { profiles: [{ id: 'u1', email: 'osoba@example.test' }] } }

    it('odmawia zapisu w repozytorium', () => {
        const inRepo = path.resolve(__dirname, 'compass-bundle.json')
        expect(insideGitRepo(inRepo)).toBe(true)
        expect(() => writeBundle(inRepo, bundle)).toThrow(/repozytorium/)
        expect(fs.existsSync(inRepo)).toBe(false)
    })

    it('zapisuje plik 0600 poza repo, z poprawnym SHA-256, bez nadpisywania', () => {
        const target = path.join(tmpDir(), 'nested', 'compass-bundle.json')
        const written = writeBundle(target, bundle)
        const raw = fs.readFileSync(target)
        expect(fs.statSync(target).mode & 0o777).toBe(0o600)
        expect(written.sha256).toBe(createHash('sha256').update(raw).digest('hex'))
        expect(JSON.parse(raw.toString('utf8'))).toEqual(bundle)
        expect(() => writeBundle(target, bundle)).toThrow(/istnieje/)
    })

    it('raport niesie tylko liczby, rozmiar i skrót — bez treści wierszy', () => {
        const report = formatReport(
            { counts: { profiles: 1, leave_requests: 0 }, skipped: ['exit_cases'] },
            { path: '/tmp/x/compass-bundle.json', bytes: 123, sha256: 'a'.repeat(64) },
        )
        expect(report).toContain('profiles: 1')
        expect(report).toContain(`sha256: ${'a'.repeat(64)}`)
        expect(report).not.toContain('@')
    })
})

describe('argumenty', () => {
    it('wymaga --out i przyjmuje częściowy eksport', () => {
        expect(() => parseArgs([])).toThrow(/--out/)
        expect(parseArgs(['--out', '/tmp/b.json', '--tables', 'profiles, leave_requests'])).toEqual({
            out: '/tmp/b.json', tables: ['profiles', 'leave_requests'],
        })
        expect(parseArgs(['--out=/tmp/b.json'])).toEqual({ out: '/tmp/b.json', tables: [] })
        expect(() => parseArgs(['--out', '/tmp/b.json', '--secret', 'x'])).toThrow(/Nieznany/)
    })

    it('odrzuca tabele spoza specyfikacji i trzyma kolejność importu', () => {
        expect(() => resolveTables(['profiles', 'user_contract_documents'])).toThrow(/user_contract_documents/)
        expect(resolveTables(['leave_requests', 'profiles'])).toEqual(['profiles', 'leave_requests'])
    })
})
