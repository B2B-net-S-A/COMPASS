'use server'


import { createClient } from '@/lib/supabase/server'

export interface ProjectsAnalysis {
    totalAnalyzed: number
    perfectMatches: number
    gaps: ProjectAnalysis[]
    userSkillsCount: number
    totalProjectsInDb: number
    diagnostics?: string          // info why zeros if applicable
}

export interface ProjectAnalysis {
    projectId: string
    projectTitle: string
    matchScore: number
    status: 'perfect_match' | 'no_requirements' | 'has_gaps'
    missingSkills: string[]
    matchedSkills: string[]
}

// Skill normalization
const normalizeSkill = (skill: string) => {
    return skill.toLowerCase().trim()
        .replace(/\s+/g, ' ')
        .replace(/\.js$/i, '')
        .replace(/js$/i, '')
        .replace(/\./g, '')
}

const skillAliases: Record<string, string> = {
    'reactjs': 'react',
    'react.js': 'react',
    'nextjs': 'next',
    'next.js': 'next',
    'vuejs': 'vue',
    'vue.js': 'vue',
    'angularjs': 'angular',
    'node': 'nodejs',
    'node.js': 'nodejs',
    'aws': 'amazon web services',
    'ts': 'typescript',
    'py': 'python',
    'k8s': 'kubernetes',
    'postgres': 'postgresql',
    'mongo': 'mongodb',
}

const getCanonicalSkill = (skill: string) => {
    const normalized = normalizeSkill(skill)
    return skillAliases[normalized] || normalized
}

export async function getSkillGaps(): Promise<ProjectsAnalysis> {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { totalAnalyzed: 0, perfectMatches: 0, gaps: [], userSkillsCount: 0, totalProjectsInDb: 0, diagnostics: 'Niezalogowany' }

    // 1. Get user profile with skills
    const { data: profile } = await supabase
        .from('profiles')
        .select('skills, bio, embedding, role')
        .eq('id', user.id)
        .single()

    const userSkillsRaw: string[] = profile?.skills || []
    const userSkills = new Set(userSkillsRaw.map(s => getCanonicalSkill(s)))

    // 2. Count total projects
    const { count: totalProjectsInDb } = await supabase
        .from('projects')
        .select('*', { count: 'exact', head: true })

    // 3. Kompetencje do dopasowania — wprost z profilu użytkownika.
    const effectiveSkills = userSkills

    // Audyt 2026-08 — stała tu gałąź „admin bez kompetencji pożycza je od pierwszego
    // kandydata z ATS". Tabela `candidates` NIE ISTNIEJE na produkcji (sprawdzone
    // w information_schema), więc zapytanie tylko po cichu zwracało błąd, a flaga
    // `candidateSkillsUsed` nigdy nie wstawała. Usunięte: admin bez kompetencji dostaje
    // teraz uczciwe „uzupełnij profil" zamiast cudzej listy podanej jako własna.

    // 4. Try embedding-based matching first
    let matchedProjects: any[] = []

    // Audyt 2026-08 — dopasowanie semantyczne przez RPC `match_projects` zostało usunięte:
    // funkcja NIE ISTNIEJE w bazie (sprawdzone w pg_proc), a supabase-js nie rzuca przy
    // brakującym RPC — zwraca błąd w polu `error`, które kod ignorował. Efektem był zawsze
    // pusty wynik i cichy zjazd do dopasowania po kompetencjach niżej. Zostaje samo
    // dopasowanie po kompetencjach; żeby wrócić do wektorów, trzeba najpierw dodać funkcję.

    // 5. Dopasowanie po pokryciu wymaganych kompetencji
    if (matchedProjects.length === 0 && effectiveSkills.size > 0) {
        const { data: allProjects } = await supabase
            .from('projects')
            .select('id, title, required_skills')
            .not('required_skills', 'is', null)
            .limit(50)

        if (allProjects && allProjects.length > 0) {
            // Score by skill overlap
            matchedProjects = allProjects
                .map(p => {
                    const reqSkills = (p.required_skills || []) as string[]
                    if (reqSkills.length === 0) return { ...p, similarity: 0.3 }
                    const matchCount = reqSkills.filter(s => effectiveSkills.has(getCanonicalSkill(s))).length
                    const score = matchCount / reqSkills.length
                    return { ...p, similarity: score }
                })
                .sort((a, b) => b.similarity - a.similarity)
        }
    }

    // 6. Final fallback: just get recent projects regardless of skills
    if (matchedProjects.length === 0) {
        const { data: recentProjects } = await supabase
            .from('projects')
            .select('id, title, required_skills')
            .order('created_at', { ascending: false })
            .limit(10)

        matchedProjects = (recentProjects || []).map(p => ({ ...p, similarity: 0 }))
    }

    // Take top 10
    const topMatches = matchedProjects
        .sort((a: any, b: any) => (b.similarity || 0) - (a.similarity || 0))
        .slice(0, 10)

    // 7. Analyze each project
    const analysis: ProjectAnalysis[] = []

    for (const project of topMatches) {
        const reqSkills = project.required_skills as string[] | null

        // No requirements defined
        if (!reqSkills || !Array.isArray(reqSkills) || reqSkills.length === 0) {
            analysis.push({
                projectId: project.id,
                projectTitle: project.title || 'Bez tytułu',
                matchScore: Math.round((project.similarity || 0) * 100),
                status: 'no_requirements',
                missingSkills: [],
                matchedSkills: [],
            })
            continue
        }

        const matched = reqSkills.filter((skill: string) => effectiveSkills.has(getCanonicalSkill(skill)))
        const missing = reqSkills.filter((skill: string) => !effectiveSkills.has(getCanonicalSkill(skill)))

        if (missing.length === 0) {
            analysis.push({
                projectId: project.id,
                projectTitle: project.title || 'Bez tytułu',
                matchScore: Math.round((project.similarity || 0) * 100),
                status: 'perfect_match',
                missingSkills: [],
                matchedSkills: matched,
            })
        } else {
            analysis.push({
                projectId: project.id,
                projectTitle: project.title || 'Bez tytułu',
                matchScore: Math.round((matched.length / reqSkills.length) * 100),
                status: 'has_gaps',
                missingSkills: missing,
                matchedSkills: matched,
            })
        }
    }

    // Build diagnostics
    let diagnostics: string | undefined
    if (userSkillsRaw.length === 0 && effectiveSkills.size === 0) {
        diagnostics = 'Brak umiejętności w profilu — uzupełnij sekcję "Umiejętności" aby uzyskać spersonalizowaną analizę'
    }

    return {
        totalAnalyzed: topMatches.length,
        perfectMatches: analysis.filter(a => a.status === 'perfect_match' || a.status === 'no_requirements').length,
        gaps: analysis,
        userSkillsCount: effectiveSkills.size,
        totalProjectsInDb: totalProjectsInDb || 0,
        diagnostics,
    }
}
