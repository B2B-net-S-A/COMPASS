'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { academyAction, assertDatabaseResult, requireAcademyContext } from '@/lib/academy/server'
import { isMissingDatabaseObject, MIGRATION_PENDING_PL } from '@/lib/academy/migration-contract'
import { parseWebinarReport, webinarMailMergeCsv } from '@/lib/academy/webinar-import'
import type { WebinarExcludedEmail, WebinarImportKind, WebinarImportPreview, WebinarRosterRow, WebinarStoredException } from '@/lib/academy/webinar-import'

export async function previewAcademyWebinarImport(input: { runId: string; kind: WebinarImportKind; text: string; sourceHash: string; sessionId?: string; dateOrder: 'dmy' | 'mdy' }) {
    return academyAction('webinar.preview', async () => {
        const parsed = z.object({ runId: z.uuid(), kind: z.enum(['registrations', 'attendance']), text: z.string().max(2_000_000), sourceHash: z.string().regex(/^[a-f0-9]{64}$/), sessionId: z.uuid().optional(), dateOrder: z.enum(['dmy', 'mdy']) }).parse(input)
        const { client } = await requireAcademyContext({ editor: true })
        const { rows, exceptions } = parseWebinarReport(parsed.text, parsed.kind, parsed.dateOrder)
        const session = parsed.kind === 'attendance' ? parsed.sessionId ?? null : null
        const { data, error } = await client.rpc('academy_preview_webinar_import_v2', { p_run_id: parsed.runId, p_kind: parsed.kind, p_rows: rows, p_exceptions: exceptions, p_source_hash: parsed.sourceHash, p_session_id: session })
        if (!isMissingDatabaseObject(error)) {
            assertDatabaseResult(error)
            return data as WebinarImportPreview
        }
        // Before the migration the file stays all-or-nothing, exactly as it was.
        if (exceptions.length) throw new Error(exceptions[0].message)
        const legacy = await client.rpc('academy_preview_webinar_import', { p_run_id: parsed.runId, p_kind: parsed.kind, p_rows: rows, p_source_hash: parsed.sourceHash, p_session_id: session })
        assertDatabaseResult(legacy.error)
        return { ...(legacy.data as WebinarImportPreview), exceptions: [], excludedCount: 0, exceptionsAvailable: false }
    })
}
export async function commitAcademyWebinarImport(batchId: string, resolutions: Record<string, string | null>) {
    return academyAction('webinar.commit', async () => {
        const parsed = z.object({ batchId: z.uuid(), resolutions: z.record(z.string().max(254), z.uuid().nullable()).refine(value => Object.keys(value).length <= 500) }).parse({ batchId, resolutions })
        const { client } = await requireAcademyContext({ editor: true })
        let { data, error } = await client.rpc('academy_commit_webinar_import_v2', { p_batch_id: parsed.batchId, p_resolutions: parsed.resolutions })
        if (isMissingDatabaseObject(error)) ({ data, error } = await client.rpc('academy_commit_webinar_import', { p_batch_id: parsed.batchId, p_resolutions: parsed.resolutions }))
        assertDatabaseResult(error)
        revalidatePath('/learning', 'layout')
        revalidatePath('/admin/learning', 'layout')
        return data as { created: number; linked: number; attendance: number; preserved: number; alreadyCommitted: boolean; exceptions?: number }
    })
}
export async function listAcademyWebinarExceptions(runId: string) {
    return academyAction('webinar.exceptions', async () => {
        const { client } = await requireAcademyContext({ editor: true })
        const { data, error } = await client.rpc('academy_list_webinar_exceptions', { p_run_id: z.uuid().parse(runId) })
        if (isMissingDatabaseObject(error)) return { available: false, items: [] as WebinarStoredException[] }
        assertDatabaseResult(error)
        return { available: true, items: data as WebinarStoredException[] }
    })
}
export async function resolveAcademyWebinarException(input: { exceptionId: string; decision: 'ignore' | 'assign'; rosterId?: string; registrationId?: string; note: string }) {
    return academyAction('webinar.exception_resolve', async () => {
        const parsed = z.object({ exceptionId: z.uuid(), decision: z.enum(['ignore', 'assign']), rosterId: z.uuid().optional(), registrationId: z.uuid().optional(), note: z.string().trim().min(10, 'Uzasadnienie musi mieć co najmniej 10 znaków.').max(2000) }).parse(input)
        const { client } = await requireAcademyContext({ editor: true })
        const { data, error } = await client.rpc('academy_resolve_webinar_exception', { p_exception_id: parsed.exceptionId, p_decision: parsed.decision, p_roster_id: parsed.rosterId ?? null, p_registration_id: parsed.registrationId ?? null, p_note: parsed.note })
        if (isMissingDatabaseObject(error)) throw new Error(MIGRATION_PENDING_PL)
        assertDatabaseResult(error)
        revalidatePath('/learning', 'layout')
        return data as { status: 'ignored' | 'assigned'; attendedSeconds: number | null }
    })
}
export async function listAcademyWebinarExcluded(runId: string) {
    return academyAction('webinar.excluded', async () => {
        const { client } = await requireAcademyContext({ editor: true })
        const { data, error } = await client.rpc('academy_list_webinar_excluded', { p_run_id: z.uuid().parse(runId) })
        if (isMissingDatabaseObject(error)) return { available: false, items: [] as WebinarExcludedEmail[] }
        assertDatabaseResult(error)
        return { available: true, items: data as WebinarExcludedEmail[] }
    })
}
export async function setAcademyWebinarExcluded(input: { runId: string; email: string; excluded: boolean }) {
    return academyAction('webinar.excluded_set', async () => {
        const parsed = z.object({ runId: z.uuid(), email: z.email().max(254), excluded: z.boolean() }).parse(input)
        const { client } = await requireAcademyContext({ editor: true })
        const { error } = await client.rpc('academy_set_webinar_excluded', { p_run_id: parsed.runId, p_email: parsed.email, p_excluded: parsed.excluded, p_note: null })
        if (isMissingDatabaseObject(error)) throw new Error(MIGRATION_PENDING_PL)
        assertDatabaseResult(error)
    })
}
export async function listAcademyWebinarRoster(runId: string) {
    return academyAction('webinar.roster', async () => {
        const { client } = await requireAcademyContext({ editor: true })
        const { data, error } = await client.rpc('academy_webinar_roster', { p_run_id: z.uuid().parse(runId) })
        assertDatabaseResult(error)
        return data as WebinarRosterRow[]
    })
}
export async function verifyAcademyWebinarContractEmail(input: { rosterId: string; email: string; note: string }) {
    return academyAction('webinar.contract_email', async () => {
        const parsed = z.object({ rosterId: z.uuid(), email: z.email().max(254), note: z.string().trim().min(10).max(2000) }).parse(input)
        const { client } = await requireAcademyContext({ editor: true })
        const { error } = await client.rpc('academy_verify_webinar_contractual_email', { p_roster_id: parsed.rosterId, p_email: parsed.email, p_note: parsed.note })
        assertDatabaseResult(error)
        revalidatePath('/learning', 'layout')
    })
}
export async function exportAcademyWebinarMailingList(runId: string) {
    return academyAction('webinar.mail_merge_export', async () => {
        const { client } = await requireAcademyContext({ editor: true })
        const { data, error } = await client.rpc('academy_export_webinar_mailing_list', { p_run_id: z.uuid().parse(runId) })
        assertDatabaseResult(error)
        const result = data as { rows: Array<{ email: string; fullName: string; courseTitle: string; runTitle: string }>; excludedMissingEmail: number }
        return { csv: webinarMailMergeCsv(result.rows), count: result.rows.length, excludedMissingEmail: result.excludedMissingEmail }
    })
}

export async function cancelAcademyWebinarRegistration(rosterId: string, note: string) {
    return academyAction('webinar.cancel', async () => {
        const input = z.object({ rosterId: z.uuid(), note: z.string().trim().min(10).max(2000) }).parse({ rosterId, note })
        const { client } = await requireAcademyContext({ editor: true })
        const { error } = await client.rpc('academy_cancel_webinar_registration', { p_roster_id: input.rosterId, p_note: input.note })
        assertDatabaseResult(error)
        revalidatePath('/learning', 'layout')
        revalidatePath('/admin/learning', 'layout')
    })
}
