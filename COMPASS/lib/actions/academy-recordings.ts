'use server'

import { z } from 'zod'
import { academyAction, assertDatabaseResult, requireAcademyContext } from '@/lib/academy/server'
import { isMissingDatabaseObject } from '@/lib/academy/migration-contract'
import { selectInChunks } from '@/lib/supabase/select-in-chunks'
import { RECORDING_MIME, splitRunMaterials, type CatalogRow, type LibraryFile, type LibraryRecording } from '@/lib/academy/recording-library'
import type { ActionResult } from '@/lib/types/learning'

type Client = Awaited<ReturnType<typeof requireAcademyContext>>['client']

export interface LibraryRecordings {
    /** False, gdy katalog materiałów nie istnieje; biblioteka pokazuje wtedy same kursy. */
    available: boolean
    items: LibraryRecording[]
}

export interface CourseRecordings {
    items: LibraryRecording[]
    files: LibraryFile[]
}

export interface RecordingProgressResult {
    /** False do zastosowania migracji kroku 2: nagranie gra, ale nie pamięta pozycji. */
    available: boolean
    accepted: boolean
    watchedPercent: number
}

const LIBRARY_LIMIT = 200

interface CourseRow { id: string; title: string; slug: string; topic?: string | null; category?: string | null; status: string }

/** Kolumna `topic` przychodzi z migracji B4.7, więc `*` zamiast listy, która by padła przed nią. */
async function coursesById(client: Client, ids: string[]): Promise<Map<string, CourseRow>> {
    const rows = await selectInChunks<CourseRow>({ source: 'academy.recordings.courses', column: 'id', ids, query: () => client.from('courses').select('*') })
    return new Map(rows.filter(row => row.status === 'published').map(row => [row.id, row]))
}

async function enrich(client: Client, userId: string, videos: CatalogRow[], captions: Map<string, string>): Promise<LibraryRecording[]> {
    if (!videos.length) return []
    const assetIds = videos.map(row => row.id)
    const [courses, durations, progress] = await Promise.all([
        coursesById(client, Array.from(new Set(videos.map(row => row.course_id)))),
        client.rpc('academy_recording_durations', { p_asset_ids: assetIds }),
        client.from('academy_video_progress').select('asset_id,position_seconds,duration_seconds,updated_at').eq('user_id', userId).in('asset_id', assetIds),
    ])
    // Czas trwania i pozycja to dekoracja: brak migracji albo błąd nie zabiera listy nagrań.
    const duration = new Map<string, number>()
    if (!durations.error) for (const item of (durations.data ?? []) as Array<{ asset_id: string; duration_seconds: number }>) duration.set(item.asset_id, Number(item.duration_seconds))
    const own = new Map<string, { position: number; duration: number; at: string }>()
    if (!progress.error) for (const item of progress.data ?? []) own.set(item.asset_id as string, { position: Number(item.position_seconds), duration: Number(item.duration_seconds), at: item.updated_at as string })
    return videos.flatMap(row => {
        const course = courses.get(row.course_id)
        if (!course) return []
        const mine = own.get(row.id)
        return [{
            assetId: row.id, runId: row.run_id!, courseId: course.id, courseSlug: course.slug, courseTitle: course.title,
            topic: course.topic ?? null, category: course.category ?? null, filename: row.filename, addedAt: row.created_at,
            durationSeconds: duration.get(row.id) ?? mine?.duration ?? null, positionSeconds: mine?.position ?? null,
            watchedAt: mine?.at ?? null, captionAssetId: captions.get(row.id) ?? null,
        }]
    })
}

/** Zatwierdzone nagrania edycji. Przed migracją kroku 1 RLS zwraca tylko edycje, na które ktoś jest zapisany. */
export async function listLibraryRecordings(): Promise<ActionResult<LibraryRecordings>> {
    return academyAction('recordings.library', async () => {
        const { client, access } = await requireAcademyContext()
        const { data, error } = await client.from('academy_material_catalog').select('*')
            .not('run_id', 'is', null).eq('status', 'ready').eq('review_status', 'published')
            .in('mime_type', [RECORDING_MIME, 'text/vtt'])
            .order('created_at', { ascending: false }).limit(LIBRARY_LIMIT)
        if (error && isMissingDatabaseObject(error)) return { available: false, items: [] }
        assertDatabaseResult(error)
        const { videos, captions } = splitRunMaterials((data ?? []) as CatalogRow[])
        return { available: true, items: await enrich(client, access.userId, videos, captions) }
    })
}

/** Nagrania i pliki wszystkich edycji jednego kursu, dla strony szkolenia. */
export async function getCourseRecordings(courseId: string): Promise<ActionResult<CourseRecordings>> {
    return academyAction('recordings.course', async () => {
        const { client, access } = await requireAcademyContext()
        const { data, error } = await client.from('academy_material_catalog').select('*')
            .eq('course_id', z.uuid().parse(courseId)).not('run_id', 'is', null).eq('status', 'ready').eq('review_status', 'published')
            .order('created_at', { ascending: false }).limit(LIBRARY_LIMIT)
        if (error && isMissingDatabaseObject(error)) return { items: [], files: [] }
        assertDatabaseResult(error)
        const { videos, files, captions } = splitRunMaterials((data ?? []) as CatalogRow[])
        return { items: await enrich(client, access.userId, videos, captions), files }
    })
}

const progressSchema = z.object({
    assetId: z.uuid(),
    position: z.number().min(0).max(86400),
    duration: z.number().positive().max(86400),
    ranges: z.array(z.tuple([z.number().min(0), z.number().min(0)])).max(200),
})

export async function saveRecordingProgress(input: z.input<typeof progressSchema>): Promise<ActionResult<RecordingProgressResult>> {
    return academyAction('recordings.progress', async () => {
        const { client } = await requireAcademyContext()
        const parsed = progressSchema.parse(input)
        const { data, error } = await client.rpc('academy_save_recording_progress', {
            p_asset_id: parsed.assetId, p_position: parsed.position, p_duration: parsed.duration, p_ranges: parsed.ranges,
        })
        if (error && isMissingDatabaseObject(error)) return { available: false, accepted: false, watchedPercent: 0 }
        assertDatabaseResult(error)
        return { available: true, accepted: data?.accepted === true, watchedPercent: Number(data?.watched_percent ?? 0) }
    })
}
