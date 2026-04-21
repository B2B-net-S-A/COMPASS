import OpenAI from 'openai'

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
})

export type ExtractionType = 'candidate' | 'project'

export async function processDataWithAI(text: string, type: ExtractionType) {
    const systemPrompt = type === 'candidate'
        ? 'You are an HR expert specializing in tech recruitment. Extract candidate details, standardize skills, and generate a professional profile.'
        : 'You are an expert IT recruiter for Nordea. Extract project specifications, standardize requirements, and generate a professional project description.'

    const userPrompt = type === 'candidate'
        ? `Analyze the following text (CV, bio, or profile) and extract data in JSON format.
           CRITICAL INSTRUCTIONS:
           1. STANDARDIZE: Map skills to common industry names (e.g., "JS/ES6" -> "JavaScript").
           2. GAP FILLING: If years of experience aren't explicitly stated, estimate based on roles/dates.
           3. SKILL MAPPING: Categorize skills into tech_stack, soft_skills, and tools.
           
           Expected JSON format:
           {
             "full_name": "string",
             "email": "string or null",
             "phone": "string or null",
             "skills": ["string", ...],
             "skill_map": {
                "frontend": ["string", ...],
                "backend": ["string", ...],
                "cloud": ["string", ...],
                "tools": ["string", ...],
                "soft": ["string", ...]
             },
             "bio_summary": "4-5 sentence professional summary in English",
             "experience_years": number,
             "previous_clients": ["string", ...]
           }
           
           TEXT:
           ${text.slice(0, 15000)}`
        : `Analyze the following project specification and extract data in JSON format.
           CRITICAL INSTRUCTIONS:
           1. STANDARDIZE: Normalize technology names.
           2. DETAILED DESCRIPTIONS: Provide a 10+ sentence summary in English and Polish.
           
           Expected JSON format:
           {
             "title": "string",
             "position": "string",
             "description": "10+ sentences in English",
             "description_pl": "10+ sentences in Polish",
             "required_skills": ["string", ...],
             "budget_range": "string or null",
             "max_rate": "string or null",
             "location": "string or null",
             "work_type": "hybrid/remote/onsite",
             "required_languages": ["string", ...],
             "start_date": "string or null",
             "recommendation_deadline": "string or null",
             "manager_name": "string or null"
           }
           
           TEXT:
           ${text.slice(0, 15000)}`

    const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' }
    })

    return JSON.parse(response.choices[0].message.content || '{}')
}
