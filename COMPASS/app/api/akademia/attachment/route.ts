import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuth } from '@/lib/api/with-auth'
import { academyClient } from '@/lib/academy/server'
import type { CourseAttachment } from '@/lib/types/learning'

export const dynamic = 'force-dynamic'

/** Authorize the actual lesson reference before issuing a short-lived Storage URL. */
export const GET = withAuth(async request => {
    const lessonId = request.nextUrl.searchParams.get('lessonId')
    const runId = request.nextUrl.searchParams.get('runId')
    const assetId = request.nextUrl.searchParams.get('assetId')
    const path = request.nextUrl.searchParams.get('path')
    if (Boolean(lessonId) === Boolean(runId) || !z.uuid().safeParse(lessonId || runId).success
        || (assetId && !z.uuid().safeParse(assetId).success) || (!assetId && (!path || runId))) {
        return NextResponse.json({ error: 'Nieprawidłowy materiał.' }, { status: 400 })
    }
    const client = academyClient()
    let attachment: CourseAttachment | undefined
    if (runId) {
        // RLS requires the exact confirmed run and an approved material; staff can preview.
        const { data: asset, error } = await client.from('course_materials')
            .select('id,filename,storage_path,status,mime_type,size_bytes').eq('id', assetId!).eq('run_id', runId).maybeSingle()
        if (error || !asset || asset.status !== 'ready') return new Response('Materiał jest niedostępny.', { status: 404 })
        attachment = { asset_id: asset.id, name: asset.filename, storage_path: asset.storage_path, mime_type: asset.mime_type, size_bytes: asset.size_bytes }
    } else {
        // RLS includes enrollment/version membership, active registration and drip release.
        const { data: lesson, error } = await client.from('course_lessons').select('attachments').eq('id', lessonId!).maybeSingle()
        if (error || !lesson || !Array.isArray(lesson.attachments)) return new Response('Materiał jest niedostępny.', { status: 404 })
        attachment = (lesson.attachments as CourseAttachment[]).find(item => assetId ? item.asset_id === assetId : !item.asset_id && item.storage_path === path)
    }
    if (!attachment) return new Response('Materiał jest niedostępny.', { status: 404 })
    let bucket = 'documents'
    if (attachment.asset_id) {
        const { data: asset } = await client.from('course_materials').select('storage_path,status').eq('id', attachment.asset_id).maybeSingle()
        if (!asset || asset.status !== 'ready' || asset.storage_path !== attachment.storage_path) return new Response('Materiał oczekuje na weryfikację.', { status: 404 })
        bucket = 'academy-materials'
    } else if (!attachment.storage_path.startsWith('courses/')) {
        return new Response('Materiał jest niedostępny.', { status: 404 })
    }
    const { data: signed, error: storageError } = await client.storage.from(bucket).createSignedUrl(attachment.storage_path, 300)
    if (storageError || !signed) return new Response('Nie udało się pobrać materiału.', { status: 503 })
    const headers = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' }
    if (request.nextUrl.searchParams.get('format') === 'json') return NextResponse.json({ url: signed.signedUrl, expiresIn: 300 }, { headers })
    return new Response(null, { status: 303, headers: { ...headers, Location: signed.signedUrl } })
}, { role: ['consultant', 'admin'] })
