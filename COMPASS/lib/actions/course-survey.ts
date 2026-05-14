'use server'

import { logCompat } from '@/lib/logger'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { ActionResult } from '@/lib/types/learning'

// ============================================================
// A2.5 — Post-Course Survey server actions
// ============================================================

export interface CourseSurveyInput {
    courseId: string
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
    try {
        const supabase = createClient()
        const {
            data: { user },
        } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }

        if (!Number.isInteger(input.npsScore) || input.npsScore < 1 || input.npsScore > 10) {
            return { success: false, error: 'NPS musi być liczbą całkowitą 1-10.' }
        }

        // Verify enrollment + completion
        const { data: enrollment } = await supabase
            .from('course_enrollments')
            .select('id, completed_at')
            .eq('user_id', user.id)
            .eq('course_id', input.courseId)
            .maybeSingle<{ id: string; completed_at: string | null }>()

        if (!enrollment) {
            return { success: false, error: 'Nie jesteś zapisany na ten kurs.' }
        }
        if (!enrollment.completed_at) {
            return { success: false, error: 'Możesz wypełnić ankietę dopiero po ukończeniu kursu.' }
        }

        // Idempotency: jeśli już wypełnione, zwróć existing
        const { data: existing } = await supabase
            .from('course_survey_responses')
            .select('id')
            .eq('user_id', user.id)
            .eq('course_id', input.courseId)
            .maybeSingle<{ id: string }>()
        if (existing) {
            return { success: true, data: { id: existing.id } }
        }

        const { data, error } = await supabase
            .from('course_survey_responses')
            .insert({
                user_id: user.id,
                course_id: input.courseId,
                enrollment_id: enrollment.id,
                nps_score: input.npsScore,
                best_part: input.bestPart?.trim() || null,
                improvement_suggestion: input.improvementSuggestion?.trim() || null,
            })
            .select('id')
            .single<{ id: string }>()
        if (error) throw error

        revalidatePath('/learning')
        return { success: true, data }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd wysyłania ankiety'
        logCompat.error('[submitCourseSurvey]', error)
        return { success: false, error: msg }
    }
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
