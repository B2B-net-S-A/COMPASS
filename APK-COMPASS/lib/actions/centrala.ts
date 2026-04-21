'use server'

import { createClient } from '@/lib/supabase/server'

export interface ConsultantSummary {
    id: string
    full_name: string | null
    email: string | null
    avatar_url: string | null
    role: string
    current_status: string | null
    loyalty_tier: string
    loyalty_points: number
    ambassador_status: string | null
    verifier_status: string | null
    sales_support_status: string | null
    created_at: string
}

export interface DashboardStats {
    totalConsultants: number
    onBench: number
    avgPoints: number
    tierDistribution: {
        bronze: number
        silver: number
        gold: number
        platinum: number
    }
}

export async function getConsultantsList() {
    const supabase = createClient()

    // Check permissions
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    // Check if user has portfolio-based filtering
    const { data: accessEntry } = await supabase
        .from('centrala_access_list')
        .select('centrala_role, access_mode')
        .eq('email', user.email)
        .single()

    // Determine if we need to filter by assignments
    const needsFiltering = accessEntry
        && accessEntry.access_mode === 'portfolio'
        && accessEntry.centrala_role !== 'finance'

    if (needsFiltering) {
        // Get assigned consultant IDs for this user
        const { data: assignments } = await supabase
            .from('consultant_assignments')
            .select('consultant_id')
            .eq('assigned_to', user.id)

        const assignedIds = assignments?.map(a => a.consultant_id) || []

        if (assignedIds.length === 0) {
            return [] as ConsultantSummary[]
        }

        const { data, error } = await supabase
            .from('profiles')
            .select('id, full_name, email, avatar_url, role, current_status, loyalty_tier, loyalty_points, ambassador_status, verifier_status, sales_support_status, created_at')
            .eq('role', 'consultant')
            .in('id', assignedIds)
            .order('full_name', { ascending: true })

        if (error) {
            console.error('Error fetching filtered consultants:', error)
            throw new Error('Failed to fetch consultants')
        }

        return data as ConsultantSummary[]
    }

    // Full access: admins, finance, or users with access_mode='full'
    const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, avatar_url, role, current_status, loyalty_tier, loyalty_points, ambassador_status, verifier_status, sales_support_status, created_at')
        .eq('role', 'consultant')
        .order('full_name', { ascending: true })

    if (error) {
        console.error('Error fetching consultants:', error)
        throw new Error('Failed to fetch consultants')
    }

    return data as ConsultantSummary[]
}

export async function getCentralaStats(): Promise<DashboardStats> {
    const consultants = await getConsultantsList()

    const stats: DashboardStats = {
        totalConsultants: consultants.length,
        onBench: 0,
        avgPoints: 0,
        tierDistribution: {
            bronze: 0,
            silver: 0,
            gold: 0,
            platinum: 0
        }
    }

    let totalPoints = 0

    consultants.forEach(c => {
        // Bench status check
        if (c.current_status === 'bench' || c.current_status === 'available') {
            stats.onBench++
        }

        // Tier distribution
        const tier = (c.loyalty_tier || 'bronze').toLowerCase() as keyof typeof stats.tierDistribution
        if (stats.tierDistribution[tier] !== undefined) {
            stats.tierDistribution[tier]++
        } else {
            // fallback for undefined tiers
            stats.tierDistribution.bronze++
        }

        totalPoints += (c.loyalty_points || 0)
    })

    stats.avgPoints = consultants.length > 0 ? Math.round(totalPoints / consultants.length) : 0

    return stats
}

export async function getCentralaData(profileId: string) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    // Fetch benefit declarations
    const { data: benefits } = await supabase
        .from('benefit_declarations')
        .select('*')
        .eq('profile_id', profileId)
        .order('created_at', { ascending: false })

    // Fetch invoices
    const { data: invoices } = await supabase
        .from('invoices')
        .select('*')
        .eq('consultant_id', profileId)
        .order('created_at', { ascending: false })

    // Fetch equipment requests
    const { data: equipment } = await supabase
        .from('equipment_requests')
        .select('*')
        .eq('profile_id', profileId)
        .order('created_at', { ascending: false })

    // Fetch stats
    const stats = await getCentralaStats()

    return {
        benefits: benefits || [],
        invoices: invoices || [],
        equipment: equipment || [],
        stats
    }
}

export async function submitBenefitDeclaration(profileId: string, variant: string, type: 'medical' | 'sport') {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    // Get user profile for email notification
    const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', profileId)
        .single()

    // Save declaration to database
    const { data: declaration, error: dbError } = await supabase
        .from('benefit_declarations')
        .insert({
            profile_id: profileId,
            benefit_type: type,
            variant_name: variant,
            status: 'active'
        })
        .select()
        .single()

    if (dbError) {
        console.error('Failed to save benefit declaration:', dbError)
        throw new Error('Failed to save declaration')
    }

    // Send email notification
    const { getSystemSetting } = await import('@/lib/actions/settings')
    const { sendBenefitDeclarationEmail } = await import('@/lib/email')

    const notificationEmail = await getSystemSetting('notification_email')

    if (notificationEmail && profile) {
        await sendBenefitDeclarationEmail(notificationEmail, {
            userName: profile.full_name || 'Unknown User',
            userEmail: profile.email || '',
            benefitType: type,
            variantName: variant,
            declarationId: declaration.id
        })
    }

    return { success: true, declarationId: declaration.id }
}

export async function submitEquipmentRequest(
    profileId: string,
    itemName: string,
    category: string,
    details?: string
) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    // Get user profile for email notification
    const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', profileId)
        .single()

    // Try to insert into equipment_requests table
    try {
        const { data, error } = await supabase
            .from('equipment_requests')
            .insert({
                profile_id: profileId,
                item_name: itemName,
                category: category,
                details: details || null,
                status: 'w_toku',
                created_at: new Date().toISOString()
            })
            .select()
            .single()

        if (error) {
            console.error('Equipment request DB error:', error)
            throw new Error(`Failed to save equipment request: ${error.message}`)
        }

        // Send email notification
        const { getSystemSetting } = await import('@/lib/actions/settings')
        const { sendEquipmentRequestEmail } = await import('@/lib/email')

        const notificationEmail = await getSystemSetting('notification_email')

        if (notificationEmail && profile) {
            await sendEquipmentRequestEmail(notificationEmail, {
                userName: profile.full_name || 'Unknown User',
                userEmail: profile.email || '',
                itemName,
                category,
                details: details || 'Brak szczegółów',
                requestId: data.id
            })
        }

        return { success: true, data }
    } catch (err) {
        console.error('Equipment request error:', err)
        throw err
    }
}
