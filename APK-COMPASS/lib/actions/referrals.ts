'use server'

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { ProjectReferral } from "@/lib/types"

export async function submitProjectReferral(data: Partial<ProjectReferral>) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    // Enforce referrer_user_id
    const referralData = {
        ...data,
        referrer_user_id: user.id,
        status: 'new'
    }

    const { data: inserted, error } = await supabase
        .from('project_referrals')
        .insert(referralData)
        .select()
        .single()

    if (error) {
        if (error.code === '23505') {
            throw new Error('Ta osoba została już zarekomendowana na ten projekt.')
        }
        throw new Error(`Failed to submit referral: ${error.message}`)
    }

    revalidatePath('/projects')
    revalidatePath('/profile')
    revalidatePath('/admin/referrals')
    return { success: true, data: inserted }
}

export async function getAdminReferrals(): Promise<ProjectReferral[]> {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    // Check admin role
    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (!profile || !['admin', 'consultant_manager', 'administrator', 'centrala'].includes(profile.role)) {
        throw new Error('Forbidden')
    }

    const { data, error } = await supabase
        .from('project_referrals')
        .select('*, project:projects(*), referrer:profiles!referrer_user_id(*)')
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Failed to fetch admin referrals:', error)
        return []
    }

    return data || []
}

export async function updateReferralStatus(referralId: string, status: string, rejectionReason?: string) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    const { error } = await supabase
        .from('project_referrals')
        .update({
            status,
            rejection_reason: rejectionReason,
            updated_at: new Date().toISOString()
        })
        .eq('id', referralId)

    if (error) throw new Error(`Failed to update: ${error.message}`)

    revalidatePath('/admin/referrals')
    revalidatePath('/profile')
    return { success: true }
}

export async function getMyReferrals(): Promise<ProjectReferral[]> {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    const { data, error } = await supabase
        .from('project_referrals')
        .select('*, project:projects(*)')
        .eq('referrer_user_id', user.id)
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Failed to fetch my referrals:', error)
        return []
    }

    return data || []
}

export async function getProjectReferralCount(projectId: string): Promise<number> {
    const supabase = createClient()
    const { count, error } = await supabase
        .from('project_referrals')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', projectId)
        .neq('status', 'withdrawn')

    if (error) return 0
    return count || 0
}

export async function withdrawReferral(referralId: string) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    const { error } = await supabase
        .from('project_referrals')
        .update({ status: 'withdrawn' })
        .eq('id', referralId)
        .eq('referrer_user_id', user.id)
        .in('status', ['new', 'in_review'])

    if (error) throw new Error(`Failed to withdraw: ${error.message}`)

    revalidatePath('/profile')
    return { success: true }
}

export async function getSelfReferralCount(): Promise<number> {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return 0

    const { count, error } = await supabase
        .from('project_referrals')
        .select('*', { count: 'exact', head: true })
        .eq('referrer_user_id', user.id)
        .eq('referral_type', 'self_referral')
        .in('status', ['new', 'in_review'])

    if (error) return 0
    return count || 0
}
