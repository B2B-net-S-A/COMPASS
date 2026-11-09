import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { testRecipients } from '@/lib/academy/outbound'
import { isMissingDatabaseObject } from '@/lib/academy/migration-contract'
import { isAcademySwitchOn } from '@/lib/academy/switches'

// Konto nauki (B1.2). Dwie listy, których nie wolno mylić: `academy_learner_accounts` to
// kto ma konto nauki, a `ACADEMY_MAIL_TEST_RECIPIENTS` w vaulcie to skrzynki właściciela,
// jedyni odbiorcy poczty do bramki startu.

export interface LearnerAccount {
    id: string
    email: string
    full_name: string | null
    source: string | null
    user_id: string | null
    info_accepted_at: string | null
    info_version: string | null
    first_login_at: string | null
    last_entry_at: string | null
    access_until: string | null
    ended_at: string | null
}

const LEARNER_COLUMNS = 'id,email,full_name,source,user_id,info_accepted_at,info_version,first_login_at,last_entry_at,access_until,ended_at'

export type LearnerEntryDenial = 'invalid_email' | 'company_domain' | 'ended' | 'expired' | 'not_owner_mailbox' | 'pass_disabled'

export function normalizeLearnerEmail(email: string): string {
    return email.trim().toLowerCase()
}

export function isCompanyEmail(email: string): boolean {
    return normalizeLearnerEmail(email).endsWith('@b2bnetwork.pl')
}

/**
 * Czy konto może wejść teraz. Sprawdzane przy każdym wejściu, nie tylko przy tworzeniu,
 * bo skrzynka może zniknąć z listy właściciela, a konto może wygasnąć.
 * Wyłączony przełącznik zostawia wyłącznie konta próbne na skrzynkach właściciela.
 */
export function learnerEntryDenial(
    account: Pick<LearnerAccount, 'email' | 'source' | 'access_until' | 'ended_at'>,
    options: { now?: Date; env?: NodeJS.ProcessEnv } = {},
): LearnerEntryDenial | null {
    const env = options.env ?? process.env
    const now = options.now ?? new Date()
    const email = normalizeLearnerEmail(account.email)
    // Tylko ASCII, tak jak bramka w bazie: inaczej znak podobny do litery udaje inną domenę.
    if (!/^[\x21-\x7E]+$/.test(email)) return 'invalid_email'
    if (isCompanyEmail(email)) return 'company_domain'
    if (account.ended_at) return 'ended'
    if (account.access_until && new Date(account.access_until).getTime() <= now.getTime()) return 'expired'
    const isTrial = account.source === 'proba'
    if (isTrial && !testRecipients(env).has(email)) return 'not_owner_mailbox'
    if (!isTrial && !isAcademySwitchOn('ACADEMY_PASS_ENABLED', env)) return 'pass_disabled'
    return null
}

async function findLearner(client: SupabaseClient, column: 'id' | 'email', value: string): Promise<LearnerAccount | null> {
    const { data, error } = await client.from('academy_learner_accounts').select(LEARNER_COLUMNS).eq(column, value).maybeSingle()
    if (error) {
        // Przed migracją kont nie ma, więc odpowiedź jest taka jak dla nieznanego konta.
        if (isMissingDatabaseObject(error)) return null
        throw new Error(`academy_learner_accounts read failed: ${error.code ?? 'unknown'}`)
    }
    return (data as LearnerAccount | null) ?? null
}

export function findLearnerAccountById(client: SupabaseClient, id: string): Promise<LearnerAccount | null> {
    return findLearner(client, 'id', id)
}

export function findLearnerAccountByEmail(client: SupabaseClient, email: string): Promise<LearnerAccount | null> {
    return findLearner(client, 'email', normalizeLearnerEmail(email))
}
