'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { logger } from '@/lib/logger'

// ── Tier config — imported from shared module (NOT re-exported) ──
// Phase 1.2 (2026-05-04): renamed loyalty-config → league-config (7 tiers).
import { TIER_CONFIG, DEFAULT_TIER, getTier, computeTierProgress, TIER_DISTRIBUTION_KEYS, type TierName } from '@/lib/league-config'

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
        logger.error({ event: 'loyalty.overview.failed', error })
        return { success: false, error: msg }
    }
}

// ─── Phase 2 (2026-05-04): B2Bnetwork League — leaderboard + history + opt-out ─────

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
        logger.error({ event: 'loyalty.leaderboard.failed', error })
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

        const items: LoyaltyHistoryEntry[] = (data ?? []).map((t) => ({
            id: t.id,
            points: t.points,
            description: t.description,
            sourceType: t.source_type,
            status: (t.status ?? 'confirmed') as LoyaltyTxStatus,
            createdAt: t.created_at ?? '',
        }))

        return { success: true, data: { items, total: count ?? items.length } }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Nieznany błąd'
        logger.error({ event: 'loyalty.history_v2.failed', error })
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

