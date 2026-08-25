import type { SupabaseClient } from '@supabase/supabase-js'

// Compass KPI snapshot — counts feeding /api/admin/snapshot.
// Service-role Supabase client bypasses RLS so counts are real (not user-scoped).
//
// Audyt 2026-08 (C3): snapshot raportował 8 pól, z czego 5 było stałym zerem.
// `centrala_benefit_declarations`, `centrala_referrals`, `centrala_equipment_requests`
// i `centrala_invoices` nie istnieją na produkcji (moduł Centrala nigdy nie wjechał),
// a `profiles.is_active` to kolumna, której nie ma — aktywność trzyma
// `employment_status`. Poprzednia wersja połykała błąd i zwracała 0, więc endpoint
// zdrowia z uporem twierdził „zero", zamiast przyznać, że nie umie policzyć.

export type SnapshotKpis = {
    profiles: { total: number }
    contracts: { active: number }
    audit_logs: { last_24h: number }
}

// Filter callback receives the post-select() builder (PostgrestFilterBuilder).
// Typed as `any` because the supabase-js generic chain is not worth pinning
// here — runtime behavior is the same regardless.
type FilterFn = (q: any) => any

/**
 * Zlicza wiersze. Awaria RZUCA — trasa łapie to i oznacza snapshot jako
 * `unhealthy`. Zero zwrócone po cichu byłoby najbardziej uspokajającą
 * z możliwych odpowiedzi i jednocześnie nieprawdziwą.
 */
async function count(supabase: SupabaseClient, table: string, extra?: FilterFn): Promise<number> {
    let query: any = supabase.from(table).select('*', { count: 'exact', head: true })
    if (extra) query = extra(query)
    const { count: n, error } = await query
    if (error) throw new Error(`Nie udało się policzyć ${table}: ${error.message}`)
    return n ?? 0
}

export async function computeKpiSnapshot(supabase: SupabaseClient): Promise<SnapshotKpis> {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const [profilesTotal, contractsActive, auditLast24h] = await Promise.all([
        count(supabase, 'profiles'),
        count(supabase, 'contracts', (q) => q.eq('status', 'active')),
        count(supabase, 'audit_logs', (q) => q.gte('created_at', dayAgo)),
    ])

    return {
        profiles: { total: profilesTotal },
        contracts: { active: contractsActive },
        audit_logs: { last_24h: auditLast24h },
    }
}
