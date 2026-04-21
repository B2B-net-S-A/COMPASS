'use server'

import { createClient } from '@/lib/supabase/server'

export interface MatchedProject {
    id: string
    title: string
    description: string
    required_skills: string[]
    similarity: number
    ai_recommendation?: string
    ai_reasoning?: string
}

export async function getCandidateMatchSummary(candidateId: string): Promise<Record<string, number>> {
    const supabase = createClient()
    const { data: candidate } = await supabase.from('candidates').select('embedding').eq('id', candidateId).single()
    if (!candidate?.embedding) return { total: 0, high: 0, medium: 0, low: 0 }

    const { data: projects, error } = await supabase.rpc('match_projects', {
        query_embedding: candidate.embedding,
        match_threshold: 0.3,
        match_count: 50
    })

    if (error || !projects) return { total: 0, high: 0, medium: 0, low: 0 }

    const matches = projects as any[]
    return {
        total: matches.length,
        high: matches.filter(m => m.similarity >= 0.9).length,
        medium: matches.filter(m => m.similarity >= 0.7).length,
        low: matches.filter(m => m.similarity >= 0.5).length
    }
}

export async function getMatchingProjectsForCandidate(candidateId: string): Promise<MatchedProject[]> {
    const supabase = createClient()

    // 1. Get Candidate Embedding
    const { data: candidate, error: fetchError } = await supabase
        .from('candidates')
        .select('id, full_name, bio, skills, embedding')
        .eq('id', candidateId)
        .single()

    if (fetchError || !candidate) {
        console.error('Candidate embedding not found or error:', fetchError)
        return []
    }

    if (!candidate.embedding) {
        console.warn('Candidate has no embedding, skipping match.')
        return []
    }

    // 2. RPC Call (Stage 1) — vector similarity search
    const { data: projects, error: rpcError } = await supabase.rpc('match_projects', {
        query_embedding: candidate.embedding,
        match_threshold: 0.3,
        match_count: 50
    })

    if (rpcError || !projects) {
        console.error('RPC Error:', rpcError)
        return []
    }

    // 3. Merge with cached AI scores (NO blocking AI calls on page load)
    try {
        let persistedResults: any[] = []
        try {
            const { data, error: dbErr } = await supabase
                .from('match_results')
                .select('project_id, score, reasoning, recommendation')
                .eq('candidate_id', candidateId)
                .in('project_id', (projects as any[]).map(p => p.id))

            if (!dbErr) {
                persistedResults = data || []
            }
        } catch (dbErr) {
            // match_results table might not exist — graceful degradation
        }

        const resultsMap = new Map((persistedResults || []).map(r => [r.project_id, r]))

        // Merge cached scores back to projects (do NOT call OpenAI here — defer to triggerAIScoring)
        return (projects as any[]).map(p => {
            const aiResult = resultsMap.get(p.id)
            return {
                ...p,
                similarity: (aiResult && typeof aiResult.score === 'number' && aiResult.score > 0)
                    ? aiResult.score / 100
                    : p.similarity,
                ai_recommendation: aiResult?.recommendation,
                ai_reasoning: aiResult?.reasoning
            }
        }).sort((a, b) => b.similarity - a.similarity) as MatchedProject[]

    } catch (err) {
        console.error('Match merge failed, falling back to Stage 1:', err)
        return projects as MatchedProject[]
    }
}

/**
 * Trigger AI scoring for unscored projects — called on-demand (not on page load)
 */
export async function triggerAIScoringForCandidate(candidateId: string): Promise<{ scored: number }> {
    const supabase = createClient()

    const { data: candidate } = await supabase
        .from('candidates')
        .select('id, full_name, bio, skills, embedding')
        .eq('id', candidateId)
        .single()

    if (!candidate?.embedding) return { scored: 0 }

    const { data: projects } = await supabase.rpc('match_projects', {
        query_embedding: candidate.embedding,
        match_threshold: 0.3,
        match_count: 50
    })

    if (!projects || (projects as any[]).length === 0) return { scored: 0 }

    // Check which projects already have scores
    let persistedIds: Set<string> = new Set()
    try {
        const { data } = await supabase
            .from('match_results')
            .select('project_id')
            .eq('candidate_id', candidateId)
            .in('project_id', (projects as any[]).map(p => p.id))
        if (data) persistedIds = new Set(data.map(r => r.project_id))
    } catch {}

    const projectsToScore = (projects as any[]).filter(p => !persistedIds.has(p.id))
    if (projectsToScore.length === 0) return { scored: 0 }

    const { batchScore } = await import('./scoring')
    const candidateContext = `Name: ${candidate.full_name}, Bio: ${candidate.bio}, Skills: ${candidate.skills?.join(', ')}`
    const projectItems = projectsToScore.map(p => ({
        id: p.id,
        content: `Title: ${p.title}, Description: ${p.description}, Skills: ${p.required_skills?.join(', ')}`
    }))

    const newScores = await batchScore(projectItems, candidateContext, 'candidate-to-projects')

    if (newScores.length > 0) {
        const inserts = newScores.map(ns => ({
            candidate_id: candidateId,
            project_id: ns.id,
            score: ns.combined_score,
            reasoning: ns.reasoning,
            recommendation: ns.recommendation,
            updated_at: new Date().toISOString()
        }))

        try {
            await supabase.from('match_results').upsert(inserts)
        } catch {}
    }

    return { scored: newScores.length }
}

export async function deleteCandidate(candidateId: string) {
    const supabase = createClient()
    const { error } = await supabase.from('candidates').delete().eq('id', candidateId)

    if (error) {
        throw new Error(`Failed to delete candidate: ${error.message}`)
    }

    return { success: true }
}

export async function deleteCandidates(candidateIds: string[]) {
    const supabase = createClient()

    // 1. Delete candidates (cascades to matches usually if set up, but here matches are computed)
    const { error } = await supabase
        .from('candidates')
        .delete()
        .in('id', candidateIds)

    if (error) {
        throw new Error(`Failed to delete candidates: ${error.message}`)
    }

    return { success: true }
}
