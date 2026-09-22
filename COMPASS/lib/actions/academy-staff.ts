'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { academyAction, assertDatabaseResult, requireAcademyContext } from '@/lib/academy/server'
import type { AcademyStaffState, AcademyStaffRole } from '@/lib/types/academy-staff'

export async function getAcademyStaff(courseId: string, runId?: string) {
    return academyAction('staff.list', async () => {
        const { client } = await requireAcademyContext({ trainer: true })
        const { data: allowed, error: accessError } = await client.rpc('academy_can_assign_staff', { p_course_id: z.uuid().parse(courseId) })
        assertDatabaseResult(accessError)
        if (!allowed) return null
        const { data, error } = await client.rpc('academy_get_staff', { p_course_id: courseId, p_run_id: runId ? z.uuid().parse(runId) : null })
        assertDatabaseResult(error)
        return data as AcademyStaffState
    })
}

export async function setAcademyStaff(input: { courseId: string; runId?: string; userId: string; role: AcademyStaffRole; enabled: boolean }) {
    return academyAction('staff.assign', async () => {
        const parsed = z.object({ courseId: z.uuid(), runId: z.uuid().optional(), userId: z.uuid(), role: z.enum(['editor', 'facilitator']), enabled: z.boolean() }).parse(input)
        const { client } = await requireAcademyContext({ trainer: true })
        if (parsed.runId && parsed.role !== 'facilitator') throw new Error('Edycja może mieć tylko dodatkowych prowadzących.')
        const { error } = parsed.runId
            ? await client.rpc('academy_set_run_staff', { p_run_id: parsed.runId, p_user_id: parsed.userId, p_enabled: parsed.enabled })
            : await client.rpc('academy_set_course_staff', { p_course_id: parsed.courseId, p_user_id: parsed.userId, p_role: parsed.role, p_enabled: parsed.enabled })
        assertDatabaseResult(error)
        revalidatePath('/learning', 'layout')
    })
}

export async function getAcademyCourseManagement(courseId: string) {
    return academyAction('staff.permissions', async () => {
        const { client } = await requireAcademyContext({ trainer: true })
        const params = { p_course_id: z.uuid().parse(courseId) }
        const [edit, lead] = await Promise.all([client.rpc('academy_can_manage_course', params), client.rpc('academy_can_lead_course', params)])
        assertDatabaseResult(edit.error); assertDatabaseResult(lead.error)
        return { canEdit: edit.data === true, canLead: lead.data === true }
    })
}
