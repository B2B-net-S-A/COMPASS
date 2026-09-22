// Audyt 2026-09-22 — rejestrator zapytań Supabase dla testów integralności HR.
//
// Każde zapytanie (łańcuch `.from(...)...`) jest zapisywane w `recorder.calls` razem
// z operacją, filtrami i payloadem, a odpowiedź podaje funkcja `recorder.resolver`
// ustawiana per test. Dzięki temu test może sprawdzić nie tylko wynik akcji, ale
// też to, czego akcja NIE zrobiła (np. brak DELETE na attendance przed odmową).

export type Op = 'select' | 'insert' | 'update' | 'delete' | 'upsert' | 'rpc'
export type Terminal = 'single' | 'maybeSingle' | 'list'

export interface RecordedQuery {
    table: string
    op: Op
    payload: unknown
    selectArg: string | null
    /** `.select()` wywołane po mutacji (zapis zwracający wiersze). */
    returning: boolean
    filters: Array<[string, string, unknown]>
    terminal: Terminal
}

export interface QueryResult {
    data: unknown
    error: { message: string } | null
}

export type Resolver = (q: RecordedQuery) => QueryResult | undefined

export interface Recorder {
    calls: RecordedQuery[]
    resolver: Resolver
    reset: () => void
    client: { from: (table: string) => unknown; rpc: (fn: string, args: unknown) => Promise<QueryResult> }
    find: (table: string, op?: Op) => RecordedQuery[]
}

export function hasFilter(q: RecordedQuery, method: string, column: string, value?: unknown): boolean {
    return q.filters.some(
        ([m, c, v]) =>
            m === method && c === column && (value === undefined || JSON.stringify(v) === JSON.stringify(value)),
    )
}

function defaultResult(q: RecordedQuery): QueryResult {
    if (q.terminal === 'list' && (q.op === 'select' || q.returning)) return { data: [], error: null }
    return { data: null, error: null }
}

export function createRecorder(): Recorder {
    const recorder: Recorder = {
        calls: [],
        resolver: () => undefined,
        reset() {
            recorder.calls = []
            recorder.resolver = () => undefined
        },
        client: {
            from: (table: string) => makeChain(table),
            rpc: async (fn: string, args: unknown) => {
                const q: RecordedQuery = {
                    table: `rpc:${fn}`,
                    op: 'rpc',
                    payload: args,
                    selectArg: null,
                    returning: false,
                    filters: [],
                    terminal: 'single',
                }
                recorder.calls.push(q)
                return recorder.resolver(q) ?? { data: null, error: null }
            },
        },
        find: (table: string, op?: Op) =>
            recorder.calls.filter((c) => c.table === table && (op === undefined || c.op === op)),
    }

    function makeChain(table: string) {
        const state = {
            op: 'select' as Op,
            payload: undefined as unknown,
            selectArg: null as string | null,
            returning: false,
            filters: [] as Array<[string, string, unknown]>,
        }
        const settle = (terminal: Terminal): QueryResult => {
            const q: RecordedQuery = { table, ...state, filters: [...state.filters], terminal }
            recorder.calls.push(q)
            return recorder.resolver(q) ?? defaultResult(q)
        }
        const filter = (method: string) => (column: string, value?: unknown) => {
            state.filters.push([method, column, value])
            return chain
        }
        const mutate = (op: Op) => (payload?: unknown) => {
            state.op = op
            state.payload = payload
            return chain
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const chain: any = {
            select: (arg?: string) => {
                if (state.op === 'select') state.selectArg = arg ?? '*'
                else state.returning = true
                if (state.op !== 'select' && arg) state.selectArg = arg
                return chain
            },
            insert: mutate('insert'),
            update: mutate('update'),
            upsert: mutate('upsert'),
            delete: mutate('delete'),
            eq: filter('eq'),
            neq: filter('neq'),
            in: filter('in'),
            is: filter('is'),
            gte: filter('gte'),
            gt: filter('gt'),
            lte: filter('lte'),
            lt: filter('lt'),
            not: (column: string, op: string, value: unknown) => {
                state.filters.push(['not', column, [op, value]])
                return chain
            },
            or: filter('or'),
            order: () => chain,
            limit: () => chain,
            range: () => chain,
            single: async () => settle('single'),
            maybeSingle: async () => settle('maybeSingle'),
            then: (onFulfilled: (v: QueryResult) => unknown, onRejected?: (e: unknown) => unknown) =>
                Promise.resolve(settle('list')).then(onFulfilled, onRejected),
        }
        return chain
    }

    return recorder
}

/** Wspólna instancja — moduły mockowane w `vi.mock` i test widzą ten sam obiekt. */
export const recorder = createRecorder()
