'use server'

import { revalidatePath } from 'next/cache'
import { academyAction, assertDatabaseResult, requireAcademyContext } from '@/lib/academy/server'
import { z } from 'zod'

export async function getAcademyAccess() {
    return academyAction('access', async () => (await requireAcademyContext()).access)
}

export async function listAcademyTrainers(search = '') {
    return academyAction('trainers.list', async () => {
        const { client } = await requireAcademyContext({ admin: true })
        let query = client.from('profiles').select('id, full_name, email, role')
            .in('role', ['consultant', 'admin']).eq('is_external', false)
            .or('employment_status.is.null,employment_status.neq.exited')
            .order('full_name').limit(100)
        const term = search.trim().slice(0, 100).replace(/[,%_()]/g, '')
        if (term) query = query.or(`full_name.ilike.%${term}%,email.ilike.%${term}%`)
        const { data: people, error } = await query
        assertDatabaseResult(error)
        const { data: grants, error: grantsError } = await client.from('academy_user_capabilities')
            .select('user_id,can_train,revoked_at,granted_at')
        assertDatabaseResult(grantsError)
        return (people ?? []).map((person: { id: string; full_name: string | null; email: string; role: string }) => {
            const grant = grants?.find((item) => item.user_id === person.id)
            return { ...person, canTeach: person.role === 'admin' || (grant?.can_train === true && !grant.revoked_at), grantedAt: grant?.granted_at as string | null }
        })
    })
}

export async function setAcademyTrainer(userId: string, enabled: boolean) {
    return academyAction('trainers.set', async () => {
        const parsed = z.object({ userId: z.uuid(), enabled: z.boolean() }).parse({ userId, enabled })
        const { client } = await requireAcademyContext({ admin: true })
        const { error } = await client.rpc('academy_set_trainer', { p_user_id: parsed.userId, p_enabled: parsed.enabled })
        assertDatabaseResult(error)
        revalidatePath('/admin/learning/trainers')
        revalidatePath('/learning')
    })
}


export async function getAcademyRollout() {
    return academyAction('rollout.get', async () => {
        const { client } = await requireAcademyContext({ admin: true })
        const { data, error } = await client.from('academy_rollout_settings').select('mode,pilot_user_ids').single()
        assertDatabaseResult(error)
        const settings = z.object({ mode: z.enum(['closed', 'pilot', 'open']), pilot_user_ids: z.array(z.uuid()) }).parse(data)
        const people = settings.pilot_user_ids.length ? await client.from('profiles').select('id,full_name,email').in('id', settings.pilot_user_ids) : { data: [], error: null }
        assertDatabaseResult(people.error)
        return { mode: settings.mode, participants: settings.pilot_user_ids.map(id => {
            const person = people.data?.find(row => row.id === id)
            return { id, fullName: person?.full_name as string | null ?? null, email: person?.email as string | null ?? null }
        }) }
    })
}

export async function setAcademyRollout(input: { mode: 'closed' | 'pilot' | 'open'; userIds: string[] }) {
    return academyAction('rollout.set', async () => {
        const parsed = z.object({ mode: z.enum(['closed', 'pilot', 'open']), userIds: z.array(z.uuid()).max(1000) }).parse(input)
        const { client } = await requireAcademyContext({ admin: true })
        const { error } = await client.rpc('academy_set_rollout', { p_mode: parsed.mode, p_user_ids: [...new Set(parsed.userIds)] })
        assertDatabaseResult(error)
        revalidatePath('/', 'layout')
    })
}
