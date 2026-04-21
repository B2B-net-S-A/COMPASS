'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { generateEmbedding } from '@/lib/ai/embeddings'

export async function matchProjectsForUser(userId: string, limit: number = 5) {
    const supabase = createClient()

    // 1. Get user profile
    const { data: profile } = await supabase
        .from('profiles')
        .select('bio, embedding')
        .eq('id', userId)
        .single()

    if (!profile) throw new Error('Profile not found')

    let embedding = profile.embedding

    // 2. If no embedding but bio exists, generate it
    if (!embedding && profile.bio) {
        embedding = await generateEmbedding(profile.bio)
        // Save it for future
        await supabase
            .from('profiles')
            .update({ embedding })
            .eq('id', userId)
    }

    if (!embedding) return []

    // 3. Match projects using cosine similarity
    const { data: projects, error } = await supabase.rpc('match_projects', {
        query_embedding: embedding,
        match_threshold: 0.5, // 50% similarity threshold
        match_count: limit,
    })

    if (error) {
        console.error('Error matching projects:', error)
        return []
    }

    return projects
}

export async function updateUserBio(bio: string) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) throw new Error('Not authenticated')

    const embedding = await generateEmbedding(bio)

    const { error } = await supabase
        .from('profiles')
        .update({ bio, embedding })
        .eq('id', user.id)

    if (error) throw new Error(error.message)

    return { success: true }
}

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

export async function updateProfileFull(data: ProfileUpdateData): Promise<{ success: true; warning?: string } | { success: false; error: string }> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) return { success: false, error: 'Nie jesteś zalogowany.' }

    const updates: ProfileUpdateData = { ...data }

    // Fix: available_from as empty string will fail on DATE column
    if (updates.available_from === '') {
        updates.available_from = null
    }

    // If bio is updated, regenerate embedding
    if (data.bio) {
        try {
            updates.embedding = await generateEmbedding(data.bio)
        } catch (e) {
            console.warn('[ProfileUpdate] Failed to generate embedding:', e)
            // Continue without embedding update if AI fails
        }
    }

    console.log('[ProfileUpdate] Updating profile for user:', user.id, updates)

    const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id)

    // Fallback: jeśli błąd sugeruje brak kolumny (np. phone), ponów update bez tego pola
    if (error) {
        const msg = (error as { message?: string }).message?.toLowerCase() ?? ''
        const looksLikeMissingColumn = msg.includes('column') && (msg.includes('phone') || msg.includes('does not exist') || msg.includes('undefined'))
        if (looksLikeMissingColumn && updates.phone !== undefined) {
            const { phone: _p, ...updatesWithoutPhone } = updates
            console.warn('[ProfileUpdate] Retrying without phone (column may be missing):', _p)
            const retry = await supabase.from('profiles').update(updatesWithoutPhone).eq('id', user.id)
            if (retry.error) {
                console.error('[ProfileUpdate] Error updating profiles table:', retry.error)
                return { success: false, error: `Błąd zapisu: ${retry.error.message}` }
            }
            revalidatePath('/home')
            revalidatePath('/profile')
            revalidatePath('/more')
            return { success: true, warning: 'Imię i nazwisko zapisane. Numer telefonu nie został zapisany — w bazie brakuje kolumny "phone". Poproś administratora o wykonanie migracji.' }
        }
        console.error('[ProfileUpdate] Error updating profiles table:', error)
        return { success: false, error: `Błąd zapisu do bazy: ${error.message}` }
    }

        revalidatePath('/home')
        revalidatePath('/profile')
        revalidatePath('/more')

        try {
            await syncProfileToCandidate(user.id, data)
        } catch (syncError: unknown) {
            const syncErr = syncError as Error
            console.warn('[ProfileUpdate] Sync to candidates skipped or failed:', syncErr.message)
            return {
                success: true,
                warning: `Profil zaktualizowany. Synchronizacja z CRM nie powiodła się.`
            }
        }

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

    if (error) {
        throw new Error(`Failed to delete profile: ${error.message}`)
    }

    // Ideally we would verify if we can sign them out server-side, 
    // but usually client handles redirect after this.
    return { success: true }
}

export async function syncProfileToCandidate(userId: string, overrideData: ProfileUpdateData = {}) {
    console.log('[Sync] syncProfileToCandidate called for user:', userId)
    console.log('[Sync] With overrides:', JSON.stringify(overrideData, null, 2))

    const supabase = createClient()
    const { data: { user: authUser } } = await supabase.auth.getUser()

    console.log('[Sync] Starting sync for user:', userId, 'Session UID:', authUser?.id)

    if (!authUser) {
        console.warn('[Sync] No auth session found. Sync skipped.')
        return
    }

    if (authUser.id !== userId) {
        console.warn('[Sync] User ID mismatch detected.', { session: authUser.id, target: userId })
        // If we're an admin, we might be syncing someone else's profile, but the sync MyProfile 
        // logic usually implies self-sync. In dev bypass, these might differ.
    }

    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

    if (profileError || !profile) {
        console.error('[Sync] Profile not found for sync:', userId, profileError)
        return
    }

    // 2. Prepare Candidate Data
    const candidateData = {
        email: authUser.email,
        full_name: overrideData.full_name || profile.full_name || authUser.user_metadata?.full_name || authUser.email?.split('@')[0],
        phone: overrideData.phone || profile.phone,
        bio: overrideData.bio || profile.bio,
        skills: overrideData.skills || profile.skills || [],
        experience_years: overrideData.experience_years ?? profile.experience_years,
        current_status: overrideData.current_status || profile.current_status,
        capacity_percentage: overrideData.capacity_percentage ?? profile.capacity_percentage,
        project_sentiment: overrideData.project_sentiment || profile.project_sentiment,
        verifier_status: overrideData.verifier_status || profile.verifier_status,
        ambassador_status: overrideData.ambassador_status || profile.ambassador_status,
        sales_support_status: overrideData.sales_support_status || profile.sales_support_status,
        previous_clients: overrideData.previous_clients || profile.previous_clients || [],
        avatar_url: overrideData.avatar_url || profile.avatar_url,
        cv_url: overrideData.cv_url || profile.cv_url,
        embedding: overrideData.embedding || profile.embedding,
        available_from: (overrideData.available_from === '' || profile.available_from === '') ? null : (overrideData.available_from ?? profile.available_from),
        fte_status: overrideData.fte_status ?? profile.fte_status,
        max_monthly_hours: overrideData.max_monthly_hours ?? profile.max_monthly_hours
    }

    // 3. Upsert into Candidates (Match by user_id ONLY -- no auto-claim by email)
    console.log('[Sync] Upserting candidate for user:', userId)

    const { data: existingCandidate } = await supabase
        .from('candidates')
        .select('id, user_id')
        .eq('user_id', userId)
        .single()

    let result
    const updateData = {
        ...candidateData,
        user_id: userId,
        candidate_status: 'konsultant' as const,
        source: 'self_registration' as const,
    }

    try {
        if (existingCandidate) {
            console.log('[Sync] Updating existing candidate ID:', existingCandidate.id)
            result = await supabase
                .from('candidates')
                .update(updateData)
                .eq('id', existingCandidate.id)
                .select()
        } else {
            console.log('[Sync] Creating new candidate')
            result = await supabase
                .from('candidates')
                .insert({
                    ...updateData,
                    status: 'new'
                })
                .select()
        }
    } catch (e: unknown) {
        const error = e as Error
        console.error('[Sync] Exception during upsert:', error)
        throw new Error(`Sync failed due to exception: ${error.message}`)
    }

    const { revalidatePath } = await import('next/cache')
    revalidatePath('/admin/candidates')
    if (result.data?.[0]?.id) {
        revalidatePath(`/admin/candidates/${result.data[0].id}`)
    }
    revalidatePath('/profile')

    if (result.error) {
        console.error('[Sync] Failed to upsert candidate:', result.error)
        throw new Error(`Sync failed: ${result.error.message}`)
    } else {
        console.log('[Sync] Success! Candidate synced:', result.data?.[0]?.id)
        return { success: true, candidateId: result.data?.[0]?.id }
    }
}

export async function syncMyProfile(overrideData: ProfileUpdateData = {}) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    return await syncProfileToCandidate(user.id, overrideData)
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

    const { data: callerProfile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (!callerProfile || !['admin', 'administrator', 'centrala'].includes(callerProfile.role)) {
        return { success: false as const, error: 'Brak uprawnień' }
    }

    const selectCols = 'id, full_name, email, avatar_url, phone, bio, skills, tech_stack, certifications, work_preferences, admin_notes, current_status, loyalty_tier, loyalty_points, experience_years, created_at'

    const { data: profile } = await supabase
        .from('profiles')
        .select(selectCols)
        .eq('id', consultantId)
        .single()

    if (profile) {
        return { success: true as const, profile }
    }

    const { data: candidate } = await supabase
        .from('candidates')
        .select('id, full_name, email, avatar_url, bio, skills, tech_stack, certifications, work_preferences, admin_notes, current_status, experience_years, created_at')
        .eq('id', consultantId)
        .single()

    if (candidate) {
        return {
            success: true as const,
            profile: {
                ...candidate,
                phone: null,
                loyalty_tier: null,
                loyalty_points: null,
            }
        }
    }

    return { success: false as const, error: 'Nie znaleziono profilu' }
}

export async function searchCandidatesByName(query: string) {
    if (!query || query.trim().length < 2) return []

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const searchTerm = query.trim()
    const cols = 'id, full_name, email, skills, bio, cv_url, created_at, original_filename'

    // FTS via GIN index on search_vector (fast at 50K+ rows)
    const ftsQuery = searchTerm.split(/\s+/).filter(Boolean).join(' & ')
    const { data: ftsCandidates, error: ftsError } = await supabase
        .from('candidates')
        .select(cols)
        .eq('candidate_status', 'kandydat')
        .textSearch('search_vector', ftsQuery, { type: 'plain', config: 'simple' })
        .order('full_name')
        .limit(20)

    let candidates = ftsCandidates

    if (ftsError || !candidates?.length) {
        // Fallback: ILIKE for partial/short queries (uses B-tree on full_name for prefix)
        const { data: ilikeCandidates, error: ilikeError } = await supabase
            .from('candidates')
            .select(cols)
            .eq('candidate_status', 'kandydat')
            .ilike('full_name', `%${searchTerm}%`)
            .order('full_name')
            .limit(20)

        if (ilikeError) {
            console.error('[Search] Error searching candidates:', ilikeError)
            return []
        }
        candidates = ilikeCandidates
    }

    return (candidates || []).map(c => ({
        id: c.id,
        full_name: c.full_name,
        email: c.email ? c.email.replace(/(.{2})(.*)(@.*)/, '$1***$3') : null,
        skills: (c.skills || []).slice(0, 5),
        bio_snippet: c.bio ? c.bio.substring(0, 150) + '...' : null,
        cv_url: c.cv_url,
        created_at: c.created_at,
        original_filename: c.original_filename,
    }))
}

export async function completeOnboarding() {
    const { cookies } = await import('next/headers')
    cookies().set('onboarding_done', 'true', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
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

export async function claimCandidate(candidateId: string) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { data: candidate, error: fetchError } = await supabase
        .from('candidates')
        .select('id, user_id, candidate_status')
        .eq('id', candidateId)
        .single()

    if (fetchError || !candidate) {
        return { success: false, error: 'Kandydat nie znaleziony.' }
    }

    if (candidate.user_id) {
        return { success: false, error: 'To CV zostalo juz przypisane do innego konta.' }
    }

    if (candidate.candidate_status !== 'kandydat') {
        return { success: false, error: 'To CV nie jest dostepne do przypisania.' }
    }

    const { data: alreadyClaimed } = await supabase
        .from('candidates')
        .select('id')
        .eq('user_id', user.id)
        .eq('candidate_status', 'konsultant')
        .single()

    if (alreadyClaimed) {
        return { success: false, error: 'Masz juz przypisane CV.' }
    }

    const { error: updateError } = await supabase
        .from('candidates')
        .update({
            user_id: user.id,
            claimed_by: user.id,
            claimed_at: new Date().toISOString(),
            candidate_status: 'konsultant',
        })
        .eq('id', candidateId)

    if (updateError) {
        console.error('[Claim] Error claiming candidate:', updateError)
        return { success: false, error: 'Nie udalo sie przypisac CV.' }
    }

    const { data: claimedCandidate } = await supabase
        .from('candidates')
        .select('bio, skills, cv_url, avatar_url, experience_years, previous_clients')
        .eq('id', candidateId)
        .single()

    if (claimedCandidate) {
        const profileUpdate: Record<string, unknown> = { onboarding_completed: true }
        if (claimedCandidate.bio) profileUpdate.bio = claimedCandidate.bio
        if (claimedCandidate.skills?.length) profileUpdate.skills = claimedCandidate.skills
        if (claimedCandidate.cv_url) profileUpdate.cv_url = claimedCandidate.cv_url
        if (claimedCandidate.avatar_url) profileUpdate.avatar_url = claimedCandidate.avatar_url
        if (claimedCandidate.experience_years) profileUpdate.experience_years = claimedCandidate.experience_years
        if (claimedCandidate.previous_clients?.length) profileUpdate.previous_clients = claimedCandidate.previous_clients

        await supabase.from('profiles').update(profileUpdate).eq('id', user.id)
    }

    revalidatePath('/home')
    revalidatePath('/profile')
    revalidatePath('/admin/candidates')

    return { success: true }
}
