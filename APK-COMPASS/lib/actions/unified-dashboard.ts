'use server'

import { createClient } from '@/lib/supabase/server'
import { getDashboardStats, getContractStatus, getQuickActions } from '@/lib/actions/dashboard'
import { getCentralaStats, getConsultantsList } from '@/lib/actions/centrala'
import { getRecentNotifications } from '@/lib/actions/notifications'
import { getMyRecruiter, type MyRecruiterInfo } from '@/lib/actions/centrala-management'
import { getAdminDashboardData, type AdminDashboardData } from '@/lib/actions/admin-dashboard'
import { isSuperAdmin } from '@/lib/auth/super-admins'

export interface AdminKpiStats {
    totalUsers: number
    activeContracts: number
    pendingInvoices: number
    totalDocuments: number
    newUsersThisWeek: number
}

async function getAdminKpiStats(): Promise<AdminKpiStats> {
    const supabase = createClient()

    const oneWeekAgo = new Date()
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)

    const [
        { count: totalUsers },
        { count: newUsersThisWeek },
        { count: totalProjects },
        { count: pendingInvoices },
        { count: totalDocuments },
    ] = await Promise.all([
        supabase.from('candidates').select('*', { count: 'exact', head: true }),
        supabase.from('candidates').select('*', { count: 'exact', head: true })
            .gte('created_at', oneWeekAgo.toISOString()),
        supabase.from('projects').select('*', { count: 'exact', head: true }),
        supabase.from('invoices').select('*', { count: 'exact', head: true })
            .eq('status', 'submitted'),
        supabase.from('app_documents').select('*', { count: 'exact', head: true })
            .eq('is_archived', false),
    ])

    return {
        totalUsers: totalUsers || 0,
        activeContracts: totalProjects || 0,
        pendingInvoices: pendingInvoices || 0,
        totalDocuments: totalDocuments || 0,
        newUsersThisWeek: newUsersThisWeek || 0,
    }
}

export async function getUnifiedDashboardData(roleHint?: string) {
    try {
        const supabase = createClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return { success: false, error: 'Nie jesteś zalogowany' }
        }

        const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single()

    const baseRole = roleHint || profile?.role || 'consultant'
    const role = isSuperAdmin(user.email) ? 'administrator' : baseRole

    const isSuperAdminUser = isSuperAdmin(user.email)

    // ─── Centrala subgroup detection ──────────────────────────────────────────
    let centralaSubRole: 'recruiter' | 'delivery_lead' | 'finance' | null = null
    if (role === 'centrala' || role === 'consultant_manager') {
        const { data: accessEntry } = await supabase
            .from('centrala_access_list')
            .select('centrala_role')
            .eq('email', user.email!)
            .maybeSingle()
        centralaSubRole = (accessEntry?.centrala_role as typeof centralaSubRole) || 'recruiter'
    }

    // ─── PERF: Role-specific data fetched in parallel ─────────────────────────
    const roleDataPromise = (role === 'admin' || role === 'administrator' || role === 'centrala' || role === 'consultant_manager')
        ? Promise.all([
            getCentralaStats(),
            getConsultantsList(),
            (role === 'admin' || role === 'administrator') ? getAdminKpiStats() : Promise.resolve(null),
            (role === 'admin' || role === 'administrator') ? getAdminDashboardData().catch(() => null) : Promise.resolve(null),
        ]).catch(() => [null, null, null, null] as const)
        : (role === 'consultant')
            ? Promise.all([
                getDashboardStats(),
                getContractStatus(),
                getQuickActions(),
                getRecentNotifications(5, false),
                getMyRecruiter()
            ]).catch(() => [null, null, null, null, null] as const)
            : Promise.resolve(null)

    const roleData = await roleDataPromise

    const userProfile = {
        ...profile,
        email: user.email!,
        created_at: user.created_at || new Date().toISOString(),
        last_sign_in_at: user.last_sign_in_at,
        role: role as 'consultant' | 'admin' | 'centrala' | 'administrator'
    }

    // ─── Unpack role-specific data ────────────────────────────────────────────
    let adminKpi: AdminKpiStats | null = null
    let adminDashboardData: AdminDashboardData | null = null
    let centralaStats = null
    let consultantsList = null
    let consultantDashboard = null
    let recruiterInfo: MyRecruiterInfo | null = null

    if ((role === 'admin' || role === 'administrator' || role === 'centrala' || role === 'consultant_manager') && Array.isArray(roleData) && roleData.length === 4) {
        const [stats, consultants, kpi, dashData] = roleData as [any, any, AdminKpiStats | null, AdminDashboardData | null]
        centralaStats = stats
        consultantsList = consultants
        adminKpi = kpi
        adminDashboardData = dashData
    } else if (role === 'consultant' && Array.isArray(roleData) && roleData.length === 5) {
        const [statsResult, contractResult, actionsResult, notificationsResult, recruiterResult] = roleData as [any, any, any, any, any]
        recruiterInfo = recruiterResult
        consultantDashboard = {
            stats: statsResult?.success ? statsResult.stats : null,
            contract: contractResult?.success ? contractResult : null,
            actions: (actionsResult?.success && actionsResult?.actions) ? actionsResult.actions : [],
            notifications: notificationsResult?.success ? notificationsResult.notifications : []
        }
    }

        return {
            success: true,
            userProfile,
            role,
            centralaSubRole,
            centralaStats,
            consultantsList,
            consultantDashboard,
            adminKpi,
            recruiterInfo,
            adminDashboardData,
            isSuperAdmin: isSuperAdminUser,
        }
    } catch (_e) {
        return { success: false, error: 'Nie udało się załadować danych' }
    }
}
