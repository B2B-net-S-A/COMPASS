'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { isVerifyAllowedFor } from '@/lib/academy/document-verify'
import { academyActionError } from '@/lib/academy/errors'
import { isMissingDatabaseObject, MIGRATION_PENDING_PL } from '@/lib/academy/migration-contract'
import { requireAcademyContext } from '@/lib/academy/server'
import { ExpectedError, runAction, type ActionResult } from '@/lib/actions/action-result'

export interface DocumentShareState { available: boolean; migrated: boolean; enabled: boolean; code: string | null }

async function requireMember() {
    try { return await requireAcademyContext() }
    catch (error) { throw new ExpectedError(academyActionError(error)) }
}

/** Właściciel widzi przełącznik tylko tam, gdzie link może zadziałać. */
export async function getCertificateShare(completionId: string): Promise<ActionResult<DocumentShareState>> {
    return runAction('getCertificateShare', async () => {
        const { client, access } = await requireMember()
        const id = z.uuid().safeParse(completionId)
        if (!id.success) throw new ExpectedError('Nieprawidłowy identyfikator dokumentu.')
        const [{ data: user }, account, share] = await Promise.all([
            client.auth.getUser(),
            client.from('academy_learner_accounts').select('source').eq('user_id', access.userId).maybeSingle(),
            client.from('academy_document_shares').select('public_code,share_enabled').eq('completion_id', id.data).maybeSingle(),
        ])
        const available = isVerifyAllowedFor({ email: user.user?.email ?? null, source: (account.data?.source as string | undefined) ?? null })
        if (isMissingDatabaseObject(share.error)) return { available, migrated: false, enabled: false, code: null }
        if (share.error) throw new Error(`Nie udało się odczytać stanu udostępnienia: ${share.error.message}`)
        return { available, migrated: true, enabled: share.data?.share_enabled === true, code: (share.data?.public_code as string | undefined) ?? null }
    })
}

export async function setCertificateShare(completionId: string, enabled: boolean): Promise<ActionResult<{ enabled: boolean; code: string }>> {
    return runAction('setCertificateShare', async () => {
        const { client } = await requireMember()
        const id = z.uuid().safeParse(completionId)
        if (!id.success) throw new ExpectedError('Nieprawidłowy identyfikator dokumentu.')
        const { data, error } = await client.rpc('academy_set_document_share', { p_kind: 'certificate', p_document_id: id.data, p_enabled: enabled === true })
        if (isMissingDatabaseObject(error)) throw new ExpectedError(MIGRATION_PENDING_PL)
        if (error) throw new ExpectedError(error.code === '42501' ? 'Nie możesz udostępnić tego dokumentu.' : academyActionError(new Error(error.message)))
        revalidatePath(`/learning/certyfikaty/${id.data}`)
        const result = data as { public_code: string; share_enabled: boolean }
        return { enabled: result.share_enabled, code: result.public_code }
    })
}
