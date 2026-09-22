'use server'

import { z } from 'zod'
import { academyAction, assertDatabaseResult, requireAcademyContext } from '@/lib/academy/server'
import { materialRejectionMessage } from '@/lib/academy/material-errors'

const inputSchema = z.object({
    courseId: z.uuid(), lessonId: z.uuid().optional(), runId: z.uuid().optional(), filename: z.string().trim().min(1).max(180).regex(/^[^/\\\r\n]+$/),
    mimeType: z.enum(['application/pdf', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'video/mp4', 'text/vtt']),
    sizeBytes: z.number().int().positive().max(1024 ** 3), fileModifiedAt: z.number().int().nonnegative(),
}).refine(value => Boolean(value.lessonId) !== Boolean(value.runId), 'Wybierz lekcję albo edycję.')

export async function prepareAcademyUpload(input: z.infer<typeof inputSchema>) {
    return academyAction('material.prepare', async () => {
        const parsed = inputSchema.parse(input)
        const { client, access } = await requireAcademyContext({ trainer: true })
        const request = parsed.runId ? client.rpc('academy_reserve_run_material', {
            p_run_id: parsed.runId, p_filename: parsed.filename, p_mime_type: parsed.mimeType,
            p_size_bytes: parsed.sizeBytes, p_file_modified_at: parsed.fileModifiedAt,
        }) : client.rpc('academy_reserve_material', {
            p_course_id: parsed.courseId, p_filename: parsed.filename, p_mime_type: parsed.mimeType,
            p_size_bytes: parsed.sizeBytes, p_file_modified_at: parsed.fileModifiedAt,
            p_lesson_id: parsed.lessonId,
        })
        const { data: asset, error } = await request
        assertDatabaseResult(error)
        if (!asset) throw new Error('Nie udało się przygotować uploadu.')
        let token: string | null = null
        if (asset.status === 'uploading') {
            const result = await client.storage.from('academy-materials').createSignedUploadUrl(asset.storage_path, { upsert: false })
            assertDatabaseResult(result.error)
            token = result.data?.token ?? null
            if (!token) throw new Error('Nie udało się autoryzować uploadu.')
        }
        const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!)
        if (url.hostname.endsWith('.supabase.co')) url.hostname = url.hostname.replace('.supabase.co', '.storage.supabase.co')
        return { assetId: asset.id as string, userId: access.userId, storagePath: asset.storage_path as string,
            status: asset.status as string, token, endpoint: `${url.origin}/storage/v1/upload/resumable/sign` }
    })
}

export async function finishAcademyUpload(assetId: string) {
    return academyAction('material.finish', async () => {
        const { client } = await requireAcademyContext({ trainer: true })
        const { error } = await client.rpc('academy_finish_material_upload', { p_asset_id: z.uuid().parse(assetId) })
        assertDatabaseResult(error)
    })
}

export async function getAcademyMaterialStatus(assetId: string) {
    return academyAction('material.status', async () => {
        const { client } = await requireAcademyContext({ trainer: true })
        const { data, error } = await client.from('course_materials').select('id,filename,storage_path,size_bytes,mime_type,status,scan_error').eq('id', z.uuid().parse(assetId)).single()
        assertDatabaseResult(error)
        if (!data) throw new Error('Materiał jest niedostępny.')
        return { asset_id: data.id as string, name: data.filename as string, storage_path: data.storage_path as string,
            size_bytes: Number(data.size_bytes), mime_type: data.mime_type as string, status: data.status as string,
            error: data.status === 'rejected' ? materialRejectionMessage(data.scan_error) : null }
    })
}

export async function listAcademyLessonUploads(lessonId: string) {
    return academyAction('material.lesson_uploads', async () => {
        const { client } = await requireAcademyContext({ trainer: true })
        const { data, error } = await client.from('course_materials').select('id,filename,status,scan_error')
            .eq('lesson_id', z.uuid().parse(lessonId)).is('purged_at', null).or('scan_error.is.null,scan_error.neq.discarded_by_author').order('created_at')
        assertDatabaseResult(error)
        return (data ?? []).map(item => ({ id: item.id as string, filename: item.filename as string, status: item.status as string,
            error: item.status === 'rejected' ? materialRejectionMessage(item.scan_error) : null }))
    })
}

export async function listAcademyRunMaterials(runId: string) {
    return academyAction('material.run_materials', async () => {
        const { client } = await requireAcademyContext()
        const { data, error } = await client.from('course_materials')
            .select('id,filename,storage_path,mime_type,size_bytes,status,review_status,review_note,uploaded_by,scan_error')
            .eq('run_id', z.uuid().parse(runId)).is('purged_at', null).or('scan_error.is.null,scan_error.neq.discarded_by_author')
            .order('created_at')
        assertDatabaseResult(error)
        return (data ?? []).map(({ scan_error, ...item }) => ({ ...item,
            error: item.status === 'rejected' ? materialRejectionMessage(scan_error) : null,
        })) as (import('@/lib/types/academy-materials').AcademyRunMaterial & { error: string | null })[]
    })
}

export async function reviewAcademyRunMaterial(input: { assetId: string; decision: 'approve' | 'reject' | 'withdraw'; note?: string }) {
    return academyAction('material.review', async () => {
        const parsed = z.object({ assetId: z.uuid(), decision: z.enum(['approve', 'reject', 'withdraw']), note: z.string().trim().max(2000).optional() }).parse(input)
        const { client } = await requireAcademyContext({ admin: true })
        const { error } = await client.rpc('academy_review_run_material', {
            p_asset_id: parsed.assetId, p_decision: parsed.decision, p_note: parsed.note ?? null,
        })
        assertDatabaseResult(error)
    })
}

export async function listAcademyRunMaterialReviews() {
    return academyAction('material.review_queue', async () => {
        const { client } = await requireAcademyContext({ admin: true })
        const { data, error } = await client.from('course_materials')
            .select('id,filename,run_id,created_at').not('run_id', 'is', null)
            .eq('status', 'ready').eq('review_status', 'pending_review').order('created_at').limit(100)
        assertDatabaseResult(error)
        return (data ?? []) as { id: string; filename: string; run_id: string; created_at: string }[]
    })
}

export async function discardAcademyUpload(assetId: string) {
    return academyAction('material.discard', async () => {
        const { client } = await requireAcademyContext({ trainer: true })
        const { error } = await client.rpc('academy_discard_material', { p_asset_id: z.uuid().parse(assetId) })
        assertDatabaseResult(error)
    })
}

export async function getAcademyMaterialQueue(input: { page?: number; filter?: 'pending' | 'failed' | 'rejected' | 'all' } = {}) {
    return academyAction('material.queue', async () => {
        const { page, filter } = z.object({ page: z.number().int().min(1).max(100000).default(1), filter: z.enum(['pending', 'failed', 'rejected', 'all']).default('pending') }).parse(input)
        const pageSize = 25
        const { client } = await requireAcademyContext({ admin: true })
        let query = client.from('course_materials')
            .select('id,filename,status,scan_attempts,scan_started_at,scan_next_attempt_at,created_at,course_id,run_id', { count: 'exact' })
            .neq('status', 'ready').is('purged_at', null).is('cleanup_token', null).or('scan_error.is.null,scan_error.neq.discarded_by_author')
        if (filter === 'pending') query = query.in('status', ['uploading', 'quarantined', 'scanning'])
        if (filter === 'failed') query = query.in('status', ['quarantined', 'scanning']).gte('scan_attempts', 5)
        if (filter === 'rejected') query = query.eq('status', 'rejected')
        const { data, error, count } = await query.order('created_at').order('id').range((page - 1) * pageSize, page * pageSize - 1)
        assertDatabaseResult(error)
        return {
            page, pageSize, filter, total: count ?? 0,
            scannerConfigured: !!process.env.ACADEMY_CLAMAV_HOST,
            items: (data ?? []).map(item => ({
                id: item.id as string, filename: item.filename as string, status: item.status as string,
                attempts: Number(item.scan_attempts), createdAt: item.created_at as string,
                nextAttemptAt: item.scan_next_attempt_at as string, courseId: item.course_id as string, runId: item.run_id as string | null,
                canRetry: Number(item.scan_attempts) >= 5 && (item.status === 'quarantined' || (item.status === 'scanning' && Date.parse(item.scan_started_at) < Date.now() - 15 * 60_000)),
            })),
        }
    })
}

export async function retryAcademyMaterialScan(assetId: string) {
    return academyAction('material.admin_retry', async () => {
        const { client } = await requireAcademyContext({ admin: true })
        const { error } = await client.rpc('academy_admin_retry_material', { p_asset_id: z.uuid().parse(assetId) })
        assertDatabaseResult(error)
    })
}

export async function getAcademyMaterialCleanupQueue(input: { page?: number; filter?: 'all' | 'failed' } = {}) {
    return academyAction('material.cleanup_queue', async () => {
        const { page, filter } = z.object({ page: z.number().int().min(1).max(100000).default(1), filter: z.enum(['all', 'failed']).default('all') }).parse(input)
        const pageSize = 25
        const { client } = await requireAcademyContext({ admin: true })
        const { academyMaterialRetentionPolicy } = await import('@/lib/academy/material-cleanup')
        const policy = academyMaterialRetentionPolicy()
        let query = client.from('course_materials')
            .select('id,filename,cleanup_attempts,cleanup_claimed_at,cleanup_error', { count: 'exact' })
            .is('purged_at', null).not('cleanup_token', 'is', null)
        if (filter === 'failed') query = query.gte('cleanup_attempts', 5)
        const { data, error, count } = await query.order('cleanup_claimed_at').order('id').range((page - 1) * pageSize, page * pageSize - 1)
        assertDatabaseResult(error)
        return {
            page, pageSize, filter, total: count ?? 0,
            mode: policy.execute ? 'execute' : 'report',
            uploadHours: policy.uploadHours, rejectedDays: policy.rejectedDays,
            items: (data ?? []).map(row => ({
                id: row.id as string, filename: row.filename as string, attempts: Number(row.cleanup_attempts),
                failed: !!row.cleanup_error,
                canRetry: Number(row.cleanup_attempts) >= 5 && Date.parse(row.cleanup_claimed_at) < Date.now() - 15 * 60_000,
            })),
        }
    })
}

export async function retryAcademyMaterialCleanup(assetId: string) {
    return academyAction('material.cleanup_retry', async () => {
        const { client } = await requireAcademyContext({ admin: true })
        const { error } = await client.rpc('academy_retry_material_cleanup', { p_asset_id: z.uuid().parse(assetId) })
        assertDatabaseResult(error)
    })
}
