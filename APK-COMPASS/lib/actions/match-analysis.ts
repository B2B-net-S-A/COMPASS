'use server'

import { createClient } from '@/lib/supabase/server'
import OpenAI from 'openai'

if (!process.env.OPENAI_API_KEY) {
    console.warn("Missing OPENAI_API_KEY environment variable. AI features will fail.")
}

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || 'MISSING_KEY',
})

export type MatchAnalysis = {
    strong_points: string[]
    missing_requirements: string[]
    recommendation: string
    match_score_verification: number
    summary: string
    negotiation_points: string[]
    confidence: 'high' | 'medium' | 'low'
}

export async function analyzeMatch(projectId: string, candidateId: string): Promise<MatchAnalysis> {
    const supabase = createClient()

    // 1. Fetch Project
    const { data: project, error: pError } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single()

    if (pError || !project) throw new Error('Project not found')

    // 2. Fetch Candidate
    // 2. Fetch Candidate (Try 'candidates' view first, then 'profiles')
    let candidate: Record<string, any> | null = null
    const { data: candidateData, error: cError } = await supabase
        .from('candidates')
        .select('*')
        .eq('id', candidateId)
        .single()

    if (!cError && candidateData) {
        candidate = candidateData
    } else {
        // Fallback to profiles for consultants
        const { data: profileData } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', candidateId)
            .single()

        if (profileData) {
            candidate = {
                full_name: profileData.full_name,
                bio: profileData.bio,
                skills: profileData.skills,
                location: profileData.location,
                current_status: profileData.status || 'Active' // Mapping
            }
        }
    }

    if (!candidate) throw new Error('Candidate/Profile not found')

    // 3. Prepare Prompt
    const prompt = `
    Jesteś ekspertem rekrutacyjnym B2B.net S.A. Przeprowadź głęboką analizę dopasowania (Stage 3).
    
    PROJECT:
    Title: ${project.title}
    Position: ${project.position}
    Description: ${project.description}
    Required Skills: ${project.required_skills?.join(', ')}
    Location: ${project.location}
    Work Type: ${project.work_type}
    Rate: ${project.max_rate}

    CANDIDATE:
    Name: ${candidate.full_name}
    Bio: ${candidate.bio}
    Skills: ${candidate.skills?.join(', ')}
    Location: ${candidate.location}
    Status: ${candidate.current_status}
    
    Zadanie:
    Wygeneruj szczegółową analizę dopasowania zgodnie z modelem Qualrix Pipeline Matching Engine.
    
    Zwróć JSON z polami:
    - strong_points: [] (Mocne strony kandydata w relacji do projektu)
    - missing_requirements: [] (Braki, ryzyka, luki kompetencyjne)
    - recommendation: "SUBMIT" | "REVIEW" | "HOLD" | "REJECT"
    - match_score_verification: number (0-100, Twój ostateczny Combined Score)
    - summary: string (2-3 zdania podsumowania dla Recruitment Managera po polsku)
    - negotiation_points: [] (Punkty do negocjacji/dyskrecji - np. stawka, hybryda)
    - confidence: "high" | "medium" | "low"

    Pamiętaj o zasadach:
    1. Bądź konserwatywny - brak kluczowej technologii drastycznie obniża score.
    2. Uwzględniając kontekst bankowy (Nordea).
    3. Dopasuj semantycznie.

    Output only valid JSON.
    `

    // 4. Call OpenAI
    const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
            { role: 'system', content: 'You are an IT Recruitment Expert. Analyze matches deeply based on the Qualrix V2.0 engine. Output JSON.' },
            { role: 'user', content: prompt }
        ],
        response_format: { type: 'json_object' }
    })

    const result = JSON.parse(response.choices[0].message.content || '{}')

    const analysisResult: MatchAnalysis = {
        strong_points: result.strong_points || [],
        missing_requirements: result.missing_requirements || [],
        recommendation: result.recommendation || 'REVIEW',
        match_score_verification: result.match_score_verification || result.total_score || 0,
        summary: result.summary || 'Brak analizy.',
        negotiation_points: result.negotiation_points || [],
        confidence: result.confidence || 'medium'
    }

    // 5. Persist Stage 3 verified result (to synchronize with list view)
    try {
        await supabase
            .from('match_results')
            .upsert({
                project_id: projectId,
                candidate_id: candidateId,
                score: analysisResult.match_score_verification,
                reasoning: analysisResult.summary,
                recommendation: analysisResult.recommendation,
                updated_at: new Date().toISOString()
            })
    } catch (persistErr) {
        console.error('Failed to persist Stage 3 match analysis:', persistErr)
    }

    return analysisResult
}
