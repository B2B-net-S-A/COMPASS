'use server'

import { createClient } from '@/lib/supabase/server'
import OpenAI from 'openai'
import { searchKnowledge } from './knowledge-base'
import { getCentralaData } from './centrala'

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || 'MISSING_KEY',
})

export type ChatMessage = {
    role: 'user' | 'assistant' | 'system'
    content: string
}

export async function getConsultantContext(profileId: string) {
    const supabase = createClient()

    // 1. Basic Profile & Contract Info
    const { data: profile } = await supabase
        .from('profiles')
        .select('*, candidates(*)')
        .eq('id', profileId)
        .single()

    // 2. Operational Data (Benefits, Invoices, etc.)
    const centralaData = await getCentralaData(profileId)

    // 3. Current Project Assignments
    const { data: assignments } = await supabase
        .from('match_results')
        .select('*, projects(*)')
        .eq('candidate_id', profile?.candidates?.id)
        .eq('recommendation', 'SUBMIT') // Or whatever status means "assigned"

    return {
        profile,
        centralaData,
        assignments: assignments || []
    }
}

export async function processChat(profileId: string, message: string, history: ChatMessage[] = []) {
    // 1. Get Context
    const context = await getConsultantContext(profileId)

    // 2. RAG - Search Knowledge Base
    const relatedKnowledge = await searchKnowledge(message)
    const knowledgeContext = relatedKnowledge.map((k: any) => `[${k.category}] ${k.content}`).join('\n\n')

    // 3. Prepare System Prompt
    const systemPrompt = `
    Jesteś Compass Assist - inteligentnym asystentem AI i Cyfrowym Opiekunem Konsultanta w firmie B2B.net S.A.
    Twoim celem jest pomoc konsultantowi w sprawach administracyjnych, benefitowych, finansowych i kontraktowych.

    KONTEKST KONSULTANTA:
    Imię: ${context.profile?.full_name}
    Status Kontraktu: ${context.profile?.candidates?.current_status || 'Aktywny'}
    Benefity: ${JSON.stringify(context.centralaData.benefits)}
    Faktury: ${JSON.stringify(context.centralaData.invoices)}
    Projekty: ${context.assignments.map((a: any) => a.projects?.title).join(', ') || 'Brak aktywnych projektów'}

    BAZA WIEDZY (RAG):
    ${knowledgeContext}

    ZASADY:
    - Odpowiadaj wyłącznie na podstawie dostarczonego kontekstu i bazy wiedzy.
    - Jeśli nie znasz odpowiedzi, poinformuj o tym i zaproponuj eskalację do odpowiedniego działu.
    - Bądź profesjonalny, pomocny i zwięzły.
    - Używaj Markdown do formatowania.
    - Jeśli użytkownik prosi o akcję (np. zmiana benefitu, zgłoszenie problemu), poinformuj, że możesz utworzyć zgłoszenie (ticket).
    `

    // 4. Call OpenAI
    const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
            { role: 'system', content: systemPrompt },
            ...history,
            { role: 'user', content: message }
        ],
        temperature: 0.3,
    })

    const aiResponse = response.choices[0].message.content || 'Przepraszam, nie mogłem wygenerować odpowiedzi.'

    // 5. Store Chat History (Optional: can be done in frontend or here)
    // For now, we return it to the frontend to handle state

    return {
        content: aiResponse,
        relatedKnowledge: relatedKnowledge.map((k: any) => k.id)
    }
}

export async function createAssistTicket(profileId: string, category: string, summary: string, chatId?: string) {
    const supabase = createClient()

    const { data, error } = await supabase
        .from('compass_assist_tickets')
        .insert({
            profile_id: profileId,
            chat_id: chatId,
            category,
            summary,
            status: 'new',
            priority: 'normal'
        })
        .select()
        .single()

    if (error) throw new Error(`Failed to create ticket: ${error.message}`)
    return data
}
