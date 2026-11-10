'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { academyAction, assertDatabaseResult, requireAcademyContext } from '@/lib/academy/server'
import { isMissingDatabaseObject, MIGRATION_PENDING_PL } from '@/lib/academy/migration-contract'
import { requireRows, selectInChunks } from '@/lib/supabase/select-in-chunks'
import { createServiceClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/logger'
import type { BoardMaterial, BoardRun } from '@/lib/academy/organize-board'
import type { ActionResult } from '@/lib/types/learning'
import { createCourse } from './courses'
import { createAcademyRunWithFirstSession, listAcademyRunPage, publishAcademyRun } from './academy-sessions'
import { saveAcademyRunAudience } from './academy-run-audience'

export interface OrganizerBoard {
    userId: string
    runs: BoardRun[]
    materials: BoardMaterial[]
    /** run_id → kiedy trener wysłał do publikacji (pusto przed migracją kroku 3). */
    requests: Record<string, string>
    hasMore: boolean
}

/** Organizator to redaktor globalny (admin, TCM) albo recenzent Akademii. */
async function requireOrganizer() {
    const context = await requireAcademyContext({ reviewState: true })
    if (!context.access.canManageAcademy && !context.access.isAdmin && context.access.canReview !== true) {
        throw new Error('Ekran „Organizuję” jest dla organizatorów Akademii.')
    }
    return context
}

export async function getOrganizerBoard(): Promise<ActionResult<OrganizerBoard>> {
    return academyAction('organize.board', async () => {
        const { client, access } = await requireOrganizer()
        const page = await listAcademyRunPage({ scope: 'managed', pageSize: 100 })
        if (!page.success) throw new Error(page.error)
        const runs: BoardRun[] = page.data.items.map(run => ({
            id: run.id, courseId: run.courseId, courseSlug: run.courseSlug, courseTitle: run.courseTitle, title: run.title,
            status: run.status, confirmedCount: run.confirmedCount,
            sessions: run.sessions.map(session => ({ startsAt: session.startsAt, endsAt: session.endsAt, status: session.status })),
        }))
        const ids = runs.map(run => run.id)
        const rows = await selectInChunks<{ id: string; run_id: string; filename: string; mime_type: string; status: string; review_status: string; uploaded_by: string | null }>({
            source: 'academy.organize.materials', column: 'run_id', ids,
            query: () => client.from('academy_material_catalog').select('id,run_id,filename,mime_type,status,review_status,uploaded_by').is('purged_at', null),
        })
        const requests: Record<string, string> = {}
        if (ids.length) {
            // Prośby trenera to dekoracja kolejki: przed migracją albo przy błędzie kolejka działa bez nich.
            const { data, error } = await client.from('academy_run_publication_requests').select('run_id,requested_at').in('run_id', ids.slice(0, 60))
            if (error && !isMissingDatabaseObject(error)) logger.error({ event: 'academy.organize.requests_failed', error })
            for (const row of error ? [] : data ?? []) requests[row.run_id as string] = row.requested_at as string
        }
        return {
            userId: access.userId, runs, hasMore: page.data.hasMore, requests,
            materials: rows.map(row => ({ id: row.id, runId: row.run_id, filename: row.filename, mimeType: row.mime_type, status: row.status, reviewStatus: row.review_status, uploadedBy: row.uploaded_by })),
        }
    })
}

export interface LiveTrainer { id: string; name: string }

/** Kogo można wpisać jako trenera: aktywne uprawnienie trenera albo rola admin/TCM. Same imiona i id. */
export async function listLiveTrainers(): Promise<ActionResult<LiveTrainer[]>> {
    return academyAction('organize.trainers', async () => {
        await requireOrganizer()
        // TCM nie czyta academy_user_capabilities (RLS: sam siebie albo admin), a lista jest po guardzie.
        const admin = createServiceClient() as unknown as SupabaseClient
        const grants = requireRows<{ user_id: string }>('trenerów Akademii', await admin.from('academy_user_capabilities').select('user_id').eq('can_train', true).is('revoked_at', null).limit(1000))
        const ids = grants.map(row => row.user_id).filter(id => z.uuid().safeParse(id).success)
        type Person = { id: string; full_name: string | null; email: string; employment_status: string | null; is_external: boolean | null }
        const columns = 'id,full_name,email,employment_status,is_external'
        // Id paczkami (selectInChunks), bo długie `.in()` ucinało się w drodze do kontenera (incydent 25.08).
        const [editors, granted] = await Promise.all([
            admin.from('profiles').select(columns).in('role', ['admin', 'talent_community']).limit(500),
            selectInChunks<Person>({ source: 'academy.organize.trainers', column: 'id', ids, query: () => admin.from('profiles').select(columns) }),
        ])
        const byId = new Map([...requireRows<Person>('redaktorów Akademii', editors), ...granted].map(person => [person.id, person]))
        const people = Array.from(byId.values())
        return people
            .filter(person => !person.is_external && person.employment_status !== 'exited')
            .map(person => ({ id: person.id, name: person.full_name || person.email }))
            .sort((a, b) => a.name.localeCompare(b.name, 'pl'))
    })
}

const liveSchema = z.object({
    title: z.string().trim().min(3, 'Tytuł musi mieć co najmniej 3 znaki.').max(200),
    trainerId: z.uuid({ message: 'Wybierz trenera.' }),
    startsAt: z.iso.datetime({ offset: true }),
    durationMinutes: z.number().int().min(15).max(480),
    timeZone: z.string().min(1).max(100).default('Europe/Warsaw'),
    mode: z.enum(['managed_teams', 'external_link']),
    organizerId: z.uuid().nullish(),
    externalJoinUrl: z.string().max(8192).nullish(),
    audience: z.object({ includeNexus: z.boolean(), includeOffice: z.boolean(), clients: z.array(z.string().max(200)).max(100) }),
})

export interface LiveTrainingResult {
    courseId: string
    runId: string | null
    /** Co zostało do zrobienia, gdy część kroków się nie udała. Zaproszenia zawsze czekają w kolejce wstrzymanych. */
    incomplete: string | null
    invitationsHeld: number
}

/**
 * „Nowe szkolenie na żywo”: szkolenie, zapowiedź bez drugiej osoby, edycja z terminem, publikacja
 * i lista zaproszonych. Zaproszenia trafiają do kolejki wstrzymanych wiadomości (nic nie wychodzi).
 */
export async function createLiveTraining(input: z.input<typeof liveSchema>): Promise<ActionResult<LiveTrainingResult>> {
    return academyAction('organize.live_create', async () => {
        const { client, access } = await requireOrganizer()
        if (!access.canManageAcademy) throw new Error('Nowe szkolenie zakłada organizator (admin albo TCM).')
        const parsed = liveSchema.parse(input)
        if (Date.parse(parsed.startsAt) <= Date.now()) throw new Error('Termin musi być w przyszłości.')
        // Bez migracji kroku 4 nie zakładamy niczego: szkic bez zapowiedzi zostałby w edytorze.
        const probe = await client.rpc('academy_publish_announcement', { p_course_id: '00000000-0000-0000-0000-000000000000' })
        if (probe.error && isMissingDatabaseObject(probe.error)) throw new Error(MIGRATION_PENDING_PL)

        const created = await createCourse({ title: parsed.title, category: 'Webinar', delivery_mode: 'live', duration_minutes: parsed.durationMinutes,
            completion_rules: { quiz_required: false, require_all_lessons: false, attendance_percent: 80, quiz_pass_percent: 80 } })
        if (!created.success) throw new Error(created.error)
        const courseId = created.data.courseId
        const partial = (incomplete: string, runId: string | null = null): LiveTrainingResult => ({ courseId, runId, incomplete, invitationsHeld: 0 })

        const published = await client.rpc('academy_publish_announcement', { p_course_id: courseId })
        if (published.error) {
            logger.error({ event: 'academy.organize.announcement_failed', error: published.error })
            return partial('Szkolenie zapisane jako szkic, ale nie udało się opublikować zapowiedzi. Spróbuj ponownie z listy.')
        }
        const endsAt = new Date(Date.parse(parsed.startsAt) + parsed.durationMinutes * 60_000).toISOString()
        const run = await createAcademyRunWithFirstSession({ courseId, versionId: published.data as string, title: parsed.title, capacity: 500, trainerId: parsed.trainerId,
            session: { startsAt: parsed.startsAt, endsAt, timeZone: parsed.timeZone, mode: parsed.mode, organizerId: parsed.organizerId ?? null, externalJoinUrl: parsed.externalJoinUrl ?? null } })
        if (!run.success) return partial(`Zapowiedź opublikowana, ale nie udało się założyć terminu: ${run.error}`)
        if (run.data.incomplete) return partial(run.data.incomplete, run.data.runId)
        const runId = run.data.runId
        const publishedRun = await publishAcademyRun(runId)
        if (!publishedRun.success) return partial(`Termin zapisany, ale zapisy nie ruszyły: ${publishedRun.error}`, runId)
        revalidatePath('/learning/organizuje')
        if (!parsed.audience.includeNexus && !parsed.audience.includeOffice && parsed.audience.clients.length === 0) return { courseId, runId, incomplete: null, invitationsHeld: 0 }
        const audience = await saveAcademyRunAudience({ runId, filter: parsed.audience, excluded: [] })
        if (!audience.success) return partial(`Zapisy otwarte, ale lista zaproszonych nie zapisała się: ${audience.error}`, runId)
        return { courseId, runId, incomplete: null, invitationsHeld: audience.data.held }
    })
}
