/**
 * Mock Supabase client when NEXT_PUBLIC_SUPABASE_URL / ANON_KEY nie są ustawione
 * lub w trybie bypass (emergency_auth_user). W trybie bypass mock jest STATEFUL —
 * dane profilu są trzymane w pamięci (Map), żeby zapis/odczyt "Mój Profil" i baner działały.
 */

const BYPASS_USER_ID = 'df0edb15-8c84-434d-928f-689348171029'
const BYPASS_EMAIL = 'zbigniew.twardowski@b2bnetwork.pl'

export const BYPASS_USER = {
  id: BYPASS_USER_ID,
  email: BYPASS_EMAIL,
  app_metadata: {},
  user_metadata: { full_name: 'Zbigniew Twardowski' },
  aud: 'authenticated',
  created_at: new Date().toISOString(),
} as const

// In-memory store (persystuje w ramach życia procesu Node; reset przy cold start)
type TableStore = Map<string, Record<string, unknown>>
const tables = new Map<string, TableStore>()

function getProfilesStore(): TableStore {
  if (!tables.has('profiles')) {
    const store = new Map<string, Record<string, unknown>>()
    store.set(BYPASS_USER_ID, {
      id: BYPASS_USER_ID,
      email: BYPASS_EMAIL,
      full_name: 'Zbigniew Twardowski',
      role: 'administrator',
      avatar_url: null,
      phone: null,
      created_at: new Date().toISOString(),
    })
    tables.set('profiles', store)
  }
  return tables.get('profiles')!
}

type ChainOp = 'select' | 'update' | 'insert' | 'delete' | 'upsert'
interface ChainState {
  table: string
  op: ChainOp
  selectCols?: string
  updateData?: Record<string, unknown>
  filters: Record<string, unknown>
  single: boolean
}

function executeChain(state: ChainState): Promise<{ data: unknown; error: null } | { data: null; error: { message: string } }> {
  if (state.table === 'profiles') {
    const store = getProfilesStore()
    const id = state.filters['id'] as string | undefined

    if (state.op === 'select') {
      const row = id ? store.get(id) ?? null : null
      return Promise.resolve({ data: state.single ? row : (row ? [row] : []), error: null })
    }
    if (state.op === 'update' && id && state.updateData) {
      const existing = store.get(id) ?? { id }
      const updated = { ...existing, ...state.updateData } as Record<string, unknown>
      store.set(id, updated)
      return Promise.resolve({ data: state.single ? updated : [updated], error: null })
    }
  }

  return Promise.resolve({ data: state.single ? null : [], error: null })
}

function chain(table: string, state: Partial<ChainState> = {}): Record<string, unknown> & PromiseLike<{ data: unknown; error: null }> {
  const s: ChainState = {
    table,
    op: 'select',
    filters: {},
    single: false,
    ...state,
  }

  const run = () => executeChain(s)

  const builder: Record<string, unknown> = {
    select: (cols = '*') => chain(table, { ...s, op: 'select', selectCols: cols }),
    update: (data: Record<string, unknown>) => chain(table, { ...s, op: 'update', updateData: data }),
    insert: () => chain(table, { ...s, op: 'insert' }),
    delete: () => chain(table, { ...s, op: 'delete' }),
    eq: (col: string, val: unknown) => chain(table, { ...s, filters: { ...s.filters, [col]: val } }),
    neq: (col: string, val: unknown) => chain(table, { ...s }),
    gt: () => chain(table, { ...s }),
    gte: () => chain(table, { ...s }),
    lt: () => chain(table, { ...s }),
    lte: () => chain(table, { ...s }),
    like: () => chain(table, { ...s }),
    ilike: () => chain(table, { ...s }),
    in: () => chain(table, { ...s }),
    is: () => chain(table, { ...s }),
    order: () => chain(table, { ...s }),
    limit: () => chain(table, { ...s }),
    range: () => chain(table, { ...s }),
    abortSignal: () => chain(table, { ...s }),
    single: () => chain(table, { ...s, single: true }),
    maybeSingle: () => chain(table, { ...s, single: true }),
    then: (onFulfilled: (v: any) => unknown, onRejected?: (e: unknown) => unknown) =>
      run().then(onFulfilled, onRejected),
    catch: (onRejected: (e: unknown) => unknown) => run().catch(onRejected),
  }

  return builder as Record<string, unknown> & PromiseLike<{ data: unknown; error: null }>
}

function from(table: string) {
  return chain(table)
}

const emptyList = { data: [], error: null }
const emptySingle = { data: null, error: null }

function chainLegacy(single = false) {
  const result = single ? emptySingle : emptyList
  const thenable = Promise.resolve(result)
  const o: Record<string, unknown> = {}
  ;['select', 'insert', 'update', 'delete', 'upsert', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'in', 'is', 'order', 'limit', 'range', 'abortSignal'].forEach((m) => {
    o[m] = () => o
  })
  o.single = () => chainLegacy(true)
  o.maybeSingle = () => chainLegacy(true)
  o.then = (onFulfilled: (v: any) => unknown, onRejected?: (e: unknown) => unknown) =>
    thenable.then(onFulfilled, onRejected)
  o.catch = (onRejected: (e: unknown) => unknown) => thenable.catch(onRejected)
  return o as { then: Promise<typeof emptyList>['then']; catch: Promise<typeof emptyList>['catch']; single: () => typeof o; maybeSingle: () => typeof o; [k: string]: unknown }
}

function fromLegacy(_table: string) {
  return chainLegacy()
}

export function createMockSupabaseClient(overrideUser?: typeof BYPASS_USER | null) {
  const user = overrideUser ?? null
  return {
    auth: {
      getUser: async () => ({ data: { user }, error: null }),
      getSession: async () => ({ data: { session: null }, error: null }),
      signIn: async () => ({ data: { user: null, session: null }, error: { message: 'Supabase not configured' } }),
      signOut: async () => ({ error: null }),
      signUp: async () => ({ data: { user: null, session: null }, error: { message: 'Supabase not configured' } }),
      resetPasswordForEmail: async () => ({ data: {}, error: { message: 'Supabase not configured' } }),
      updateUser: async () => ({ data: { user: null }, error: { message: 'Supabase not configured' } }),
    },
    from: user ? from : fromLegacy,
    storage: {
      from: () => ({
        upload: async () => ({ data: null, error: { message: 'Supabase not configured' } }),
        getPublicUrl: () => ({ data: { publicUrl: '' } }),
        list: async () => ({ data: [], error: null }),
        remove: async () => ({ data: null, error: null }),
        createSignedUrl: async () => ({ data: null, error: { message: 'Supabase not configured' } }),
      }),
    },
    channel: (name?: string) => {
      const ch = {
        on: () => ch,
        subscribe: () => ({ unsubscribe: () => {} }),
        unsubscribe: () => {},
      }
      return ch
    },
    removeChannel: (_channel: unknown) => Promise.resolve(),
  } as unknown as import('@supabase/supabase-js').SupabaseClient
}

export function isSupabaseConfigured(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
}
