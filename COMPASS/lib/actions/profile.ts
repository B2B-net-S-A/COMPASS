'use server'

import { logCompat } from '@/lib/logger'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/admin'
import type { TablesUpdate } from '@/lib/supabase/database.types'
import { generateEmbedding } from '@/lib/ai/embeddings'
import { parseOrThrow } from '@/lib/validators/common'
import {
    consultantIdSchema,
    profileUpdateInputSchema,
    updateUserBioInputSchema,
    type ProfileUpdateInput,
} from '@/lib/validators/profile'

// Phase 1.0 (2026-05-04): extracted from legacy lib/actions/matching.ts.
// Drops candidate-syncing logic (candidates table is archived to compass_legacy).
// Keeps profile CRUD that the consultant onboarding/profile UI still needs.

export type ProfileUpdateData = ProfileUpdateInput

export async function updateUserBio(bio: string) {
    const { bio: validBio } = parseOrThrow(updateUserBioInputSchema, { bio })
    const result = await updateOwnProfile({ bio: validBio })
    if (!result.success) throw new Error(result.error)
    return { success: true }
}

export async function updateOwnProfile(
    data: ProfileUpdateData,
): Promise<{ success: true; warning?: string } | { success: false; error: string }> {
    try {
        const session = createClient()
        const { data: { user } } = await session.auth.getUser()
        if (!user) return { success: false, error: 'Nie jesteś zalogowany.' }

        const parsed = parseOrThrow(profileUpdateInputSchema, data)
        const updates = { ...parsed } as unknown as TablesUpdate<'profiles'>

        if (updates.available_from === '') {
            updates.available_from = null
        }

        if (parsed.bio !== undefined) {
            try {
                updates.embedding = await generateEmbedding(parsed.bio) as unknown as string
            } catch (e) {
                logCompat.warn('[ProfileUpdate] Failed to generate embedding:', e)
            }
        }

        // The service client is used only after getUser() and with an immutable
        // target id. This keeps profiles client writes removable in C2.
        const admin = createServiceClient()
        const { error } = await admin
            .from('profiles')
            .update(updates)
            .eq('id', user.id)

        if (error) {
            logCompat.error('[ProfileUpdate] Database update failed:', { code: error.code, userId: user.id })
            return { success: false, error: 'Nie udało się zapisać profilu.' }
        }

        revalidatePath('/home')
        revalidatePath('/profile')
        revalidatePath('/settings')
        return { success: true }
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        logCompat.error('[ProfileUpdate] Unexpected error:', e)
        return { success: false, error: msg || 'Nie udało się zapisać zmian. Spróbuj ponownie.' }
    }
}

/** Compatibility name for the single existing onboarding caller. */
export async function updateProfileFull(data: ProfileUpdateData) {
    return updateOwnProfile(data)
}

export async function deleteMyProfile() {
    throw new Error('Usunięcie konta wymaga zweryfikowanej procedury administracyjnej.')
}

export async function getMyProfile() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const admin = createServiceClient()
    const { data: profile } = await admin
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

    const admin = createServiceClient()
    const { data: profile } = await admin
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
        const admin = createServiceClient()
        await admin.from('profiles').update({ onboarding_completed: true }).eq('id', user.id)
    }

    return { success: true }
}
