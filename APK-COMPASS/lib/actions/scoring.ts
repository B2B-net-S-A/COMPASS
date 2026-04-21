'use server'

import OpenAI from 'openai'

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || 'MISSING_KEY',
})

export interface ScoringResult {
    id: string
    combined_score: number
    quality_band: string
    recommendation: string
    reasoning: string
}

export async function batchScore(
    items: { id: string; content: string }[],
    queryContent: string,
    mode: 'candidate-to-projects' | 'project-to-candidates'
): Promise<ScoringResult[]> {
    if (items.length === 0) return []

    const prompt = `
    Jesteś silnikiem scoringowym Qualrix M9. Etap 2: Structured Scoring.
    
    WEJŚCIE:
    ${mode === 'candidate-to-projects' ? 'KANDYDAT' : 'PROJEKT'}: ${queryContent}
    
    LISTA DO OCENY:
    ${items.map((item) => `[ID: ${item.id}] ${item.content}`).join('\n\n')}
    
    ZADANIE:
    Oblicz Combined Score (0-100) dla każdego. Zwróć JSON "results":
    [{
      "id": "UUID",
      "combined_score": number,
      "quality_band": "EXCELLENT|GOOD|ACCEPTABLE|WEAK|POOR",
      "recommendation": "SUBMIT|REVIEW|HOLD|REJECT",
      "reasoning": "Krótkie uzasadnienie (PL, 1 zdanie)"
    }]
    
    Zasady: Konserwatywnie; Neutralnie (50) przy braku danych; Hard Reject przy braku kluczowych skilli technicznych.
    `

    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini', // Use faster model for batch re-ranking
            messages: [
                { role: 'system', content: 'You are an IT recruitment scoring engine. Output JSON array.' },
                { role: 'user', content: prompt }
            ],
            response_format: { type: 'json_object' }
        })

        const content = response.choices[0].message.content || '{"results": []}'
        let parsed: { results?: ScoringResult[]; matches?: ScoringResult[];[key: string]: any }
        try {
            parsed = JSON.parse(content)
        } catch {
            console.error('Failed to parse AI response as JSON:', content)
            return []
        }

        // Robust extraction: find the first array in the object regardless of key name
        let results: ScoringResult[] = []
        if (Array.isArray(parsed)) {
            results = parsed
        } else if (typeof parsed === 'object' && parsed !== null) {
            // Try known keys or find the first array value
            if (Array.isArray(parsed.results)) {
                results = parsed.results
            } else if (Array.isArray(parsed.matches)) {
                results = parsed.matches
            } else {
                const firstArray = Object.values(parsed).find(val => Array.isArray(val))
                if (firstArray) {
                    results = firstArray as ScoringResult[]
                }
            }
        }

        if (results.length === 0) {
            console.warn('AI returned no scoring results or format was unrecognized:', parsed)
        } else {
            // Log a sample for debugging
            console.log(`Stage 2: Parsed ${results.length} results. Sample score: ${results[0]?.combined_score}`)
        }

        return results || []
    } catch (err) {
        console.error('Batch scoring failed:', err)
        return []
    }
}
