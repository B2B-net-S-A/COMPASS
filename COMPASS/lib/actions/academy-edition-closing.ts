'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { academyAction, assertDatabaseResult, requireAcademyContext } from '@/lib/academy/server'
import { isMissingDatabaseObject, MIGRATION_PENDING_PL } from '@/lib/academy/migration-contract'
import { logger } from '@/lib/logger'

export interface EditionOperationCounter { count: number; minutes: number }

/** Decoration of the closing screen: without audit access the counter simply stays hidden. */
export async function getEditionOperationCounter(runId: string) {
    return academyAction<EditionOperationCounter | null>('edition_closing.counter', async () => {
        const { client } = await requireAcademyContext({ editor: true })
        const { data, error } = await client.from('academy_audit_events').select('created_at').eq('details->>run_id', z.uuid().parse(runId)).order('created_at').limit(2000)
        if (error || !data) { logger.warn({ event: 'academy.edition_closing.counter_unavailable', code: error?.code }); return null }
        if (data.length === 0) return { count: 0, minutes: 0 }
        return { count: data.length, minutes: Math.round((Date.parse(data[data.length - 1].created_at) - Date.parse(data[0].created_at)) / 60000) }
    })
}

/** In-app notification only; it creates no e-mail and no message in the outbox. */
export async function notifyEditionClosed(runId: string) {
    return academyAction<{ notified: number }>('edition_closing.notify', async () => {
        const id = z.uuid().parse(runId)
        const { client } = await requireAcademyContext({ editor: true })
        const { data, error } = await client.rpc('academy_notify_edition_closed', { p_run_id: id })
        if (isMissingDatabaseObject(error)) throw new Error(MIGRATION_PENDING_PL)
        assertDatabaseResult(error)
        revalidatePath(`/learning/edycje/${id}`)
        return { notified: data as number }
    })
}
