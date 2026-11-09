// Automat tożsamości kont nauki (B1.6). Czysta funkcja: porównuje aktywne umowy z migawki
// NEXUS z listą kont nauki i mówi, co należałoby zrobić. Bez dopasowań po nazwisku.
//
// Adres w migawce to adres kandydata z ATS, o niepotwierdzonej aktualności, a nie adres
// z umowy. Dlatego przełącznik zostaje wyłączony do czasu dopisania adresu z umowy po
// stronie NEXUSA (opis w docs/academy/czeka-na-wlasciciela.md, sekcja B1.6).

export const MAX_EXPIRIES_PER_RUN = 5

export interface SyncContract {
    nexus_candidate_id: number
    email: string | null
    name: string | null
    lastname: string | null
}

export interface SyncAccount {
    id: string
    email: string
    source: string | null
    source_ref: string | null
    disappeared_at: string | null
    ended_at: string | null
}

export interface LearnerSyncInsert {
    email: string
    full_name: string | null
    source: 'umowa'
    source_ref: string
}

export interface LearnerSyncCounts {
    contracts: number
    new: number
    expired: number
    returned: number
    conflicts: number
    no_email: number
    excluded_domain: number
}

export type LearnerSyncRefusal = 'empty_snapshot' | 'mass_expiry'

export interface LearnerSyncPlan {
    counts: LearnerSyncCounts
    inserts: LearnerSyncInsert[]
    expiredIds: string[]
    returnedIds: string[]
    refusal: LearnerSyncRefusal | null
}

function normalizedEmail(value: string | null): string | null {
    const email = value?.trim().toLowerCase() ?? ''
    return /^[\x21-\x7E]+@[\x21-\x7E]+$/.test(email) && email.split('@').length === 2 ? email : null
}

function fullName(contract: SyncContract): string | null {
    return [contract.name, contract.lastname].map(part => part?.trim()).filter(Boolean).join(' ') || null
}

export function planLearnerSync(
    contracts: readonly SyncContract[],
    accounts: readonly SyncAccount[],
    options: { confirmExpiries?: number } = {},
): LearnerSyncPlan {
    const counts: LearnerSyncCounts = { contracts: contracts.length, new: 0, expired: 0, returned: 0, conflicts: 0, no_email: 0, excluded_domain: 0 }
    const candidatesByEmail = new Map<string, Map<number, SyncContract>>()
    for (const contract of contracts) {
        const email = normalizedEmail(contract.email)
        if (!email) { counts.no_email += 1; continue }
        if (email.endsWith('@b2bnetwork.pl')) { counts.excluded_domain += 1; continue }
        const byCandidate = candidatesByEmail.get(email) ?? new Map<number, SyncContract>()
        if (!byCandidate.has(contract.nexus_candidate_id)) byCandidate.set(contract.nexus_candidate_id, contract)
        candidatesByEmail.set(email, byCandidate)
    }

    const accountByEmail = new Map(accounts.map(account => [account.email, account]))
    const inserts: LearnerSyncInsert[] = []
    const returnedIds: string[] = []
    const liveEmails = new Set<string>()

    for (const [email, byCandidate] of Array.from(candidatesByEmail)) {
        liveEmails.add(email)
        const account = accountByEmail.get(email)
        if (byCandidate.size > 1) { counts.conflicts += 1; continue }
        const [candidateId, contract] = Array.from(byCandidate)[0]
        if (account?.source === 'umowa' && account.source_ref && account.source_ref !== String(candidateId)) {
            counts.conflicts += 1
            continue
        }
        if (!account) {
            inserts.push({ email, full_name: fullName(contract), source: 'umowa', source_ref: String(candidateId) })
        } else if (account.source === 'umowa' && account.disappeared_at && !account.ended_at) {
            returnedIds.push(account.id)
        }
    }

    const expiredIds = accounts
        .filter(account => account.source === 'umowa' && !account.ended_at && !account.disappeared_at && !liveEmails.has(account.email))
        .map(account => account.id)

    counts.new = inserts.length
    counts.returned = returnedIds.length
    counts.expired = expiredIds.length

    // Pusta migawka to awaria eksportu, nie koniec wszystkich umów.
    if (contracts.length === 0) return { counts, inserts: [], expiredIds: [], returnedIds: [], refusal: 'empty_snapshot' }
    if (expiredIds.length > MAX_EXPIRIES_PER_RUN && options.confirmExpiries !== expiredIds.length) {
        return { counts, inserts: [], expiredIds: [], returnedIds: [], refusal: 'mass_expiry' }
    }
    return { counts, inserts, expiredIds, returnedIds, refusal: null }
}
