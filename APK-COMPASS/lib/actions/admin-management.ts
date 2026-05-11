'use server'

import { createClient } from '@/lib/supabase/server'
import { getSuperAdmins, isSuperAdmin } from '@/lib/auth/super-admins'
import { parseOrThrow } from '@/lib/validators/common'
import { addAdminMemberInputSchema, removeAdminMemberInputSchema } from '@/lib/validators/admin'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AdminMember {
    id: string
    email: string
    full_name: string | null
    created_at: string
    // Joined from profiles
    profile_id: string | null
    avatar_url: string | null
    has_logged_in: boolean
}

// ─── Super Admin check ──────────────────────────────────────────────────────

async function requireSuperAdmin() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    if (!isSuperAdmin(user.email)) {
        throw new Error('Wymagane uprawnienia Super Admina.')
    }

    return { supabase, user }
}

// ─── CRUD Operations ─────────────────────────────────────────────────────────

export async function getAdminMembers(): Promise<AdminMember[]> {
    const { supabase } = await requireSuperAdmin()

    const { data: adminList, error } = await supabase
        .from('admin_access_list')
        .select('*')
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Error fetching admin members:', error)
        throw new Error('Failed to fetch admin members')
    }

    if (!adminList || adminList.length === 0) return []

    // Get matching profiles
    const emails = adminList.map(a => a.email)
    const { data: profiles } = await supabase
        .from('profiles')
        .select('id, email, full_name, avatar_url')
        .in('email', emails)

    const profileMap = new Map<string, { id: string; full_name: string | null; avatar_url: string | null }>()
    profiles?.forEach(p => {
        if (p.email) profileMap.set(p.email, p)
    })

    return adminList.map(item => {
        const profile = profileMap.get(item.email)
        return {
            id: item.id,
            email: item.email,
            full_name: item.full_name || profile?.full_name || null,
            created_at: item.created_at,
            profile_id: profile?.id || null,
            avatar_url: profile?.avatar_url || null,
            has_logged_in: !!profile,
        }
    })
}

export async function addAdminMember(email: string) {
    const { supabase, user } = await requireSuperAdmin()

    // Zod walidacja: format email + domain @b2bnetwork.pl (Phase 18.4).
    const { email: emailLower } = parseOrThrow(addAdminMemberInputSchema, { email })

    // Prevent adding Super Admins (they already have full access)
    if (isSuperAdmin(emailLower)) {
        throw new Error('Super Admin nie wymaga dodawania — ma uprawnienia automatycznie.')
    }

    const { error } = await supabase
        .from('admin_access_list')
        .insert({
            email: emailLower,
            added_by: user.id,
        })

    if (error) {
        if (error.code === '23505') {
            throw new Error('Ten adres email jest już na liście administratorów.')
        }
        console.error('Error adding admin member:', error)
        throw new Error('Błąd dodawania: ' + error.message)
    }

    // If user has a profile, update their role immediately
    const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', emailLower)
        .maybeSingle()

    if (profile) {
        await supabase.from('profiles').update({ role: 'admin' }).eq('id', profile.id)
    }

    return { success: true }
}

export async function removeAdminMember(id: string) {
    const { supabase } = await requireSuperAdmin()

    // Zod walidacja: id musi być UUID (Phase 18.4).
    const { id: validId } = parseOrThrow(removeAdminMemberInputSchema, { id })

    // Get email before deletion
    const { data: member } = await supabase
        .from('admin_access_list')
        .select('email')
        .eq('id', validId)
        .single()

    const { error } = await supabase
        .from('admin_access_list')
        .delete()
        .eq('id', validId)

    if (error) {
        console.error('Error removing admin member:', error)
        throw new Error('Błąd usuwania: ' + error.message)
    }

    // Downgrade their role in profiles (they'll get correct role on next login via syncRole)
    if (member?.email) {
        const { data: profile } = await supabase
            .from('profiles')
            .select('id')
            .eq('email', member.email)
            .maybeSingle()

        if (profile) {
            await supabase.from('profiles').update({ role: 'consultant' }).eq('id', profile.id)
        }
    }

    return { success: true }
}

// ─── Check if current user is Super Admin ────────────────────────────────────

export async function checkIsSuperAdmin(): Promise<boolean> {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return false
    return isSuperAdmin(user.email)
}

// ─── List super admin emails (server-only; caller must already be super admin) ───

export async function listSuperAdmins(): Promise<readonly string[]> {
    await requireSuperAdmin()
    return getSuperAdmins()
}
