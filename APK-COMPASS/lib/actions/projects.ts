'use server'

import { logCompat } from '@/lib/logger'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { parseOrThrow } from '@/lib/validators/common'
import {
    deleteProjectInputSchema,
    deleteProjectsInputSchema,
    updateProjectInputSchema,
} from '@/lib/validators/projects'

export async function deleteProject(projectId: string) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        throw new Error('Unauthorized')
    }

    // Phase 18.4: UUID walidacja zanim trafi do .eq() — chroni przed
    // przypadkowym SQL injection przez Supabase parser i przed wywołaniem
    // delete z nullable input.
    const { projectId: validId } = parseOrThrow(deleteProjectInputSchema, { projectId })

    // 1. Get project to check for file_url (to delete from storage)
    const { data: project } = await supabase
        .from('projects')
        .select('file_url')
        .eq('id', validId)
        .single()

    // 2. Delete file from storage if exists
    if (project?.file_url) {
        const { error: storageError } = await supabase.storage
            .from('documents')
            .remove([project.file_url])

        if (storageError) {
            logCompat.error('Failed to delete project file:', storageError)
            // We continue to delete the row even if file deletion fails
        }
    }

    // 3. Delete from DB
    const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', validId)

    if (error) {
        throw new Error(`Failed to delete project: ${error.message}`)
    }

    revalidatePath('/admin/projects')
    revalidatePath('/projects')
    return { success: true }
}

export async function deleteProjects(projectIds: string[]) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) throw new Error('Unauthorized')

    // Phase 18.4: Walidacja każdego UUID + limit 500 (chroni przed
    // wysłaniem 100k IDs które mogłyby zatkać DB połączenie).
    const { projectIds: validIds } = parseOrThrow(deleteProjectsInputSchema, { projectIds })

    // 1. Get projects to check for file_urls
    const { data: projects } = await supabase
        .from('projects')
        .select('file_url')
        .in('id', validIds)

    // 2. Delete files from storage
    const filesToDelete = projects
        ?.map(p => p.file_url)
        .filter((url): url is string => !!url) || []

    if (filesToDelete.length > 0) {
        await supabase.storage
            .from('documents')
            .remove(filesToDelete)
    }

    // 3. Delete from DB
    const { error } = await supabase
        .from('projects')
        .delete()
        .in('id', validIds)

    if (error) {
        throw new Error(`Failed to delete projects: ${error.message}`)
    }

    revalidatePath('/admin/projects')
    revalidatePath('/projects')
    return { success: true }
}

export async function updateProject(projectId: string, updates: Record<string, unknown>) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) throw new Error('Unauthorized')

    // Phase 18.4: Zod allowlist field walidacji. Wcześniej `updates` był
    // przekazywany bezpośrednio do .update() — można było wstrzyknąć dowolne
    // kolumny (role, owner_id, embedding). Teraz tylko explicit fields,
    // .strict() rzuca błąd dla nieoczekiwanych kluczy.
    const { projectId: validId, updates: safeUpdates } = parseOrThrow(
        updateProjectInputSchema,
        { projectId, updates },
    )

    const { error } = await supabase
        .from('projects')
        .update(safeUpdates)
        .eq('id', validId)

    if (error) {
        throw new Error(`Failed to update project: ${error.message}`)
    }

    revalidatePath('/admin/projects')
    revalidatePath('/projects')
    return { success: true }
}

import { ProjectMatch } from '@/lib/types'

export async function getProjectMatchSummary(projectId: string): Promise<Record<string, number>> {
    const supabase = createClient()
    const { data: project } = await supabase.from('projects').select('embedding').eq('id', projectId).single()
    if (!project?.embedding) return { total: 0, high: 0, medium: 0, low: 0 }

    const { data: candidates, error } = await supabase.rpc('match_candidates', {
        query_embedding: project.embedding,
        match_threshold: 0.3,
        match_count: 50
    })

    if (error || !candidates) return { total: 0, high: 0, medium: 0, low: 0 }

    const matches = candidates as { similarity: number }[]
    return {
        total: matches.length,
        high: matches.filter(m => m.similarity >= 0.9).length,
        medium: matches.filter(m => m.similarity >= 0.7).length,
        low: matches.filter(m => m.similarity >= 0.5).length
    }
}

export async function getProjectMatches(projectId: string): Promise<ProjectMatch[]> {
    const supabase = createClient()

    // 1. Get project details for context
    const { data: project } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single()

    // If no embedding, return empty
    if (!project?.embedding) return []

    // 2. Call RPC match_candidates (Stage 1)
    const { data: matches, error } = await supabase.rpc('match_candidates', {
        query_embedding: project.embedding,
        match_threshold: 0.3,
        match_count: 50
    })

    if (error || !matches) {
        logCompat.error('Error fetching Stage 1 matches:', error)
        return []
    }

    interface CandidateMatch {
        id: string
        full_name: string
        bio?: string
        skills?: string[]
        similarity: number
    }

    // 3. AI Re-ranking (Stage 2) with Persistence
    try {
        // 3a. Check for existing persisted results (Defensive)
        let persistedResults: { candidate_id: string; score: number; recommendation?: string; reasoning?: string }[] = []
        try {
            const { data, error: dbErr } = await supabase
                .from('match_results')
                .select('*')
                .eq('project_id', projectId)
                .in('candidate_id', (matches as CandidateMatch[]).map(m => m.id))

            if (dbErr) {
                logCompat.warn('Database error in match_results:', dbErr.message)
            } else {
                persistedResults = data || []
            }
        } catch (dbErr) {
            logCompat.warn('match_results table might be missing, skipping cache:', dbErr)
        }

        const resultsMap = new Map((persistedResults || []).map(r => [r.candidate_id, r]))

        // Identify which candidates need AI scoring
        const candidatesToScore = (matches as CandidateMatch[]).filter(m => !resultsMap.has(m.id))

        // Phase 1.0 (2026-05-04): AI candidate scoring removed (legacy ATS feature).
        // Returns embedding-similarity-only results from cached match_results table.
        return (matches as CandidateMatch[]).map(m => {
            const aiResult = resultsMap.get(m.id)
            return {
                ...m,
                similarity: (aiResult && typeof aiResult.score === 'number' && aiResult.score > 0)
                    ? aiResult.score / 100
                    : m.similarity,
                ai_recommendation: aiResult?.recommendation,
                ai_reasoning: aiResult?.reasoning
            } as ProjectMatch
        }).sort((a, b) => b.similarity - a.similarity)

    } catch (err) {
        logCompat.error('Stage 2 failed, falling back to Stage 1:', err)
        return (matches as ProjectMatch[]) || []
    }
}

export async function getMyProjectMatch(projectId: string): Promise<ProjectMatch | null> {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return null

    // 1. Check for existing persisted result
    const { data: existingMatch } = await supabase
        .from('match_results')
        .select('*')
        .eq('project_id', projectId)
        .eq('candidate_id', user.id)
        .single()

    // 2. Get User Profile for display and context
    const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

    if (!profile) return null

    // Construct base match object
    const baseMatch: ProjectMatch = {
        id: profile.id,
        full_name: profile.full_name || 'Ja',
        avatar_url: profile.avatar_url || '',
        job_title: profile.position || 'Konsultant',
        similarity: 0,
    }

    if (existingMatch) {
        return {
            ...baseMatch,
            similarity: existingMatch.score / 100, // DB stores 0-100, frontend wants 0-1
            ai_recommendation: existingMatch.recommendation,
            ai_reasoning: existingMatch.reasoning
        }
    }

    // 3. If no match, we calculate it on the fly (and save it)
    const { data: project } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single()

    if (!project) return null

    // Phase 1.0 (2026-05-04): AI candidate scoring removed (legacy ATS feature).
    return baseMatch
}
