'use server'

import { createClient } from '@/lib/supabase/server'
import { parseFile } from '@/lib/files/parsers'
import { generateEmbedding } from '@/lib/ai/embeddings'
import OpenAI from 'openai'

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
})

// --- Gap Analysis ---

export async function analyzeGap(projectId: string) {
    const supabase = createClient()

    // 0. Get Current User Bio
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { data: profile } = await supabase
        .from('profiles')
        .select('bio')
        .eq('id', user.id)
        .single()

    if (!profile?.bio) {
        return { error: 'Uzupełnij swoje Bio w profilu, aby uzyskać analizę.' }
    }

    // 1. Get Project Details
    const { data: project } = await supabase
        .from('projects')
        .select('title, description, required_skills')
        .eq('id', projectId)
        .single()

    if (!project) throw new Error('Project not found')

    // 2. Call OpenAI for Analysis
    try {
        const prompt = `
    You are an expert IT Recruiter. Compare the following Candidate Profile with the Project Requirements.
    
    Candidate Bio: "${profile.bio}"
    
    Project Title: "${project.title}"
    Project Description: "${project.description}"
    Required Skills: "${project.required_skills?.join(', ')}"
    
    Provide a JSON response with:
    - match_score (0-100 integer)
    - matching_skills (list of skills the candidate has that match requirements)
    - missing_skills (list of skills/requirements the candidate lacks)
    - explanation (brief summary of the fit)

    Response Format: JSON only.
    `

        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' },
        })

        const analysis = JSON.parse(response.choices[0].message.content || '{}')
        return analysis

    } catch (error) {
        console.error('Gap Analysis Error:', error)
        return { error: 'Nie udało się przeanalizować luki kompetencyjnej' }
    }
}

// --- Admin Project Import ---

export async function parseProjectSpec(formData: FormData) {
    const file = formData.get('file') as File
    if (!file) throw new Error('No file')

    const text = await parseFile(file)

    // Extract JSON structure from text using AI
    try {
        const prompt = `
    Extract project details from the following text into a JSON object.
    
    Text: "${text.slice(0, 15000)}"
    
    Fields required:
    - title (string)
    - description (string)
    - required_skills (array of strings)
    - budget_range (string, e.g. "100-150 PLN/h")
    
    Response Format: JSON only.
    `

        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' },
        })

        const extractedData = JSON.parse(response.choices[0].message.content || '{}')
        return extractedData

    } catch (error) {
        console.error('Project Parse Error:', error)
        throw new Error('Failed to parse project spec')
    }
}

export async function createProjectFromSpec(data: any) {
    const supabase = createClient()

    // Generate embedding
    const textToEmbed = `${data.title} ${data.description} ${data.required_skills?.join(' ')}`
    const embedding = await generateEmbedding(textToEmbed)

    const { error } = await supabase
        .from('projects')
        .insert({
            title: data.title,
            description: data.description,
            required_skills: data.required_skills,
            budget_range: data.budget_range,
            embedding
        })

    if (error) throw new Error(error.message)
    return { success: true }
}
