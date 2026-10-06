'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { academyAction, assertDatabaseResult, requireAcademyContext } from '@/lib/academy/server'
import { parseWebinarCsv, webinarMailMergeCsv } from '@/lib/academy/webinar-import'
import type { WebinarImportKind, WebinarImportPreview, WebinarRosterRow } from '@/lib/academy/webinar-import'

export async function previewAcademyWebinarImport(input: { runId: string; kind: WebinarImportKind; text: string; sourceHash: string; sessionId?: string; dateOrder: 'dmy' | 'mdy' }) {
    return academyAction('webinar.preview', async () => {
        const parsed = z.object({ runId: z.uuid(), kind: z.enum(['registrations', 'attendance']), text: z.string().max(2_000_000), sourceHash: z.string().regex(/^[a-f0-9]{64}$/), sessionId: z.uuid().optional(), dateOrder: z.enum(['dmy', 'mdy']) }).parse(input)
        const { client } = await requireAcademyContext({ editor: true })
        const rows = parseWebinarCsv(parsed.text, parsed.kind, parsed.dateOrder)
        const { data, error } = await client.rpc('academy_preview_webinar_import', { p_run_id: parsed.runId, p_kind: parsed.kind, p_rows: rows, p_source_hash: parsed.sourceHash, p_session_id: parsed.kind === 'attendance' ? parsed.sessionId ?? null : null })
        assertDatabaseResult(error)
        return data as WebinarImportPreview
    })
}
export async function commitAcademyWebinarImport(batchId: string, resolutions: Record<string, string | null>) {
    return academyAction('webinar.commit', async () => {
        const parsed = z.object({ batchId: z.uuid(), resolutions: z.record(z.string().max(254), z.uuid().nullable()).refine(value => Object.keys(value).length <= 500) }).parse({ batchId, resolutions })
        const { client } = await requireAcademyContext({ editor: true })
        const { data, error } = await client.rpc('academy_commit_webinar_import', { p_batch_id: parsed.batchId, p_resolutions: parsed.resolutions })
        assertDatabaseResult(error)
        revalidatePath('/learning', 'layout')
        revalidatePath('/admin/learning', 'layout')
        return data as { created: number; linked: number; attendance: number; preserved: number; alreadyCommitted: boolean }
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
