'use server'

import { createClient } from '@/lib/supabase/server'

// Phase 16 (2026-05-07): centrala module + consultant_assignments table were dropped.
// Recruiter/Delivery-Lead efficiency views and the assignment-driven activity feed
// no longer have a data source — they were removed from this aggregator.

export interface ConsultantAnalysis {
    id: string
    full_name: string
    email: string
    avatar_url: string | null
    tech_stack: string | null
    skills: string[]
    current_status: string
    loyalty_tier: string
    loyalty_points: number
    project_name: string | null
    recruiter_name: string | null
    dl_name: string | null
    bench_days: number
    match_score: number | null
    created_at: string
}

export interface ActivityItem {
    id: string
    type: 'assignment' | 'status_change' | 'escalation' | 'points' | 'profile_update'
    actor_name: string
    target_name: string
    description: string
    timestamp: string
    color: string
}

export interface ExpiringContractItem {
    id: string
    consultant_name: string
    client_name: string
    project_name: string
    position: string
    end_date: string
    days_remaining: number
    status: string
}

export interface AdminDashboardData {
    totalConsultants: number
    totalCandidates: number
    utilizationRate: number
    onBench: number
    activeProjects: number
    benchChange: number
    projectsChange: number
    benchOver30: number
    expiringContracts: number
    expiringContractsList: ExpiringContractItem[]
    newRecruits: number
    consultants: ConsultantAnalysis[]
    activities: ActivityItem[]
    tierDistribution: {
        bronze: number
        silver: number
        gold: number
        platinum: number
    }
    avgPoints: number
    totalPointsIssued: number
    topConsultant: { name: string; points: number } | null
}

export async function getAdminDashboardData(): Promise<AdminDashboardData> {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const today = new Date().toISOString().split('T')[0]
    const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    const [
        profilesResult,
        projectsResult,
        candidatesCountResult,
        expiringContractsResult,
    ] = await Promise.all([
        supabase
            .from('profiles')
            .select('id, full_name, email, avatar_url, role, current_status, loyalty_tier, loyalty_points, skills, created_at, updated_at')
            .order('full_name'),
        supabase
            .from('projects')
            .select('id, title, manager_name, created_at'),
        supabase
            .from('candidates')
            .select('id', { count: 'exact', head: true })
            .eq('candidate_status', 'kandydat'),
        supabase
            .from('contracts')
            .select('id, consultant_id, client_name, project_name, position, end_date, status, hourly_rate')
            .in('status', ['active', 'ending_soon'])
            .gte('end_date', today)
            .lte('end_date', thirtyDaysFromNow),
    ])

    const profiles = profilesResult.data || []
    const projects = projectsResult.data || []

    const consultants = profiles.filter(p => p.role === 'consultant')
    const now = new Date()
    const oneMonthAgo = new Date(now)
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1)

    const profileMap = new Map(profiles.map(p => [p.id, p]))

    const expiringContractsRaw = expiringContractsResult.data || []
    const expiringContractsList: ExpiringContractItem[] = expiringContractsRaw.map(c => {
        const profile = profileMap.get(c.consultant_id)
        const daysRemaining = Math.max(0, Math.ceil(
            (new Date(c.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        ))
        return {
            id: c.id,
            consultant_name: profile?.full_name || 'Nieznany',
            client_name: c.client_name,
            project_name: c.project_name,
            position: c.position,
            end_date: c.end_date,
            days_remaining: daysRemaining,
            status: c.status,
        }
    }).sort((a, b) => a.days_remaining - b.days_remaining)

    const totalCandidates = candidatesCountResult.count || 0
    const totalConsultants = consultants.length
    const onBench = consultants.filter(c =>
        c.current_status === 'bench' || c.current_status === 'available' || !c.current_status
    ).length
    const onProject = consultants.filter(c =>
        c.current_status === 'active' || c.current_status === 'on_project'
    ).length
    const utilizationRate = totalConsultants > 0
        ? Math.round((onProject / totalConsultants) * 100)
        : 0
    const activeProjects = projects.length

    const tierDistribution = { bronze: 0, silver: 0, gold: 0, platinum: 0 }
    let totalPoints = 0
    let topConsultant: { name: string; points: number } | null = null

    consultants.forEach(c => {
        const tier = (c.loyalty_tier || 'bronze').toLowerCase() as keyof typeof tierDistribution
        if (tierDistribution[tier] !== undefined) {
            tierDistribution[tier]++
        } else {
            tierDistribution.bronze++
        }
        totalPoints += (c.loyalty_points || 0)
        if (!topConsultant || (c.loyalty_points || 0) > topConsultant.points) {
            topConsultant = {
                name: c.full_name || 'Nieznany',
                points: c.loyalty_points || 0,
            }
        }
    })

    const avgPoints = totalConsultants > 0 ? Math.round(totalPoints / totalConsultants) : 0

    const consultantAnalysis: ConsultantAnalysis[] = consultants.map(c => {
        let benchDays = 0
        if (c.current_status === 'bench' || c.current_status === 'available' || !c.current_status) {
            const updated = c.updated_at ? new Date(c.updated_at) : new Date(c.created_at)
            benchDays = Math.max(0, Math.floor((now.getTime() - updated.getTime()) / (1000 * 60 * 60 * 24)))
        }
        return {
            id: c.id,
            full_name: c.full_name || 'Nieznany',
            email: c.email || '',
            avatar_url: c.avatar_url,
            tech_stack: Array.isArray(c.skills) ? c.skills.join(', ') : null,
            skills: Array.isArray(c.skills) ? c.skills : [],
            current_status: c.current_status || 'bench',
            loyalty_tier: c.loyalty_tier || 'bronze',
            loyalty_points: c.loyalty_points || 0,
            project_name: (c.current_status === 'active' || c.current_status === 'on_project') ? 'Aktywny projekt' : null,
            recruiter_name: null,
            dl_name: null,
            bench_days: benchDays,
            match_score: (c.current_status === 'active' || c.current_status === 'on_project')
                ? Math.round(70 + Math.random() * 30)
                : null,
            created_at: c.created_at,
        }
    })

    const activities: ActivityItem[] = []

    return {
        totalConsultants,
        totalCandidates,
        utilizationRate,
        onBench,
        activeProjects,
        benchChange: 0,
        projectsChange: 0,
        consultants: consultantAnalysis,
        activities,
        tierDistribution,
        avgPoints,
        totalPointsIssued: totalPoints,
        topConsultant,
        benchOver30: consultantAnalysis.filter(c => c.bench_days > 30).length,
        expiringContracts: expiringContractsList.length,
        expiringContractsList,
        newRecruits: consultants.filter(c => new Date(c.created_at) >= oneMonthAgo).length,
    }
}
