'use server'

import { createClient } from '@/lib/supabase/server'

// ============================================================
// Types
// ============================================================

export interface CVAnalysisResult {
    overallScore: number // 0-100
    strengths: string[]
    weaknesses: string[]
    recommendations: string[]
    marketPosition: 'junior' | 'mid' | 'senior' | 'expert'
    marketPositionLabel: string
    summaryText: string
}

export interface CareerPathResult {
    primaryPath: CareerPath
    alternativePaths: CareerPath[]
    reasoning: string
}

export interface CareerPath {
    id: string
    name: string
    icon: string // emoji
    description: string
    stages: CareerStage[]
    requiredCertifications: string[]
    estimatedTimeMonths: number
}

export interface CareerStage {
    title: string
    level: string
    skills: string[]
    timeframe: string
    description: string
}

export interface DevelopmentPlan {
    quarters: QuarterPlan[]
    estimatedRateIncrease: string
    keyMilestones: string[]
    summaryText: string
}

export interface QuarterPlan {
    quarter: string // "Q1", "Q2", etc.
    title: string
    goals: string[]
    skills: string[]
    certifications: string[]
    actions: string[]
}

export interface ProjectMatch {
    projectId: string
    projectTitle: string
    description: string
    requiredSkills: string[]
    matchScore: number // 0-100
    matchedSkills: string[]
    missingSkills: string[]
    aiRecommendation: string
    fitLevel: 'excellent' | 'good' | 'partial' | 'low'
}

export interface ProjectMatchingResult {
    matches: ProjectMatch[]
    consultantName: string
    consultantSkills: string[]
    totalProjectsAnalyzed: number
    aiSummary: string
}

export interface ConsultantOption {
    id: string
    fullName: string
    email: string
    avatarUrl: string | null
    skills: string[]
    experienceYears: number
    currentStatus: string | null
}

export interface FullDevelopmentAnalysis {
    cvAnalysis: CVAnalysisResult | null
    careerPath: CareerPathResult | null
    developmentPlan: DevelopmentPlan | null
    profileData: {
        fullName: string
        skills: string[]
        bio: string
        experienceYears: number
        previousClients: string[]
        cvUrl: string | null
    }
    error?: string
}

// ============================================================
// Helper: Get consultant profile from candidates OR profiles
// ============================================================

async function getConsultantProfile(supabase: ReturnType<typeof createClient>, userId: string) {
    // First try 'candidates' table (where real consultants live)
    const { data: candidate } = await supabase
        .from('candidates')
        .select('id, full_name, email, skills, bio, experience_years, previous_clients, cv_url, current_status')
        .eq('id', userId)
        .single()

    if (candidate) {
        return {
            full_name: candidate.full_name,
            skills: candidate.skills || [],
            bio: candidate.bio || '',
            experience_years: candidate.experience_years || 0,
            previous_clients: candidate.previous_clients || [],
            cv_url: candidate.cv_url || null,
            role: 'consultant',
            source: 'candidates' as const,
        }
    }

    // Fallback to 'profiles' table (for logged-in users)
    const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, skills, bio, experience_years, previous_clients, cv_url, role')
        .eq('id', userId)
        .single()

    if (profile) {
        return {
            full_name: profile.full_name,
            skills: profile.skills || [],
            bio: profile.bio || '',
            experience_years: profile.experience_years || 0,
            previous_clients: profile.previous_clients || [],
            cv_url: profile.cv_url || null,
            role: profile.role || 'consultant',
            source: 'profiles' as const,
        }
    }

    return null
}

// ============================================================
// OpenAI call helper
// ============================================================

async function callOpenAI(systemPrompt: string, userPrompt: string): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) throw new Error('OPENAI_API_KEY not configured')

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
            max_tokens: 2000,
            temperature: 0.4,
            response_format: { type: 'json_object' },
        }),
    })

    if (!response.ok) {
        const err = await response.text()
        throw new Error(`OpenAI error: ${err}`)
    }

    const data = await response.json()
    return data.choices?.[0]?.message?.content || '{}'
}

// ============================================================
// 1. Analiza CV
// ============================================================

export async function analyzeCVWithAI(userId?: string): Promise<CVAnalysisResult> {
    const supabase = createClient()

    // Get current user or specified user
    let targetUserId = userId
    if (!targetUserId) {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('Not authenticated')
        targetUserId = user.id
    }

    // Get profile data from candidates or profiles
    const profile = await getConsultantProfile(supabase, targetUserId)
    if (!profile) throw new Error('Profile not found')

    const skills = profile.skills
    const bio = profile.bio
    const experience = profile.experience_years
    const clients = profile.previous_clients

    // If no meaningful data, return basic result
    if (skills.length === 0 && !bio) {
        return {
            overallScore: 10,
            strengths: [],
            weaknesses: ['Brak uzupełnionego profilu — CV jest puste'],
            recommendations: [
                'Dodaj swoje umiejętności techniczne do profilu',
                'Napisz krótkie bio opisujące doświadczenie',
                'Wgraj aktualne CV w formacie PDF lub DOCX',
                'Podaj lata doświadczenia w branży IT',
            ],
            marketPosition: 'junior',
            marketPositionLabel: 'Nie można ocenić — brak danych',
            summaryText: 'Profil konsultanta jest pusty. Uzupełnij dane, aby otrzymać pełną analizę.',
        }
    }

    const systemPrompt = `Jesteś ekspertem HR i rekruterem IT z 15-letnim doświadczeniem. Analizujesz CV konsultantów IT pod kątem atrakcyjności rynkowej.

Odpowiedz w formacie JSON:
{
  "overallScore": <number 0-100>,
  "strengths": [<string>, ...],
  "weaknesses": [<string>, ...],
  "recommendations": [<string>, ...],
  "marketPosition": "junior" | "mid" | "senior" | "expert",
  "marketPositionLabel": "<string po polsku np. 'Senior Developer — wysoka pozycja rynkowa'>",
  "summaryText": "<2-3 zdania podsumowania po polsku>"
}

KRYTERIA OCENY:
- Kompletność profilu (bio, skills, doświadczenie, klienci)
- Aktualność i atrakcyjność technologii (React, Cloud, AI > starsze technologie)
- Głębokość vs szerokość umiejętności
- Doświadczenie z klientami (enterprise = +)
- Braki standardowe: certyfikaty, języki obce, soft skills
- Scoring: 0-25 junior, 26-50 mid, 51-75 senior, 76-100 expert

Bądź SZCZERY i KONKRETNY. Podawaj rekomendacje, które naprawdę zwiększą atrakcyjność na rynku.
Odpowiadaj PO POLSKU.`

    const userPrompt = `Przeanalizuj profil konsultanta IT:

IMIĘ: ${profile.full_name || 'Nieznane'}
UMIEJĘTNOŚCI: ${skills.join(', ') || 'Brak'}
BIO: ${bio || 'Brak'}
DOŚWIADCZENIE: ${experience} lat
POPRZEDNI KLIENCI: ${clients.join(', ') || 'Brak informacji'}
CV WGRANE: ${profile.cv_url ? 'Tak' : 'Nie'}

Oceń profil pod kątem atrakcyjności w rekrutacjach IT.`

    try {
        const result = await callOpenAI(systemPrompt, userPrompt)
        const parsed = JSON.parse(result)
        return {
            overallScore: parsed.overallScore || 0,
            strengths: parsed.strengths || [],
            weaknesses: parsed.weaknesses || [],
            recommendations: parsed.recommendations || [],
            marketPosition: parsed.marketPosition || 'junior',
            marketPositionLabel: parsed.marketPositionLabel || '',
            summaryText: parsed.summaryText || '',
        }
    } catch (error) {
        console.error('CV Analysis AI error:', error)
        throw new Error('Nie udało się przeanalizować CV. Spróbuj ponownie.')
    }
}

// ============================================================
// 2. Ścieżka Rozwoju
// ============================================================

export async function suggestCareerPathWithAI(userId?: string): Promise<CareerPathResult> {
    const supabase = createClient()

    let targetUserId = userId
    if (!targetUserId) {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('Not authenticated')
        targetUserId = user.id
    }

    const profile = await getConsultantProfile(supabase, targetUserId)
    if (!profile) throw new Error('Profile not found')

    const skills = profile.skills
    const bio = profile.bio
    const experience = profile.experience_years

    const systemPrompt = `Jesteś doradcą kariery IT z doświadczeniem w planowaniu ścieżek rozwoju dla konsultantów.

Masz do dyspozycji 4 główne ścieżki:
1. "technical" — Technical Expert (Developer → Senior → Architect → Principal Engineer)
2. "management" — Management (Team Lead → Project Manager → Delivery Director → VP Engineering)
3. "analytical" — Analytical/Data (Analyst → Data Engineer → ML Engineer → Head of Data)
4. "hybrid" — Hybrid/Full-Stack Leader (Full-Stack → Tech Lead → Engineering Manager → CTO)

Odpowiedz w formacie JSON:
{
  "primaryPath": {
    "id": "<string>",
    "name": "<nazwa po polsku>",
    "icon": "<emoji>",
    "description": "<opis po polsku 2-3 zdania>",
    "stages": [
      {
        "title": "<nazwa etapu>",
        "level": "<junior/mid/senior/expert>",
        "skills": ["<skill>", ...],
        "timeframe": "<np. '6-12 miesięcy'>",
        "description": "<co robić na tym etapie>"
      }
    ],
    "requiredCertifications": ["<certyfikat>", ...],
    "estimatedTimeMonths": <number>
  },
  "alternativePaths": [<max 2 inne ścieżki w tym samym formacie>],
  "reasoning": "<wyjaśnienie po polsku dlaczego ta ścieżka pasuje>"
}

Sugeruj KONKRETNE technologie, certyfikaty i szkolenia. Bądź realistyczny w timeframe.
Odpowiadaj PO POLSKU.`

    const userPrompt = `Zaproponuj ścieżkę rozwoju dla konsultanta:

UMIEJĘTNOŚCI: ${skills.join(', ') || 'Brak danych'}
BIO: ${bio || 'Brak danych'}
DOŚWIADCZENIE: ${experience} lat
POPRZEDNI KLIENCI: ${(profile.previous_clients || []).join(', ') || 'Brak danych'}

Na podstawie profilu zaproponuj najlepszą ścieżkę kariery.`

    try {
        const result = await callOpenAI(systemPrompt, userPrompt)
        const parsed = JSON.parse(result)
        return {
            primaryPath: parsed.primaryPath || { id: 'technical', name: 'Ścieżka Techniczna', icon: '🔧', description: 'Brak danych', stages: [], requiredCertifications: [], estimatedTimeMonths: 24 },
            alternativePaths: parsed.alternativePaths || [],
            reasoning: parsed.reasoning || '',
        }
    } catch (error) {
        console.error('Career Path AI error:', error)
        throw new Error('Nie udało się wygenerować ścieżki rozwoju.')
    }
}

// ============================================================
// 3. Plan Rozwoju (12-miesięczny roadmap)
// ============================================================

export async function generateDevelopmentPlanWithAI(
    userId?: string,
    preferredPath?: string
): Promise<DevelopmentPlan> {
    const supabase = createClient()

    let targetUserId = userId
    if (!targetUserId) {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('Not authenticated')
        targetUserId = user.id
    }

    const profile = await getConsultantProfile(supabase, targetUserId)
    if (!profile) throw new Error('Profile not found')

    const skills = profile.skills
    const experience = profile.experience_years

    const systemPrompt = `Jesteś strategicznym doradcą kariery IT. Tworzysz 12-miesięczne plany rozwoju dla konsultantów IT.

Odpowiedz w formacie JSON:
{
  "quarters": [
    {
      "quarter": "Q1",
      "title": "<tytuł kwartału np. 'Fundamenty'>",
      "goals": ["<cel>", ...],
      "skills": ["<technologia do nauki>", ...],
      "certifications": ["<certyfikat do zdobycia>"],
      "actions": ["<konkretna akcja>", ...]
    },
    ... (4 kwartały)
  ],
  "estimatedRateIncrease": "<np. '+15-25% po 12 miesiącach'>",
  "keyMilestones": ["<kamień milowy>", ...],
  "summaryText": "<2-3 zdania podsumowania planu>"
}

ZASADY:
- Plan musi być REALISTYCZNY dla osoby pracującej na pełen etat
- Sugeruj KONKRETNE kursy (Udemy, Coursera, Pluralsight), certyfikaty (AWS, Azure, Scrum)
- Każdy kwartał: max 2-3 główne cele + konkretne akcje
- Uwzględnij soft skills (komunikacja, prezentacje, mentoring)
- Estymuj realny wzrost stawki na rynku po realizacji
Odpowiadaj PO POLSKU.`

    const userPrompt = `Stwórz 12-miesięczny plan rozwoju:

UMIEJĘTNOŚCI OBECNE: ${skills.join(', ') || 'Brak'}
DOŚWIADCZENIE: ${experience} lat
BIO: ${profile.bio || 'Brak'}
PREFEROWANA ŚCIEŻKA: ${preferredPath || 'Brak preferencji — dobierz optymalną'}

Opracuj szczegółowy plan kwartalny.`

    try {
        const result = await callOpenAI(systemPrompt, userPrompt)
        const parsed = JSON.parse(result)
        return {
            quarters: parsed.quarters || [],
            estimatedRateIncrease: parsed.estimatedRateIncrease || 'Brak estymacji',
            keyMilestones: parsed.keyMilestones || [],
            summaryText: parsed.summaryText || '',
        }
    } catch (error) {
        console.error('Development Plan AI error:', error)
        throw new Error('Nie udało się wygenerować planu rozwoju.')
    }
}

// ============================================================
// 4. Full analysis — all 3 in parallel
// ============================================================

export async function getFullDevelopmentAnalysis(userId?: string): Promise<FullDevelopmentAnalysis> {
    const supabase = createClient()

    let targetUserId = userId
    if (!targetUserId) {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('Not authenticated')
        targetUserId = user.id
    }

    // Get profile data first
    const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, skills, bio, experience_years, previous_clients, cv_url, role')
        .eq('id', targetUserId)
        .single()

    if (!profile) {
        return {
            cvAnalysis: null,
            careerPath: null,
            developmentPlan: null,
            profileData: { fullName: '', skills: [], bio: '', experienceYears: 0, previousClients: [], cvUrl: null },
            error: 'Nie znaleziono profilu',
        }
    }

    const profileData = {
        fullName: profile.full_name || '',
        skills: profile.skills || [],
        bio: profile.bio || '',
        experienceYears: profile.experience_years || 0,
        previousClients: profile.previous_clients || [],
        cvUrl: profile.cv_url || null,
    }

    // For admin without real profile data — use sample candidate
    let analyzeUserId = targetUserId
    if (profile.role === 'admin' && (!profile.skills || profile.skills.length === 0) && !profile.bio) {
        const { data: sampleCandidate } = await supabase
            .from('candidates')
            .select('id, full_name, skills, bio, experience_years, previous_clients')
            .not('skills', 'is', null)
            .limit(1)
            .single()

        if (sampleCandidate) {
            // Return analysis based on sample candidate but note it
            profileData.fullName = sampleCandidate.full_name || 'Demo Consultant'
            profileData.skills = sampleCandidate.skills || []
            profileData.bio = sampleCandidate.bio || ''
            profileData.experienceYears = sampleCandidate.experience_years || 0
            profileData.previousClients = sampleCandidate.previous_clients || []
            analyzeUserId = sampleCandidate.id
        }
    }

    // Run all 3 analyses
    let cvAnalysis: CVAnalysisResult | null = null
    let careerPath: CareerPathResult | null = null
    let developmentPlan: DevelopmentPlan | null = null

    try {
        // Run CV analysis first (fastest)
        cvAnalysis = await analyzeCVWithAI(analyzeUserId)
    } catch (e) {
        console.warn('CV Analysis failed:', e)
    }

    try {
        careerPath = await suggestCareerPathWithAI(analyzeUserId)
    } catch (e) {
        console.warn('Career Path failed:', e)
    }

    try {
        developmentPlan = await generateDevelopmentPlanWithAI(
            analyzeUserId,
            careerPath?.primaryPath?.id
        )
    } catch (e) {
        console.warn('Development Plan failed:', e)
    }

    return {
        cvAnalysis,
        careerPath,
        developmentPlan,
        profileData,
    }
}

// ============================================================
// 5. Get current user role & info
// ============================================================

export async function getCurrentUserRole(): Promise<{ role: string; userId: string } | null> {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    return {
        role: profile?.role || 'consultant',
        userId: user.id,
    }
}

// ============================================================
// 6. Get consultants list (for admin/centrala selector)
// ============================================================

export async function getConsultantsForSelector(): Promise<ConsultantOption[]> {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    // Check role — only admin/centrala can see the selector
    const { data: myProfile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (!myProfile || myProfile.role === 'consultant') return []

    // Consultants are stored in the 'candidates' table (NOT profiles)
    const { data: consultants, error } = await supabase
        .from('candidates')
        .select('id, full_name, email, avatar_url, skills, experience_years, current_status')
        .order('full_name', { ascending: true })

    if (error) {
        console.error('Error fetching consultants from candidates:', error)
        return []
    }

    if (!consultants || consultants.length === 0) return []

    return consultants.map(c => ({
        id: c.id,
        fullName: c.full_name || c.email || 'Nieznany',
        email: c.email || '',
        avatarUrl: c.avatar_url,
        skills: c.skills || [],
        experienceYears: c.experience_years || 0,
        currentStatus: c.current_status,
    }))
}

// ============================================================
// 7. AI Project Matching — dopasowanie projektów do konsultanta
// ============================================================

export async function matchProjectsWithAI(userId: string): Promise<ProjectMatchingResult> {
    const supabase = createClient()

    // Get consultant profile from candidates or profiles
    const profile = await getConsultantProfile(supabase, userId)
    if (!profile) throw new Error('Profil konsultanta nie znaleziony')

    const consultantSkills = profile.skills
    const consultantBio = profile.bio
    const consultantName = profile.full_name || 'Nieznany'

    // Get all projects
    const { data: projects } = await supabase
        .from('projects')
        .select('id, title, description, required_skills, position, location, work_type, max_rate')
        .order('created_at', { ascending: false })
        .limit(50)

    if (!projects || projects.length === 0) {
        return {
            matches: [],
            consultantName,
            consultantSkills,
            totalProjectsAnalyzed: 0,
            aiSummary: 'Brak projektów w bazie danych.',
        }
    }

    // Calculate skill-based matching first (fast, no AI)
    const normalizeSkill = (s: string) => s.toLowerCase().trim()
        .replace('reactjs', 'react').replace('react.js', 'react')
        .replace('nodejs', 'node').replace('node.js', 'node')
        .replace('typescript', 'ts').replace('javascript', 'js')
        .replace('postgresql', 'postgres').replace('kubernetes', 'k8s')

    const userSkillsNorm = consultantSkills.map(normalizeSkill)

    const preMatches = projects.map(p => {
        const projSkills = (p.required_skills || []) as string[]
        const projSkillsNorm = projSkills.map(normalizeSkill)

        const matched = projSkills.filter((s: string) =>
            userSkillsNorm.some((us: string) =>
                normalizeSkill(s).includes(us) || us.includes(normalizeSkill(s))
            )
        )
        const missing = projSkills.filter(s => !matched.includes(s))

        const score = projSkills.length > 0
            ? Math.round((matched.length / projSkills.length) * 100)
            : 0

        return {
            projectId: p.id,
            projectTitle: p.title || 'Bez tytułu',
            description: (p.description || '').slice(0, 200),
            requiredSkills: projSkills,
            matchScore: score,
            matchedSkills: matched,
            missingSkills: missing,
            position: p.position || '',
            location: p.location || '',
            maxRate: p.max_rate || '',
        }
    })

    // Sort by match score descending
    preMatches.sort((a, b) => b.matchScore - a.matchScore)

    // Take top 15 for AI analysis
    const topProjects = preMatches.slice(0, 15)

    // AI enrichment — generate recommendations for top matches
    const projectsSummary = topProjects.map((p, i) =>
        `${i + 1}. "${p.projectTitle}" | Wymagane: ${p.requiredSkills.join(', ')} | Dopasowane: ${p.matchedSkills.join(', ')} | Brakujące: ${p.missingSkills.join(', ')} | Score: ${p.matchScore}%`
    ).join('\n')

    const systemPrompt = `Jesteś rekruterem IT w B2B.net. Analizujesz dopasowanie konsultanta do projektów.

Odpowiedz w formacie JSON:
{
  "recommendations": [
    {
      "index": <0-based numer projektu>,
      "fitLevel": "excellent" | "good" | "partial" | "low",
      "recommendation": "<1-2 zdania rekomendacji po polsku — czy warto, co konsultant powinien douczyć>"
    },
    ...
  ],
  "summary": "<3-4 zdania ogólnego podsumowania dopasowania konsultanta do rynku projektów>"
}

ZASADY FIT LEVEL:
- excellent: >80% dopasowanie, konsultant może od razu startować
- good: 60-80%, brakuje 1-2 umiejętności, szybkie doszkolenie wystarczy
- partial: 30-59%, wymaga istotnego doszkolenia
- low: <30%, fundamentalny mismatch

Bądź KONKRETNY i PRAKTYCZNY. Odpowiadaj PO POLSKU.`

    const userPrompt = `KONSULTANT: ${consultantName}
UMIEJĘTNOŚCI: ${consultantSkills.join(', ') || 'Brak'}
DOŚWIADCZENIE: ${profile.experience_years || 0} lat
BIO: ${consultantBio.slice(0, 300) || 'Brak'}

PROJEKTY DO OCENY:
${projectsSummary}

Oceń dopasowanie konsultanta do każdego projektu.`

    try {
        const result = await callOpenAI(systemPrompt, userPrompt)
        const parsed = JSON.parse(result)
        const aiRecs = parsed.recommendations || []

        // Merge AI recommendations with pre-calculated matches
        const matches: ProjectMatch[] = topProjects.map((p, i) => {
            const aiRec = aiRecs.find((r: { index: number }) => r.index === i)
            return {
                projectId: p.projectId,
                projectTitle: p.projectTitle,
                description: p.description,
                requiredSkills: p.requiredSkills,
                matchScore: p.matchScore,
                matchedSkills: p.matchedSkills,
                missingSkills: p.missingSkills,
                aiRecommendation: aiRec?.recommendation || '',
                fitLevel: aiRec?.fitLevel || (p.matchScore >= 80 ? 'excellent' : p.matchScore >= 60 ? 'good' : p.matchScore >= 30 ? 'partial' : 'low'),
            }
        })

        return {
            matches,
            consultantName,
            consultantSkills,
            totalProjectsAnalyzed: projects.length,
            aiSummary: parsed.summary || '',
        }
    } catch (error) {
        console.warn('AI project matching failed, using skill-based only:', error)

        // Fallback without AI
        const matches: ProjectMatch[] = topProjects.map(p => ({
            projectId: p.projectId,
            projectTitle: p.projectTitle,
            description: p.description,
            requiredSkills: p.requiredSkills,
            matchScore: p.matchScore,
            matchedSkills: p.matchedSkills,
            missingSkills: p.missingSkills,
            aiRecommendation: '',
            fitLevel: p.matchScore >= 80 ? 'excellent' as const : p.matchScore >= 60 ? 'good' as const : p.matchScore >= 30 ? 'partial' as const : 'low' as const,
        }))

        return {
            matches,
            consultantName,
            consultantSkills,
            totalProjectsAnalyzed: projects.length,
            aiSummary: 'Ranking oparty na dopasowaniu umiejętności (bez AI).',
        }
    }
}
