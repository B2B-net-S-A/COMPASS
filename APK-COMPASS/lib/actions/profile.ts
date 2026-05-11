'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { generateEmbedding } from '@/lib/ai/embeddings'
import { parseOrThrow } from '@/lib/validators/common'
import {
    consultantIdSchema,
    profileUpdateInputSchema,
    updateUserBioInputSchema,
} from '@/lib/validators/profile'

// Phase 1.0 (2026-05-04): extracted from legacy lib/actions/matching.ts.
// Drops candidate-syncing logic (candidates table is archived to compass_legacy).
// Keeps profile CRUD that the consultant onboarding/profile UI still needs.

export interface ProfileUpdateData {
    bio?: string
    experience_years?: number
    current_status?: string
    capacity_percentage?: number
    project_sentiment?: string[]
    verifier_status?: string
    ambassador_status?: string
    sales_support_status?: string
    previous_clients?: string[]
    available_from?: string | null
    fte_status?: string | null
    max_monthly_hours?: number
    gdpr_consent?: boolean
    full_name?: string
    phone?: string
    embedding?: number[]
    skills?: string[]
    avatar_url?: string
    cv_url?: string
    tech_stack?: Record<string, unknown>[]
    certifications?: Record<string, unknown>[]
    work_preferences?: Record<string, unknown>
}

export async function updateUserBio(bio: string) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    // Phase 18.4: Zod walidacja długości bio (max 5000).
    const { bio: validBio } = parseOrThrow(updateUserBioInputSchema, { bio })

    const embedding = await generateEmbedding(validBio)
    const { error } = await supabase
        .from('profiles')
        .update({ bio: validBio, embedding })
        .eq('id', user.id)
    if (error) throw new Error(error.message)

    return { success: true }
}

export async function updateProfileFull(
    data: ProfileUpdateData,
): Promise<{ success: true; warning?: string } | { success: false; error: string }> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Nie jesteś zalogowany.' }

        // Phase 18.4: Zod walidacja każdego pola + odrzucenie sensitive fields
        // (role, email, embedding, loyalty_*, onboarding_*). Nawet jeśli atakujący
        // wyśle `{ role: 'admin' }` w request body, ten field jest dropowany przed
        // dotarciem do .update().
        const parsed = parseOrThrow(profileUpdateInputSchema, data)
        const updates: ProfileUpdateData = { ...parsed }

        if (updates.available_from === '') {
            updates.available_from = null
        }

        if (data.bio) {
            try {
                updates.embedding = await generateEmbedding(data.bio)
            } catch (e) {
                console.warn('[ProfileUpdate] Failed to generate embedding:', e)
            }
        }

        const { error } = await supabase
            .from('profiles')
            .update(updates)
            .eq('id', user.id)

        if (error) {
            const msg = (error as { message?: string }).message?.toLowerCase() ?? ''
            const looksLikeMissingColumn = msg.includes('column') && (msg.includes('phone') || msg.includes('does not exist') || msg.includes('undefined'))
            if (looksLikeMissingColumn && updates.phone !== undefined) {
                const { phone: _p, ...updatesWithoutPhone } = updates
                console.warn('[ProfileUpdate] Retrying without phone (column may be missing):', _p)
                const retry = await supabase.from('profiles').update(updatesWithoutPhone).eq('id', user.id)
                if (retry.error) {
                    return { success: false, error: `Błąd zapisu: ${retry.error.message}` }
                }
                revalidatePath('/home')
                revalidatePath('/profile')
                revalidatePath('/settings')
                return { success: true, warning: 'Imię i nazwisko zapisane. Numer telefonu nie został zapisany — w bazie brakuje kolumny "phone".' }
            }
            return { success: false, error: `Błąd zapisu do bazy: ${error.message}` }
        }

        revalidatePath('/home')
        revalidatePath('/profile')
        revalidatePath('/settings')
        return { success: true }
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error('[ProfileUpdate] Unexpected error:', e)
        return { success: false, error: msg || 'Nie udało się zapisać zmian. Spróbuj ponownie.' }
    }
}

export async function deleteMyProfile() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { error } = await supabase
        .from('profiles')
        .delete()
        .eq('id', user.id)
    if (error) throw new Error(`Failed to delete profile: ${error.message}`)

    return { success: true }
}

export async function getMyProfile() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()
    return profile
}

export async function getConsultantProfile360(consultantId: string) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false as const, error: 'Nie jesteś zalogowany' }

    // Phase 18.4: UUID walidacja przed .eq().
    const { consultantId: validId } = parseOrThrow(consultantIdSchema, { consultantId })

    const { data: callerProfile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (!callerProfile || callerProfile.role !== 'admin') {
        return { success: false as const, error: 'Brak uprawnień' }
    }

    const selectCols = 'id, full_name, email, avatar_url, phone, bio, skills, tech_stack, certifications, work_preferences, admin_notes, current_status, loyalty_tier, loyalty_points, experience_years, created_at'

    const { data: profile } = await supabase
        .from('profiles')
        .select(selectCols)
        .eq('id', validId)
        .single()

    if (profile) {
        return { success: true as const, profile }
    }

    return { success: false as const, error: 'Nie znaleziono profilu' }
}

export async function completeOnboarding() {
    const { cookies } = await import('next/headers')
    cookies().set('onboarding_done', 'true', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 30,
    })

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
        await supabase.from('profiles').update({ onboarding_completed: true }).eq('id', user.id)
    }

    return { success: true }
}
