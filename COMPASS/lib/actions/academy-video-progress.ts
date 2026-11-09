'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { academyAction, assertDatabaseResult, requireAcademyContext } from '@/lib/academy/server'
import { isMissingDatabaseObject } from '@/lib/academy/migration-contract'
import type { ActionResult } from '@/lib/types/learning'

export interface LessonVideoProgress {
    /** False until the migration is applied; the lesson then keeps its manual button. */
    available: boolean
    items: Record<string, { position: number; duration: number }>
}

export interface VideoProgressResult {
    available: boolean
    accepted: boolean
    completed: boolean
    watchedPercent: number
    streak: { current: number; milestone_reached: boolean } | null
}

const unavailable: VideoProgressResult = { available: false, accepted: false, completed: false, watchedPercent: 0, streak: null }

export async function getLessonVideoProgress(assetIds: string[]): Promise<ActionResult<LessonVideoProgress>> {
    return academyAction('video_progress.get', async () => {
        const { client, access } = await requireAcademyContext()
        const ids = z.array(z.uuid()).max(100).parse(assetIds)
        if (!ids.length) return { available: true, items: {} }
        const { data, error } = await client.from('academy_video_progress').select('asset_id,position_seconds,duration_seconds').eq('user_id', access.userId).in('asset_id', ids)
        if (error && isMissingDatabaseObject(error)) return { available: false, items: {} }
        assertDatabaseResult(error)
        return { available: true, items: Object.fromEntries((data ?? []).map(row => [row.asset_id as string, { position: Number(row.position_seconds), duration: Number(row.duration_seconds) }])) }
    })
}

const saveSchema = z.object({
    enrollmentId: z.uuid(),
    lessonId: z.uuid(),
    assetId: z.uuid(),
    position: z.number().min(0).max(86400),
    duration: z.number().positive().max(86400),
    ranges: z.array(z.tuple([z.number().min(0), z.number().min(0)])).max(200),
})

export async function saveVideoProgress(input: z.input<typeof saveSchema>): Promise<ActionResult<VideoProgressResult>> {
    return academyAction('video_progress.save', async () => {
        const { client } = await requireAcademyContext()
        const parsed = saveSchema.parse(input)
        const { data, error } = await client.rpc('academy_save_video_progress', {
            p_enrollment_id: parsed.enrollmentId, p_lesson_id: parsed.lessonId, p_asset_id: parsed.assetId,
            p_position: parsed.position, p_duration: parsed.duration, p_ranges: parsed.ranges,
        })
        if (error && isMissingDatabaseObject(error)) return unavailable
        assertDatabaseResult(error)
        if (data?.completed === true && data?.already_completed !== true) revalidatePath('/learning', 'layout')
        return {
            available: true,
            accepted: data?.accepted === true,
            completed: data?.completed === true && data?.already_completed !== true,
            watchedPercent: Number(data?.watched_percent ?? 0),
            streak: data?.streak ?? null,
        }
    })
}
