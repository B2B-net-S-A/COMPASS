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

    // 3. For admin with no skills — try to get skills from candidates table (first record as demo)
    let effectiveSkills = userSkills
    let candidateSkillsUsed = false

    if (userSkills.size === 0 && ['admin', 'administrator', 'centrala'].includes(profile?.role || '')) {
        // Admin doesn't have personal skills — use aggregate from candidates to show system works
        const { data: sampleCandidate } = await supabase
            .from('candidates')
            .select('skills')
            .not('skills', 'is', null)
            .limit(1)
            .single()

        if (sampleCandidate?.skills && Array.isArray(sampleCandidate.skills) && sampleCandidate.skills.length > 0) {
            effectiveSkills = new Set(sampleCandidate.skills.map((s: string) => getCanonicalSkill(s)))
            candidateSkillsUsed = true
        }
    }

    // 4. Try embedding-based matching first
    let matchedProjects: any[] = []

    if (profile?.embedding) {
        try {
            const { data: projects } = await supabase.rpc('match_projects', {
                query_embedding: profile.embedding,
                match_threshold: 0.3,    // Lower threshold for more results
                match_count: 20,
            })
            matchedProjects = projects || []
        } catch (e) {
            console.warn('Embedding match failed:', e)
        }
    }

    // 5. Fallback: if no embedding matches, get projects with required_skills that overlap user skills
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
    if (candidateSkillsUsed) {
        diagnostics = 'Analiza na bazie umiejętności przykładowego konsultanta (konto admin nie posiada własnych umiejętności)'
    } else if (userSkillsRaw.length === 0 && effectiveSkills.size === 0) {
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
