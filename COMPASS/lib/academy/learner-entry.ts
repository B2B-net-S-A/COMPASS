import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { findLearnerAccountById, learnerEntryDenial, type LearnerAccount } from '@/lib/academy/learner-accounts'
import { isMissingDatabaseObject } from '@/lib/academy/migration-contract'
import { learnerPassSecret, verifyLearnerPassToken, type LearnerPassClaims } from '@/lib/academy/learner-pass'
import { logger } from '@/lib/logger'

export type LearnerPassResolution =
    | { status: 'ok'; account: LearnerAccount; claims: LearnerPassClaims }
    | { status: 'used' }
    | { status: 'not_found' }

/**
 * Sprawdzenie przepustki, tylko odczyt, bo skanery poczty otwierają linki.
 * Każda odmowa wygląda tak samo: zły podpis, termin, adres firmowy i wyłączony przełącznik
 * dają `not_found`, żeby odpowiedź nie mówiła, które konto istnieje.
 */
export async function resolveLearnerPass(
    client: SupabaseClient,
    token: string,
    options: { env?: NodeJS.ProcessEnv; now?: Date } = {},
): Promise<LearnerPassResolution> {
    const secret = learnerPassSecret(options.env)
    if (!secret) return { status: 'not_found' }
    const verified = verifyLearnerPassToken(token, secret, options.now)
    if (!verified.ok) return { status: 'not_found' }
    const account = await findLearnerAccountById(client, verified.claims.accountId)
    if (!account || learnerEntryDenial(account, options)) return { status: 'not_found' }
    if (account.last_entry_at && new Date(account.last_entry_at).getTime() >= verified.claims.issuedAt * 1000) return { status: 'used' }
    return { status: 'ok', account, claims: verified.claims }
}

export function maskLearnerEmail(email: string): string {
    const [local, domain] = email.split('@')
    return `${local.slice(0, 2)}***@${domain}`
}

/** Zużywa link i zapisuje zgodę jednym warunkowym UPDATE-em, więc dwa kliknięcia nie przejdą. */
export async function claimLearnerEntry(
    client: SupabaseClient,
    resolved: { account: LearnerAccount; claims: LearnerPassClaims },
    infoVersion: string,
): Promise<boolean> {
    const now = new Date().toISOString()
    const issuedAt = new Date(resolved.claims.issuedAt * 1000).toISOString()
    const { data, error } = await client.from('academy_learner_accounts')
        .update({
            last_entry_at: now,
            info_accepted_at: now,
            info_version: infoVersion,
            first_login_at: resolved.account.first_login_at ?? now,
        })
        .eq('id', resolved.account.id)
        .or(`last_entry_at.is.null,last_entry_at.lt.${issuedAt}`)
        .select('id')
    if (error) throw new Error(`learner entry claim failed: ${error.code ?? 'unknown'}`)
    return (data ?? []).length === 1
}

/**
 * Zakłada konto przez Admin API albo potwierdza istniejące. Znacznik `academy_only` idzie
 * w `app_metadata` jako wartość logiczna. Nie przejmujemy cudzego konta o tym adresie.
 */
export async function ensureLearnerUser(client: SupabaseClient, account: LearnerAccount): Promise<string | null> {
    if (account.user_id) {
        const { data, error } = await client.auth.admin.getUserById(account.user_id)
        const user = data?.user
        if (error || !user || user.app_metadata?.academy_only !== true || user.email?.toLowerCase() !== account.email) {
            logger.error({ event: 'academy.learner_entry.account_mismatch', code: error?.code })
            return null
        }
        return user.id
    }
    const { data, error } = await client.auth.admin.createUser({
        email: account.email,
        email_confirm: true,
        app_metadata: { academy_only: true },
        user_metadata: { full_name: account.full_name ?? undefined },
    })
    if (error || !data.user) {
        logger.error({ event: 'academy.learner_entry.create_failed', code: error?.code })
        return null
    }
    const { error: linkError } = await client.from('academy_learner_accounts').update({ user_id: data.user.id }).eq('id', account.id).is('user_id', null)
    if (linkError) {
        // Bez powiązania kolejne wejście odbiłoby się od „adres zajęty", więc cofamy założenie konta.
        await client.auth.admin.deleteUser(data.user.id)
        throw new Error(`learner account link failed: ${linkError.code ?? 'unknown'}`)
    }
    return data.user.id
}

/**
 * Łączy konto z prywatną listą edycji i przenosi zaimportowaną obecność. Nigdy nie blokuje wejścia:
 * brak migracji albo awaria oznacza tylko, że powiązanie powstanie przy następnym wejściu.
 */
export async function bindLearnerToRuns(client: SupabaseClient, accountId: string, userId: string): Promise<void> {
    const { data, error } = await client.rpc('academy_bind_learner_on_entry', { p_account_id: accountId, p_user_id: userId })
    if (error) {
        if (!isMissingDatabaseObject(error)) logger.error({ event: 'academy.learner_entry.bind_failed', code: error.code })
        return
    }
    const failed = (data as { failed?: number } | null)?.failed ?? 0
    if (failed > 0) logger.error({ event: 'academy.learner_entry.bind_partial', failed })
}

/** Jednorazowy `token_hash` dla `verifyOtp` w przeglądarce. `generateLink` niczego nie wysyła. */
export async function createLearnerSessionHash(client: SupabaseClient, email: string, userId: string): Promise<string | null> {
    const { data, error } = await client.auth.admin.generateLink({ type: 'magiclink', email })
    if (error || !data.properties?.hashed_token || data.user?.id !== userId) {
        logger.error({ event: 'academy.learner_entry.link_failed', code: error?.code })
        return null
    }
    return data.properties.hashed_token
}
