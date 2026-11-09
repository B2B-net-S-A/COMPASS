'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { academyActionError } from '@/lib/academy/errors'
import { isMissingDatabaseObject, MIGRATION_PENDING_PL } from '@/lib/academy/migration-contract'
import { requireAcademyContext } from '@/lib/academy/server'
import { COURSE_TOPIC_MAX_LENGTH, COURSE_TOPIC_TOO_LONG_PL, normalizeCourseTopic } from '@/lib/academy/course-library'
import { ExpectedError, runAction, type ActionResult } from '@/lib/actions/action-result'

// B4.7: temat i program kursu (biblioteka IT, M10). Pola leżą na `courses`, poza wersją,
// więc zmiana od razu działa w katalogu. Zapis wyłącznie przez RPC
// `academy_set_course_library_fields`, który sam sprawdza `academy_can_manage_course`.
// Programu nie da się tu założyć: nie ma RPC, program powstaje przy kursie dla nieobecnych (B4.8).

export interface CourseLibraryState {
    /** False, dopóki migracja B4.7 nie jest zastosowana: panel mówi wtedy „czeka na migrację”. */
    migrated: boolean
    canEdit: boolean
    topic: string | null
    programmeId: string | null
    programmes: { id: string; title: string }[]
}

const NOT_MIGRATED: CourseLibraryState = { migrated: false, canEdit: false, topic: null, programmeId: null, programmes: [] }

const RPC_MESSAGES: Record<string, string> = {
    programme_not_found: 'Wybrany program już nie istnieje. Odśwież stronę.',
    invalid_course_topic: COURSE_TOPIC_TOO_LONG_PL,
}

async function requireTrainer() {
    try { return await requireAcademyContext({ trainer: true }) }
    catch (error) { throw new ExpectedError(academyActionError(error)) }
}

export async function getCourseLibraryFields(courseId: string): Promise<ActionResult<CourseLibraryState>> {
    return runAction('getCourseLibraryFields', async () => {
        const { client } = await requireTrainer()
        const id = z.uuid().safeParse(courseId)
        if (!id.success) throw new ExpectedError('Nieprawidłowy identyfikator szkolenia.')
        const course = await client.from('courses').select('topic,programme_id').eq('id', id.data).maybeSingle()
        if (isMissingDatabaseObject(course.error)) return NOT_MIGRATED
        if (course.error) throw new Error(`Nie udało się odczytać tematu kursu: ${course.error.message}`)
        if (!course.data) throw new ExpectedError('Szkolenie nie istnieje lub nie masz do niego dostępu.')
        const [programmes, manage] = await Promise.all([
            client.from('academy_programmes').select('id,title').order('title').limit(500),
            client.rpc('academy_can_manage_course', { p_course_id: id.data }),
        ])
        if (isMissingDatabaseObject(programmes.error)) return NOT_MIGRATED
        // Lista programów to treść pola wyboru: pusta przez awarię wyglądałaby jak „brak programów”.
        if (programmes.error) throw new Error(`Nie udało się odczytać programów: ${programmes.error.message}`)
        if (programmes.data === null) throw new Error('Brak odpowiedzi przy odczycie programów')
        if (manage.error) throw new Error(`Nie udało się sprawdzić uprawnień do kursu: ${manage.error.message}`)
        const row = course.data as { topic: string | null; programme_id: string | null }
        return {
            migrated: true,
            canEdit: manage.data === true,
            topic: row.topic,
            programmeId: row.programme_id,
            programmes: programmes.data as { id: string; title: string }[],
        }
    })
}

export async function setCourseLibraryFields(input: { courseId: string; topic: string | null; programmeId: string | null }): Promise<ActionResult<null>> {
    return runAction('setCourseLibraryFields', async () => {
        const { client } = await requireTrainer()
        const parsed = z.object({
            courseId: z.uuid(),
            topic: z.string().nullable().transform(normalizeCourseTopic),
            programmeId: z.uuid().nullable(),
        }).safeParse(input)
        if (!parsed.success) throw new ExpectedError('Sprawdź temat i wybrany program.')
        const { courseId, topic, programmeId } = parsed.data
        if (topic && topic.length > COURSE_TOPIC_MAX_LENGTH) throw new ExpectedError(COURSE_TOPIC_TOO_LONG_PL)
        const { error } = await client.rpc('academy_set_course_library_fields', { p_course_id: courseId, p_topic: topic, p_programme_id: programmeId })
        if (isMissingDatabaseObject(error)) throw new ExpectedError(MIGRATION_PENDING_PL)
        if (error) {
            if (RPC_MESSAGES[error.message]) throw new ExpectedError(RPC_MESSAGES[error.message])
            if (error.code === '42501') throw new ExpectedError(academyActionError(new Error(error.message)))
            throw new Error(`academy_set_course_library_fields: ${error.code ?? ''} ${error.message}`)
        }
        revalidatePath('/learning', 'layout')
        return null
    })
}
