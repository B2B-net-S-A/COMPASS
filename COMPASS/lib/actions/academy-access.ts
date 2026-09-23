'use server'

import { revalidatePath } from 'next/cache'
import { academyAction, assertDatabaseResult, requireAcademyContext } from '@/lib/academy/server'
import { z } from 'zod'

export async function getAcademyAccess() {
    return academyAction('access', async () => (await requireAcademyContext()).access)
}

const trainerPageSchema = z.object({
    search: z.string().max(100).default(''),
    page: z.number().int().min(1).max(100_000).default(1),
    pageSize: z.number().int().min(1).max(100).default(25),
})

async function loadAcademyTrainerPage(input: z.input<typeof trainerPageSchema>) {
    const { search, page, pageSize } = trainerPageSchema.parse(input)
    const { client } = await requireAcademyContext({ admin: true })
    let query = client.from('profiles').select('id, full_name, email, role', { count: 'exact' })
        .in('role', ['consultant', 'admin']).eq('is_external', false)
        .or('employment_status.is.null,employment_status.neq.exited')
    const term = search.trim().replace(/[,%_()]/g, '')
    if (term) query = query.or(`full_name.ilike.%${term}%,email.ilike.%${term}%`)
    const { data: people, error, count } = await query.order('full_name').order('email').order('id')
        .range((page - 1) * pageSize, page * pageSize - 1)
    assertDatabaseResult(error)
    if (count === null || !Number.isSafeInteger(count) || count < 0) throw new Error('Nie udało się ustalić liczby kont Akademii.')
    const expectedRows = Math.min(pageSize, Math.max(0, count - (page - 1) * pageSize))
    if ((people ?? []).length !== expectedRows) throw new Error('Lista kont Akademii jest niepełna.')

    // PostgREST caps unpaged reads. Only fetch grants for visible consultants so
    // a large global grant table cannot silently turn a trainer into a learner.
    const consultantIds = (people ?? []).filter(person => person.role === 'consultant').map(person => person.id as string)
    const { data: grants, error: grantsError, count: grantCount } = consultantIds.length
        ? await client.from('academy_user_capabilities').select('user_id,can_train,revoked_at,granted_at', { count: 'exact' }).in('user_id', consultantIds)
        : { data: [], error: null, count: 0 }
    assertDatabaseResult(grantsError)
    if (grantCount === null || !Number.isSafeInteger(grantCount) || grantCount !== (grants ?? []).length) {
        throw new Error('Lista uprawnień trenerów jest niepełna.')
    }
    const byUserId = new Map((grants ?? []).map(grant => [grant.user_id, grant]))
    return {
        page, pageSize, total: count,
        items: (people ?? []).map((person: { id: string; full_name: string | null; email: string; role: string }) => {
            const grant = byUserId.get(person.id)
            return { ...person, canTeach: person.role === 'admin' || (grant?.can_train === true && !grant.revoked_at), grantedAt: (grant?.granted_at as string | null | undefined) ?? null }
        }),
    }
}

/** Kept for the pilot-account search, which intentionally shows its first 100 matches. */
export async function listAcademyTrainers(search = '') {
    return academyAction('trainers.list', async () => (await loadAcademyTrainerPage({ search, pageSize: 100 })).items)
}

export async function listAcademyTrainerPage(input: { search?: string; page?: number } = {}) {
    return academyAction('trainers.page', async () => loadAcademyTrainerPage(input))
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
