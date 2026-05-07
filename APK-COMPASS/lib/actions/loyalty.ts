'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

/**
 * Add loyalty points to a user
 * @param userId User ID
 * @param points Points amount (can be negative)
 * @param sourceType Source type code (e.g. 'manual_bonus', 'referral')
 * @param description Description for the user
 * @param sourceId Optional source UUID
 */
export async function addLoyaltyPoints(
    userId: string,
    points: number,
    sourceType: string,
    description: string,
    sourceId?: string
) {
    try {
        const supabase = createClient()

        // Security check - primarily for admin use or internal system calls
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }

        // Check role
        const { data: callerProfile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single()

        const allowedRoles = ['admin']
        const hasPermission = allowedRoles.includes(callerProfile?.role || '')

        // If not admin, maybe allow self-triggering for specific system events? 
        // For now, let's enforce admin/centrala for MANUAL adds via this server action if it's used by the UI.
        // However, if this action is used by other system events (e.g. referral), it might need to bypass this check 
        // or be split into "adminAddPoints" vs internal "systemAddPoints".
        // Assuming this function is for the Admin UI manual add:
        if (!hasPermission) {
            return { success: false, error: 'Niewystarczające uprawnienia' }
        }

        const { error } = await supabase.from('loyalty_transactions').insert({
            user_id: userId,
            points,
            source_type: sourceType,
            description,
            source_id: sourceId
        })

        if (error) throw error

        // Also update the profile total points/tier? 
        // The trigger should handle it, but let's confirm trigger existence. 
        // Based on migrations, there is a trigger `update_loyalty_status`. So we are good.

        revalidatePath('/profile')
        revalidatePath('/admin')
        return { success: true }
    } catch (error: any) {
        console.error('Error adding points:', error)
        return { success: false, error: error.message }
    }
}

export async function searchUsers(query: string) {
    const supabase = createClient()

    // Check auth
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    if (!query || query.length < 2) return []

    const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, role, loyalty_points, loyalty_tier')
        .or(`full_name.ilike.%${query}%,email.ilike.%${query}%`)
        .limit(10)

    if (error) {
        console.error('Search error:', error)
        return []
    }

    return data
}

// --- Loyalty Rules Configuration ---

export interface LoyaltyRule {
    id: string
    code: string
    name: string
    points: number
    category: string
    description: string | null
    is_active: boolean
}

const DEFAULT_RULES: Omit<LoyaltyRule, 'id' | 'created_at' | 'updated_at'>[] = [
    { code: 'referral_hired', name: 'Referral (Zatrudnienie)', points: 1000, category: 'Recruitment', description: 'Zatrudnienie osoby poleconej', is_active: true },
    { code: 'role_ambassador', name: 'Rola Compass: Ambasador', points: 200, category: 'Compass', description: 'Miesięczny bonus za rolę', is_active: true },
    { code: 'role_verifier', name: 'Rola Compass: Weryfikator', points: 100, category: 'Compass', description: 'Miesięczny bonus za rolę', is_active: true },
    { code: 'role_sales', name: 'Rola Compass: Wsparcie Sprzedaży', points: 300, category: 'Compass', description: 'Miesięczny bonus za rolę', is_active: true },
    { code: 'anniversary', name: 'Rocznica zatrudnienia', points: 500, category: 'Loyalty', description: 'Nagroda roczna', is_active: true },
    { code: 'contract_extension', name: 'Przedłużenie umowy (Annex)', points: 500, category: 'Loyalty', description: 'Za każdy aneks', is_active: true },
    { code: 'smooth_transition', name: 'Gładkie przejście', points: 300, category: 'Loyalty', description: 'Gap między projektami ≤ 14 dni', is_active: true },
    { code: 'positive_feedback', name: 'Pozytywna ankieta kwartalna', points: 200, category: 'Quality', description: 'Rating ≥ 4.5', is_active: true },
    { code: 'certification', name: 'Nowa certyfikacja', points: 150, category: 'Development', description: 'Uzyskanie certyfikatu (np. AWS, Azure)', is_active: true },
    { code: 'perfect_attendance', name: 'Pełny miesiąc na projekcie', points: 100, category: 'Performance', description: 'Frekwencja ≥ 90%', is_active: true },
]

export async function getLoyaltyRules() {
    const supabase = createClient()

    try {
        const { data, error } = await supabase
            .from('loyalty_rules')
            .select('*')
            .order('category', { ascending: true })
            .order('points', { ascending: false })

        if (error) {
            console.warn('Error fetching loyalty rules (table might generally be missing, using defaults):', error.message)
            // Return defaults with fake IDs if table assumes missing
            return DEFAULT_RULES.map((r, i) => ({ ...r, id: `mock-${i}` }))
        }

        return data as LoyaltyRule[]
    } catch (e) {
        console.error('Exception fetching rules:', e)
        return DEFAULT_RULES.map((r, i) => ({ ...r, id: `mock-${i}` }))
    }
}

export async function updateLoyaltyRule(id: string, updates: Partial<LoyaltyRule>) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Brak autoryzacji' }

    // Check admin role
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (!['admin'].includes(profile?.role || '')) {
        return { success: false, error: 'Niewystarczające uprawnienia' }
    }

    if (id.startsWith('mock-')) {
        return { success: false, warning: 'Changes cannot be saved (Database table "loyalty_rules" is missing). Please run the migration script.' }
    }

    const { error } = await supabase
        .from('loyalty_rules')
        .update(updates)
        .eq('id', id)

    if (error) return { success: false, error: error.message }

    return { success: true }
}


/**
 * Get loyalty transaction history for a user
 */
export async function getLoyaltyHistory(limit = 10) {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }

        const { data, error } = await supabase
            .from('loyalty_transactions')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(limit)

        if (error) throw error

        return { success: true, history: data }
    } catch (error: any) {
        console.error('Error fetching loyalty history:', error)
        return { success: false, error: error.message }
    }
}

/**
 * Get progress to next tier
 */
export async function getTierProgress() {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }

        const { data: profile } = await supabase
            .from('profiles')
            .select('loyalty_points, loyalty_tier')
            .eq('id', user.id)
            .single()

        if (!profile) return { success: false, error: 'Nie znaleziono profilu' }

        const points = profile.loyalty_points || 0
        const currentTier = profile.loyalty_tier || DEFAULT_TIER

        const tierInfo = TIER_CONFIG.find(t => t.name === currentTier) || TIER_CONFIG[0]
        const nextTier = tierInfo.next || null
        const threshold = tierInfo.nextThreshold
        const missing = tierInfo.next ? Math.max(0, threshold - points) : 0
        const progressPercent = tierInfo.next
            ? Math.min(100, Math.round(((points - tierInfo.threshold) / (threshold - tierInfo.threshold)) * 100))
            : 100

        return {
            success: true,
            currentPoints: points,
            currentTier,
            nextTier: nextTier || 'max',
            nextTierThreshold: threshold,
            pointsToNextTier: missing,
            progressPercent
        }

    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

// ── Tier config — imported from shared module (NOT re-exported) ──
// Phase 1.2 (2026-05-04): renamed loyalty-config → league-config (7 tiers).
import { TIER_CONFIG, DEFAULT_TIER, getTier, computeTierProgress, TIER_DISTRIBUTION_KEYS, type TierName } from '@/lib/league-config'

// ── Breakdown types ──

export interface CategoryBreakdown {
    category: string
    totalPoints: number
    percentage: number
    items: {
        sourceType: string
        label: string
        description: string | null
        totalPoints: number
        count: number
        lastEarned: string | null
        rulePoints: number
    }[]
}

export interface TimelineMonth {
    month: string
    points: number
    breakdown: Record<string, number>
}

export interface LoyaltyBreakdownResult {
    success: boolean
    error?: string
    summary?: {
        totalPoints: number
        currentTier: string
        nextTier: string | null
        pointsToNext: number
        progressPercent: number
        memberSince: string | null
    }
    byCategory?: CategoryBreakdown[]
    timeline?: TimelineMonth[]
    recentTransactions?: {
        id: string
        points: number
        sourceType: string
        label: string
        description: string
        createdAt: string
    }[]
    transactionsPagination?: {
        totalCount: number
        hasMore: boolean
        offset: number
        limit: number
    }
}

/**
 * Full loyalty breakdown with category grouping, timeline, and paginated transactions.
 * Centrala/admin can pass targetUserId to view any consultant.
 */
export async function getLoyaltyBreakdown(
    targetUserId?: string,
    txOffset = 0,
    txLimit = 20,
): Promise<LoyaltyBreakdownResult> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }

        let userId = user.id

        if (targetUserId && targetUserId !== user.id) {
            const { data: callerProfile } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', user.id)
                .single()
            if (!['admin'].includes(callerProfile?.role || '')) {
                return { success: false, error: 'Niewystarczające uprawnienia' }
            }
            userId = targetUserId
        }

        // Fetch profile
        const { data: profile } = await supabase
            .from('profiles')
            .select('loyalty_points, loyalty_tier, loyalty_joined_at')
            .eq('id', userId)
            .single()

        const totalPoints = profile?.loyalty_points || 0
        const currentTier = profile?.loyalty_tier || DEFAULT_TIER
        const tierInfo = TIER_CONFIG.find(t => t.name === currentTier) || TIER_CONFIG[0]
        const pointsToNext = tierInfo.next ? Math.max(0, tierInfo.nextThreshold - totalPoints) : 0
        const progressPercent = tierInfo.next
            ? Math.min(100, Math.round(((totalPoints - tierInfo.threshold) / (tierInfo.nextThreshold - tierInfo.threshold)) * 100))
            : 100

        // Fetch all transactions for aggregation
        const { data: allTx, error: txError } = await supabase
            .from('loyalty_transactions')
            .select('id, points, source_type, description, created_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })

        if (txError) throw txError
        const transactions = allTx || []

        // Fetch rules for label/category mapping
        let rules: LoyaltyRule[] = []
        try {
            rules = await getLoyaltyRules()
        } catch {
            rules = DEFAULT_RULES.map((r, i) => ({ ...r, id: `mock-${i}` }))
        }
        const ruleMap = new Map(rules.map(r => [r.code, r]))

        // Build category breakdown
        const sourceAgg = new Map<string, { points: number; count: number; lastEarned: string | null }>()
        for (const tx of transactions) {
            const key = tx.source_type
            const existing = sourceAgg.get(key)
            if (existing) {
                existing.points += tx.points
                existing.count += 1
                if (!existing.lastEarned || tx.created_at > existing.lastEarned) {
                    existing.lastEarned = tx.created_at
                }
            } else {
                sourceAgg.set(key, { points: tx.points, count: 1, lastEarned: tx.created_at })
            }
        }

        const categoryMap = new Map<string, CategoryBreakdown>()

        // First add all rules (including ones with 0 transactions) for motivational display
        for (const rule of rules) {
            if (!rule.is_active) continue
            const agg = sourceAgg.get(rule.code)
            const cat = rule.category
            if (!categoryMap.has(cat)) {
                categoryMap.set(cat, { category: cat, totalPoints: 0, percentage: 0, items: [] })
            }
            categoryMap.get(cat)!.items.push({
                sourceType: rule.code,
                label: rule.name,
                description: rule.description,
                totalPoints: agg?.points || 0,
                count: agg?.count || 0,
                lastEarned: agg?.lastEarned || null,
                rulePoints: rule.points,
            })
            categoryMap.get(cat)!.totalPoints += (agg?.points || 0)
            sourceAgg.delete(rule.code)
        }

        // Add any remaining custom source types not in rules
        for (const [code, agg] of Array.from(sourceAgg)) {
            const cat = 'Inne'
            if (!categoryMap.has(cat)) {
                categoryMap.set(cat, { category: cat, totalPoints: 0, percentage: 0, items: [] })
            }
            categoryMap.get(cat)!.items.push({
                sourceType: code,
                label: code.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
                description: null,
                totalPoints: agg.points,
                count: agg.count,
                lastEarned: agg.lastEarned,
                rulePoints: 0,
            })
            categoryMap.get(cat)!.totalPoints += agg.points
        }

        const byCategory = Array.from(categoryMap.values())
            .map(c => ({
                ...c,
                percentage: totalPoints > 0 ? Math.round((c.totalPoints / totalPoints) * 100) : 0,
                items: c.items.sort((a, b) => b.totalPoints - a.totalPoints),
            }))
            .sort((a, b) => b.totalPoints - a.totalPoints)

        // Build monthly timeline (last 12 months)
        const timeline: TimelineMonth[] = []
        const now = new Date()
        for (let i = 11; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
            timeline.push({ month: key, points: 0, breakdown: {} })
        }
        const timelineMap = new Map(timeline.map(t => [t.month, t]))
        for (const tx of transactions) {
            const d = new Date(tx.created_at)
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
            const entry = timelineMap.get(key)
            if (entry) {
                entry.points += tx.points
                const rule = ruleMap.get(tx.source_type)
                const cat = rule?.category || 'Inne'
                entry.breakdown[cat] = (entry.breakdown[cat] || 0) + tx.points
            }
        }

        // Paginated recent transactions
        const totalCount = transactions.length
        const paginatedTx = transactions.slice(txOffset, txOffset + txLimit)
        const recentTransactions = paginatedTx.map(tx => {
            const rule = ruleMap.get(tx.source_type)
            return {
                id: tx.id,
                points: tx.points,
                sourceType: tx.source_type,
                label: rule?.name || tx.source_type.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
                description: tx.description,
                createdAt: tx.created_at,
            }
        })

        return {
            success: true,
            summary: {
                totalPoints,
                currentTier,
                nextTier: tierInfo.next || null,
                pointsToNext,
                progressPercent,
                memberSince: profile?.loyalty_joined_at || null,
            },
            byCategory,
            timeline,
            recentTransactions,
            transactionsPagination: {
                totalCount,
                hasMore: txOffset + txLimit < totalCount,
                offset: txOffset,
                limit: txLimit,
            },
        }
    } catch (error: any) {
        console.error('Error in getLoyaltyBreakdown:', error)
        return { success: false, error: error.message }
    }
}

// ── Admin overview: all consultants loyalty data ──

export interface ConsultantLoyaltyRow {
    id: string
    full_name: string | null
    email: string | null
    role: string
    loyalty_points: number
    loyalty_tier: string
    loyalty_joined_at: string | null
}

export interface LoyaltyStats {
    totalConsultants: number
    avgPoints: number
    tierDistribution: Record<string, number>
    topPerformer: ConsultantLoyaltyRow | null
}

export interface AllConsultantsLoyaltyResult {
    success: boolean
    error?: string
    consultants?: ConsultantLoyaltyRow[]
    stats?: LoyaltyStats
}

/**
 * Get all consultants/contractors with their loyalty data.
 * Admin/Centrala only.
 */
export async function getAllConsultantsLoyalty(): Promise<AllConsultantsLoyaltyResult> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }

        const { data: callerProfile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single()

        if (!['admin'].includes(callerProfile?.role || '')) {
            return { success: false, error: 'Niewystarczające uprawnienia' }
        }

        const { data, error } = await supabase
            .from('profiles')
            .select('id, full_name, email, role, loyalty_points, loyalty_tier, loyalty_joined_at')
            .in('role', ['consultant', 'b2b_consultant', 'contractor', 'candidate'])
            .order('loyalty_points', { ascending: false })

        if (error) throw error

        const consultants: ConsultantLoyaltyRow[] = (data || []).map(p => ({
            id: p.id,
            full_name: p.full_name,
            email: p.email,
            role: p.role,
            loyalty_points: p.loyalty_points || 0,
            loyalty_tier: p.loyalty_tier || DEFAULT_TIER,
            loyalty_joined_at: p.loyalty_joined_at || null,
        }))

        // Compute stats
        const totalConsultants = consultants.length
        const totalPoints = consultants.reduce((sum, c) => sum + c.loyalty_points, 0)
        const avgPoints = totalConsultants > 0 ? Math.round(totalPoints / totalConsultants) : 0

        const tierDistribution: Record<string, number> = { ...TIER_DISTRIBUTION_KEYS }
        for (const c of consultants) {
            tierDistribution[c.loyalty_tier] = (tierDistribution[c.loyalty_tier] || 0) + 1
        }

        const topPerformer = consultants.length > 0 ? consultants[0] : null

        return {
            success: true,
            consultants,
            stats: { totalConsultants, avgPoints, tierDistribution, topPerformer },
        }
    } catch (error: any) {
        console.error('Error in getAllConsultantsLoyalty:', error)
        return { success: false, error: error.message }
    }
}

// TODO:CACHE — When scale >100 users becomes a concern, wrap getLoyaltyBreakdown
// with unstable_cache or use revalidateTag('loyalty-breakdown-{userId}') to avoid
// re-running the aggregation on every page load.

/**
 * Export loyalty transactions as CSV. Centrala/admin can export for any user.
 * Supports date range filtering.
 */
export async function exportLoyaltyCsv(
    targetUserId?: string,
    dateFrom?: string,
    dateTo?: string,
): Promise<{ success: boolean; csv?: string; error?: string }> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }

        let userId = user.id

        if (targetUserId && targetUserId !== user.id) {
            const { data: callerProfile } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', user.id)
                .single()
            if (!['admin'].includes(callerProfile?.role || '')) {
                return { success: false, error: 'Niewystarczające uprawnienia' }
            }
            userId = targetUserId
        }

        let query = supabase
            .from('loyalty_transactions')
            .select('id, points, source_type, description, created_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })

        if (dateFrom) {
            query = query.gte('created_at', dateFrom)
        }
        if (dateTo) {
            query = query.lte('created_at', dateTo + 'T23:59:59.999Z')
        }

        const { data, error } = await query
        if (error) throw error

        let rules: LoyaltyRule[] = []
        try {
            rules = await getLoyaltyRules()
        } catch {
            rules = DEFAULT_RULES.map((r, i) => ({ ...r, id: `mock-${i}` }))
        }
        const ruleMap = new Map(rules.map(r => [r.code, r]))

        const rows = (data || []).map(tx => {
            const rule = ruleMap.get(tx.source_type)
            return [
                tx.created_at,
                rule?.name || tx.source_type,
                rule?.category || 'Inne',
                tx.points,
                tx.description,
            ].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')
        })

        const header = 'Data,Zdarzenie,Kategoria,Punkty,Opis'
        const csv = [header, ...rows].join('\n')

        return { success: true, csv }
    } catch (error: any) {
        console.error('Error exporting CSV:', error)
        return { success: false, error: error.message }
    }
}

// ─── Phase 1.2 (2026-05-04): Pending points + League overview ────────────────

export interface LoyaltyOverview {
    confirmed_points: number
    pending_points: number
    total_potential: number
    tier: TierName
    tier_label: string
    next_tier: TierName | null
    next_tier_threshold: number
    points_to_next: number
    progress_pct: number
    member_since: string | null
}

/**
 * League dashboard summary: confirmed + pending balances, current tier,
 * progress toward next tier. Pending = points awarded but awaiting moderation
 * (status='pending' in loyalty_transactions, added by migration 4).
 */
export async function getLoyaltyOverview(targetUserId?: string): Promise<{ success: true; data: LoyaltyOverview } | { success: false; error: string }> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }

        let userId = user.id
        if (targetUserId && targetUserId !== user.id) {
            const { data: callerProfile } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', user.id)
                .single()
            if (!['admin'].includes(callerProfile?.role || '')) {
                return { success: false, error: 'Niewystarczające uprawnienia' }
            }
            userId = targetUserId
        }

        const { data: profile } = await supabase
            .from('profiles')
            .select('loyalty_points, loyalty_tier, loyalty_joined_at')
            .eq('id', userId)
            .single()

        if (!profile) return { success: false, error: 'Nie znaleziono profilu' }

        const confirmed_points = profile.loyalty_points || 0
        const tierName = (profile.loyalty_tier as TierName) || DEFAULT_TIER
        const tierInfo = getTier(tierName)

        // Sum pending transactions
        const { data: pendingTx } = await supabase
            .from('loyalty_transactions')
            .select('points')
            .eq('user_id', userId)
            .eq('status', 'pending')

        const pending_points = (pendingTx || []).reduce((sum, t: { points: number }) => sum + t.points, 0)

        return {
            success: true,
            data: {
                confirmed_points,
                pending_points,
                total_potential: confirmed_points + pending_points,
                tier: tierInfo.name as TierName,
                tier_label: tierInfo.label,
                next_tier: tierInfo.next,
                next_tier_threshold: tierInfo.nextThreshold,
                points_to_next: tierInfo.next ? Math.max(0, tierInfo.nextThreshold - confirmed_points) : 0,
                progress_pct: computeTierProgress(confirmed_points, tierName),
                member_since: profile.loyalty_joined_at || null,
            },
        }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Nieznany błąd'
        console.error('Error in getLoyaltyOverview:', error)
        return { success: false, error: msg }
    }
}

/**
 * Admin/trainer: flip a pending transaction to confirmed (e.g. after quiz moderation).
 * Trigger update_loyalty_status will recompute tier on UPDATE OF status.
 */
export async function confirmPendingTransaction(transactionId: string): Promise<{ success: boolean; error?: string }> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }

        const { data: callerProfile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single()
        if (!['admin'].includes(callerProfile?.role || '')) {
            return { success: false, error: 'Niewystarczające uprawnienia' }
        }

        const { error } = await supabase
            .from('loyalty_transactions')
            .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
            .eq('id', transactionId)
            .eq('status', 'pending')

        if (error) return { success: false, error: error.message }

        revalidatePath('/league')
        revalidatePath('/league')
        return { success: true }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Nieznany błąd'
        return { success: false, error: msg }
    }
}

/**
 * Admin/trainer: mark an awarded transaction as reversed (e.g. moderation rejection
 * after points were already credited). Inserts a compensating reversal row referencing
 * the original via reverses_id, then flips status='reversed' on the original.
 */
export async function reverseTransaction(transactionId: string, reason: string): Promise<{ success: boolean; error?: string }> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }

        const { data: callerProfile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single()
        if (!['admin'].includes(callerProfile?.role || '')) {
            return { success: false, error: 'Niewystarczające uprawnienia' }
        }

        const { data: original, error: fetchError } = await supabase
            .from('loyalty_transactions')
            .select('id, user_id, points, source_type, status')
            .eq('id', transactionId)
            .single()

        if (fetchError || !original) return { success: false, error: 'Transakcja nie znaleziona' }
        if (original.status === 'reversed') return { success: false, error: 'Transakcja już cofnięta' }

        const { error: insertError } = await supabase
            .from('loyalty_transactions')
            .insert({
                user_id: original.user_id,
                points: -original.points,
                source_type: `reversal:${original.source_type}`,
                description: `Cofnięcie: ${reason}`,
                reverses_id: original.id,
                status: 'confirmed',
            })

        if (insertError) return { success: false, error: insertError.message }

        const { error: updateError } = await supabase
            .from('loyalty_transactions')
            .update({ status: 'reversed' })
            .eq('id', transactionId)

        if (updateError) return { success: false, error: updateError.message }

        revalidatePath('/league')
        revalidatePath('/league')
        return { success: true }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Nieznany błąd'
        return { success: false, error: msg }
    }
}

// ─── Phase 2 (2026-05-04): Dynaminds League — leaderboard + history + opt-out ─────

export interface LeaderboardEntryRow {
    rank: number
    user_id: string
    full_name: string | null
    avatar_url: string | null
    loyalty_points: number
    loyalty_tier: string
    is_self: boolean
    is_anonymous: boolean
}

/**
 * Globalny ranking top-N. Profile z `leaderboard_opt_out=true` są zwracane jako
 * anonimowe (full_name='Anonim', avatar_url=null) — zachowują rank, ukrywają tożsamość.
 * Phase 2 MVP: jedyne wymiary to "all-time"; tygodniowe/miesięczne w Phase 6+ jeśli potrzeba.
 */
export async function getLeaderboard(limit = 50): Promise<{ success: true; data: LeaderboardEntryRow[] } | { success: false; error: string }> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }

        const { data, error } = await supabase
            .from('profiles')
            .select('id, full_name, avatar_url, loyalty_points, loyalty_tier, leaderboard_opt_out')
            .order('loyalty_points', { ascending: false })
            .limit(Math.min(200, Math.max(1, limit)))

        if (error) throw error

        const rows: LeaderboardEntryRow[] = (data ?? []).map((p, i) => {
            const optOut = (p as { leaderboard_opt_out?: boolean }).leaderboard_opt_out ?? false
            const isSelf = p.id === user.id
            const isAnonymous = optOut && !isSelf
            return {
                rank: i + 1,
                user_id: p.id,
                full_name: isAnonymous ? null : p.full_name,
                avatar_url: isAnonymous ? null : p.avatar_url,
                loyalty_points: p.loyalty_points || 0,
                loyalty_tier: p.loyalty_tier || DEFAULT_TIER,
                is_self: isSelf,
                is_anonymous: isAnonymous,
            }
        })

        return { success: true, data: rows }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Nieznany błąd'
        console.error('[getLeaderboard]', error)
        return { success: false, error: msg }
    }
}

export type LoyaltyTxStatus = 'pending' | 'confirmed' | 'reversed'

export interface LoyaltyHistoryEntry {
    id: string
    points: number
    description: string
    sourceType: string
    status: LoyaltyTxStatus
    createdAt: string
}

/**
 * Phase 2: paginated transaction history for /league/history with optional status filter.
 * Replaces simpler `getLoyaltyHistory` (kept for backward compat).
 */
export async function getLoyaltyHistoryV2(
    options: { status?: LoyaltyTxStatus; offset?: number; limit?: number } = {},
): Promise<{ success: true; data: { items: LoyaltyHistoryEntry[]; total: number } } | { success: false; error: string }> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }

        const offset = Math.max(0, options.offset ?? 0)
        const limit = Math.min(100, Math.max(1, options.limit ?? 25))

        let query = supabase
            .from('loyalty_transactions')
            .select('id, points, description, source_type, status, created_at', { count: 'exact' })
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })

        if (options.status) {
            query = query.eq('status', options.status)
        }

        query = query.range(offset, offset + limit - 1)

        const { data, error, count } = await query
        if (error) throw error

        const items: LoyaltyHistoryEntry[] = (data ?? []).map((t: { id: string; points: number; description: string; source_type: string; status: LoyaltyTxStatus; created_at: string }) => ({
            id: t.id,
            points: t.points,
            description: t.description,
            sourceType: t.source_type,
            status: t.status ?? 'confirmed',
            createdAt: t.created_at,
        }))

        return { success: true, data: { items, total: count ?? items.length } }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Nieznany błąd'
        console.error('[getLoyaltyHistoryV2]', error)
        return { success: false, error: msg }
    }
}

/**
 * Toggle leaderboard visibility for current user.
 */
export async function setLeaderboardOptOut(optOut: boolean): Promise<{ success: boolean; error?: string }> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }

        const { error } = await supabase
            .from('profiles')
            .update({ leaderboard_opt_out: optOut })
            .eq('id', user.id)

        if (error) return { success: false, error: error.message }

        revalidatePath('/league/leaderboard')
        revalidatePath('/settings')
        return { success: true }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Nieznany błąd'
        return { success: false, error: msg }
    }
}

