'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { academyAction, assertDatabaseResult, requireAcademyContext } from '@/lib/academy/server'
import type { ActionResult } from '@/lib/types/learning'

export interface TwinCourseResult {
    courseId: string
    created: boolean
    absentees: number
}

/** Creates a draft only. Publication goes through the usual independent review and nothing is sent. */
export async function createTwinCourse(runId: string): Promise<ActionResult<TwinCourseResult>> {
    return academyAction('twin_course.create', async () => {
        const { client } = await requireAcademyContext({ trainer: true })
        const { data, error } = await client.rpc('academy_create_twin_course', { p_run_id: z.uuid().parse(runId) })
        assertDatabaseResult(error)
        revalidatePath('/learning/tworze')
        return { courseId: z.uuid().parse(data?.course_id), created: data?.created === true, absentees: Number(data?.absentees ?? 0) }
    })
}
