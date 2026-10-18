#!/usr/bin/env node
// „Ludzie w NEXUSIE” — eksport paczki `compass-bundle` v1 dla importu w NEXUSIE.
//
// Specyfikacja: docs/nexus-bundle-v1.md (kopia BUNDLE.md z NEXUSA). Eksportujemy
// DOKŁADNIE te tabele i kolumny — paczka niesie dane osobowe, więc nic ponad to,
// czego import potrzebuje. Test: lib/hr/__tests__/export-nexus-bundle.test.ts.
//
// Zasady, każda z powodem:
//   • Wyłącznie SELECT z jawną listą kolumn (nigdy `*`) — nowa kolumna w Compassie
//     nie może po cichu trafić do paczki.
//   • Stronicowanie `.range()` po stałym kluczu — PostgREST tnie odpowiedź do limitu
//     wierszy, a ucięta strona wyglądałaby jak komplet.
//   • Sprawy tylko z kategorii `inbox_%` (skrzynka administracja@); helpdesku i rozmów
//     kontraktorskich nie eksportujemy. Tabele podrzędne (meta, komentarze, archiwum
//     maili) tylko dla wyeksportowanych spraw, `.in()` paczkami po 60 id
//     (incydent 25.08: długi query string ucinany w drodze = pusta odpowiedź).
//   • `leave_requests.documentation_url` jedzie jako „czy jest” (true/null) — import
//     potrzebuje tylko tej informacji, ścieżka do pliku zostaje w Compassie.
//   • Plik wyłącznie poza repozytorium, tryb 0600, bez nadpisywania istniejącego.
//   • Na wyjściu tylko liczby wierszy per tabela i SHA-256 pliku — nigdy treść
//     wierszy, e-maile ani nazwiska (wyjście terminala bywa wklejane do czatu).
//
// Uruchomienie: docs/nexus-bundle-v1.md (komentarz na górze).

import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export const BUNDLE_FORMAT = 'compass-bundle'
export const BUNDLE_VERSION = 1
export const MAX_BUNDLE_BYTES = 64 * 1024 * 1024
export const PAGE_SIZE = 1000
export const IN_CHUNK = 60
const MAX_PAGES = 10_000

/** Kolejność importu z BUNDLE.md; tabele w obrębie modułu jak w specyfikacji. */
export const BUNDLE_SPEC = [
    // Osoby
    { table: 'profiles', order: ['id'], columns: ['id', 'email', 'role', 'is_external', 'employment_type', 'employment_status', 'default_location', 'hired_at', 'work_start_date', 'termination_date', 'can_log_overtime', 'job_title', 'department', 'phone', 'leave_entitlement_days', 'leave_carried_over_days', 'leave_used_initial_days', 'manager_id'] },
    // leave
    { table: 'leave_requests', order: ['id'], presenceOnly: ['documentation_url'], columns: ['id', 'user_id', 'leave_type', 'status', 'start_date', 'end_date', 'half_day', 'note', 'substitute_id', 'forward_mail_enabled', 'oof_internal_message', 'oof_external_message', 'paid_days', 'unpaid_days', 'decided_by', 'decided_at', 'decision_note', 'created_by', 'created_on_behalf', 'source', 'documentation_url', 'created_at'] },
    // time
    { table: 'timesheets', order: ['id'], columns: ['id', 'user_id', 'year', 'month', 'status', 'submitted_at', 'approved_by', 'approved_at', 'rejection_note', 'pdf_hash', 'created_at'] },
    { table: 'timesheet_entries', order: ['id'], columns: ['id', 'timesheet_id', 'work_date', 'hours', 'project', 'description', 'source', 'is_overtime_override', 'override_reason', 'override_by'] },
    { table: 'attendance_records', order: ['id'], columns: ['id', 'user_id', 'date', 'status', 'location', 'note'] },
    { table: 'timesheet_role_defaults', order: ['id'], columns: ['id', 'applies_to_role', 'label', 'project', 'default_description', 'is_active', 'sort_order', 'created_by'] },
    { table: 'timesheet_user_templates', order: ['id'], columns: ['id', 'user_id', 'name', 'description', 'project', 'sort_order'] },
    // payroll
    { table: 'user_rates', order: ['id'], columns: ['id', 'user_id', 'hourly_rate', 'currency', 'effective_from', 'effective_to', 'reason', 'set_by'] },
    { table: 'bonuses', order: ['id'], columns: ['id', 'recipient_user_id', 'proposed_by', 'amount', 'currency', 'category', 'status', 'period_year', 'period_month', 'period_quarter', 'place_rank', 'reason', 'created_at', 'cancelled_at', 'cancelled_by', 'cancellation_reason', 'client_name', 'sales_client_name', 'sales_service_description', 'delivery_candidate_name', 'delivery_margin_amount', 'delivery_margin_percent', 'recruiter_candidate_name', 'recruiter_margin_per_hour', 'recruiter_calculated_tier', 'custom_email_memo', 'notes'] },
    // lifecycle
    { table: 'exit_interviews', order: ['id'], columns: ['id', 'user_id', 'is_anonymous', 'manager_snapshot', 'exit_reason', 'status', 'reviewed_at', 'cancelled_at', 'cancelled_by', 'created_at', 'updated_at'] },
    { table: 'exit_cases', order: ['id'], optional: true, columns: ['id', 'person_type', 'person_id', 'is_anonymous', 'manager_snapshot', 'exit_reason', 'status', 'end_date', 'reviewed_at', 'cancelled_at', 'cancelled_by', 'created_by', 'created_at', 'updated_at'] },
    { table: 'offboarding_tasks', order: ['id'], columns: ['id', 'user_id', 'category', 'title', 'responsible_role', 'due_date', 'completed_at', 'completed_by', 'notes', 'position'] },
    { table: 'onboarding_progress', order: ['id'], columns: ['id', 'user_id', 'started_at', 'completed_at', 'cancelled_at', 'cancelled_by', 'created_at', 'updated_at'] },
    { table: 'onboarding_cases', order: ['id'], optional: true, columns: ['id', 'person_type', 'person_id', 'status', 'owner_id', 'start_date', 'started_at', 'completed_at', 'cancelled_at', 'cancelled_by', 'created_by', 'created_at', 'updated_at'] },
    { table: 'onboarding_tasks', order: ['id'], columns: ['id', 'progress_id', 'title', 'category', 'responsible_role', 'due_date', 'completed_at', 'completed_by', 'notes', 'position'] },
    // cases — wyłącznie skrzynka administracja@ (`inbox_%`)
    { table: 'support_categories', order: ['id'], scope: 'inbox_categories', columns: ['id', 'slug'] },
    { table: 'support_tickets', order: ['id'], scope: 'inbox_tickets', columns: ['id', 'category_id', 'user_id', 'assignee_id', 'subject', 'body_md', 'status', 'priority', 'resolved_at', 'created_at', 'updated_at'] },
    { table: 'support_inbox_meta', order: ['ticket_id'], scope: 'by_ticket', columns: ['ticket_id', 'priority_level', 'due_date', 'planned_due_date', 'follow_up_date', 'work_area', 'waiting_for', 'checklist', 'materials', 'consultant_id', 'consultant_name', 'consultant_phone', 'client_name', 'external_message_id', 'email_from', 'email_subject', 'email_received_at'] },
    { table: 'support_ticket_comments', order: ['id'], scope: 'by_ticket', columns: ['id', 'ticket_id', 'author_id', 'body_md', 'created_at'] },
    { table: 'support_inbox_email_archive', order: ['ticket_id'], scope: 'by_ticket', columns: ['ticket_id', 'email_body_text', 'email_body_html', 'external_conversation_id'] },
    // care
    { table: 'clients', order: ['id'], columns: ['id', 'name'] },
    { table: 'client_areas', order: ['id'], columns: ['id', 'client_id', 'name'] },
    { table: 'vendors', order: ['id'], columns: ['id', 'name'] },
    { table: 'technologies', order: ['id'], columns: ['id', 'name', 'aliases'] },
    { table: 'contractors', order: ['id'], columns: ['id', 'full_name', 'nexus_candidate_id', 'nexus_contract_id', 'owner_tcm_id', 'current_client'] },
    { table: 'contractor_success_settings', order: ['contractor_id'], columns: ['contractor_id', 'monitoring_status', 'check_in_cadence_days', 'onboarding_program_ends_on', 'onboarding_program_completed_at'] },
    { table: 'tech_interview_cards', order: ['id'], columns: ['id', 'contractor_id', 'client_id', 'client_area_id', 'tcm_id', 'created_by', 'interview_date', 'status', 'is_draft', 'finalized_at', 'satisfaction', 'satisfaction_comment', 'hiring', 'hiring_source', 'hiring_roles', 'project_end_month', 'project_end_year', 'project_end_unknown', 'team_size', 'team_externals', 'memorable_quote', 'tech_old_new', 'vendors_note', 'title', 'professional_insurance', 'created_at'] },
    { table: 'tech_interview_card_technologies', order: ['card_id', 'technology_id'], columns: ['card_id', 'technology_id'] },
    { table: 'tech_interview_card_vendors', order: ['card_id', 'vendor_id'], columns: ['card_id', 'vendor_id'] },
    { table: 'tech_interview_card_initiatives', order: ['card_id', 'name', 'kind', 'priority'], columns: ['card_id', 'name', 'kind', 'priority'] },
    { table: 'tech_card_sales_status', order: ['card_id'], columns: ['card_id', 'status', 'atlas_deal_title', 'reason', 'handled_by_name', 'handled_at'] },
    { table: 'contractor_conversations', order: ['id'], columns: ['id', 'contractor_id', 'conversation_date', 'client_snapshot', 'category', 'status', 'note', 'follow_up_date', 'tcm_id', 'created_by', 'created_at'] },
]

const SPEC_BY_TABLE = new Map(BUNDLE_SPEC.map((spec) => [spec.table, spec]))

// PostgREST: brak tabeli w schemacie. Dotyczy tylko luster oznaczonych `optional`.
const MISSING_TABLE_CODES = new Set(['42P01', 'PGRST205'])

export class ExportError extends Error {
    constructor(message) {
        super(message)
        this.name = 'ExportError'
    }
}

function fail(table, error) {
    // Kod i komunikat PostgREST (bez wierszy) — wystarcza do diagnozy, nie niesie danych osobowych.
    return new ExportError(`${table}: ${error?.code ?? 'błąd'} ${error?.message ?? ''}`.trim())
}

/** Wszystkie strony jednego zapytania. `build()` zwraca świeży builder po `.select(...)`. */
async function readPaged(table, order, build) {
    const rows = []
    for (let page = 0; page < MAX_PAGES; page += 1) {
        let query = build()
        for (const column of order) query = query.order(column, { ascending: true })
        const from = page * PAGE_SIZE
        const { data, error } = await query.range(from, from + PAGE_SIZE - 1)
        if (error) throw Object.assign(fail(table, error), { code: error.code })
        if (!Array.isArray(data)) throw new ExportError(`${table}: odpowiedź bez wierszy (null) — przerywam`)
        rows.push(...data)
        if (data.length < PAGE_SIZE) return rows
    }
    throw new ExportError(`${table}: przekroczono ${MAX_PAGES} stron`)
}

function chunk(items, size) {
    const out = []
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
    return out
}

/** Rozwiązuje `--tables`: nieznana nazwa to błąd, nie cichy pominięty eksport. */
export function resolveTables(requested) {
    if (!requested || requested.length === 0) return BUNDLE_SPEC.map((spec) => spec.table)
    const unknown = requested.filter((table) => !SPEC_BY_TABLE.has(table))
    if (unknown.length > 0) {
        throw new ExportError(`Nieznane tabele: ${unknown.join(', ')}. Dozwolone: ${BUNDLE_SPEC.map((s) => s.table).join(', ')}`)
    }
    // Zachowujemy kolejność ze specyfikacji, nie z linii poleceń.
    return BUNDLE_SPEC.map((spec) => spec.table).filter((table) => requested.includes(table))
}

/**
 * Buduje paczkę z klienta Supabase (service role). Zwraca obiekt paczki i liczby
 * wierszy; NIE pisze nic na dysk i nic nie wypisuje.
 *
 * @param {any} client klient Supabase (albo zgodna atrapa w testach)
 * @param {{ tables?: string[], now?: () => Date }} [options]
 */
export async function exportBundle(client, { tables, now = () => new Date() } = {}) {
    const selected = resolveTables(tables)
    /** @type {Record<string, Array<Record<string, unknown>>>} */
    const out = {}
    /** @type {Record<string, number>} */
    const counts = {}
    /** @type {string[]} */
    const skipped = []

    let inboxCategoryIds = null
    const inboxCategories = async () => {
        if (inboxCategoryIds === null) {
            const rows = await readPaged('support_categories', ['id'], () =>
                client.from('support_categories').select('id').like('slug', 'inbox_%'))
            inboxCategoryIds = rows.map((row) => row.id)
        }
        return inboxCategoryIds
    }
    let inboxTicketIds = null
    const inboxTickets = async () => {
        if (inboxTicketIds === null) {
            const categories = await inboxCategories()
            inboxTicketIds = categories.length === 0 ? [] : (await readPaged('support_tickets', ['id'], () =>
                client.from('support_tickets').select('id').in('category_id', categories))).map((row) => row.id)
        }
        return inboxTicketIds
    }

    for (const table of selected) {
        const spec = SPEC_BY_TABLE.get(table)
        const select = spec.columns.join(', ')
        let rows
        try {
            if (spec.scope === 'inbox_categories') {
                rows = await readPaged(table, spec.order, () => client.from(table).select(select).like('slug', 'inbox_%'))
            } else if (spec.scope === 'inbox_tickets') {
                const categories = await inboxCategories()
                rows = categories.length === 0 ? [] : await readPaged(table, spec.order, () =>
                    client.from(table).select(select).in('category_id', categories))
                inboxTicketIds = rows.map((row) => row.id)
            } else if (spec.scope === 'by_ticket') {
                rows = []
                for (const ids of chunk(await inboxTickets(), IN_CHUNK)) {
                    rows.push(...await readPaged(table, spec.order, () => client.from(table).select(select).in('ticket_id', ids)))
                }
            } else {
                rows = await readPaged(table, spec.order, () => client.from(table).select(select))
            }
        } catch (error) {
            if (spec.optional && MISSING_TABLE_CODES.has(error?.code)) {
                // Lustro, którego na tej bazie nie ma — import bierze wtedy tabelę źródłową.
                skipped.push(table)
                continue
            }
            throw error
        }
        for (const column of spec.presenceOnly ?? []) {
            for (const row of rows) row[column] = row[column] ? true : null
        }
        out[table] = rows
        counts[table] = rows.length
    }

    return {
        bundle: { format: BUNDLE_FORMAT, version: BUNDLE_VERSION, exported_at: now().toISOString(), tables: out },
        counts,
        skipped,
    }
}

/** Czy ścieżka leży w jakimkolwiek repozytorium git (katalog z `.git` po drodze w górę). */
export function insideGitRepo(target) {
    let dir = path.dirname(path.resolve(target))
    try {
        dir = fs.realpathSync(dir)
    } catch {
        // Katalog jeszcze nie istnieje — sprawdzamy ścieżkę, jak jest.
    }
    for (;;) {
        if (fs.existsSync(path.join(dir, '.git'))) return true
        const parent = path.dirname(dir)
        if (parent === dir) return false
        dir = parent
    }
}

/** Zapis paczki: poza repo, 0600, bez nadpisywania. Zwraca rozmiar i SHA-256. */
export function writeBundle(outPath, bundle) {
    const target = path.resolve(outPath)
    if (insideGitRepo(target)) {
        throw new ExportError('Odmowa: plik paczki nie może leżeć w repozytorium (dane osobowe). Wskaż katalog poza repo, np. ~/.claude/nexus-hr/compass-export/.')
    }
    const raw = Buffer.from(JSON.stringify(bundle), 'utf8')
    if (raw.length > MAX_BUNDLE_BYTES) {
        throw new ExportError(`Paczka ma ${raw.length} B — więcej niż limit importu NEXUSA (64 MB).`)
    }
    fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 })
    try {
        fs.writeFileSync(target, raw, { mode: 0o600, flag: 'wx' })
    } catch (error) {
        if (error?.code === 'EEXIST') throw new ExportError('Odmowa: plik już istnieje — usuń go albo podaj inną ścieżkę.')
        throw error
    }
    fs.chmodSync(target, 0o600)
    return { path: target, bytes: raw.length, sha256: createHash('sha256').update(raw).digest('hex') }
}

export function parseArgs(argv) {
    const args = { out: null, tables: [] }
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i]
        const value = () => {
            const next = argv[i + 1]
            if (next === undefined || next.startsWith('--')) throw new ExportError(`Brak wartości dla ${arg}`)
            i += 1
            return next
        }
        if (arg === '--out') args.out = value()
        else if (arg.startsWith('--out=')) args.out = arg.slice('--out='.length)
        else if (arg === '--tables') args.tables = value().split(',').map((t) => t.trim()).filter(Boolean)
        else if (arg.startsWith('--tables=')) args.tables = arg.slice('--tables='.length).split(',').map((t) => t.trim()).filter(Boolean)
        else throw new ExportError(`Nieznany argument: ${arg}`)
    }
    if (!args.out) throw new ExportError('Podaj --out <ścieżka poza repozytorium>.')
    return args
}

/** Raport: wyłącznie nazwy tabel, liczby, rozmiar i SHA-256. */
export function formatReport({ counts, skipped }, written) {
    const lines = Object.entries(counts).map(([table, n]) => `  ${table}: ${n}`)
    if (skipped.length > 0) lines.push(`  (brak w bazie, pominięte lustra: ${skipped.join(', ')})`)
    lines.push(`plik: ${written.path} (${written.bytes} B, tryb 0600)`)
    lines.push(`sha256: ${written.sha256}`)
    return `compass-bundle v${BUNDLE_VERSION}\n${lines.join('\n')}\n`
}

async function main() {
    const args = parseArgs(process.argv.slice(2))
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) throw new ExportError('Ustaw SUPABASE_URL i SUPABASE_SERVICE_ROLE_KEY.')
    // Odmowa zapisu w repo PRZED czytaniem bazy — żeby nie pobierać danych, których nie zapiszemy.
    if (insideGitRepo(args.out)) {
        throw new ExportError('Odmowa: plik paczki nie może leżeć w repozytorium (dane osobowe).')
    }
    const { createClient } = await import('@supabase/supabase-js')
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    const result = await exportBundle(client, { tables: args.tables })
    const written = writeBundle(args.out, result.bundle)
    process.stdout.write(formatReport(result, written))
}

function invokedDirectly() {
    try {
        return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href
    } catch {
        return false
    }
}

if (invokedDirectly()) {
    main().catch((error) => {
        process.stderr.write(`${error instanceof ExportError ? error.message : `Eksport przerwany: ${error?.message ?? error}`}\n`)
        process.exit(1)
    })
}
