'use server'

import { logCompat } from '@/lib/logger'

import { createClient } from '@/lib/supabase/server'
import { academyAction, assertDatabaseResult, requireAcademyContext } from '@/lib/academy/server'
import { loadAcademyCourse } from '@/lib/academy/course-data'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import type { ActionResult } from '@/lib/types/learning'

// ============================================================
// A2.5 — Post-Course Survey server actions
// ============================================================

export interface CourseSurveyInput {
    courseId: string
    enrollmentId?: string
    npsScore: number
    bestPart?: string
    improvementSuggestion?: string
}

export interface CourseSurveyAggregate {
    response_count: number
    avg_nps: number
    nps_score_value: number // -100..+100 NPS-style: %promoters - %detractors
    promoters_count: number
    passives_count: number
    detractors_count: number
    best_parts_sample: string[] // first 5 non-empty
    improvements_sample: string[] // first 5 non-empty
}

/**
 * A2.5: Post-course survey submit. Wymaga ukończonego enrollment.
 */
export async function submitCourseSurvey(
    input: CourseSurveyInput,
): Promise<ActionResult<{ id: string }>> {
    return academyAction('survey.submit', async () => {
        const { client, access } = await requireAcademyContext()
        const { enrollment } = await loadAcademyCourse(client, access.userId, z.uuid().parse(input.courseId), { enrollmentId: input.enrollmentId })
        if (!enrollment?.completed_at) throw new Error('Ankieta jest dostępna po ukończeniu szkolenia.')
        const { data, error } = await client.rpc('academy_submit_survey', {
            p_enrollment_id: enrollment.id,
            p_nps_score: z.number().int().min(0).max(10).parse(input.npsScore),
            p_best_part: z.string().trim().max(1000).parse(input.bestPart ?? '') || null,
            p_improvement_suggestion: z.string().trim().max(1000).parse(input.improvementSuggestion ?? '') || null,
        })
        assertDatabaseResult(error)
        revalidatePath('/learning', 'layout')
        return { id: data as string }
    })
}

/**
 * A2.5: agregacja survey responses dla autora/admina (insights).
 */
export async function getCourseSurveyAggregate(
    courseId: string,
): Promise<ActionResult<CourseSurveyAggregate>> {
    try {
        const supabase = createClient()
        const { data: responses, error } = await supabase
            .from('course_survey_responses')
            .select('nps_score, best_part, improvement_suggestion')
            .eq('course_id', courseId)
        if (error) throw error

        type R = {
            nps_score: number | null
            best_part: string | null
            improvement_suggestion: string | null
        }
        const rows = (responses ?? []) as R[]
        const total = rows.length
        if (total === 0) {
            return {
                success: true,
                data: {
                    response_count: 0,
                    avg_nps: 0,
                    nps_score_value: 0,
                    promoters_count: 0,
                    passives_count: 0,
                    detractors_count: 0,
                    best_parts_sample: [],
                    improvements_sample: [],
                },
            }
        }

        const validScores = rows.filter((r) => r.nps_score !== null) as Array<{ nps_score: number }>
        const avgNps = validScores.reduce((s, r) => s + r.nps_score, 0) / Math.max(1, validScores.length)
        const promoters = validScores.filter((r) => r.nps_score >= 9).length
        const passives = validScores.filter((r) => r.nps_score >= 7 && r.nps_score < 9).length
        const detractors = validScores.filter((r) => r.nps_score < 7).length
        const npsScore = validScores.length > 0
            ? Math.round(((promoters - detractors) / validScores.length) * 100)
            : 0

        const bestParts = rows
            .map((r) => r.best_part)
            .filter((s): s is string => !!s && s.trim().length > 0)
            .slice(0, 5)
        const improvements = rows
            .map((r) => r.improvement_suggestion)
            .filter((s): s is string => !!s && s.trim().length > 0)
            .slice(0, 5)

        return {
            success: true,
            data: {
                response_count: total,
                avg_nps: Math.round(avgNps * 10) / 10,
                nps_score_value: npsScore,
                promoters_count: promoters,
                passives_count: passives,
                detractors_count: detractors,
                best_parts_sample: bestParts,
                improvements_sample: improvements,
            },
        }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd agregacji'
        logCompat.error('[getCourseSurveyAggregate]', error)
        return { success: false, error: msg }
    }
}
