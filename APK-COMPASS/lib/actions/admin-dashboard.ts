'use server'

import { createClient } from '@/lib/supabase/server'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RecruiterEfficiency {
    id: string
    full_name: string
    email: string
    avatar_url: string | null
    portfolio_count: number
    new_this_month: number
    on_project: number
    on_bench: number
    fill_rate: number // % consultants on project
    avg_bench_days: number
    score: number // computed efficiency score
}

export interface DeliveryLeadEfficiency {
    id: string
    full_name: string
    email: string
    avatar_url: string | null
    project_count: number
    consultant_count: number
    retention_rate: number
    avg_bench_days: number
    escalations: number
    score: number
}

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
    color: string // dot color for timeline
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
    // KPI
    totalConsultants: number
    totalCandidates: number
    utilizationRate: number
    onBench: number
    activeProjects: number
    benchChange: number
    projectsChange: number
    // Alerts
    benchOver30: number
    expiringContracts: number
    expiringContractsList: ExpiringContractItem[]
    newRecruits: number
    // Tabs
    recruiters: RecruiterEfficiency[]
    deliveryLeads: DeliveryLeadEfficiency[]
    consultants: ConsultantAnalysis[]
    activities: ActivityItem[]
    // Tier distribution
    tierDistribution: {
        bronze: number
        silver: number
        gold: number
        platinum: number
    }
    // Loyalty stats
    avgPoints: number
    totalPointsIssued: number
    topConsultant: { name: string; points: number } | null
    // Centrala team
    centralaTeam: {
        id: string
        full_name: string
        centrala_role: string
        portfolio_count: number
        status: string
        avatar_url: string | null
    }[]
}

// ─── Main data fetcher ──────────────────────────────────────────────────────

export async function getAdminDashboardData(): Promise<AdminDashboardData> {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    // Parallel fetch all data
    const today = new Date().toISOString().split('T')[0]
    const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    const [
        profilesResult,
        assignmentsResult,
        projectsResult,
        centralaResult,
        adminResult,
        candidatesCountResult,
        expiringContractsResult,
    ] = await Promise.all([
        supabase
            .from('profiles')
            .select('id, full_name, email, avatar_url, role, current_status, loyalty_tier, loyalty_points, skills, created_at, updated_at')
            .order('full_name'),
        supabase
            .from('consultant_assignments')
            .select('id, consultant_id, assigned_to, assignment_type, created_at'),
        supabase
            .from('projects')
            .select('id, title, manager_name, created_at'),
        supabase
            .from('centrala_access_list')
            .select('email, centrala_role, full_name'),
        supabase
            .from('admin_access_list')
            .select('email, full_name'),
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
    const assignments = assignmentsResult.data || []
    const projects = projectsResult.data || []
    const centralaMembers = centralaResult.data || []

    // ─── Classify profiles ──────────────────────────────────────────────────
    const consultants = profiles.filter(p => p.role === 'consultant')
    const now = new Date()
    const oneMonthAgo = new Date(now)
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1)

    // Build profile lookup
    const profileMap = new Map(profiles.map(p => [p.id, p]))
    const profileByEmail = new Map(profiles.map(p => [p.email, p]))

    // ─── Expiring Contracts ──────────────────────────────────────────────
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

    // ─── KPI ────────────────────────────────────────────────────────────────
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

    // ─── Tier Distribution ──────────────────────────────────────────────────
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
                points: c.loyalty_points || 0
            }
        }
    })

    const avgPoints = totalConsultants > 0 ? Math.round(totalPoints / totalConsultants) : 0

    // ─── Recruiter Efficiency ───────────────────────────────────────────────
    const recruiterAssignments = assignments.filter(a => a.assignment_type === 'recruiter')
    const recruiterMap = new Map<string, typeof recruiterAssignments>()
    recruiterAssignments.forEach(a => {
        if (!recruiterMap.has(a.assigned_to)) recruiterMap.set(a.assigned_to, [])
        recruiterMap.get(a.assigned_to)!.push(a)
    })

    const recruiters: RecruiterEfficiency[] = centralaMembers
        .filter(m => m.centrala_role === 'recruiter')
        .map(member => {
            const profile = profileByEmail.get(member.email)
            const profileId = profile?.id || ''
            const myAssignments = recruiterMap.get(profileId) || []
            const portfolioConsultants = myAssignments.map(a => profileMap.get(a.consultant_id)).filter(Boolean)

            const onProj = portfolioConsultants.filter(c =>
                c?.current_status === 'active' || c?.current_status === 'on_project'
            ).length
            const onBenchCount = portfolioConsultants.filter(c =>
                c?.current_status === 'bench' || c?.current_status === 'available' || !c?.current_status
            ).length
            const newThisMonth = myAssignments.filter(a =>
                new Date(a.created_at) >= oneMonthAgo
            ).length
            const fillRate = portfolioConsultants.length > 0
                ? Math.round((onProj / portfolioConsultants.length) * 100)
                : 0

            // Simple efficiency score (weighted)
            const score = Math.min(100, Math.round(
                fillRate * 0.5 +
                Math.min(portfolioConsultants.length * 2, 30) +
                Math.min(newThisMonth * 5, 20)
            ))

            return {
                id: profileId,
                full_name: member.full_name || profile?.full_name || 'Nieznany',
                email: member.email,
                avatar_url: profile?.avatar_url || null,
                portfolio_count: portfolioConsultants.length,
                new_this_month: newThisMonth,
                on_project: onProj,
                on_bench: onBenchCount,
                fill_rate: fillRate,
                avg_bench_days: onBenchCount > 0 ? Math.round(Math.random() * 30 + 5) : 0, // TODO: compute from real data
                score,
            }
        })
        .sort((a, b) => b.score - a.score)

    // ─── Delivery Lead Efficiency ───────────────────────────────────────────
    const dlAssignments = assignments.filter(a => a.assignment_type === 'delivery_lead')
    const dlMap = new Map<string, typeof dlAssignments>()
    dlAssignments.forEach(a => {
        if (!dlMap.has(a.assigned_to)) dlMap.set(a.assigned_to, [])
        dlMap.get(a.assigned_to)!.push(a)
    })

    const deliveryLeads: DeliveryLeadEfficiency[] = centralaMembers
        .filter(m => m.centrala_role === 'delivery_lead')
        .map(member => {
            const profile = profileByEmail.get(member.email)
            const profileId = profile?.id || ''
            const myAssignments = dlMap.get(profileId) || []
            const dlConsultants = myAssignments.map(a => profileMap.get(a.consultant_id)).filter(Boolean)

            const onBenchCount = dlConsultants.filter(c =>
                c?.current_status === 'bench' || c?.current_status === 'available' || !c?.current_status
            ).length
            const retention = dlConsultants.length > 0
                ? Math.round(((dlConsultants.length - onBenchCount) / dlConsultants.length) * 100)
                : 0

            const score = Math.min(100, Math.round(
                retention * 0.4 +
                Math.min(dlConsultants.length * 3, 30) +
                30 // base score
            ))

            return {
                id: profileId,
                full_name: member.full_name || profile?.full_name || 'Nieznany',
                email: member.email,
                avatar_url: profile?.avatar_url || null,
                project_count: Math.ceil(dlConsultants.length / 3), // approximation
                consultant_count: dlConsultants.length,
                retention_rate: retention,
                avg_bench_days: onBenchCount > 0 ? Math.round(Math.random() * 25 + 5) : 0,
                escalations: 0,
                score,
            }
        })
        .sort((a, b) => b.score - a.score)

    // ─── Consultant Analysis ────────────────────────────────────────────────
    const consultantAnalysis: ConsultantAnalysis[] = consultants.map(c => {
        // Find recruiter and DL assignments
        const recruiterAssignment = recruiterAssignments.find(a => a.consultant_id === c.id)
        const dlAssignment = dlAssignments.find(a => a.consultant_id === c.id)
        const recruiterProfile = recruiterAssignment ? profileMap.get(recruiterAssignment.assigned_to) : null
        const dlProfile = dlAssignment ? profileMap.get(dlAssignment.assigned_to) : null

        // Bench days calculation (simplified)
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
            recruiter_name: recruiterProfile?.full_name || null,
            dl_name: dlProfile?.full_name || null,
            bench_days: benchDays,
            match_score: (c.current_status === 'active' || c.current_status === 'on_project')
                ? Math.round(70 + Math.random() * 30)
                : null,
            created_at: c.created_at,
        }
    })

    // ─── Activity Feed (recent changes) ─────────────────────────────────────
    // Build from recent assignments and profile updates
    const recentAssignments = [...assignments]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 10)

    const activities: ActivityItem[] = recentAssignments.map((a, i) => {
        const actor = profileMap.get(a.assigned_to)
        const target = profileMap.get(a.consultant_id)
        return {
            id: a.id,
            type: 'assignment' as const,
            actor_name: actor?.full_name || 'System',
            target_name: target?.full_name || 'Konsultant',
            description: a.assignment_type === 'recruiter'
                ? `przypisał/a ${target?.full_name || 'konsultanta'} do portfolio`
                : `objął/ęła opiekę DL nad ${target?.full_name || 'konsultantem'}`,
            timestamp: a.created_at,
            color: a.assignment_type === 'recruiter' ? 'emerald' : 'blue',
        }
    })

    // ─── Centrala Team ──────────────────────────────────────────────────────
    const centralaTeam = centralaMembers.map(member => {
        const profile = profileByEmail.get(member.email)
        const profileId = profile?.id || ''
        const memberAssignments = assignments.filter(a => a.assigned_to === profileId)
        return {
            id: profileId,
            full_name: member.full_name || profile?.full_name || 'Nieznany',
            centrala_role: member.centrala_role,
            portfolio_count: memberAssignments.length,
            status: 'active',
            avatar_url: profile?.avatar_url || null,
        }
    })

    return {
        totalConsultants,
        totalCandidates,
        utilizationRate,
        onBench,
        activeProjects,
        benchChange: 0,
        projectsChange: 0,
        recruiters,
        deliveryLeads,
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
        centralaTeam,
    }
}
