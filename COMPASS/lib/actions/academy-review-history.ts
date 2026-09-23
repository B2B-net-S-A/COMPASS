'use server'

import { z } from 'zod'
import { academyAction, assertDatabaseResult, requireAcademyContext } from '@/lib/academy/server'
import type { ActionResult } from '@/lib/types/learning'
import type { AcademyReviewHistoryCursor, AcademyReviewHistoryPage } from '@/lib/types/academy-review-history'

const cursorSchema = z.object({ createdAt: z.iso.datetime({ offset: true }), id: z.uuid() })
const pageSchema = z.object({
    items: z.array(z.object({
        id: z.uuid(),
        action: z.enum(['COURSE_REVIEW_SUBMITTED', 'COURSE_SUBMITTED', 'COURSE_PUBLISHED', 'COURSE_REJECTED', 'LEGACY_COURSE_REVIEWED', 'COURSE_ARCHIVED']),
        createdAt: z.iso.datetime({ offset: true }), actorName: z.string().max(200).nullable(),
        versionNumber: z.number().int().positive().nullable(), submissionId: z.uuid().nullable(),
        reason: z.string().max(3000).nullable(), approved: z.boolean().nullable(),
    })).max(50),
    nextCursor: cursorSchema.nullable(),
})

export async function getAcademyReviewHistory(input: { courseId: string; cursor?: AcademyReviewHistoryCursor; limit?: number }): Promise<ActionResult<AcademyReviewHistoryPage>> {
    return academyAction('review.history', async () => {
        const parsed = z.object({ courseId: z.uuid(), cursor: cursorSchema.optional(), limit: z.number().int().min(1).max(50).default(20) }).parse(input)
        const { client } = await requireAcademyContext({ trainer: true })
        const { data, error } = await client.rpc('academy_course_review_history', {
            p_course_id: parsed.courseId, p_before_created_at: parsed.cursor?.createdAt ?? null,
            p_before_id: parsed.cursor?.id ?? null, p_limit: parsed.limit,
        })
        assertDatabaseResult(error)
        const result = pageSchema.safeParse(data)
        if (!result.success) throw new Error('Nie udało się odczytać historii decyzji. Odśwież widok.')
        return result.data
    })
}
