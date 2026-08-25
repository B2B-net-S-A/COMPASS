import { vi } from 'vitest'

export type Row = Record<string, unknown>
export type TableData = Record<string, Row[]>

interface QueryFilter {
    kind: string
    column?: string
    value?: unknown
    values?: unknown[]
    pattern?: string
    query?: string
    options?: Record<string, unknown>
    matchObj?: Record<string, unknown>
    orExprs?: Array<{ column: string; op: 'eq' | 'ilike'; value: string }>
}

interface QueryState {
    table: string
    operation: 'select' | 'insert' | 'update' | 'delete' | 'upsert'
    filters: QueryFilter[]
    payload?: Row | Row[]
    columns?: string
    limitN?: number
    rangeFrom?: number
    rangeTo?: number
    countMode?: 'exact' | 'planned' | 'estimated'
    headOnly?: boolean
    orderBy?: { column: string; ascending: boolean }
    single?: boolean
    maybeSingle?: boolean
    selectAfterMutation?: boolean
    onConflict?: string
    ignoreDuplicates?: boolean
}

export interface MockSupabaseUser {
    id: string
    email: string
    user_metadata?: Record<string, unknown>
}

export interface MockSupabaseConfig {
    user?: MockSupabaseUser | null
    tables?: TableData
    rpcs?: Record<string, (args: Record<string, unknown>) => unknown>
    storage?: Record<string, { upload?: ReturnType<typeof vi.fn>; download?: ReturnType<typeof vi.fn>; getPublicUrl?: ReturnType<typeof vi.fn> }>
}

const cloneRow = (r: Row): Row => JSON.parse(JSON.stringify(r))

function applyFilters(rows: Row[], filters: QueryFilter[]): Row[] {
    let out = rows.map(cloneRow)
    for (const f of filters) {
        if (f.kind === 'eq' && f.column !== undefined) {
            out = out.filter(r => r[f.column!] === f.value)
        } else if (f.kind === 'in' && f.column !== undefined && Array.isArray(f.values)) {
            out = out.filter(r => f.values!.includes(r[f.column!]))
        } else if (f.kind === 'ilike' && f.column !== undefined && typeof f.pattern === 'string') {
            const pattern = f.pattern.replace(/%/g, '.*')
            const re = new RegExp(`^${pattern}$`, 'i')
            out = out.filter(r => re.test(String(r[f.column!] ?? '')))
        } else if (f.kind === 'is' && f.column !== undefined) {
            out = out.filter(r => r[f.column!] === f.value)
        } else if (f.kind === 'not_is_null' && f.column !== undefined) {
            out = out.filter(r => r[f.column!] !== null && r[f.column!] !== undefined)
        } else if (f.kind === 'neq' && f.column !== undefined) {
            out = out.filter(r => r[f.column!] !== f.value)
        } else if (f.kind === 'gte' && f.column !== undefined) {
            out = out.filter(r => (r[f.column!] as any) >= (f.value as any))
        } else if (f.kind === 'lte' && f.column !== undefined) {
            out = out.filter(r => (r[f.column!] as any) <= (f.value as any))
        } else if (f.kind === 'gt' && f.column !== undefined) {
            out = out.filter(r => (r[f.column!] as any) > (f.value as any))
        } else if (f.kind === 'lt' && f.column !== undefined) {
            out = out.filter(r => (r[f.column!] as any) < (f.value as any))
        } else if (f.kind === 'match' && f.matchObj) {
            out = out.filter(r => Object.entries(f.matchObj!).every(([k, v]) => r[k] === v))
        } else if (f.kind === 'contains' && f.column !== undefined && Array.isArray(f.values)) {
            out = out.filter(r => {
                const arr = r[f.column!] as unknown[] | undefined
                if (!Array.isArray(arr)) return false
                return f.values!.every(v => arr.includes(v))
            })
        } else if (f.kind === 'or' && f.orExprs) {
            out = out.filter(r => f.orExprs!.some(expr => {
                // PostgREST `eq.true` dopasowuje boolean true — porównujemy po
                // stringifikacji (wcześniej strict === gubił boole z fixtur).
                if (expr.op === 'eq') return String(r[expr.column]) === expr.value
                const re = new RegExp(`^${expr.value.replace(/%/g, '.*')}$`, 'i')
                return re.test(String(r[expr.column] ?? ''))
            }))
        } else if (f.kind === 'textSearch' && f.column !== undefined) {
            const tokens = String(f.query || '').split(/\s*&\s*/).map(t => t.trim().toLowerCase()).filter(Boolean)
            out = out.filter(r => {
                const hay = String(r[f.column!] ?? '').toLowerCase()
                return tokens.every(t => hay.includes(t))
            })
        }
    }
    return out
}

function parseOrExpression(expr: string): Array<{ column: string; op: 'eq' | 'ilike'; value: string }> {
    return expr.split(',').map(part => {
        const m = part.match(/^([^.]+)\.(eq|ilike)\.(.*)$/)
        if (!m) return null
        return { column: m[1], op: m[2] as 'eq' | 'ilike', value: m[3] }
    }).filter(Boolean) as Array<{ column: string; op: 'eq' | 'ilike'; value: string }>
}

function buildQueryBuilder(state: QueryState, tables: TableData) {
    const builder: any = {
        select(cols?: string, opts?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean }) {
            state.columns = cols
            if (opts?.count) state.countMode = opts.count
            if (opts?.head) state.headOnly = true
            if (state.operation !== 'select') {
                state.selectAfterMutation = true
            }
            return builder
        },
        eq(column: string, value: unknown) { state.filters.push({ kind: 'eq', column, value }); return builder },
        neq(column: string, value: unknown) { state.filters.push({ kind: 'neq', column, value }); return builder },
        in(column: string, values: unknown[]) { state.filters.push({ kind: 'in', column, values }); return builder },
        ilike(column: string, pattern: string) { state.filters.push({ kind: 'ilike', column, pattern }); return builder },
        is(column: string, value: unknown) { state.filters.push({ kind: 'is', column, value }); return builder },
        not(column: string, op: string, value: unknown) {
            if (op === 'is' && value === null) {
                state.filters.push({ kind: 'not_is_null', column })
            } else if (op === 'eq') {
                state.filters.push({ kind: 'neq', column, value })
            }
            return builder
        },
        gte(column: string, value: unknown) { state.filters.push({ kind: 'gte', column, value }); return builder },
        lte(column: string, value: unknown) { state.filters.push({ kind: 'lte', column, value }); return builder },
        gt(column: string, value: unknown) { state.filters.push({ kind: 'gt', column, value }); return builder },
        lt(column: string, value: unknown) { state.filters.push({ kind: 'lt', column, value }); return builder },
        match(obj: Record<string, unknown>) { state.filters.push({ kind: 'match', matchObj: obj }); return builder },
        or(expr: string) { state.filters.push({ kind: 'or', orExprs: parseOrExpression(expr) }); return builder },
        textSearch(column: string, query: string, options?: Record<string, unknown>) { state.filters.push({ kind: 'textSearch', column, query, options }); return builder },
        order(column: string, opts?: { ascending?: boolean }) { state.orderBy = { column, ascending: opts?.ascending ?? true }; return builder },
        limit(n: number) { state.limitN = n; return builder },
        range(from: number, to: number) { state.rangeFrom = from; state.rangeTo = to; return builder },
        contains(column: string, values: unknown[]) { state.filters.push({ kind: 'contains', column, values }); return builder },
        single() { state.single = true; return builder },
        maybeSingle() { state.maybeSingle = true; return builder },
        async then(resolve: (v: { data: any; error: any }) => void) {
            const result = await execute(state, tables)
            resolve(result)
        },
    }
    return builder
}

/**
 * Kolumny rozstrzygające konflikt. Jawny `onConflict` wygrywa; bez niego
 * odwzorowujemy PostgREST, który idzie po kluczu głównym — u nas `id`, o ile
 * ładunek go niesie. Bez jednego i drugiego `upsert` degraduje się do `insert`,
 * tak jak wcześniej.
 */
function upsertConflictKeys(state: QueryState, payload: Row[]): string[] {
    if (state.onConflict) {
        return state.onConflict.split(',').map((c) => c.trim()).filter(Boolean)
    }
    return payload.every((r) => r && 'id' in r) ? ['id'] : []
}

/**
 * Rzutowanie na listę kolumn z `select(...)`.
 *
 * Audyt 2026-08: atrapa listę kolumn tylko ZAPISYWAŁA i zwracała pełne wiersze
 * z fixtury. Kod czytający pole, którego nie ma w `select(...)`, działał więc
 * w testach bez zarzutu, a na produkcji dostawał `undefined` — dokładnie ta klasa
 * wywróciła skrzynkę 2026-08-25 (patrz `lib/supabase/fetch-hardening.ts`).
 * Teraz brak kolumny w `select` = brak pola w wyniku, tak jak w PostgREST.
 *
 * Świadomie NIE ruszamy zapytań z osadzeniem (`profil:profiles(...)`) ani `*` —
 * odwzorowanie zagnieżdżeń to osobna praca, a udawana połowiczna obsługa byłaby
 * gorsza od jawnego przepuszczenia całego wiersza.
 */
function applyProjection(rows: Row[], columns?: string): Row[] {
    if (!columns) return rows
    const spec = columns.trim()
    if (spec === '' || spec === '*' || spec.includes('(')) return rows
    const keys = spec.split(',').map(c => c.trim()).filter(Boolean).map(c => {
        const alias = c.match(/^([^:]+):(.+)$/)
        return alias ? { out: alias[1].trim(), src: alias[2].trim() } : { out: c, src: c }
    })
    return rows.map(r => {
        const out: Row = {}
        for (const k of keys) { if (k.src in r) out[k.out] = r[k.src] }
        return out
    })
}

async function execute(state: QueryState, tables: TableData): Promise<{ data: any; error: any }> {
    const rows = tables[state.table] || []
    if (state.operation === 'select') {
        let filtered = applyFilters(rows, state.filters)
        if (state.orderBy) {
            const { column, ascending } = state.orderBy
            filtered = filtered.sort((a, b) => {
                const av = a[column], bv = b[column]
                if (av === bv) return 0
                const cmp = (av as any) < (bv as any) ? -1 : 1
                return ascending ? cmp : -cmp
            })
        }
        const totalCount = filtered.length
        if (state.rangeFrom !== undefined && state.rangeTo !== undefined) {
            filtered = filtered.slice(state.rangeFrom, state.rangeTo + 1)
        }
        if (state.limitN !== undefined) {
            filtered = filtered.slice(0, state.limitN)
        }
        if (state.headOnly) {
            return { data: null, error: null, count: state.countMode ? totalCount : null } as any
        }
        const projected = applyProjection(filtered, state.columns)
        if (state.single) {
            if (projected.length === 0) return { data: null, error: { code: 'PGRST116', message: 'No rows', details: null } }
            return { data: projected[0], error: null }
        }
        if (state.maybeSingle) {
            return { data: projected[0] || null, error: null }
        }
        return { data: projected, error: null, count: state.countMode ? totalCount : null } as any
    }
    if (state.operation === 'insert' || state.operation === 'upsert') {
        const payload = Array.isArray(state.payload) ? state.payload : [state.payload!]
        const inserted: Row[] = []
        // Audyt 2026-08: `upsert` zachowywał się jak zwykły `insert` — ignorował
        // `onConflict` i `ignoreDuplicates`, więc każdy wiersz „wchodził". Testy
        // widziały sukces tam, gdzie realny Postgres odbija kolizję kluczem
        // unikalnym: rezerwacja „jeden mail na miesiąc", idempotencja importów po
        // `external_key`, dedup alertów. Gwarancje oparte o ON CONFLICT były więc
        // nietestowalne — mock potwierdzał każdą z nich niezależnie od kodu.
        const conflictKeys = state.operation === 'upsert' ? upsertConflictKeys(state, payload) : []
        for (const r of payload) {
            const cloned = cloneRow(r as Row)
            if (conflictKeys.length > 0) {
                const idx = rows.findIndex((existing) =>
                    conflictKeys.every((k) => existing[k] === cloned[k]),
                )
                if (idx !== -1) {
                    // `ignoreDuplicates: true` = DO NOTHING — wiersz nie wraca
                    // z `.select()`, i to jest właśnie sygnał „ktoś mnie ubiegł".
                    if (state.ignoreDuplicates) continue
                    rows[idx] = { ...rows[idx], ...cloned }
                    inserted.push(cloneRow(rows[idx]))
                    continue
                }
            }
            rows.push(cloned)
            inserted.push(cloned)
        }
        tables[state.table] = rows
        return { data: inserted.map(cloneRow), error: null }
    }
    if (state.operation === 'update') {
        const filtered = applyFilters(rows, state.filters)
        const ids = new Set(filtered.map(r => JSON.stringify(r)))
        const updated: Row[] = []
        for (let i = 0; i < rows.length; i++) {
            if (ids.has(JSON.stringify(rows[i]))) {
                rows[i] = { ...rows[i], ...(state.payload as Row) }
                updated.push(cloneRow(rows[i]))
            }
        }
        tables[state.table] = rows
        return { data: updated, error: null }
    }
    if (state.operation === 'delete') {
        const filtered = applyFilters(rows, state.filters)
        const ids = new Set(filtered.map(r => JSON.stringify(r)))
        tables[state.table] = rows.filter(r => !ids.has(JSON.stringify(r)))
        return { data: filtered, error: null }
    }
    return { data: null, error: { message: 'unsupported op' } }
}

export function createMockSupabaseClient(config: MockSupabaseConfig = {}) {
    const tables: TableData = config.tables ? JSON.parse(JSON.stringify(config.tables)) : {}
    const rpcs = config.rpcs || {}

    const auth = {
        getUser: vi.fn(async () => ({ data: { user: config.user ?? null }, error: null })),
        getSession: vi.fn(async () => ({ data: { session: config.user ? { user: config.user } : null }, error: null })),
        signOut: vi.fn(async () => ({ error: null })),
        signInWithPassword: vi.fn(async () => ({ data: { user: config.user, session: null }, error: null })),
    }

    const from = vi.fn((table: string) => {
        const state: QueryState = { table, operation: 'select', filters: [] }
        const baseBuilder: any = buildQueryBuilder(state, tables)
        baseBuilder.insert = (payload: Row | Row[]) => {
            state.operation = 'insert'
            state.payload = payload
            return buildQueryBuilder(state, tables)
        }
        baseBuilder.update = (payload: Row) => {
            state.operation = 'update'
            state.payload = payload
            return buildQueryBuilder(state, tables)
        }
        baseBuilder.delete = () => {
            state.operation = 'delete'
            return buildQueryBuilder(state, tables)
        }
        baseBuilder.upsert = (
            payload: Row | Row[],
            opts?: { onConflict?: string; ignoreDuplicates?: boolean },
        ) => {
            state.operation = 'upsert'
            state.payload = payload
            state.onConflict = opts?.onConflict
            state.ignoreDuplicates = opts?.ignoreDuplicates === true
            return buildQueryBuilder(state, tables)
        }
        return baseBuilder
    })

    const rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => {
        if (rpcs[name]) {
            try {
                return { data: await rpcs[name](args || {}), error: null }
            } catch (e) {
                return { data: null, error: { message: (e as Error).message } }
            }
        }
        return { data: null, error: { message: `rpc ${name} not mocked` } }
    })

    const storage = {
        from: vi.fn((bucket: string) => {
            const b = config.storage?.[bucket] ?? {}
            return {
                upload: b.upload ?? vi.fn(async () => ({ data: { path: 'mock-path' }, error: null })),
                download: b.download ?? vi.fn(async () => ({ data: new Blob(['mock']), error: null })),
                getPublicUrl: b.getPublicUrl ?? vi.fn(() => ({ data: { publicUrl: `https://mock/${bucket}/path` } })),
            }
        }),
    }

    return { from, rpc, auth, storage, _tables: tables }
}

export type MockSupabase = ReturnType<typeof createMockSupabaseClient>
