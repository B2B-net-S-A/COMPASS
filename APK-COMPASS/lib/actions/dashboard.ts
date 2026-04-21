'use server'

import { createClient } from '@/lib/supabase/server'

/**
 * Get aggregated dashboard statistics for the current user
 */
export async function getDashboardStats() {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return { success: false, error: 'Nie jesteś zalogowany' }
        }

        // Get profile data
        const { data: profile } = await supabase
            .from('profiles')
            .select('id, full_name, role, avatar_url, loyalty_points, loyalty_tier')
            .eq('id', user.id)
            .single()

        // Get active contract
        const { data: activeContract } = await supabase
            .from('contracts')
            .select('*')
            .eq('consultant_id', user.id)
            .eq('status', 'active')
            .order('end_date', { ascending: false })
            .limit(1)
            .single()

        // Get contracts ending soon
        const { count: endingSoonCount } = await supabase
            .from('contracts')
            .select('*', { count: 'exact' })
            .eq('consultant_id', user.id)
            .eq('status', 'ending_soon')

        // Get favorite projects count
        const { count: favoritesCount } = await supabase
            .from('favorite_projects')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id)

        // Get unread notifications count
        const { count: unreadNotificationsCount } = await supabase
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .eq('is_read', false)

        // Get referrals count
        const { count: referralsCount } = await supabase
            .from('project_referrals')
            .select('*', { count: 'exact', head: true })
            .eq('referrer_user_id', user.id)

        return {
            success: true,
            stats: {
                profile: profile || {
                    id: user.id,
                    full_name: user.email?.split('@')[0] || 'User',
                    role: 'consultant',
                    avatar_url: undefined,
                    loyalty_points: 0,
                    loyalty_tier: 'bronze'
                },
                activeContract,
                endingSoonCount: endingSoonCount || 0,
                favoritesCount: favoritesCount || 0,
                unreadNotificationsCount: unreadNotificationsCount || 0,
                referralsCount: referralsCount || 0,
                loyaltyPoints: profile?.loyalty_points || 0,
                loyaltyTier: profile?.loyalty_tier || 'bronze'
            }
        }
    } catch (error: unknown) {
        console.error('Dashboard stats error:', error)
        return { success: false, error: error instanceof Error ? error.message : 'Nie udało się pobrać statystyk' }
    }
}

/**
 * Get current contract status with health score
 */
export async function getContractStatus() {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return { success: false, error: 'Nie jesteś zalogowany' }
        }

        // Get active contract with health score
        const { data: contract, error } = await supabase
            .from('contracts')
            .select('*')
            .eq('consultant_id', user.id)
            .in('status', ['active', 'ending_soon'])
            .order('end_date', { ascending: false })
            .limit(1)
            .single()

        if (error && error.code !== 'PGRST116') {
            // PGRST116 = no rows returned (expected if no contract)
            console.error('Contract status error:', error)
            return { success: false, error: error.message }
        }

        // Calculate days remaining
        let daysRemaining = null
        if (contract?.end_date) {
            const endDate = new Date(contract.end_date)
            const today = new Date()
            const diffTime = endDate.getTime() - today.getTime()
            daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
        }

        return {
            success: true,
            contract: contract || null,
            daysRemaining,
            hasContract: !!contract
        }
    } catch (error: unknown) {
        console.error('Contract status error:', error)
        return { success: false, error: error instanceof Error ? error.message : 'Nie udało się pobrać statusu kontraktu' }
    }
}

/**
 * Get contextual quick actions based on user state
 */
export async function getQuickActions() {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return { success: false, error: 'Nie jesteś zalogowany' }
        }

        // Get profile to check CV status
        const { data: profile } = await supabase
            .from('profiles')
            .select('cv_url, full_name')
            .eq('id', user.id)
            .single()

        // Check if has active contract
        const { data: activeContract } = await supabase
            .from('contracts')
            .select('id, end_date')
            .eq('consultant_id', user.id)
            .eq('status', 'active')
            .single()

        // Build contextual actions
        const actions = [
            {
                id: 'browse_projects',
                title_pl: 'Przeglądaj Projekty',
                title_en: 'Browse Projects',
                description_pl: 'Znajdź nowe możliwości',
                description_en: 'Discover new opportunities',
                icon: '🎯',
                url: '/projects',
                priority: activeContract ? 'low' : 'high'
            },
            {
                id: 'recommend_friend',
                title_pl: 'Rekomenduj',
                title_en: 'Recommend',
                description_pl: 'Polecaj znajomych na projekty',
                description_en: 'Recommend friends for projects',
                icon: '👥',
                url: '/projects',
                priority: 'high'
            },
            {
                id: 'update_profile',
                title_pl: 'Aktualizuj Profil',
                title_en: 'Update Profile',
                description_pl: profile?.cv_url ? 'Zaktualizuj swoje dane' : 'Dodaj CV',
                description_en: profile?.cv_url ? 'Update your info' : 'Upload CV',
                icon: '👤',
                url: '/profile',
                priority: profile?.cv_url ? 'low' : 'high'
            },
            {
                id: 'view_documents',
                title_pl: 'Dokumenty',
                title_en: 'Documents',
                description_pl: 'Umowy i faktury',
                description_en: 'Contracts and invoices',
                icon: '📄',
                url: '/documents',
                priority: 'low'
            }
        ]

        // Sort by priority
        const priorityOrder: Record<string, number> = { high: 0, normal: 1, low: 2 }
        actions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])

        return {
            success: true,
            actions
        }
    } catch (error: unknown) {
        console.error('Quick actions error:', error)
        return { success: false, error: error instanceof Error ? error.message : 'Nie udało się pobrać szybkich akcji' }
    }
}
