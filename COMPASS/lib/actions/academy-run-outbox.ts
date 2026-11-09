'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { academyAction, assertDatabaseResult, requireAcademyContext } from '@/lib/academy/server'
import { isMissingDatabaseObject } from '@/lib/academy/migration-contract'
import { approveAcademyOutboxBatch, sendAcademyMailTest } from '@/lib/academy/outbound'
import { isAcademySwitchOn } from '@/lib/academy/switches'
import { createServiceClient } from '@/lib/supabase/admin'

const MAX_ROWS = 2000

export interface OutboxBatch { batchId: string | null; kind: string; status: string; count: number; expiresAt: string; sampleId: string; subject: string }
export interface RunOutboxState { available: boolean; mailEnabled: boolean; batches: OutboxBatch[] }

const REFUSAL: Record<string, string> = {
    mail_disabled: 'Wysyłka jest wyłączona. Paczki nie można zatwierdzić.',
    not_test_recipient: 'Test wysyła się wyłącznie na skrzynki właściciela.',
    not_held: 'Ta wiadomość nie czeka już w kolejce.',
    past_due: 'Termin tej wiadomości minął.',
}

export async function getAcademyRunOutbox(runId: string) {
    return academyAction<RunOutboxState>('outbox.state', async () => {
        const id = z.uuid().parse(runId)
        const { client } = await requireAcademyContext({ editor: true })
        const { data, error } = await client.from('academy_outbox').select('id,batch_id,kind,status,expires_at,subject').eq('run_id', id).order('expires_at').limit(MAX_ROWS)
        const mailEnabled = isAcademySwitchOn('ACADEMY_MAIL_ENABLED')
        if (isMissingDatabaseObject(error)) return { available: false, mailEnabled, batches: [] }
        assertDatabaseResult(error)
        const groups = new Map<string, OutboxBatch>()
        for (const row of (data ?? []) as Array<{ id: string; batch_id: string | null; kind: string; status: string; expires_at: string; subject: string }>) {
            const key = `${row.batch_id ?? row.kind}:${row.status}`
            const current = groups.get(key)
            if (current) current.count++
            else groups.set(key, { batchId: row.batch_id, kind: row.kind, status: row.status, count: 1, expiresAt: row.expires_at, sampleId: row.id, subject: row.subject })
        }
        return { available: true, mailEnabled, batches: Array.from(groups.values()) }
    })
}

export async function previewAcademyOutboxMessage(id: string) {
    return academyAction<{ subject: string; html: string; recipient: string; expiresAt: string }>('outbox.preview', async () => {
        const { client } = await requireAcademyContext({ editor: true })
        const { data, error } = await client.from('academy_outbox').select('subject,html,recipient,expires_at').eq('id', z.uuid().parse(id)).single()
        assertDatabaseResult(error)
        return { subject: data.subject, html: data.html, recipient: data.recipient, expiresAt: data.expires_at }
    })
}

/** Only ever delivers to the owner's test mailboxes; the gate enforces that, not this screen. */
export async function sendAcademyOutboxTest(input: { id: string; runId: string }) {
    return academyAction<void>('outbox.test', async () => {
        const parsed = z.object({ id: z.uuid(), runId: z.uuid() }).parse(input)
        await requireAcademyContext({ editor: true })
        const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')
        const result = await sendAcademyMailTest(createServiceClient() as unknown as SupabaseClient, { id: parsed.id, personalLink: async () => `${appUrl}/learning/edycje/${parsed.runId}` })
        if (result.status === 'refused') throw new Error(REFUSAL[result.reason] ?? 'Test nie został wysłany.')
        if (result.status === 'failed') throw new Error('Wysyłka testowa nie powiodła się.')
        revalidatePath(`/learning/edycje/${parsed.runId}`)
    })
}

export async function approveAcademyRunOutboxBatch(input: { batchId: string; runId: string }) {
    return academyAction<{ count: number }>('outbox.approve', async () => {
        const parsed = z.object({ batchId: z.uuid(), runId: z.uuid() }).parse(input)
        const { access } = await requireAcademyContext({ editor: true })
        const result = await approveAcademyOutboxBatch(createServiceClient() as unknown as SupabaseClient, { batchId: parsed.batchId, approvedBy: access.userId })
        if (result.status === 'refused') throw new Error(REFUSAL[result.reason] ?? 'Nie udało się zatwierdzić paczki.')
        revalidatePath(`/learning/edycje/${parsed.runId}`)
        return { count: result.count }
    })
}
