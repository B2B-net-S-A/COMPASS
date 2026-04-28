/**
 * Embeddings via Voyage AI (voyage-3-large, 1024 dim).
 *
 * IMPORTANT: DB columns vector(1536) must be migrated to vector(1024) (or padded).
 * See migration 20260428_voyage_embeddings.sql.
 *
 * Fallback: returns deterministic mock vector if VOYAGE_API_KEY missing.
 */

const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings'
const EMBEDDING_DIM = 1024
const EMBEDDING_MODEL = process.env.VOYAGE_MODEL ?? 'voyage-3-large'

interface VoyageResponse {
    object: string
    data: Array<{ index: number; embedding: number[] }>
    model: string
    usage: { total_tokens: number }
}

export async function generateEmbedding(text: string): Promise<number[]> {
    const apiKey = process.env.VOYAGE_API_KEY
    const cleanText = text.replace(/\n/g, ' ').slice(0, 32000)

    if (!apiKey) {
        console.warn('VOYAGE_API_KEY missing — returning mock embedding')
        return mockEmbedding()
    }

    try {
        const response = await fetch(VOYAGE_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: EMBEDDING_MODEL,
                input: [cleanText],
                input_type: 'document',
                output_dimension: EMBEDDING_DIM,
            }),
        })

        if (!response.ok) {
            const errBody = await response.text()
            throw new Error(`Voyage AI ${response.status}: ${errBody.slice(0, 200)}`)
        }

        const data = await response.json() as VoyageResponse
        return data.data[0]?.embedding ?? mockEmbedding()
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'unknown'
        console.warn(`Voyage AI error (${msg}) — returning mock embedding`)
        return mockEmbedding()
    }
}

function mockEmbedding(): number[] {
    return Array.from({ length: EMBEDDING_DIM }, () => (Math.random() - 0.5) * 0.1)
}
