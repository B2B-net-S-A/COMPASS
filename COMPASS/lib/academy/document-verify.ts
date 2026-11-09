import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { certificateValidity } from './certificate-validity'
import { isMissingDatabaseObject } from './migration-contract'
import { testRecipients } from './outbound'
import { isAcademySwitchOn } from './switches'

// Publiczna weryfikacja dokumentu (B5.2). Przy wyłączonym ACADEMY_PUBLIC_VERIFY_ENABLED
// działa tylko dokument konta próbnego z adresem na liście skrzynek właściciela.

const CODE_PATTERN = /^[a-f0-9]{32}$/
const WINDOW_MS = 15 * 60 * 1000
const MAX_PER_IP = 30
const MAX_TRACKED_KEYS = 10_000

export type PublicDocumentState = 'valid' | 'expired' | 'revoked'
export interface PublicDocument {
    kind: 'certificate' | 'participation'
    courseTitle: string
    participantName: string
    issuedAt: string
    state: PublicDocumentState
    validUntil: string | null
}
interface VerifiedRow {
    kind: 'certificate' | 'participation'; course_title: string; participant_name: string; issued_at: string
    valid_until: string | null; revoked_at: string | null; owner_email: string | null; owner_source: string | null
}

export function isVerifyAllowedFor(owner: { email: string | null; source: string | null }, env: NodeJS.ProcessEnv = process.env): boolean {
    if (isAcademySwitchOn('ACADEMY_PUBLIC_VERIFY_ENABLED', env)) return true
    return owner.source === 'proba' && !!owner.email && testRecipients(env).has(owner.email.toLowerCase())
}

/** Zwraca wyłącznie to, co może zobaczyć osoba z linkiem: bez wyniku, adresu i identyfikatorów. */
export async function resolvePublicDocument(client: SupabaseClient, code: string, env: NodeJS.ProcessEnv = process.env, now: number = Date.now()): Promise<PublicDocument | null> {
    if (!CODE_PATTERN.test(code)) return null
    const { data, error } = await client.rpc('academy_verify_document', { p_code: code })
    if (isMissingDatabaseObject(error)) return null
    if (error) throw new Error('document_verify_failed')
    const row = data as VerifiedRow | null
    if (!row || !isVerifyAllowedFor({ email: row.owner_email, source: row.owner_source }, env)) return null
    const validity = certificateValidity({ valid_until: row.valid_until }, row.revoked_at, now)
    const state: PublicDocumentState = validity.state === 'revoked' ? 'revoked' : validity.state === 'expired' ? 'expired' : 'valid'
    return { kind: row.kind, courseTitle: row.course_title, participantName: row.participant_name, issuedAt: row.issued_at, state, validUntil: validity.validUntil }
}

type Bucket = { count: number; resetAt: number }
const buckets = new Map<string, Bucket>()

/** Pamięć procesu wystarcza, bo aplikacja chodzi w jednym kontenerze. */
export function allowVerifyRequest(ip: string, now: number = Date.now()): boolean {
    const current = buckets.get(ip)
    if (!current || current.resetAt <= now) {
        if (!current && buckets.size >= MAX_TRACKED_KEYS) {
            buckets.forEach((bucket, tracked) => { if (bucket.resetAt <= now) buckets.delete(tracked) })
            if (buckets.size >= MAX_TRACKED_KEYS) return false
        }
        buckets.set(ip, { count: 1, resetAt: now + WINDOW_MS })
        return true
    }
    current.count += 1
    return current.count <= MAX_PER_IP
}

export function resetVerifyRateLimit(): void {
    buckets.clear()
}
