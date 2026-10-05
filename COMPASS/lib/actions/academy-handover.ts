'use server'

import { z } from 'zod'
import { academyAction, assertDatabaseResult, requireAcademyContext } from '@/lib/academy/server'
import type { AcademyHandover, AcademyHandoverState } from '@/lib/types/academy-handover'
const scope = z.object({ versionId: z.uuid(), runId: z.uuid().optional() })
const link = z.string().max(2048).refine(value => {
    try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash && (url.hostname.endsWith('.sharepoint.com') || ['sharepoint.com','onedrive.live.com','drive.google.com'].includes(url.hostname)) } catch { return false }
}, 'Podaj firmowy link HTTPS bez parametrów i fragmentu.').nullable()
const input = scope.extend({ id: z.uuid().nullable(), items: z.object({ presentation: z.array(z.uuid()).max(100), participant_materials: z.array(z.uuid()).max(100), exercises: z.array(z.uuid()).max(100), modular_video: z.array(z.uuid()).max(100), audio: z.array(z.uuid()).max(100) }), sourceUrl: link, rightsUrl: link, rightsSignedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(), submit: z.boolean() })

export async function getAcademyHandover(value: z.infer<typeof scope>) {
    return academyAction('handover.get', async (): Promise<AcademyHandoverState> => {
        const { versionId, runId } = scope.parse(value)
        const { client, access } = await requireAcademyContext({ trainer: true })
        let query = client.from('academy_handovers').select('*').eq('version_id', versionId)
        query = runId ? query.eq('run_id', runId) : query.is('run_id', null)
        const result = await query.order('created_at', { ascending: false }).limit(1).maybeSingle()
        assertDatabaseResult(result.error)
        const handover = result.data as AcademyHandover | null
        let files = client.from('academy_material_catalog').select('id,filename,mime_type,uploaded_by').eq('status', 'ready').is('purged_at', null)
        if (runId) files = files.eq('run_id', runId)
        else {
            const lessons = await client.from('course_lessons').select('attachments').eq('version_id', versionId)
            assertDatabaseResult(lessons.error)
            const ids = (lessons.data ?? []).flatMap(row => (row.attachments as { asset_id?: string }[]).flatMap(item => item.asset_id ? [item.asset_id] : []))
            if (!ids.length) {
                const review = await client.rpc('academy_can_review_version', { p_version_id: versionId })
                assertDatabaseResult(review.error)
                return { handover, files: [], canReview: access.isAdmin && review.data === true && !handover?.contributors.includes(access.userId) }
            }
            files = files.in('id', ids).is('run_id', null)
        }
        const assets = await files.order('created_at').limit(100)
        assertDatabaseResult(assets.error)
        const review = await client.rpc('academy_can_review_version', { p_version_id: versionId })
        assertDatabaseResult(review.error)
        const selected = new Set(Object.values(handover?.material_ids ?? {}).flat())
        return { handover, files: (assets.data ?? []).map(({ uploaded_by: _uploader, ...file }) => file), canReview: access.isAdmin && review.data === true && !handover?.contributors.includes(access.userId) && !(assets.data ?? []).some(file => selected.has(file.id) && file.uploaded_by === access.userId) }
    })
}
export async function saveAcademyHandover(value: z.infer<typeof input>) {
    return academyAction('handover.save', async () => {
        const parsed = input.parse(value)
        const { client } = await requireAcademyContext({ trainer: true })
        const { data, error } = await client.rpc('academy_save_handover', { p_version_id: parsed.versionId, p_run_id: parsed.runId ?? null, p_id: parsed.id, p_items: parsed.items, p_source_url: parsed.sourceUrl, p_rights_url: parsed.rightsUrl, p_rights_signed_on: parsed.rightsSignedOn, p_submit: parsed.submit })
        assertDatabaseResult(error)
        return data as AcademyHandover
    })
}
export async function reviewAcademyHandover(value: { id: string; accept: boolean; note?: string }) {
    return academyAction('handover.review', async () => {
        const parsed = z.object({ id: z.uuid(), accept: z.boolean(), note: z.string().trim().max(2000).optional() }).parse(value)
        const { client } = await requireAcademyContext({ admin: true })
        const { error } = await client.rpc('academy_review_handover', { p_id: parsed.id, p_accept: parsed.accept, p_note: parsed.note ?? null })
        assertDatabaseResult(error)
    })
}
