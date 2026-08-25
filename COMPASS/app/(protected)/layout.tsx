import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'
import { AppLayout } from '@/components/layout/AppLayout'
import { LayoutPreferencesProvider } from '@/lib/contexts/LayoutPreferencesContext'
import { ThemeProvider } from '@/lib/contexts/ThemeContext'
import { getPermissions } from '@/lib/actions/permissions'
import { getUnreadNewsCount } from '@/lib/actions/news'
import { listTickets } from '@/lib/actions/support-tickets'
import { listAllPitchesAdmin } from '@/lib/actions/incubator'
import { getLifecycleSidebarCount } from '@/lib/actions/lifecycle'
import { getActiveLeavesCount } from '@/lib/actions/internal-leave'
import type { PermissionRole, PermissionsMap } from '@/lib/types/permissions'
import type { SidebarBadgeCounts } from '@/components/layout/Sidebar'
import nextDynamic from 'next/dynamic'
import { logger } from '@/lib/logger'
import { isConsultantSuccessEnabled } from '@/lib/consultant-success/flags'

const Tour = nextDynamic(() => import('@/components/onboarding/Tour').then(m => m.Tour), { ssr: false })
// Smart Work Clock (Phase 17) UI disabled — to re-enable, uncomment import + render below.
// const WorkClockButton = nextDynamic(
//     () => import('@/components/internal/WorkClockButton').then((m) => m.WorkClockButton),
//     { ssr: false },
// )

async function countOpenInboxTickets(supabase: ReturnType<typeof createClient>): Promise<number> {
    try {
        const { data: cats } = await supabase
            .from('support_categories')
            .select('id')
            .like('slug', 'inbox_%')
        const ids = (cats ?? []).map((c: { id: string }) => c.id)
        if (ids.length === 0) return 0
        const { count } = await supabase
            .from('support_tickets')
            .select('id', { count: 'exact', head: true })
            .in('category_id', ids)
            .eq('status', 'open')
        return count ?? 0
    } catch {
        return 0
    }
}

export default async function ProtectedLayout({
    children,
}: {
    children: React.ReactNode
}) {
    try {
        const supabase = createClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            redirect('/login')
        }

        type ProfileData = { full_name?: string | null; avatar_url?: string | null; role?: string; bio?: string | null; onboarding_tour_done?: boolean; is_inbox_handler?: boolean; has_tcm_access?: boolean }
        let profile: ProfileData | null = null
        let permissionsMap: PermissionsMap = {} as PermissionsMap
        try {
            const [profileRes, perms] = await Promise.all([
                supabase.from('profiles').select('id, full_name, avatar_url, email, bio, role, cv_url, gdpr_consent, onboarding_tour_done, is_inbox_handler, has_tcm_access').eq('id', user.id).single(),
                getPermissions(),
            ])
            profile = (profileRes as { data?: ProfileData | null })?.data ?? null
            permissionsMap = perms ?? {} as PermissionsMap
        } catch {
            const { DEFAULT_PERMISSIONS } = await import('@/lib/types/permissions')
            permissionsMap = DEFAULT_PERMISSIONS
        }

        const role = (profile?.role as 'consultant' | 'admin' | 'internal' | 'finanse' | 'manager' | 'talent_community') || 'consultant'

        // PR5b: usunięto cookie-based MFA check dla admin (lib/mfa.ts).
        // Microsoft Entra Conditional Access przejmuje wymuszanie MFA na
        // poziomie Azure dla wszystkich @b2bnetwork.pl (PR5a + Cfg).

        // Phase 11 + 19a + 20: dedicated permission sets per role.
        const permissionRole: PermissionRole =
            role === 'admin' ? 'admin' :
            role === 'finanse' ? 'finanse' :
            role === 'internal' ? 'internal' :
            role === 'manager' ? 'manager' :
            role === 'talent_community' ? 'talent_community' :
            'consultant'
        const userPermissions = permissionsMap[permissionRole]
        const userData = {
            ...user,
            full_name: profile?.full_name || (user as { user_metadata?: { full_name?: string } }).user_metadata?.full_name,
            avatar_url: profile?.avatar_url ?? undefined,
            email: user.email,
            bio: profile?.bio,
        }

        // Phase 7: sidebar badge counts (unread news for all; admin counts for admins).
        // Phase 9: unread guardian messages for consultants (Support Center badge).
        // Phase 10: inbox kanban open ticket count for handlers (admin or is_inbox_handler).
        const isAdminLike = role === 'admin'
        // Rola talent_community implikuje obsługę skrzynki (2026-08-25) — badge widzi cały TCM.
        const isInboxHandler = isAdminLike || role === 'talent_community' || profile?.is_inbox_handler === true
        // Phase 45: per-user grant — additive Talent Community / People Ops access on top of role.
        const hasTcmAccess = profile?.has_tcm_access === true
        // Phase 22: lifecycle count for HR-zone roles only (consultant IT has no lifecycle module).
        const isHrZoneUser = isAdminLike || ['internal', 'finanse', 'manager', 'talent_community'].includes(role)
        const [
            newsRes,
            adminTicketsRes,
            adminPitchesRes,
            consultantSupport,
            adminInbox,
            lifecycleCount,
            activeLeaves,
        ] = await Promise.all([
            getUnreadNewsCount(),
            isAdminLike ? listTickets({ scope: 'all', status: 'open', limit: 1 }) : Promise.resolve({ success: false as const, error: 'skip' }),
            isAdminLike ? listAllPitchesAdmin('submitted') : Promise.resolve({ success: false as const, error: 'skip' }),
            // Audyt 2026-08 (C4): komunikator usunięty — nie miał RPC w bazie,
            // zera wierszy i żadnego wejścia z nawigacji. Badge zostaje na 0,
            // bo `consultantSupport` jest częścią kontraktu SidebarBadgeCounts.
            Promise.resolve(0),
            isInboxHandler ? countOpenInboxTickets(supabase) : Promise.resolve(0),
            isHrZoneUser
                ? getLifecycleSidebarCount().catch(() => ({ total: 0 } as { total: number }))
                : Promise.resolve({ total: 0 } as { total: number }),
            // Phase 25e — active leaves badge dla sidebar (HR-zone only).
            isHrZoneUser
                ? getActiveLeavesCount().catch(() => ({ count: 0, selfOnLeave: false }))
                : Promise.resolve({ count: 0, selfOnLeave: false }),
        ])
        const sidebarBadges: SidebarBadgeCounts = {
            news: newsRes.success ? newsRes.data : 0,
            adminTickets: adminTicketsRes.success ? adminTicketsRes.data.total : 0,
            adminPitches: adminPitchesRes.success ? adminPitchesRes.data.length : 0,
            adminInbox,
            consultantSupport,
            lifecyclePendingTasks: lifecycleCount.total,
            activeLeaves: activeLeaves.count,
            selfOnLeave: activeLeaves.selfOnLeave,
        }

        return (
            <ThemeProvider>
                <AppLayout
                    user={userData}
                    role={role}
                    permissions={userPermissions}
                    sidebarBadges={sidebarBadges}
                    isInboxHandler={isInboxHandler}
                    consultantSuccessEnabled={isConsultantSuccessEnabled()}
                    hasTcmAccess={hasTcmAccess}
                >
                    <LayoutPreferencesProvider>
                        {children}
                    </LayoutPreferencesProvider>
                    <Tour initialDone={profile?.onboarding_tour_done ?? false} />
                    {/* Smart Work Clock (Phase 17) UI disabled — re-enable when feature returns. */}
                    {/* {(role === 'internal' || role === 'admin') && <WorkClockButton />} */}
                </AppLayout>
            </ThemeProvider>
        )
    } catch (e) {
        const err = e as { digest?: string }
        // Redirects and not-found signals from nested routes are implemented as
        // framework exceptions. Let Next.js handle them instead of replacing a
        // valid child redirect (for example a legacy contractor deep link) with
        // an unrelated /login redirect.
        if (err.digest?.startsWith('NEXT_REDIRECT') || err.digest?.startsWith('NEXT_NOT_FOUND')) {
            throw e
        }
        logger.error({ event: 'protected_layout.failed', error: e })
        redirect('/login')
    }
}
