'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { academyAction, assertDatabaseResult, requireAcademyContext } from '@/lib/academy/server'
import { validateTeamsJoinUrl } from '@/lib/academy/teams'
import { academyManagedTeamsConfiguration, academyAttendanceRetentionConfiguration } from '@/lib/academy/db-worker'
import type { ActionResult } from '@/lib/types/learning'
import type {
    AcademyIntegrationIssuesPageDTO, AcademyOrganizerDTO, AcademyRunDTO, AcademyM365IdentityDTO, AcademyM365IdentitiesPageDTO, AcademyIntegrationConfigDTO,
    AcademyRunParticipantDTO, SaveAcademySessionInput, ReplaceAcademySessionInput, AcademyMyRunOverview,
} from '@/lib/types/academy-sessions'

const uuid = z.uuid()
const timestamp = z.iso.datetime({ offset: true })
const reason = z.string().trim().min(5, 'Uzasadnienie musi mieć co najmniej 5 znaków.').max(2000)
const runFields = { title: z.string().trim().min(2).max(200), capacity: z.number().int().min(1).max(500) }
const sessionSchema = z.object({
    id: uuid.optional(), runId: uuid, title: z.string().trim().min(2).max(200),
    startsAt: timestamp, endsAt: timestamp, timeZone: z.string().min(1).max(100),
    mode: z.enum(['managed_teams', 'external_link']), organizerId: uuid.nullish(),
    externalJoinUrl: z.string().max(8192).nullish(), required: z.boolean(),
}).refine(input => Date.parse(input.endsAt) > Date.parse(input.startsAt), 'Koniec musi być późniejszy od początku.')

function refresh(runId?: string) {
    revalidatePath('/learning', 'layout')
    revalidatePath('/admin/learning', 'layout')
    if (runId) revalidatePath(`/learning/edycje/${runId}`)
}

export async function getAcademyIntegrationConfig(): Promise<ActionResult<AcademyIntegrationConfigDTO>> {
    return academyAction('sessions.config', async () => {
        const { client } = await requireAcademyContext({ trainer: true })
        const config = { ...academyManagedTeamsConfiguration(), ...academyAttendanceRetentionConfiguration() }
        if (!config.managedTeamsAvailable) return config
        const { data, error } = await client.rpc('academy_list_organizers')
        assertDatabaseResult(error)
        const organizerAvailable = (data as AcademyOrganizerDTO[] | null)?.some(o => o.enabled && o.tenantId.toLowerCase() === process.env.AZURE_TENANT_ID!.toLowerCase())
        return organizerAvailable ? config : { ...config, managedTeamsAvailable: false, reason: 'Administrator musi skonfigurować aktywnego organizatora Teams. Możesz użyć linku zewnętrznego.' }
    })
}

const runPageSchema = z.object({
    courseId: uuid.optional(), page: z.number().int().min(1).max(20_000_000).default(1),
    pageSize: z.number().int().min(1).max(100).default(24),
    scope: z.enum(['managed', 'registered', 'calendar', 'my_calendar', 'catalog']),
    windowStart: timestamp.optional(), windowEnd: timestamp.optional(),
    courseIds: z.array(uuid).min(1).max(50).optional(),
})
type RunPageOptions = z.input<typeof runPageSchema>
type RunPage = { items: AcademyRunDTO[]; page: number; hasMore: boolean }
const myRunOverviewSchema = z.object({
    waiting: z.object({
        items: z.array(z.object({ runId: uuid, courseTitle: z.string(), runTitle: z.string() })).max(25),
        total: z.number().int().nonnegative(), page: z.number().int().positive(), pageSize: z.number().int().positive(),
    }),
    upcoming: z.object({ runId: uuid, sessionTitle: z.string(), startsAt: timestamp, timeZone: z.string() }).nullable(),
})

async function fetchRunPage(client: Awaited<ReturnType<typeof requireAcademyContext>>['client'], options: RunPageOptions): Promise<RunPage> {
    const parsed = runPageSchema.parse(options)
    const { data, error } = await client.rpc('academy_list_runs_page', {
        p_course_id: parsed.courseId ?? null,
        p_offset: (parsed.page - 1) * parsed.pageSize,
        p_limit: parsed.pageSize + 1,
        p_scope: parsed.scope,
        p_window_start: parsed.windowStart ?? null,
        p_window_end: parsed.windowEnd ?? null,
        p_course_ids: parsed.courseIds ?? null,
    })
    assertDatabaseResult(error)
    const rows = (data ?? []) as AcademyRunDTO[]
    return { items: rows.slice(0, parsed.pageSize), page: parsed.page, hasMore: rows.length > parsed.pageSize }
}

/** Filter before paging: an assigned trainer must not lose later manageable runs. */
export async function listAcademyRunPage(options: RunPageOptions): Promise<ActionResult<RunPage>> {
    return academyAction('sessions.runs_page', async () => {
        const { client } = await requireAcademyContext()
        return fetchRunPage(client, options)
    })
}

/** A bounded waitlist page and the single next session for this learner. */
export async function getMyAcademyRunOverview(waitlistPage = 1): Promise<ActionResult<AcademyMyRunOverview>> {
    return academyAction('sessions.my_overview', async () => {
        const page = z.number().int().min(1).max(100_000).parse(waitlistPage)
        const { client } = await requireAcademyContext()
        const { data, error } = await client.rpc('academy_my_run_overview', { p_waitlist_page: page, p_limit: 25 })
        assertDatabaseResult(error)
        const overview = myRunOverviewSchema.parse(data)
        const expected = Math.min(25, Math.max(0, overview.waiting.total - (page - 1) * 25))
        if (overview.waiting.page !== page || overview.waiting.pageSize !== 25 || overview.waiting.items.length !== expected) {
            throw new Error('Lista rezerwowa jest niepełna.')
        }
        return overview
    })
}

export async function getAcademyRun(runId: string): Promise<ActionResult<AcademyRunDTO>> {
    return academyAction('sessions.run', async () => {
        const { client } = await requireAcademyContext()
        const { data, error } = await client.rpc('academy_list_runs', { p_course_id: null, p_run_id: uuid.parse(runId) })
        assertDatabaseResult(error)
        const run = (data as AcademyRunDTO[] | null)?.[0]
        if (!run) throw new Error('Nie znaleziono edycji lub nie masz do niej dostępu.')
        return run
    })
}
export async function createAcademyRun(input: { courseId: string; versionId: string; title: string; capacity: number }): Promise<ActionResult<string>> {
    return academyAction('sessions.run_create', async () => {
        const parsed = z.object({ courseId: uuid, versionId: uuid, ...runFields }).parse(input)
        const { client } = await requireAcademyContext({ trainer: true })
        const { data, error } = await client.rpc('academy_create_run', { p_input: parsed })
        assertDatabaseResult(error)
        refresh()
        return data as string
    })
}
export async function updateAcademyRun(input: { runId: string; title: string; capacity: number }): Promise<ActionResult<void>> {
    return academyAction('sessions.run_update', async () => {
        const parsed = z.object({ runId: uuid, ...runFields }).parse(input)
        const { client } = await requireAcademyContext({ trainer: true })
        const { error } = await client.rpc('academy_update_run', { p_run_id: parsed.runId, p_title: parsed.title, p_capacity: parsed.capacity })
        assertDatabaseResult(error)
        refresh(parsed.runId)
    })
}
export async function publishAcademyRun(runId: string): Promise<ActionResult<void>> {
    return academyAction('sessions.run_publish', async () => {
        const id = uuid.parse(runId)
        const { client } = await requireAcademyContext({ admin: true })
        const { data: sessions, error: sessionError } = await client.from('course_sessions').select('meeting_mode').eq('run_id', id).eq('status', 'scheduled')
        assertDatabaseResult(sessionError)
        if (sessions?.some(s => s.meeting_mode === 'managed_teams')) {
            const config = academyManagedTeamsConfiguration()
            if (!config.managedTeamsAvailable) throw new Error(config.reason)
        }
        const { error } = await client.rpc('academy_publish_run', { p_run_id: id })
        assertDatabaseResult(error)
        refresh(id)
    })
}
export async function cancelAcademyRun(input: { runId: string; reason: string }): Promise<ActionResult<void>> {
    return academyAction('sessions.run_cancel', async () => {
        const parsed = z.object({ runId: uuid, reason }).parse(input)
        const { client } = await requireAcademyContext({ trainer: true })
        const { error } = await client.rpc('academy_cancel_run', { p_run_id: parsed.runId, p_reason: parsed.reason })
        assertDatabaseResult(error)
        refresh(parsed.runId)
    })
}
async function prepareSession(input: SaveAcademySessionInput) {
    const parsed = sessionSchema.parse(input)
    try { new Intl.DateTimeFormat('pl', { timeZone: parsed.timeZone }).format() } catch { throw new Error('Wybierz prawidłową strefę czasową.') }
    const { client } = await requireAcademyContext({ trainer: true })
    if (parsed.mode === 'external_link') {
        try { parsed.externalJoinUrl = validateTeamsJoinUrl(parsed.externalJoinUrl ?? '') } catch { throw new Error('Podaj prawidłowy link spotkania Teams zaczynający się od https://.') }
        parsed.organizerId = null
    } else {
        const config = academyManagedTeamsConfiguration()
        if (!config.managedTeamsAvailable) throw new Error(config.reason)
        if (!parsed.organizerId) throw new Error('Wybierz organizatora Teams.')
        const { data: organizer, error } = await client.from('academy_organizers').select('tenant_id,enabled').eq('id', parsed.organizerId).single()
        assertDatabaseResult(error)
        if (!organizer?.enabled || organizer.tenant_id.toLowerCase() !== process.env.AZURE_TENANT_ID?.toLowerCase()) {
            throw new Error('Organizator nie jest aktywny w skonfigurowanej organizacji Microsoft 365.')
        }
        parsed.externalJoinUrl = null
    }
    return { parsed, client }
}
export async function saveAcademySession(input: SaveAcademySessionInput): Promise<ActionResult<string>> {
    return academyAction('sessions.save', async () => {
        const { parsed, client } = await prepareSession(input)
        const { data, error } = await client.rpc('academy_save_session', { p_input: parsed })
        assertDatabaseResult(error)
        refresh(parsed.runId)
        return data as string
    })
}
export async function replaceAcademySession(input: ReplaceAcademySessionInput): Promise<ActionResult<string>> {
    return academyAction('sessions.replace', async () => {
        const metadata = z.object({ sessionId: uuid, reason, externalCancellationConfirmed: z.boolean() }).parse(input)
        const { parsed, client } = await prepareSession(input.session)
        if (parsed.id) throw new Error('Zastępstwo tworzy nowe spotkanie z zachowaniem historii.')
        const { data, error } = await client.rpc('academy_replace_session', {
            p_session_id: metadata.sessionId, p_input: parsed, p_reason: metadata.reason,
            p_external_cancelled: metadata.externalCancellationConfirmed,
        })
        assertDatabaseResult(error)
        refresh(parsed.runId)
        return data as string
    })
}
export async function cancelAcademySession(input: { sessionId: string; reason: string }): Promise<ActionResult<void>> {
    return academyAction('sessions.cancel', async () => {
        const parsed = z.object({ sessionId: uuid, reason }).parse(input)
        const { client } = await requireAcademyContext({ trainer: true })
        const { error } = await client.rpc('academy_cancel_session', { p_session_id: parsed.sessionId, p_reason: parsed.reason })
        assertDatabaseResult(error)
        refresh()
    })
}
export async function registerAcademyRun(runId: string): Promise<ActionResult<{ registrationId: string; status: 'confirmed' | 'waitlisted'; enrollmentId: string | null }>> {
    return academyAction('sessions.register', async () => {
        const id = uuid.parse(runId)
        const { client } = await requireAcademyContext()
        const { data, error } = await client.rpc('academy_register_run', { p_run_id: id })
        assertDatabaseResult(error)
        refresh(id)
        return data
    })
}
export async function cancelAcademyRegistration(runId: string): Promise<ActionResult<void>> {
    return academyAction('sessions.registration_cancel', async () => {
        const id = uuid.parse(runId)
        const { client } = await requireAcademyContext()
        const { error } = await client.rpc('academy_cancel_registration', { p_run_id: id })
        assertDatabaseResult(error)
        refresh(id)
    })
}
export async function listAcademyRunParticipants(runId: string): Promise<ActionResult<AcademyRunParticipantDTO[]>> {
    return academyAction('sessions.participants', async () => {
        const { client } = await requireAcademyContext({ trainer: true })
        const { data, error } = await client.rpc('academy_run_participants', { p_run_id: uuid.parse(runId) })
        assertDatabaseResult(error)
        return (data ?? []) as AcademyRunParticipantDTO[]
    })
}
export async function confirmAcademySessionWindow(input: { sessionId: string; startsAt: string; endsAt: string }): Promise<ActionResult<void>> {
    return academyAction('sessions.actual_window', async () => {
        const parsed = z.object({ sessionId: uuid, startsAt: timestamp, endsAt: timestamp }).parse(input)
        const { client } = await requireAcademyContext({ trainer: true })
        const { error } = await client.rpc('academy_confirm_session_window', { p_session_id: parsed.sessionId, p_starts_at: parsed.startsAt, p_ends_at: parsed.endsAt })
        assertDatabaseResult(error)
        refresh()
    })
}
export async function recordAcademyAttendance(input: { sessionId: string; enrollmentId: string; status: 'present' | 'insufficient'; attendedSeconds: number; note: string }): Promise<ActionResult<{ completed: boolean }>> {
    return academyAction('sessions.attendance_review', async () => {
        const parsed = z.object({ sessionId: uuid, enrollmentId: uuid, status: z.enum(['present', 'insufficient']), attendedSeconds: z.number().int().min(0).max(86400), note: reason }).parse(input)
        const { client } = await requireAcademyContext({ trainer: true })
        const { data, error } = await client.rpc('academy_record_attendance', { p_input: parsed })
        assertDatabaseResult(error)
        refresh()
        return { completed: data?.completed === true }
    })
}
export async function listAcademyOrganizers(): Promise<ActionResult<AcademyOrganizerDTO[]>> {
    return academyAction('sessions.organizers', async () => {
        const { client } = await requireAcademyContext({ trainer: true })
        const { data, error } = await client.rpc('academy_list_organizers')
        assertDatabaseResult(error)
        return (data ?? []) as AcademyOrganizerDTO[]
    })
}
export async function listAcademyOrganizerCandidates(search?: string): Promise<ActionResult<Array<{ id: string; fullName: string | null; email: string }>>> {
    return academyAction('sessions.organizer_candidates', async () => {
        const parsed = z.string().trim().max(100).parse(search ?? '')
        const { client } = await requireAcademyContext({ admin: true })
        const { data, error } = await client.rpc('academy_organizer_candidates', { p_search: parsed })
        assertDatabaseResult(error)
        return data ?? []
    })
}
export async function saveAcademyOrganizer(input: { id?: string; profileId: string; tenantId: string; objectId: string; enabled: boolean }): Promise<ActionResult<string>> {
    return academyAction('sessions.organizer_save', async () => {
        const parsed = z.object({ id: uuid.optional(), profileId: uuid, tenantId: uuid, objectId: uuid, enabled: z.boolean() }).parse(input)
        const { client } = await requireAcademyContext({ admin: true })
        const { data, error } = await client.rpc('academy_save_organizer', { p_input: parsed })
        assertDatabaseResult(error)
        refresh()
        return data as string
    })
}
export async function saveAcademyM365Identity(input: { userId: string; tenantId: string; objectId: string; verifiedEmail?: string; invitationTarget?: boolean }): Promise<ActionResult<void>> {
    return academyAction('sessions.identity_save', async () => {
        const parsed = z.object({ userId: uuid, tenantId: uuid, objectId: uuid, verifiedEmail: z.email().max(254).optional(), invitationTarget: z.boolean().optional() }).parse(input)
        const { client } = await requireAcademyContext({ admin: true })
        const { error } = await client.rpc('academy_save_m365_identity', { p_input: parsed })
        assertDatabaseResult(error)
        refresh()
    })
}
const integrationIssuesPageSchema = z.object({
    after: z.object({ updatedAt: timestamp, id: uuid }).optional(),
    limit: z.number().int().min(1).max(100).default(50),
})
export async function listAcademyIntegrationIssuesPage(options: z.input<typeof integrationIssuesPageSchema> = {}): Promise<ActionResult<AcademyIntegrationIssuesPageDTO>> {
    return academyAction('sessions.integration_issues', async () => {
        const parsed = integrationIssuesPageSchema.parse(options)
        const { client } = await requireAcademyContext({ trainer: true })
        const { data, error } = await client.rpc('academy_integration_issues_page', {
            p_after_updated_at: parsed.after?.updatedAt ?? null,
            p_after_id: parsed.after?.id ?? null,
            p_limit: parsed.limit,
        })
        assertDatabaseResult(error)
        return data as AcademyIntegrationIssuesPageDTO
    })
}
export async function listAcademyM365Identities(search?: string): Promise<ActionResult<AcademyM365IdentityDTO[]>> {
    return academyAction('sessions.identities', async () => {
        const { client } = await requireAcademyContext({ admin: true })
        const { data, error } = await client.rpc('academy_list_m365_identities', { p_search: z.string().trim().max(100).parse(search ?? '') })
        assertDatabaseResult(error)
        return (data ?? []) as AcademyM365IdentityDTO[]
    })
}
const identitiesPageSchema = z.object({
    search: z.string().trim().max(100).default(''),
    page: z.number().int().min(1).max(100_000).default(1),
})
const identityPageResultSchema = z.object({
    page: z.number().int().min(1), pageSize: z.number().int().min(1).max(100),
    total: z.number().int().min(0),
    items: z.array(z.object({
        id: uuid, userId: uuid, fullName: z.string().nullable(), email: z.string(),
        tenantId: uuid, objectId: uuid, verifiedEmail: z.string().nullable(),
        verifiedAt: z.string(), invitationTarget: z.boolean(),
    })),
})
export async function listAcademyM365IdentitiesPage(input: z.input<typeof identitiesPageSchema> = {}): Promise<ActionResult<AcademyM365IdentitiesPageDTO>> {
    return academyAction('sessions.identities_page', async () => {
        const { search, page } = identitiesPageSchema.parse(input)
        const { client } = await requireAcademyContext({ admin: true })
        const { data, error } = await client.rpc('academy_list_m365_identities_page', { p_search: search, p_page: page, p_limit: 25 })
        assertDatabaseResult(error)
        const result = identityPageResultSchema.parse(data)
        if (result.page !== page || result.pageSize !== 25 || result.items.length !== Math.min(25, Math.max(0, result.total - (page - 1) * 25))) {
            throw new Error('Lista powiązań kont Teams jest niepełna.')
        }
        return result
    })
}
export async function removeAcademyM365Identity(input: { identityId: string; note: string }): Promise<ActionResult<void>> {
    return academyAction('sessions.identity_remove', async () => {
        const parsed = z.object({ identityId: uuid, note: reason }).parse(input)
        const { client } = await requireAcademyContext({ admin: true })
        const { error } = await client.rpc('academy_remove_m365_identity', { p_identity_id: parsed.identityId, p_note: parsed.note })
        assertDatabaseResult(error)
        refresh()
    })
}
export async function retryAcademyIntegration(jobId: string): Promise<ActionResult<void>> {
    return academyAction('sessions.integration_retry', async () => {
        const { client } = await requireAcademyContext({ trainer: true })
        const { error } = await client.rpc('academy_retry_integration', { p_job_id: uuid.parse(jobId) })
        assertDatabaseResult(error)
        refresh()
    })
}

export async function reconcileAcademyAttendance(sessionId: string): Promise<ActionResult<void>> {
    return academyAction('sessions.attendance_reconcile', async () => {
        const { client } = await requireAcademyContext({ admin: true })
        const { error } = await client.rpc('academy_reconcile_attendance', { p_session_id: uuid.parse(sessionId) })
        assertDatabaseResult(error)
        refresh()
    })
}
