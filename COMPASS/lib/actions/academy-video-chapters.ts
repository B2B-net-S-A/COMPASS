'use server'

import { z } from 'zod'
import { academyAction, assertDatabaseResult, requireAcademyContext } from '@/lib/academy/server'
import { isMissingDatabaseObject, MIGRATION_PENDING_PL } from '@/lib/academy/migration-contract'
import type { VideoChapter } from '@/lib/academy/video-chapters'
import type { ActionResult } from '@/lib/types/learning'

export interface VideoChaptersResult {
    /** False until the migration is applied; the editor then explains why it is unavailable. */
    available: boolean
    chapters: VideoChapter[]
}

export async function listVideoChapters(assetId: string): Promise<ActionResult<VideoChaptersResult>> {
    return academyAction('video_chapters.list', async () => {
        const { client } = await requireAcademyContext()
        const { data, error } = await client.from('academy_video_chapters').select('position_seconds,title').eq('asset_id', z.uuid().parse(assetId)).order('position_seconds')
        if (error && isMissingDatabaseObject(error)) return { available: false, chapters: [] }
        assertDatabaseResult(error)
        return { available: true, chapters: (data ?? []) as VideoChapter[] }
    })
}

const chaptersSchema = z.array(z.object({
    position_seconds: z.number().int().min(0).max(86400),
    title: z.string().trim().min(1, 'Podaj tytuł rozdziału.').max(120),
})).max(100, 'Nagranie może mieć najwyżej 100 rozdziałów.')

export async function saveVideoChapters(assetId: string, chapters: VideoChapter[]): Promise<ActionResult<{ saved: number }>> {
    return academyAction('video_chapters.save', async () => {
        const { client } = await requireAcademyContext({ trainer: true })
        const parsed = chaptersSchema.parse(chapters)
        const { data, error } = await client.rpc('academy_replace_video_chapters', { p_asset_id: z.uuid().parse(assetId), p_chapters: parsed })
        if (error && isMissingDatabaseObject(error)) throw new Error(MIGRATION_PENDING_PL)
        assertDatabaseResult(error)
        return { saved: Number(data ?? 0) }
    })
}
