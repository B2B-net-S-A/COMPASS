'use server'

import { createClient } from '@/lib/supabase/server'
import { createNotification } from '@/lib/actions/notifications'
import { sendRoleChangeEmail } from '@/lib/email'

const CENTRALA_ROLE_LABELS: Record<string, string> = {
    recruiter: 'Rekruter',
    delivery_lead: 'Delivery Lead',
    finance: 'Finanse',
}

// ============================================================
// Types
// ============================================================

export interface CentralaMember {
    id: string
    email: string
    full_name: string | null
    centrala_role: 'recruiter' | 'delivery_lead' | 'finance'
    created_at: string
    // Joined from profiles
    profile_id: string | null
    avatar_url: string | null
    last_sign_in: string | null
    assignment_count: number
}

export interface ConsultantAssignment {
    id: string
    consultant_id: string
    assigned_to: string
    assignment_type: 'recruiter' | 'delivery_lead'
    assigned_by: string | null
    notes: string | null
    created_at: string
    // Joined from profiles
    consultant_name: string | null
    consultant_email: string | null
    consultant_avatar: string | null
    consultant_status: string | null
    assigned_to_name: string | null
}

export interface ConsultantForAssignment {
    id: string
    full_name: string | null
    email: string | null
    avatar_url: string | null
    current_status: string | null
    loyalty_tier: string | null
}

// ============================================================
// Admin check helper
// ============================================================

async function requireAdmin() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (!profile || !['administrator', 'admin'].includes(profile.role)) {
        throw new Error('Admin access required')
    }

    return { supabase, user }
}

// ============================================================
// 1. Centrala Members CRUD
// ============================================================

export async function getCentralaMembers(): Promise<CentralaMember[]> {
    const { supabase } = await requireAdmin()

    // Get access list
    const { data: accessList, error } = await supabase
        .from('centrala_access_list')
        .select('*')
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Error fetching centrala members:', error)
        throw new Error('Failed to fetch centrala members')
    }

    if (!accessList || accessList.length === 0) return []

    // Get matching profiles for additional info
    const emails = accessList.map(a => a.email)
    const { data: profiles } = await supabase
        .from('profiles')
        .select('id, email, full_name, avatar_url')
        .in('email', emails)

    // Get assignment counts per centrala member
    const profileMap = new Map<string, { id: string, full_name: string | null, avatar_url: string | null }>()
    profiles?.forEach(p => {
        if (p.email) profileMap.set(p.email, p)
    })

    // Count assignments per profile
    const profileIds = profiles?.map(p => p.id) || []
    const assignmentCounts = new Map<string, number>()

    if (profileIds.length > 0) {
        const { data: assignments } = await supabase
            .from('consultant_assignments')
            .select('assigned_to')

        if (assignments) {
            assignments.forEach(a => {
                const current = assignmentCounts.get(a.assigned_to) || 0
                assignmentCounts.set(a.assigned_to, current + 1)
            })
        }
    }

    return accessList.map(item => {
        const profile = profileMap.get(item.email)
        return {
            id: item.id,
            email: item.email,
            full_name: item.full_name || profile?.full_name || null,
            centrala_role: item.centrala_role || 'recruiter',
            created_at: item.created_at,
            profile_id: profile?.id || null,
            avatar_url: profile?.avatar_url || null,
            last_sign_in: null,
            assignment_count: profile ? (assignmentCounts.get(profile.id) || 0) : 0,
        }
    })
}

export async function addCentralaMember(
    email: string,
    centralaRole: 'recruiter' | 'delivery_lead' | 'finance',
    fullName?: string
) {
    const { supabase } = await requireAdmin()

    if (!email.trim().endsWith('@b2bnetwork.pl')) {
        throw new Error('Tylko adresy @b2bnetwork.pl są dozwolone.')
    }

    const { error } = await supabase
        .from('centrala_access_list')
        .insert({
            email: email.trim().toLowerCase(),
            centrala_role: centralaRole,
            full_name: fullName?.trim() || null,
        })

    if (error) {
        if (error.code === '23505') {
            throw new Error('Ten adres email jest już na liście.')
        }
        console.error('Error adding centrala member:', error)
        throw new Error('Błąd dodawania: ' + error.message)
    }

    const normalizedEmail = email.trim().toLowerCase()
    const roleLabel = CENTRALA_ROLE_LABELS[centralaRole] || centralaRole

    try {
        const { data: targetProfile } = await supabase
            .from('profiles')
            .select('id, full_name')
            .eq('email', normalizedEmail)
            .maybeSingle()

        const displayName = fullName?.trim() || targetProfile?.full_name || normalizedEmail.split('@')[0]

        if (targetProfile) {
            await createNotification({
                userId: targetProfile.id,
                type: 'role_change',
                titlePl: 'Twoja rola została zmieniona',
                titleEn: 'Your role has been changed',
                bodyPl: `Otrzymałeś rolę ${roleLabel} w Centrali. Wyloguj się i zaloguj ponownie, aby aktywować nowe uprawnienia.`,
                bodyEn: `You have been assigned the ${roleLabel} role in Centrala. Log out and log in again to activate new permissions.`,
                actionUrl: '/login',
                priority: 'high',
            })
        }

        await sendRoleChangeEmail(normalizedEmail, displayName, roleLabel, 'added')
    } catch (notifErr) {
        console.error('[addCentralaMember] Notification failed (non-blocking):', notifErr)
    }

    return { success: true }
}

export async function updateCentralaMember(
    id: string,
    updates: {
        centrala_role?: 'recruiter' | 'delivery_lead' | 'finance'
        full_name?: string
    }
) {
    const { supabase } = await requireAdmin()

    const { error } = await supabase
        .from('centrala_access_list')
        .update(updates)
        .eq('id', id)

    if (error) {
        console.error('Error updating centrala member:', error)
        throw new Error('Błąd aktualizacji: ' + error.message)
    }

    return { success: true }
}

export async function removeCentralaMember(id: string) {
    const { supabase } = await requireAdmin()

    // Get email before deletion for cleanup
    const { data: member } = await supabase
        .from('centrala_access_list')
        .select('email')
        .eq('id', id)
        .single()

    // Delete from access list
    const { error } = await supabase
        .from('centrala_access_list')
        .delete()
        .eq('id', id)

    if (error) {
        console.error('Error removing centrala member:', error)
        throw new Error('Błąd usuwania: ' + error.message)
    }

    // Also remove their assignments if they have a profile
    if (member?.email) {
        const { data: profile } = await supabase
            .from('profiles')
            .select('id, full_name')
            .eq('email', member.email)
            .single()

        if (profile) {
            await supabase
                .from('consultant_assignments')
                .delete()
                .eq('assigned_to', profile.id)
        }

        try {
            const displayName = profile?.full_name || member.email.split('@')[0]

            if (profile) {
                await createNotification({
                    userId: profile.id,
                    type: 'role_change',
                    titlePl: 'Twoja rola w Centrali została odebrana',
                    titleEn: 'Your Centrala role has been revoked',
                    bodyPl: 'Po ponownym zalogowaniu powrócisz do roli Konsultanta.',
                    bodyEn: 'After logging in again you will return to the Consultant role.',
                    actionUrl: '/login',
                    priority: 'high',
                })
            }

            await sendRoleChangeEmail(member.email, displayName, '', 'removed')
        } catch (notifErr) {
            console.error('[removeCentralaMember] Notification failed (non-blocking):', notifErr)
        }
    }

    return { success: true }
}

// ============================================================
// 2. Consultant Assignments CRUD
// ============================================================

export async function getConsultantAssignments(assignedToId?: string): Promise<ConsultantAssignment[]> {
    const { supabase } = await requireAdmin()

    let query = supabase
        .from('consultant_assignments')
        .select('*')
        .order('created_at', { ascending: false })

    if (assignedToId) {
        query = query.eq('assigned_to', assignedToId)
    }

    const { data: assignments, error } = await query

    if (error) {
        console.error('Error fetching assignments:', error)
        throw new Error('Failed to fetch assignments')
    }

    if (!assignments || assignments.length === 0) return []

    // Get consultant profiles
    const consultantIds = Array.from(new Set(assignments.map(a => a.consultant_id)))
    const assignedToIds = Array.from(new Set(assignments.map(a => a.assigned_to)))
    const allIds = Array.from(new Set([...consultantIds, ...assignedToIds]))

    const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email, avatar_url, current_status')
        .in('id', allIds)

    const profileMap = new Map<string, { full_name: string | null, email: string | null, avatar_url: string | null, current_status: string | null }>()
    profiles?.forEach(p => profileMap.set(p.id, p))

    return assignments.map(a => {
        const consultant = profileMap.get(a.consultant_id)
        const assignedTo = profileMap.get(a.assigned_to)
        return {
            ...a,
            consultant_name: consultant?.full_name || null,
            consultant_email: consultant?.email || null,
            consultant_avatar: consultant?.avatar_url || null,
            consultant_status: consultant?.current_status || null,
            assigned_to_name: assignedTo?.full_name || null,
        }
    })
}

/**
 * Returns the profile id for a centrala member by email.
 * The member must have logged in at least once so that their
 * profile exists (profiles.id = auth.users.id, set by trigger).
 * Throws a clear error if member has never logged in.
 */
export async function ensureCentralaMemberProfile(
    email: string,
    _fullName: string | null
): Promise<{ profileId?: string; error?: string }> {
    const { supabase } = await requireAdmin()

    // Look up profile by email (created automatically when user first logs in)
    const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', email)
        .maybeSingle()

    if (existingProfile) return { profileId: existingProfile.id }

    // Profile doesn't exist — user has never logged in
    // Return error object instead of throwing — Next.js production masks thrown errors
    return {
        error: `Użytkownik ${email} nie ma jeszcze profilu w systemie. ` +
            `Poproś tę osobę o zalogowanie się do aplikacji przynajmniej raz, ` +
            `a następnie spróbuj ponownie przypisać konsultantów.`
    }
}

export async function assignConsultant(
    consultantId: string,
    assignedToId: string,
    assignmentType: 'recruiter' | 'delivery_lead'
): Promise<{ success: boolean; error?: string }> {
    const { supabase, user } = await requireAdmin()

    // --- VALIDATION: Consultant can only have ONE recruiter ---
    if (assignmentType === 'recruiter') {
        const { data: existing } = await supabase
            .from('consultant_assignments')
            .select('id, assigned_to')
            .eq('consultant_id', consultantId)
            .eq('assignment_type', 'recruiter')
            .maybeSingle()

        if (existing && existing.assigned_to !== assignedToId) {
            // Find recruiter's name
            const { data: recruiterProfile } = await supabase
                .from('profiles')
                .select('full_name, email')
                .eq('id', existing.assigned_to)
                .single()

            const recruiterName = recruiterProfile?.full_name || recruiterProfile?.email || 'nieznany'
            // Return error object instead of throwing — Next.js production masks thrown errors
            return {
                success: false,
                error: `ALREADY_ASSIGNED:${recruiterName}:Konsultant jest już przypisany do rekrutera ${recruiterName}. Najpierw rekruter powinien wypisać konsultanta ze swojej listy.`
            }
        }
    }

    const { error } = await supabase
        .from('consultant_assignments')
        .insert({
            consultant_id: consultantId,
            assigned_to: assignedToId,
            assignment_type: assignmentType,
            assigned_by: user.id,
        })

    if (error) {
        if (error.code === '23505') {
            return { success: false, error: 'To przypisanie już istnieje.' }
        }
        console.error('Error assigning consultant:', error)
        return { success: false, error: 'Błąd przypisania: ' + error.message }
    }

    return { success: true }
}

export interface BulkAssignResult {
    success: boolean
    assignedCount: number
    skippedCount: number
    skipped: Array<{ consultantId: string; consultantName: string; currentRecruiter: string }>
}

export async function bulkAssignConsultants(
    consultantIds: string[],
    assignedToId: string,
    assignmentType: 'recruiter' | 'delivery_lead'
): Promise<BulkAssignResult> {
    const { supabase, user } = await requireAdmin()

    let idsToAssign = consultantIds
    const skipped: Array<{ consultantId: string; consultantName: string; currentRecruiter: string }> = []

    // --- VALIDATION: For recruiter type, filter out already-assigned consultants ---
    if (assignmentType === 'recruiter') {
        const { data: existingAssignments } = await supabase
            .from('consultant_assignments')
            .select('consultant_id, assigned_to')
            .in('consultant_id', consultantIds)
            .eq('assignment_type', 'recruiter')

        if (existingAssignments && existingAssignments.length > 0) {
            // Find which are assigned to ANOTHER recruiter
            const conflicting = existingAssignments.filter(a => a.assigned_to !== assignedToId)

            if (conflicting.length > 0) {
                // Get names for better error messages
                const conflictConsultantIds = conflicting.map(c => c.consultant_id)
                const conflictRecruiterIds = Array.from(new Set(conflicting.map(c => c.assigned_to)))
                const allProfileIds = [...conflictConsultantIds, ...conflictRecruiterIds]

                const { data: profiles } = await supabase
                    .from('profiles')
                    .select('id, full_name, email')
                    .in('id', allProfileIds)

                const profileMap = new Map<string, string>()
                profiles?.forEach(p => profileMap.set(p.id, p.full_name || p.email || 'nieznany'))

                conflicting.forEach(c => {
                    skipped.push({
                        consultantId: c.consultant_id,
                        consultantName: profileMap.get(c.consultant_id) || 'nieznany',
                        currentRecruiter: profileMap.get(c.assigned_to) || 'nieznany',
                    })
                })

                // Remove conflicting IDs from insert list
                const conflictingIds = new Set(conflictConsultantIds)
                idsToAssign = consultantIds.filter(id => !conflictingIds.has(id))
            }

            // Also remove already-assigned-to-same-recruiter (no-op duplicates)
            const alreadySame = existingAssignments.filter(a => a.assigned_to === assignedToId)
            const alreadySameIds = new Set(alreadySame.map(a => a.consultant_id))
            idsToAssign = idsToAssign.filter(id => !alreadySameIds.has(id))
        }
    }

    if (idsToAssign.length > 0) {
        const inserts = idsToAssign.map(cId => ({
            consultant_id: cId,
            assigned_to: assignedToId,
            assignment_type: assignmentType,
            assigned_by: user.id,
        }))

        const { error } = await supabase
            .from('consultant_assignments')
            .upsert(inserts, { onConflict: 'consultant_id,assigned_to,assignment_type' })

        if (error) {
            console.error('Error bulk assigning:', error)
            throw new Error('Błąd masowego przypisania: ' + error.message)
        }
    }

    return {
        success: true,
        assignedCount: idsToAssign.length,
        skippedCount: skipped.length,
        skipped,
    }
}

export async function unassignConsultant(assignmentId: string) {
    const { supabase } = await requireAdmin()

    const { error } = await supabase
        .from('consultant_assignments')
        .delete()
        .eq('id', assignmentId)

    if (error) {
        console.error('Error unassigning consultant:', error)
        throw new Error('Błąd usuwania przypisania: ' + error.message)
    }

    return { success: true }
}

// ============================================================
// 3. Query helpers
// ============================================================

export async function getAllConsultants(): Promise<ConsultantForAssignment[]> {
    const { supabase } = await requireAdmin()

    const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, avatar_url, current_status, loyalty_tier')
        .eq('role', 'consultant')
        .order('full_name', { ascending: true })

    if (error) {
        console.error('Error fetching consultants:', error)
        throw new Error('Failed to fetch consultants')
    }

    return (data || []) as ConsultantForAssignment[]
}

export async function getUnassignedConsultants(): Promise<ConsultantForAssignment[]> {
    const { supabase } = await requireAdmin()

    // Get all consultants
    const { data: allConsultants } = await supabase
        .from('profiles')
        .select('id, full_name, email, avatar_url, current_status, loyalty_tier')
        .eq('role', 'consultant')
        .order('full_name', { ascending: true })

    if (!allConsultants) return []

    // Get all assigned consultant IDs (for recruiter type)
    const { data: assignments } = await supabase
        .from('consultant_assignments')
        .select('consultant_id')
        .eq('assignment_type', 'recruiter')

    const assignedIds = new Set(assignments?.map(a => a.consultant_id) || [])

    return allConsultants.filter(c => !assignedIds.has(c.id)) as ConsultantForAssignment[]
}

export async function getAssignmentStats() {
    const { supabase } = await requireAdmin()

    // Get all assignments
    const { data: assignments } = await supabase
        .from('consultant_assignments')
        .select('assigned_to, assignment_type')

    // Get all consultants count
    const { count: totalConsultants } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'consultant')

    // Get assigned consultant IDs (recruiter type)
    const { data: recruiterAssignments } = await supabase
        .from('consultant_assignments')
        .select('consultant_id')
        .eq('assignment_type', 'recruiter')

    const assignedCount = new Set(recruiterAssignments?.map(a => a.consultant_id) || []).size
    const unassignedCount = (totalConsultants || 0) - assignedCount

    // Count per assigned_to
    const countPerMember = new Map<string, number>()
    assignments?.forEach(a => {
        const key = a.assigned_to
        countPerMember.set(key, (countPerMember.get(key) || 0) + 1)
    })

    const counts = Array.from(countPerMember.values())
    const avgAssignments = counts.length > 0 ? Math.round(counts.reduce((a, b) => a + b, 0) / counts.length) : 0
    const maxAssignments = counts.length > 0 ? Math.max(...counts) : 0
    const minAssignments = counts.length > 0 ? Math.min(...counts) : 0

    return {
        totalConsultants: totalConsultants || 0,
        assignedCount,
        unassignedCount,
        avgAssignments,
        maxAssignments,
        minAssignments,
        memberCount: countPerMember.size,
    }
}

// ============================================================
// 4. Consultant-facing: get my assigned recruiter
// ============================================================

export interface MyRecruiterInfo {
    full_name: string
    email: string
    phone: string | null
    avatar_url: string | null
}

/**
 * Returns the recruiter assigned to the currently logged-in consultant.
 * Reads from consultant_assignments (assignment_type = 'recruiter')
 * and joins with profiles + centrala_access_list for contact details.
 * Does NOT require admin — any authenticated user can call this.
 */
export async function getMyRecruiter(): Promise<MyRecruiterInfo | null> {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    // Find recruiter assignment for this consultant
    const { data: assignment, error } = await supabase
        .from('consultant_assignments')
        .select('assigned_to')
        .eq('consultant_id', user.id)
        .eq('assignment_type', 'recruiter')
        .limit(1)
        .maybeSingle()

    if (error || !assignment) return null

    // Fetch recruiter profile
    const { data: recruiterProfile } = await supabase
        .from('profiles')
        .select('full_name, email, avatar_url, phone')
        .eq('id', assignment.assigned_to)
        .single()

    if (!recruiterProfile) return null

    // If no phone in profiles, try centrala_access_list
    const phone = recruiterProfile.phone || null

    return {
        full_name: recruiterProfile.full_name || 'Rekruter B2B.net',
        email: recruiterProfile.email || '',
        phone,
        avatar_url: recruiterProfile.avatar_url || null,
    }
}
