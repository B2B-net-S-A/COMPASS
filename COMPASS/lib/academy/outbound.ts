import 'server-only'

import * as Sentry from '@sentry/nextjs'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { sendEmail } from '@/lib/email/sender'
import { logger } from '@/lib/logger'
import { isMissingDatabaseObject } from './migration-contract'
import { isAcademySwitchOn } from './switches'

// Bramka wyjścia Akademii (B0.2): jedyna droga poczty. Wiadomość powstaje jako wiersz
// `held` w academy_outbox i nie dotyka Graph. Przełącznik ACADEMY_MAIL_ENABLED jest
// warunkiem koniecznym, ale nie wystarcza: wysyłka idzie wyłącznie z paczki zatwierdzonej
// przez człowieka, więc jego zmiana nigdy nie opróżnia kolejki. Żadna funkcja nie wysyła
// wierszy `held` poza jawnym testem na skrzynki właściciela.
//
// Błąd zapisu albo brak tabeli oznacza brak wysyłki i zdarzenie w Sentry. Klucz i treść
// nie trafiają do logów, a o adresacie mówimy tylko domeną.

export const ACADEMY_PERSONAL_LINK_PLACEHOLDER = '{{academy_personal_link}}'

/** Wiersze końcowe trzymamy tyle po terminie; `held` zawsze najpierw wygasa. */
const RETENTION_DAYS = 30
const BATCH_LIMIT = 500
const FINISHED_STATUSES = ['sent_test', 'sent', 'expired', 'failed']

export type AcademyOutboxRefusal = 'migration_pending' | 'write_failed' | 'invalid' | 'past_due' | 'token_in_body' | 'mail_disabled' | 'not_test_recipient' | 'not_held'

export interface AcademyMailInput {
    kind: string
    recipient: string
    subject: string
    html: string
    /** Termin zdarzenia: po nim wiersz wygasa i nie da się go wysłać. */
    expiresAt: string
    dedupeKey: string
    runId?: string
    batchId?: string
}

type Refused = { status: 'refused'; reason: AcademyOutboxRefusal }
type PersonalLink = (row: OutboxRow) => Promise<string>
interface OutboxRow { id: string; kind: string; recipient: string; subject: string; html: string; status: string; expires_at: string }

const inputSchema = z.object({
    kind: z.string().regex(/^[a-z0-9_.-]{1,64}$/),
    recipient: z.string().max(320).regex(/^[^@\s]+@[^@\s]+$/),
    subject: z.string().trim().min(1).max(500),
    html: z.string().min(1).max(200_000),
    expiresAt: z.iso.datetime({ offset: true }),
    dedupeKey: z.string().trim().min(1).max(200),
    runId: z.uuid().optional(),
    batchId: z.uuid().optional(),
})

function isMailEnabled(env: NodeJS.ProcessEnv): boolean {
    return isAcademySwitchOn('ACADEMY_MAIL_ENABLED', env)
}

export function testRecipients(env: NodeJS.ProcessEnv): ReadonlySet<string> {
    return new Set((env.ACADEMY_MAIL_TEST_RECIPIENTS ?? '').split(/[\s,;]+/)
        .map(entry => entry.replace(/^["']+|["']+$/g, '').toLowerCase()).filter(Boolean))
}

/** Own Academy mailbox, unused until the launch gate turns its switch on. Graph permissions stay unchanged. */
export function academySenderOverride(env: NodeJS.ProcessEnv): string | undefined {
    if (!isAcademySwitchOn('ACADEMY_MAIL_SENDER_ENABLED', env)) return undefined
    const sender = env.ACADEMY_MAIL_FROM?.trim()
    return sender && /^(?:[^<>]*<)?[^@\s<>]+@[^@\s<>]+>?$/.test(sender) ? sender : undefined
}

function domainOf(address: string): string {
    return address.split('@')[1]?.toLowerCase() ?? 'unknown'
}

function carriesToken(text: string): boolean {
    return /[?&](token|access_token|otp)=/i.test(text) || /\/wejdz\/[^/"'\s<]{8,}/i.test(text)
}

function refuse(reason: AcademyOutboxRefusal, context: { kind?: string; recipient?: string; code?: string } = {}): Refused {
    const details = { reason, kind: context.kind ?? 'unknown', recipient_domain: context.recipient ? domainOf(context.recipient) : 'unknown' }
    logger.error({ event: 'academy.outbox.refused', ...details, code: context.code })
    Sentry.captureMessage('academy_outbox_refused', { level: 'error', tags: details })
    return { status: 'refused', reason }
}

function refusalFor(error: { code?: string | null }, context: { kind?: string; recipient?: string } = {}): Refused {
    return refuse(isMissingDatabaseObject(error) ? 'migration_pending' : 'write_failed', { ...context, code: error.code ?? undefined })
}

/** Wstrzymuje wiadomość. Niezależnie od przełączników niczego nie wysyła. */
export async function holdAcademyMail(client: SupabaseClient, input: AcademyMailInput): Promise<{ status: 'held'; id: string } | { status: 'duplicate' } | Refused> {
    const parsed = inputSchema.safeParse({ ...input, recipient: input.recipient.trim().toLowerCase() })
    if (!parsed.success) return { status: 'refused', reason: 'invalid' }
    const message = parsed.data
    if (carriesToken(`${message.subject} ${message.html}`)) return refuse('token_in_body', { kind: message.kind, recipient: message.recipient })
    if (Date.parse(message.expiresAt) <= Date.now()) return { status: 'refused', reason: 'past_due' }
    try {
        const { data, error } = await client.from('academy_outbox').insert({
            kind: message.kind, recipient: message.recipient, subject: message.subject, html: message.html,
            expires_at: message.expiresAt, dedupe_key: message.dedupeKey, run_id: message.runId ?? null, batch_id: message.batchId ?? null,
        }).select('id').single()
        if (error?.code === '23505') return { status: 'duplicate' }
        if (error || !data) return refusalFor(error ?? {}, message)
        return { status: 'held', id: data.id as string }
    } catch {
        return refuse('write_failed', message)
    }
}

/** Zatwierdzenie paczki to decyzja człowieka: `approvedBy` musi być jego identyfikatorem. */
export async function approveAcademyOutboxBatch(client: SupabaseClient, input: { batchId: string; approvedBy: string; env?: NodeJS.ProcessEnv }): Promise<{ status: 'approved'; count: number } | Refused> {
    if (!isMailEnabled(input.env ?? process.env)) return { status: 'refused', reason: 'mail_disabled' }
    if (!z.uuid().safeParse(input.approvedBy).success || !z.uuid().safeParse(input.batchId).success) return { status: 'refused', reason: 'invalid' }
    const now = new Date().toISOString()
    try {
        const { data, error } = await client.from('academy_outbox')
            .update({ status: 'approved', approved_by: input.approvedBy, approved_at: now })
            .eq('batch_id', input.batchId).eq('status', 'held').gt('expires_at', now).select('id')
        if (error) return refusalFor(error)
        return { status: 'approved', count: (data ?? []).length }
    } catch {
        return refuse('write_failed')
    }
}

/** Przejęcie wiersza przed wysyłką: wysyłka co najwyżej raz, także przy dwóch workerach. */
async function claim(client: SupabaseClient, row: OutboxRow, now: string): Promise<'claimed' | 'taken' | Refused> {
    const { data, error } = await client.from('academy_outbox').update({ claimed_at: now })
        .eq('id', row.id).eq('status', row.status).is('claimed_at', null).gt('expires_at', now).select('id')
    if (error) return refusalFor(error, row)
    return (data ?? []).length === 1 ? 'claimed' : 'taken'
}

async function finish(client: SupabaseClient, row: OutboxRow, patch: Record<string, unknown>): Promise<void> {
    const { error } = await client.from('academy_outbox').update(patch).eq('id', row.id)
    // Wiadomość już wyszła albo nie wyjdzie; przejęty wiersz i tak nie zostanie wysłany ponownie.
    if (error) refusalFor(error, row)
}

async function deliver(client: SupabaseClient, row: OutboxRow, sentStatus: 'sent' | 'sent_test', env: NodeJS.ProcessEnv, personalLink?: PersonalLink): Promise<'sent' | 'failed'> {
    let html = row.html
    if (html.includes(ACADEMY_PERSONAL_LINK_PLACEHOLDER)) {
        const link = await personalLink?.(row).catch(() => null)
        if (!link) {
            await finish(client, row, { status: 'failed', last_error: 'personal_link_unavailable' })
            return 'failed'
        }
        html = html.split(ACADEMY_PERSONAL_LINK_PLACEHOLDER).join(link)
    }
    const senderOverride = academySenderOverride(env)
    const result = await sendEmail({ to: row.recipient, subject: row.subject, html, redactRecipientInLogs: true, ...(senderOverride ? { senderOverride } : {}) })
    if (!result.success) {
        logger.error({ event: 'academy.outbox.send_failed', kind: row.kind, recipientDomain: domainOf(row.recipient) })
        await finish(client, row, { status: 'failed', last_error: 'send_failed' })
        return 'failed'
    }
    await finish(client, row, { status: sentStatus, sent_at: new Date().toISOString() })
    return 'sent'
}

/** Wysyła wyłącznie wiersze tej paczki zatwierdzone przez człowieka i przed terminem. */
export async function sendApprovedAcademyBatch(client: SupabaseClient, input: { batchId: string; env?: NodeJS.ProcessEnv; personalLink?: PersonalLink }): Promise<{ status: 'done'; sent: number; failed: number; skipped: number } | Refused> {
    if (!isMailEnabled(input.env ?? process.env)) return { status: 'refused', reason: 'mail_disabled' }
    const now = new Date().toISOString()
    try {
        const { error: expireError } = await client.from('academy_outbox').update({ status: 'expired' })
            .eq('batch_id', input.batchId).in('status', ['held', 'approved']).lte('expires_at', now).select('id')
        if (expireError) return refusalFor(expireError)
        const { data, error } = await client.from('academy_outbox').select('id,kind,recipient,subject,html,status,expires_at')
            .eq('batch_id', input.batchId).eq('status', 'approved').is('claimed_at', null).gt('expires_at', now).limit(BATCH_LIMIT)
        if (error) return refusalFor(error)
        let sent = 0, failed = 0, skipped = 0
        for (const row of (data ?? []) as OutboxRow[]) {
            const claimed = await claim(client, row, now)
            if (claimed === 'taken') { skipped++; continue }
            if (claimed !== 'claimed') return claimed
            if (await deliver(client, row, 'sent', input.env ?? process.env, input.personalLink) === 'sent') sent++
            else failed++
        }
        return { status: 'done', sent, failed, skipped }
    } catch {
        return refuse('write_failed')
    }
}

/** Jawna wysyłka testowa jednego wiersza, tylko na adres z listy skrzynek właściciela. */
export async function sendAcademyMailTest(client: SupabaseClient, input: { id: string; env?: NodeJS.ProcessEnv; personalLink?: PersonalLink }): Promise<{ status: 'sent_test' } | { status: 'failed' } | Refused> {
    const now = new Date().toISOString()
    try {
        const { data, error } = await client.from('academy_outbox').select('id,kind,recipient,subject,html,status,expires_at').eq('id', input.id).maybeSingle()
        if (error) return refusalFor(error)
        const row = data as OutboxRow | null
        if (!row || row.status !== 'held') return { status: 'refused', reason: 'not_held' }
        if (!testRecipients(input.env ?? process.env).has(row.recipient)) return { status: 'refused', reason: 'not_test_recipient' }
        if (row.expires_at <= now) return { status: 'refused', reason: 'past_due' }
        const claimed = await claim(client, row, now)
        if (claimed === 'taken') return { status: 'refused', reason: 'not_held' }
        if (claimed !== 'claimed') return claimed
        return await deliver(client, row, 'sent_test', input.env ?? process.env, input.personalLink) === 'sent' ? { status: 'sent_test' } : { status: 'failed' }
    } catch {
        return refuse('write_failed')
    }
}

/** Wygaszanie po terminie i retencja. Nie zależy od przełączników i niczego nie wysyła. */
export async function runAcademyOutboxHousekeeping(client: SupabaseClient): Promise<{ status: 'done'; expired: number; purged: number } | { status: 'migration_pending' } | { status: 'failed' }> {
    const now = Date.now()
    try {
        const expired = await client.from('academy_outbox').update({ status: 'expired' })
            .in('status', ['held', 'approved']).lte('expires_at', new Date(now).toISOString()).select('id')
        if (expired.error) return outcomeOfHousekeepingError(expired.error)
        const purged = await client.from('academy_outbox').delete().in('status', FINISHED_STATUSES)
            .lt('expires_at', new Date(now - RETENTION_DAYS * 86_400_000).toISOString()).select('id')
        if (purged.error) return outcomeOfHousekeepingError(purged.error)
        return { status: 'done', expired: (expired.data ?? []).length, purged: (purged.data ?? []).length }
    } catch {
        logger.error({ event: 'academy.outbox.housekeeping_failed', code: 'exception' })
        return { status: 'failed' }
    }
}

function outcomeOfHousekeepingError(error: { code?: string | null }): { status: 'migration_pending' } | { status: 'failed' } {
    if (isMissingDatabaseObject(error)) return { status: 'migration_pending' }
    logger.error({ event: 'academy.outbox.housekeeping_failed', code: error.code })
    return { status: 'failed' }
}
