'use server'

import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { academyAction, assertDatabaseResult, requireAcademyContext } from '@/lib/academy/server'
import { isMissingDatabaseObject, MIGRATION_PENDING_PL } from '@/lib/academy/migration-contract'
import { holdAcademyMail } from '@/lib/academy/outbound'
import { audienceClients, invitationExpiry, runInvitationMail, selectAudience, type AudienceCandidate } from '@/lib/academy/run-audience'
import { activeRoster } from '@/lib/hr/employment-window'
import { warsawDate } from '@/lib/oof/oof-dates'
import { createServiceClient } from '@/lib/supabase/admin'
import { requireRows } from '@/lib/supabase/select-in-chunks'
import type { AcademyRunDTO } from '@/lib/types/academy-sessions'

const INVITATION_KIND = 'academy.run_invitation'
const MAX_RECIPIENTS = 1000
// Rola `consultant` jest w migawce NEXUS, więc lista biura jej nie obejmuje.
const OFFICE_ROLES = ['admin', 'internal', 'manager', 'finanse', 'talent_community'] as const

const filterSchema = z.object({ includeNexus: z.boolean(), includeOffice: z.boolean(), clients: z.array(z.string().max(200)).max(100) })
const excludedSchema = z.array(z.email().max(254)).max(500)

export interface AudiencePreview { count: number; excludedCount: number; sample: Array<{ fullName: string; email: string }>; clients: string[] }
export interface AudienceChoice { count: number; filter: z.infer<typeof filterSchema>; excluded: string[]; chosenBy: string | null; chosenAt: string }
export interface AudienceState { available: boolean; choice: AudienceChoice | null; held: number; clients: string[] }

async function loadCandidates(): Promise<AudienceCandidate[]> {
    const admin = createServiceClient()
    const today = warsawDate(new Date())
    const [contracts, staff] = await Promise.all([
        admin.from('nexus_contract_snapshot').select('email,name,lastname,client_name,end_date').not('email', 'is', null).limit(5000),
        admin.from('profiles').select('email,full_name,role,employment_status').in('role', OFFICE_ROLES).limit(2000),
    ])
    const nexus = requireRows('migawki NEXUS', contracts as never as { data: Array<{ email: string; name: string | null; lastname: string | null; client_name: string | null; end_date: string | null }> | null; error: { message: string } | null })
    const office = requireRows('profili biura', staff as never as { data: Array<{ email: string | null; full_name: string | null; employment_status: string | null }> | null; error: { message: string } | null })
    return [
        ...nexus.filter(row => !row.end_date || row.end_date >= today).map(row => ({ email: row.email, fullName: [row.name, row.lastname].filter(Boolean).join(' ') || row.email, source: 'nexus' as const, clientName: row.client_name })),
        ...activeRoster(office as never[] as Array<{ email: string | null; full_name: string | null; employment_status: 'active' }>).flatMap(row => row.email ? [{ email: row.email, fullName: row.full_name || row.email, source: 'office' as const, clientName: null }] : []),
    ]
}

async function loadOpenRun(client: Awaited<ReturnType<typeof requireAcademyContext>>['client'], runId: string) {
    const { data, error } = await client.rpc('academy_list_runs', { p_course_id: null, p_run_id: runId })
    assertDatabaseResult(error)
    const run = (data as AcademyRunDTO[] | null)?.[0]
    if (!run?.canManage) throw new Error('Nie masz dostępu do tej edycji.')
    if (run.status !== 'published') throw new Error('Adresatów wybiera się dla opublikowanej edycji.')
    const first = run.sessions.filter(session => session.status === 'scheduled').sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))[0]
    const expiresAt = first ? invitationExpiry(first.startsAt, new Date()) : null
    if (!first || !expiresAt) throw new Error('Zaproszenia można przygotować przed pierwszym spotkaniem edycji.')
    return { run, first, expiresAt }
}

export async function getAcademyRunAudienceState(runId: string) {
    return academyAction<AudienceState>('audience.state', async () => {
        const id = z.uuid().parse(runId)
        const { client } = await requireAcademyContext({ editor: true })
        const { data, error } = await client.from('academy_run_audience').select('filter,recipient_count,excluded_emails,chosen_by,chosen_at').eq('run_id', id).order('chosen_at', { ascending: false }).limit(1).maybeSingle()
        if (isMissingDatabaseObject(error)) return { available: false, choice: null, held: 0, clients: [] }
        assertDatabaseResult(error)
        const [held, candidates] = await Promise.all([
            client.from('academy_outbox').select('id', { count: 'exact', head: true }).eq('run_id', id).eq('kind', INVITATION_KIND).eq('status', 'held'),
            // Only feeds the client dropdown; a failed read must not hide the panel.
            loadCandidates().catch(() => [] as AudienceCandidate[]),
        ])
        let chosenBy: string | null = null
        if (data?.chosen_by) {
            const { data: person } = await client.from('profiles').select('full_name,email').eq('id', data.chosen_by).maybeSingle()
            chosenBy = person?.full_name || person?.email || null
        }
        return {
            available: true, held: held.count ?? 0, clients: audienceClients(candidates),
            choice: data ? { count: data.recipient_count, filter: data.filter, excluded: data.excluded_emails, chosenBy, chosenAt: data.chosen_at } : null,
        }
    })
}

export async function previewAcademyRunAudience(input: { runId: string; filter: z.input<typeof filterSchema>; excluded: string[] }) {
    return academyAction<AudiencePreview>('audience.preview', async () => {
        const parsed = z.object({ runId: z.uuid(), filter: filterSchema, excluded: excludedSchema }).parse(input)
        await requireAcademyContext({ editor: true })
        const candidates = await loadCandidates()
        const { recipients, excludedCount } = selectAudience(candidates, parsed.filter, parsed.excluded)
        return { count: recipients.length, excludedCount, sample: recipients.slice(0, 10).map(item => ({ fullName: item.fullName, email: item.email })), clients: audienceClients(candidates) }
    })
}

/** Records who chose whom and creates held rows only. Nothing here can send. */
export async function saveAcademyRunAudience(input: { runId: string; filter: z.input<typeof filterSchema>; excluded: string[] }) {
    return academyAction<{ count: number; held: number; duplicates: number; withdrawn: number }>('audience.save', async () => {
        const parsed = z.object({ runId: z.uuid(), filter: filterSchema, excluded: excludedSchema }).parse(input)
        const { client } = await requireAcademyContext({ editor: true })
        const { run, first, expiresAt } = await loadOpenRun(client, parsed.runId)
        const { recipients, excludedCount } = selectAudience(await loadCandidates(), parsed.filter, parsed.excluded)
        if (recipients.length === 0) throw new Error('Te filtry nie wskazują żadnej osoby.')
        if (recipients.length > MAX_RECIPIENTS) throw new Error(`Jedna edycja obsługuje do ${MAX_RECIPIENTS} adresatów. Zawęź filtry.`)
        const { error } = await client.rpc('academy_record_run_audience', { p_run_id: run.id, p_filter: { ...parsed.filter, excludedCount }, p_count: recipients.length, p_excluded: parsed.excluded })
        if (isMissingDatabaseObject(error)) throw new Error(MIGRATION_PENDING_PL)
        assertDatabaseResult(error)

        // academy_outbox is newer than the generated database types.
        const admin = createServiceClient() as unknown as SupabaseClient
        const startsLabel = new Intl.DateTimeFormat('pl-PL', { dateStyle: 'long', timeStyle: 'short', timeZone: first.timeZone }).format(new Date(first.startsAt))
        const mail = runInvitationMail({ courseTitle: run.courseTitle, runTitle: run.title, startsLabel })
        const batchId = randomUUID()
        let held = 0, duplicates = 0
        for (const person of recipients) {
            const outcome = await holdAcademyMail(admin, { kind: INVITATION_KIND, recipient: person.email, ...mail, expiresAt, batchId, runId: run.id, dedupeKey: `run_invitation:${run.id}:${person.email}` })
            if (outcome.status === 'held') held++
            else if (outcome.status === 'duplicate') duplicates++
            else if (outcome.reason === 'migration_pending') throw new Error(MIGRATION_PENDING_PL)
            else throw new Error('Nie udało się zapisać kolejki zaproszeń. Nic nie zostało wysłane.')
        }

        // Someone removed from the audience must not stay queued for a later approval.
        const keep = new Set(recipients.map(person => person.email))
        const queued = await admin.from('academy_outbox').select('id,recipient').eq('run_id', run.id).eq('kind', INVITATION_KIND).eq('status', 'held').limit(5000)
        const stale = requireRows('kolejki zaproszeń', queued as never as { data: Array<{ id: string; recipient: string }> | null; error: { message: string } | null }).filter(row => !keep.has(row.recipient)).map(row => row.id)
        for (let start = 0; start < stale.length; start += 60) {
            const { error: expireError } = await admin.from('academy_outbox').update({ status: 'expired' }).in('id', stale.slice(start, start + 60))
            if (expireError) throw new Error('Nie udało się wycofać zaproszeń osób spoza wyboru. Nic nie zostało wysłane.')
        }
        revalidatePath(`/learning/edycje/${run.id}`)
        return { count: recipients.length, held, duplicates, withdrawn: stale.length }
    })
}
