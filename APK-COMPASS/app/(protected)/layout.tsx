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
import { getUnreadGuardianMessages } from '@/lib/actions/communicator'
import type { PermissionRole, PermissionsMap } from '@/lib/types/permissions'
import type { SidebarBadgeCounts } from '@/components/layout/Sidebar'
import nextDynamic from 'next/dynamic'
import { logger } from '@/lib/logger'

const Tour = nextDynamic(() => import('@/components/onboarding/Tour').then(m => m.Tour), { ssr: false })

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

        type ProfileData = { full_name?: string | null; avatar_url?: string | null; role?: string; bio?: string | null; onboarding_tour_done?: boolean; is_inbox_handler?: boolean }
        let profile: ProfileData | null = null
        let permissionsMap: PermissionsMap = {} as PermissionsMap
        try {
            const [profileRes, perms] = await Promise.all([
                supabase.from('profiles').select('id, full_name, avatar_url, email, bio, role, cv_url, gdpr_consent, onboarding_tour_done, is_inbox_handler').eq('id', user.id).single(),
                getPermissions(),
            ])
            profile = (profileRes as { data?: ProfileData | null })?.data ?? null
            permissionsMap = perms ?? {} as PermissionsMap
        } catch {
            const { DEFAULT_PERMISSIONS } = await import('@/lib/types/permissions')
            permissionsMap = DEFAULT_PERMISSIONS
        }

        const role = (profile?.role as 'consultant' | 'admin') || 'consultant'

        if (role === 'admin') {
            const mfaVerified = cookies().get('mfa_verified')?.value === 'true'
            if (!mfaVerified) redirect('/login')
        }

        const permissionRole: PermissionRole = role
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
        const isInboxHandler = isAdminLike || profile?.is_inbox_handler === true
        const [newsRes, adminTicketsRes, adminPitchesRes, consultantSupport, adminInbox] = await Promise.all([
            getUnreadNewsCount(),
            isAdminLike ? listTickets({ scope: 'all', status: 'open', limit: 1 }) : Promise.resolve({ success: false as const, error: 'skip' }),
            isAdminLike ? listAllPitchesAdmin('submitted') : Promise.resolve({ success: false as const, error: 'skip' }),
            !isAdminLike ? getUnreadGuardianMessages() : Promise.resolve(0),
            isInboxHandler ? countOpenInboxTickets(supabase) : Promise.resolve(0),
        ])
        const sidebarBadges: SidebarBadgeCounts = {
            news: newsRes.success ? newsRes.data : 0,
            adminTickets: adminTicketsRes.success ? adminTicketsRes.data.total : 0,
            adminPitches: adminPitchesRes.success ? adminPitchesRes.data.length : 0,
            adminInbox,
            consultantSupport,
        }

        return (
            <ThemeProvider>
                <AppLayout user={userData} role={role} permissions={userPermissions} sidebarBadges={sidebarBadges}>
                    <LayoutPreferencesProvider>
                        {children}
                    </LayoutPreferencesProvider>
                    <Tour initialDone={profile?.onboarding_tour_done ?? false} />
                </AppLayout>
            </ThemeProvider>
        )
    } catch (e) {
        const err = e as { digest?: string }
        if (err?.digest !== 'NEXT_REDIRECT') {
            logger.error({ event: 'protected_layout.failed', error: e })
        }
        redirect('/login')
    }
}
