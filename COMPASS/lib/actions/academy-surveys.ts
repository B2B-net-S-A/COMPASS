'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { academyAction, assertDatabaseResult, requireAcademyContext } from '@/lib/academy/server'
import type { EditionSurveyAnswers, EditionSurveyLabels, EditionSurveyReport, EditionSurveyState } from '@/lib/types/academy-surveys'

export async function getEditionSurveyState(runId: string) {
    return academyAction('edition-survey.state', async () => {
        const { client } = await requireAcademyContext()
        const { data, error } = await client.rpc('academy_edition_survey_state', { p_run_id: z.uuid().parse(runId) })
        assertDatabaseResult(error)
        return data as EditionSurveyState
    })
}
export async function submitEditionSurvey(runId: string, answers: EditionSurveyAnswers) {
    return academyAction('edition-survey.submit', async () => {
        const { client } = await requireAcademyContext()
        const { data, error } = await client.rpc('academy_submit_edition_survey', { p_run_id: z.uuid().parse(runId), p_answers: answers })
        assertDatabaseResult(error)
        revalidatePath('/learning/edycje/' + runId)
        return data as string
    })
}
export async function getEditionSurveyReport(runId: string) {
    return academyAction('edition-survey.report', async () => {
        const { client } = await requireAcademyContext({ trainer: true })
        const { data, error } = await client.rpc('academy_edition_survey_report', { p_run_id: z.uuid().parse(runId) })
        assertDatabaseResult(error)
        return data as EditionSurveyReport
    })
}
export async function saveEditionSurveySettings(runId: string, introduction: string, labels: Partial<EditionSurveyLabels>) {
    return academyAction('edition-survey.configure', async () => {
        const { client } = await requireAcademyContext({ trainer: true })
        const { error } = await client.rpc('academy_save_edition_survey_settings', { p_run_id: z.uuid().parse(runId), p_introduction: introduction, p_labels: labels })
        assertDatabaseResult(error)
        revalidatePath('/learning/edycje/' + runId)
        return null
    })
}

export async function getHistoricalCourseSurveys() {
    return academyAction('edition-survey.history', async () => {
        const { client } = await requireAcademyContext({ trainer: true })
        const { data, error } = await client.rpc('academy_course_survey_history')
        assertDatabaseResult(error)
        return data as Array<{ courseId: string; title: string; responseCount: number; averageNps: number | null; bestParts: string[]; improvements: string[] }>
    })
}
