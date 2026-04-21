import OpenAI from 'openai'

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || 'mock-key',
})

export async function generateEmbedding(text: string) {
    try {
        if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.includes('mock-key')) {
            throw new Error('No valid API Key')
        }

        const response = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: text.replace(/\n/g, ' '),
        })
        return response.data[0].embedding
    } catch (error) {
        console.warn('⚠️ OpenAI Error (Using Mock Embedding):', error)
        // Fallback: Generate a random vector of size 1536
        return Array.from({ length: 1536 }, () => (Math.random() - 0.5) * 0.1)
    }
}
