'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { academyAction, assertDatabaseResult, requireAcademyContext } from '@/lib/academy/server'

export interface AcademyCertificateRecord {
    id: string
    course_id: string
    enrollment_id: string
    user_id: string
    completed_at: string
    revoked_at: string | null
    revoked_reason: string | null
    certificate_snapshot: { course_title: string; participant_name: string; version_number: number; certificate_hash: string }
    decision: { rewards_state: string; reversed_transactions: number; manual_reward_review_required: boolean } | null
}

export async function listAcademyCertificates(search = '', page = 1) {
    return academyAction('certificates.list', async () => {
        const { client, access } = await requireAcademyContext({ admin: true })
        const currentPage = z.number().int().min(1).max(10000).parse(page)
        const term = search.trim().slice(0, 100).replace(/[,%_()]/g, '')
        let query = client.from('course_completions').select('id,course_id,enrollment_id,user_id,completed_at,revoked_at,revoked_reason,certificate_snapshot')
        if (term) query = query.or(`certificate_snapshot->>participant_name.ilike.%${term}%,certificate_snapshot->>course_title.ilike.%${term}%`)
        const { data, error } = await query.order('completed_at', { ascending: false }).order('id').range((currentPage - 1) * 50, currentPage * 50)
        assertDatabaseResult(error)
        const rows = (data ?? []).slice(0, 50)
        const decisions = rows.length ? await client.from('academy_completion_revocations').select('completion_id,rewards_state,reversed_transactions,manual_reward_review_required').in('completion_id', rows.map(row => row.id)) : { data: [], error: null }
        assertDatabaseResult(decisions.error)
        return { items: rows.map(row => ({ ...row, decision: decisions.data?.find(decision => decision.completion_id === row.id) ?? null })) as AcademyCertificateRecord[], hasMore: (data?.length ?? 0) > 50, viewerId: access.userId }
    })
}

export async function revokeAcademyCertificate(completionId: string, reason: string) {
    return academyAction('certificates.revoke', async () => {
        const input = z.object({ completionId: z.uuid(), reason: z.string().trim().min(10, 'Podaj powód unieważnienia (co najmniej 10 znaków).').max(2000) }).parse({ completionId, reason })
        const { client } = await requireAcademyContext({ admin: true })
        const { data, error } = await client.rpc('academy_revoke_completion', { p_completion_id: input.completionId, p_reason: input.reason })
        assertDatabaseResult(error)
        revalidatePath('/learning', 'layout')
        revalidatePath('/admin/learning', 'layout')
        return data as { already_revoked: boolean; rewards_state: string; manual_reward_review_required: boolean }
    })
}

export async function getMyAcademyCertificate(completionId: string) {
    return academyAction('certificates.mine', async () => {
        const { client, access } = await requireAcademyContext()
        const { data, error } = await client.from('course_completions').select('id,course_id,enrollment_id,user_id,completed_at,revoked_at,revoked_reason,certificate_snapshot')
            .eq('id', z.uuid().parse(completionId)).eq('user_id', access.userId).single()
        assertDatabaseResult(error)
        if (!data) throw new Error('Certyfikat nie istnieje lub nie masz do niego dostępu.')
        return data as Omit<AcademyCertificateRecord, 'decision'>
    })
}
