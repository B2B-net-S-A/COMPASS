'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { academyAction, assertDatabaseResult, requireAcademyContext } from '@/lib/academy/server'
import { isMissingDatabaseObject, MIGRATION_PENDING_PL } from '@/lib/academy/migration-contract'
import type { ActionResult } from '@/lib/types/learning'

export interface RunPublicationState {
    /** False do zastosowania migracji kroku 3: przycisk mówi wtedy, że czeka na migrację. */
    available: boolean
    requestedAt: string | null
    viewers: Record<string, number>
}

export interface TeachingCounts {
    quizQuestions: number
    learnerQuestions: number
}

const uuid = z.uuid()

export async function getRunPublicationState(runId: string): Promise<ActionResult<RunPublicationState>> {
    return academyAction('publication.state', async () => {
        const { client } = await requireAcademyContext({ trainer: true })
        const id = uuid.parse(runId)
        const [request, viewers] = await Promise.all([
            client.from('academy_run_publication_requests').select('requested_at').eq('run_id', id).maybeSingle(),
            client.rpc('academy_run_recording_viewers', { p_run_id: id }),
        ])
        if (request.error && isMissingDatabaseObject(request.error)) return { available: false, requestedAt: null, viewers: {} }
        assertDatabaseResult(request.error)
        // Liczba oglądających to dekoracja: błąd zostawia sam stan publikacji.
        const counts = viewers.error ? [] : (viewers.data ?? []) as Array<{ asset_id: string; viewers: number }>
        return { available: true, requestedAt: (request.data?.requested_at as string | undefined) ?? null, viewers: Object.fromEntries(counts.map(row => [row.asset_id, Number(row.viewers)])) }
    })
}

const REQUEST_ERRORS: Record<string, string> = {
    nothing_to_publish: 'Najpierw wgraj nagranie albo slajdy. Pliki trafiają do akceptacji po skanie bezpieczeństwa.',
    trainer_consent_required: 'Zaznacz zgodę na publikację.',
    run_manager_required: 'Wysłać do publikacji może prowadzący tę edycję.',
    run_not_found: 'Ta edycja została odwołana albo nie istnieje.',
}

const requestSchema = z.object({ runId: uuid, courseId: uuid, trainerConsent: z.literal(true, { message: 'Zaznacz zgodę na publikację.' }) })

/** „Wyślij do publikacji”: zgoda trenera i dzwonek dla osób, które zatwierdzają nagranie. */
export async function requestRunPublication(input: z.input<typeof requestSchema>): Promise<ActionResult<{ requestedAt: string }>> {
    return academyAction('publication.request', async () => {
        const parsed = requestSchema.parse(input)
        const { client } = await requireAcademyContext({ trainer: true })
        const { data, error } = await client.rpc('academy_request_run_publication', { p_run_id: parsed.runId, p_trainer_consent: true })
        if (error && isMissingDatabaseObject(error)) throw new Error(MIGRATION_PENDING_PL)
        if (error?.message && REQUEST_ERRORS[error.message]) throw new Error(REQUEST_ERRORS[error.message])
        assertDatabaseResult(error)
        revalidatePath(`/learning/tworze/${parsed.courseId}`)
        return { requestedAt: data as string }
    })
}

export async function getTeachingCounts(input: { courseId: string; versionId: string | null }): Promise<ActionResult<TeachingCounts>> {
    return academyAction('publication.counts', async () => {
        const { client } = await requireAcademyContext({ trainer: true })
        const courseId = uuid.parse(input.courseId)
        const versionId = input.versionId ? uuid.parse(input.versionId) : null
        const [quiz, questions] = await Promise.all([
            versionId ? client.from('course_quiz_questions').select('id', { count: 'exact', head: true }).eq('version_id', versionId) : null,
            client.from('course_questions').select('id', { count: 'exact', head: true }).eq('course_id', courseId),
        ])
        return { quizQuestions: quiz && !quiz.error ? quiz.count ?? 0 : 0, learnerQuestions: questions.error ? 0 : questions.count ?? 0 }
    })
}
