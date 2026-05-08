import type { SupabaseClient } from '@supabase/supabase-js'

// Compass KPI snapshot — counts feeding /api/admin/snapshot.
// Service-role Supabase client bypasses RLS so counts are real (not user-scoped).

export type SnapshotKpis = {
    profiles: { total: number; active: number }
    contracts: { active: number }
    centrala: {
        benefit_declarations: number
        referrals: number
        equipment_requests: number
        invoices: number
    }
    audit_logs: { last_24h: number }
}

// Filter callback receives the post-select() builder (PostgrestFilterBuilder).
// Typed as `any` because the supabase-js generic chain is not worth pinning
// here — runtime behavior is the same regardless.
type FilterFn = (q: any) => any

async function safeCount(
    supabase: SupabaseClient,
    table: string,
    extra?: FilterFn,
): Promise<number> {
    let query: any = supabase.from(table).select('*', { count: 'exact', head: true })
    if (extra) query = extra(query)
    const { count, error } = await query
    if (error) return 0
    return count ?? 0
}

export async function computeKpiSnapshot(supabase: SupabaseClient): Promise<SnapshotKpis> {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const [
        profilesTotal,
        profilesActive,
        contractsActive,
        benefits,
        referrals,
        equipment,
        invoices,
        auditLast24h,
    ] = await Promise.all([
        safeCount(supabase, 'profiles'),
        safeCount(supabase, 'profiles', (q) => q.eq('is_active', true)),
        safeCount(supabase, 'contracts', (q) => q.eq('status', 'active')),
        safeCount(supabase, 'centrala_benefit_declarations'),
        safeCount(supabase, 'centrala_referrals'),
        safeCount(supabase, 'centrala_equipment_requests'),
        safeCount(supabase, 'centrala_invoices'),
        safeCount(supabase, 'audit_logs', (q) => q.gte('created_at', dayAgo)),
    ])

    return {
        profiles: { total: profilesTotal, active: profilesActive },
        contracts: { active: contractsActive },
        centrala: {
            benefit_declarations: benefits,
            referrals: referrals,
            equipment_requests: equipment,
            invoices: invoices,
        },
        audit_logs: { last_24h: auditLast24h },
    }
}
