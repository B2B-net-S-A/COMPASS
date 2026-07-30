'use server'

import { logger, logCompat } from '@/lib/logger'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/admin'
import {
    requireInternalOrAdminAction,
    requireBonusProposerAction,
    requireBonusReadAllAction,
    requireFinanseOrAdminAction,
} from '@/lib/auth/internal-guard'
import { logAudit } from '@/lib/actions/audit'
import {
    sendBonusProposed,
    sendBonusCancelled,
    sendBonusAssigned,
    sendBonusUpdated,
    sendChampionsLeagueAssigned,
    sendChampionsLeagueCancelled,
} from '@/lib/email'
import { sendPushToUserId } from '@/lib/actions/push-subscriptions'
import { requireInvoicesEnabled } from '@/lib/feature-flags'
// Formularz premii ma w dropdownie klientów opcję „Inny (wpisz ręcznie)", więc nazwa może
// przyjść jako wolny tekst — kanonizujemy ją tak samo jak przy imporcie TC (Phase 42a),
// inaczej „NORDEA" wpisane z ręki znów rozbiłoby statystyki na dwa byty.
import { normalizeClientName } from '@/lib/contractors/name-normalization'
import type {
    BonusRow,
    BonusStatus,
    BonusCategory,
    BonusWithUsers,
    ProposeBonusInput,
    AssignBonusInput,
    UpdateBonusInput,
    EligibleEmployeeForBonus,
    CancelBonusInput,
    LinkBonusInput,
    BonusListFilter,
} from '@/lib/types/bonus'
import {
    BONUS_MIN_AMOUNT,
    BONUS_MAX_AMOUNT,
    BONUS_REASON_MIN_LENGTH,
    BONUS_REASON_MAX_LENGTH,
    BONUS_PERIOD_MAX_MONTHS_BACK,
    BONUS_MONTHS_PL,
    BONUS_ATTACHMENT_MAX_BYTES,
    BONUS_ATTACHMENT_ALLOWED_MIME,
    BONUS_CUSTOM_MEMO_MAX_LENGTH,
    BONUS_QUARTERS_PL,
    CHAMPIONS_LEAGUE_PLACE_LABELS_PL,
    CHAMPIONS_LEAGUE_PLACE_SHORT_PL,
    isQuarterInAllowedRange,
    recruiterTierForMargin,
} from '@/lib/types/bonus'

// ─── Validation ─────────────────────────────────────────────────────────────

function validateAmount(amount: number): void {
    if (!Number.isFinite(amount) || amount < BONUS_MIN_AMOUNT) {
        throw new Error(`Kwota musi być >= ${BONUS_MIN_AMOUNT}.`)
    }
    if (amount > BONUS_MAX_AMOUNT) {
        throw new Error(`Kwota za duża (max ${BONUS_MAX_AMOUNT}).`)
    }
}

function validateReason(reason: string): string {
    const trimmed = (reason ?? '').trim()
    if (trimmed.length < BONUS_REASON_MIN_LENGTH) {
        throw new Error(`Uzasadnienie musi mieć co najmniej ${BONUS_REASON_MIN_LENGTH} znaki.`)
    }
    if (trimmed.length > BONUS_REASON_MAX_LENGTH) {
        throw new Error(`Uzasadnienie za długie (max ${BONUS_REASON_MAX_LENGTH} znaków).`)
    }
    return trimmed
}

function validateCurrency(currency?: string): void {
    if (currency && !/^[A-Z]{3}$/.test(currency)) {
        throw new Error('Waluta musi być w formacie ISO (np. PLN, EUR).')
    }
}

function validateProposeInput(input: ProposeBonusInput): void {
    if (!input.recipient_user_id) throw new Error('Pracownik jest wymagany.')
    validateAmount(input.amount)
    validateReason(input.reason)
    validateCurrency(input.currency)
}

/** Phase 26 — period must be within past 12 months + current month (inclusive). */
function validatePeriod(year: number, month: number): void {
    if (!Number.isInteger(year) || year < 2020 || year > 2100) {
        throw new Error('Niepoprawny rok.')
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
        throw new Error('Niepoprawny miesiąc (1-12).')
    }
    const now = new Date()
    const target = new Date(year, month - 1, 1)
    const min = new Date(now.getFullYear(), now.getMonth() - BONUS_PERIOD_MAX_MONTHS_BACK, 1)
    const max = new Date(now.getFullYear(), now.getMonth(), 1)
    if (target < min || target > max) {
        throw new Error(
            `Okres musi mieścić się w ostatnich ${BONUS_PERIOD_MAX_MONTHS_BACK} miesiącach + bieżący.`,
        )
    }
}

function validateAssignInput(input: AssignBonusInput): void {
    if (!input.recipient_user_id) throw new Error('Pracownik jest wymagany.')
    validateAmount(input.amount)
    validateReason(input.reason)
    validateCurrency(input.currency)
    // Phase 31 — champions_league uses period_quarter zamiast period_month.
    if (input.category === 'champions_league') {
        validateChampionsLeagueInput(input.period_year, input.period_quarter, input.place_rank)
    } else {
        validatePeriod(input.period_year, input.period_month)
    }
    validateCategoryFields(input)
}

/** Phase 31 — walidacja kwartału i miejsca dla champions_league. */
function validateChampionsLeagueInput(year: number, quarter: number, placeRank: number): void {
    if (!Number.isInteger(year) || year < 2020 || year > 2100) {
        throw new Error('Niepoprawny rok.')
    }
    if (!Number.isInteger(quarter) || quarter < 1 || quarter > 4) {
        throw new Error('Niepoprawny kwartał (1-4).')
    }
    if (!Number.isInteger(placeRank) || placeRank < 1 || placeRank > 3) {
        throw new Error('Niepoprawne miejsce (1, 2 lub 3).')
    }
    if (!isQuarterInAllowedRange(year, quarter as 1 | 2 | 3 | 4)) {
        throw new Error('Kwartał musi mieścić się w ostatnich 4 kwartałach + bieżący.')
    }
}

/** Phase 27d — validate client name (shared across sales/delivery/recruiter). */
function validateClientName(name: string | undefined | null): void {
    const client = (name ?? '').trim()
    if (client.length < 2) {
        throw new Error('Klient: minimum 2 znaki.')
    }
}

/** Phase 27b/d — per-category field validation. */
function validateCategoryFields(input: AssignBonusInput): void {
    switch (input.category) {
        case 'sales': {
            validateClientName(input.client_name)
            const desc = (input.sales_service_description ?? '').trim()
            if (desc.length < 3) {
                throw new Error('Opis usługi: minimum 3 znaki.')
            }
            break
        }
        case 'delivery_lead': {
            validateClientName(input.client_name)
            const candidate = (input.delivery_candidate_name ?? '').trim()
            if (candidate.length < 3) {
                throw new Error('Imię i nazwisko kandydata: minimum 3 znaki.')
            }
            if (!Number.isFinite(input.delivery_margin_amount) || input.delivery_margin_amount <= 0) {
                throw new Error('Marża miesięczna musi być > 0.')
            }
            if (input.delivery_margin_percent !== undefined) {
                if (
                    !Number.isFinite(input.delivery_margin_percent) ||
                    input.delivery_margin_percent < 0 ||
                    input.delivery_margin_percent > 100
                ) {
                    throw new Error('Procent premii musi być w zakresie 0-100.')
                }
            }
            break
        }
        case 'recruiter': {
            validateClientName(input.client_name)
            if (
                !Number.isFinite(input.recruiter_margin_per_hour) ||
                input.recruiter_margin_per_hour < 0
            ) {
                throw new Error('Marża rekrutera (PLN/h) musi być >= 0.')
            }
            const candidate = (input.recruiter_candidate_name ?? '').trim()
            if (candidate.length < 3) {
                throw new Error('Imię i nazwisko kandydata: minimum 3 znaki.')
            }
            break
        }
        case 'custom': {
            const memo = (input.custom_email_memo ?? '').trim()
            if (memo.length < 1) {
                // DB CHECK requires custom_email_memo OR attachment_path; attachment is uploaded
                // in a second step after insert, so memo must be present on initial insert.
                throw new Error('Memo opisujące premię niestandardową jest wymagane (możesz też dodać załącznik po zapisaniu).')
            }
            if (memo.length > BONUS_CUSTOM_MEMO_MAX_LENGTH) {
                throw new Error(`Memo za długie (max ${BONUS_CUSTOM_MEMO_MAX_LENGTH} znaków).`)
            }
            break
        }
        case 'champions_league': {
            // Period+place już zwalidowane w validateChampionsLeagueInput (przed tym wywołaniem).
            // Tu nic dodatkowego do sprawdzania (amount domyślny pobiera klient z CHAMPIONS_LEAGUE_AMOUNTS).
            break
        }
        default: {
            // Exhaustive check.
            const _exhaustive: never = input
            throw new Error(`Nieznana kategoria premii: ${(_exhaustive as { category: string }).category}`)
        }
    }
}

function periodLabelPl(year: number, month: number): string {
    return `${BONUS_MONTHS_PL[month - 1]} ${year}`
}

/** Phase 31 — etykieta kwartału dla emaila / notyfikacji (np. "Q1 2026"). */
function quarterLabelPl(year: number, quarter: 1 | 2 | 3 | 4): string {
    return `${BONUS_QUARTERS_PL[quarter - 1]} ${year}`
}

/** Phase 27b/d + 31 — extract per-category columns from input for INSERT. */
function buildCategoryInsertPayload(input: AssignBonusInput): Record<string, unknown> {
    switch (input.category) {
        case 'sales':
            return {
                client_name: normalizeClientName(input.client_name),
                sales_service_description: input.sales_service_description.trim(),
            }
        case 'delivery_lead':
            return {
                client_name: normalizeClientName(input.client_name),
                delivery_candidate_name: input.delivery_candidate_name.trim(),
                delivery_margin_amount: input.delivery_margin_amount,
                delivery_margin_percent: input.delivery_margin_percent ?? 10.0,
            }
        case 'recruiter': {
            const tier = recruiterTierForMargin(input.recruiter_margin_per_hour)
            return {
                client_name: normalizeClientName(input.client_name),
                recruiter_margin_per_hour: input.recruiter_margin_per_hour,
                recruiter_candidate_name: input.recruiter_candidate_name.trim(),
                recruiter_calculated_tier: tier?.tier ?? null,
            }
        }
        case 'custom':
            return {
                custom_email_memo: input.custom_email_memo?.trim() || null,
            }
        case 'champions_league':
            // Period_quarter, place_rank, period_month=NULL ustawiane w assignBonus przez periodFields.
            // Tu kategoria nie ma typed columns oprócz period_quarter/place_rank.
            return {}
    }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function fetchRecipientContact(userId: string): Promise<{
    email: string
    full_name: string | null
    manager_id: string | null
} | null> {
    const admin = createServiceClient()
    const { data } = await admin
        .from('profiles')
        .select('email, full_name, manager_id')
        .eq('id', userId)
        .single<{ email: string | null; full_name: string | null; manager_id: string | null }>()
    if (!data?.email) return null
    return { email: data.email, full_name: data.full_name, manager_id: data.manager_id }
}

async function fetchUserDisplayName(userId: string, fallback: string): Promise<string> {
    const admin = createServiceClient()
    const { data } = await admin
        .from('profiles')
        .select('full_name')
        .eq('id', userId)
        .single<{ full_name: string | null }>()
    return data?.full_name ?? fallback
}

function truncate(text: string, max: number): string {
    return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

type NotifyKind = 'proposed' | 'cancelled' | 'assigned' | 'updated'

// Fire all 3 notification channels in parallel. One failure doesn't block others.
async function notifyRecipient(args: {
    recipientId: string
    recipientEmail: string
    recipientName: string
    proposerName: string
    bonusId: string
    amount: number
    currency: string
    reason: string
    kind: NotifyKind
    cancellationReason?: string
    periodYear?: number
    periodMonth?: number
    changesSummary?: string
}): Promise<void> {
    const supabase = createServiceClient()

    const periodLabel = args.periodYear && args.periodMonth
        ? periodLabelPl(args.periodYear, args.periodMonth)
        : null

    let titlePl: string
    let titleEn: string
    let bodyPl: string
    let notificationType: 'bonus_proposed' | 'bonus_cancelled' | 'bonus_assigned' | 'bonus_updated'

    switch (args.kind) {
        case 'assigned':
            titlePl = periodLabel
                ? `Otrzymałeś premię za ${periodLabel}`
                : 'Otrzymałeś premię'
            titleEn = periodLabel
                ? `You received a bonus for ${periodLabel}`
                : 'You received a bonus'
            bodyPl = `${args.amount.toFixed(2)} ${args.currency} — ${truncate(args.reason, 120)}`
            notificationType = 'bonus_assigned'
            break
        case 'updated':
            titlePl = periodLabel
                ? `Zaktualizowano premię za ${periodLabel}`
                : 'Zaktualizowano premię'
            titleEn = periodLabel
                ? `Bonus updated for ${periodLabel}`
                : 'Bonus updated'
            bodyPl = `${args.amount.toFixed(2)} ${args.currency} — ${truncate(args.changesSummary ?? args.reason, 120)}`
            notificationType = 'bonus_updated'
            break
        case 'cancelled':
            titlePl = periodLabel
                ? `Anulowano premię za ${periodLabel}`
                : 'Premia została anulowana'
            titleEn = periodLabel
                ? `Bonus cancelled for ${periodLabel}`
                : 'Bonus cancelled'
            bodyPl = `${args.amount.toFixed(2)} ${args.currency} — ${truncate(args.cancellationReason ?? '', 120)}`
            notificationType = 'bonus_cancelled'
            break
        case 'proposed':
        default:
            titlePl = 'Masz nową premię'
            titleEn = 'New bonus assigned'
            bodyPl = `${args.amount.toFixed(2)} ${args.currency} — ${truncate(args.reason, 120)}`
            notificationType = 'bonus_proposed'
            break
    }
    const bodyEn = bodyPl

    // 1. In-app notification (Supabase notifications table via RPC).
    const inAppPromise = supabase.rpc('create_notification', {
        p_user_id: args.recipientId,
        p_type: notificationType,
        p_title_pl: titlePl,
        p_title_en: titleEn,
        p_body_pl: bodyPl,
        p_body_en: bodyEn,
        p_action_url: '/internal?tab=bonuses',
        p_priority: 'normal',
    })

    // 2. Email (Microsoft Graph fallback Resend).
    let emailPromise: Promise<{ success: boolean }>
    switch (args.kind) {
        case 'assigned':
            emailPromise = sendBonusAssigned(
                args.recipientEmail,
                args.recipientName,
                args.proposerName,
                args.amount,
                args.currency,
                args.periodYear ?? new Date().getFullYear(),
                args.periodMonth ?? new Date().getMonth() + 1,
                args.reason,
            )
            break
        case 'updated':
            emailPromise = sendBonusUpdated(
                args.recipientEmail,
                args.recipientName,
                args.proposerName,
                args.amount,
                args.currency,
                args.periodYear ?? new Date().getFullYear(),
                args.periodMonth ?? new Date().getMonth() + 1,
                args.reason,
                args.changesSummary,
            )
            break
        case 'cancelled':
            emailPromise = sendBonusCancelled(
                args.recipientEmail,
                args.recipientName,
                args.proposerName,
                args.amount,
                args.currency,
                args.cancellationReason ?? 'Brak podanego powodu.',
            )
            break
        case 'proposed':
        default:
            emailPromise = sendBonusProposed(
                args.recipientEmail,
                args.recipientName,
                args.proposerName,
                args.amount,
                args.currency,
                args.reason,
            )
            break
    }

    // 3. Web push (best-effort, recipient must have subscription).
    const pushPromise = sendPushToUserId(args.recipientId, {
        title: titlePl,
        body: bodyPl,
        url: '/internal?tab=bonuses',
        tag: `bonus-${args.kind}-${args.bonusId}`,
    }).catch((err) => {
        logCompat.error('Bonus push notification failed:', err)
        return { sent: 0, failed: 1 }
    })

    const results = await Promise.allSettled([inAppPromise, emailPromise, pushPromise])
    const channels = ['in_app', 'email', 'push'] as const
    results.forEach((r, idx) => {
        if (r.status === 'rejected') {
            logger.error({
                event: 'bonus.notify.channel_failed',
                channel: channels[idx],
                bonus_id: args.bonusId,
                kind: args.kind,
                error: r.reason,
            })
        }
    })
}

// ─── Phase 31 — Champions League notifications (osobny helper) ──────────────

type ChampionsLeagueNotifyKind = 'assigned' | 'cancelled'

/**
 * Phase 31 — multi-channel notification dla Champions League.
 * Trzy kanały (in-app + email + push) z accent złotym, period kwartalne.
 */
async function notifyChampionsLeagueRecipient(args: {
    recipientId: string
    recipientEmail: string
    recipientName: string
    proposerName: string
    bonusId: string
    amount: number
    currency: string
    reason: string
    periodYear: number
    periodQuarter: 1 | 2 | 3 | 4
    placeRank: 1 | 2 | 3
    kind: ChampionsLeagueNotifyKind
    cancellationReason?: string
}): Promise<void> {
    const supabase = createServiceClient()
    const quarterLabel = quarterLabelPl(args.periodYear, args.periodQuarter)
    const placeLabel = CHAMPIONS_LEAGUE_PLACE_LABELS_PL[args.placeRank]

    const isCancelled = args.kind === 'cancelled'
    const titlePl = isCancelled
        ? `Anulowano premię Champions League — ${placeLabel} (${quarterLabel})`
        : `🏆 Champions League ${quarterLabel} — ${placeLabel}`
    const titleEn = isCancelled
        ? `Champions League bonus cancelled — ${quarterLabel}`
        : `🏆 Champions League ${quarterLabel} — place ${args.placeRank}`
    const bodyPl = isCancelled
        ? `${args.amount.toFixed(2)} ${args.currency} — ${truncate(args.cancellationReason ?? args.reason, 120)}`
        : `${args.amount.toFixed(2)} ${args.currency} — ${truncate(args.reason, 120)}`

    // 1. In-app — używamy bonus_assigned/bonus_cancelled przy cancel (typ champions_league_cancelled
    //    nie istnieje w notifications_type_check), assigned używa nowego typu Phase 31.
    const inAppType = isCancelled ? 'bonus_cancelled' : 'champions_league_assigned'
    const inAppPromise = supabase.rpc('create_notification', {
        p_user_id: args.recipientId,
        p_type: inAppType,
        p_title_pl: titlePl,
        p_title_en: titleEn,
        p_body_pl: bodyPl,
        p_body_en: bodyPl,
        p_action_url: '/internal?tab=bonuses',
        p_priority: 'normal',
    })

    // 2. Email — accent złoty (#EAB308).
    const emailPromise = isCancelled
        ? sendChampionsLeagueCancelled(
              args.recipientEmail,
              args.recipientName,
              args.proposerName,
              args.amount,
              args.currency,
              args.periodYear,
              args.periodQuarter,
              args.placeRank,
              args.cancellationReason ?? 'Brak podanego powodu.',
          )
        : sendChampionsLeagueAssigned(
              args.recipientEmail,
              args.recipientName,
              args.proposerName,
              args.amount,
              args.currency,
              args.periodYear,
              args.periodQuarter,
              args.placeRank,
              args.reason,
          )

    // 3. Web push.
    const pushPromise = sendPushToUserId(args.recipientId, {
        title: titlePl,
        body: bodyPl,
        url: '/internal?tab=bonuses',
        tag: `champions-league-${args.kind}-${args.bonusId}`,
    }).catch((err) => {
        logCompat.error('Champions League push failed:', err)
        return { sent: 0, failed: 1 }
    })

    const results = await Promise.allSettled([inAppPromise, emailPromise, pushPromise])
    const channels = ['in_app', 'email', 'push'] as const
    results.forEach((r, idx) => {
        if (r.status === 'rejected') {
            logger.error({
                event: 'champions_league.notify.channel_failed',
                channel: channels[idx],
                bonus_id: args.bonusId,
                kind: args.kind,
                error: r.reason,
            })
        }
    })
}

// ─── User-side (recipient) ──────────────────────────────────────────────────

export async function listMyBonuses(filter?: { status?: BonusStatus }): Promise<BonusWithUsers[]> {
    const ctx = await requireInternalOrAdminAction()
    const supabase = createClient()

    let q = supabase
        .from('bonuses')
        .select('*')
        .eq('recipient_user_id', ctx.userId)
        .order('created_at', { ascending: false })

    if (filter?.status) q = q.eq('status', filter.status)

    const { data, error } = await q
    if (error) throw new Error(`Błąd pobierania premii: ${error.message}`)

    return enrichBonusesWithUsers((data ?? []) as BonusRow[])
}

/** @deprecated Phase 26 — invoice link path disabled. Gated by INVOICES_ENABLED. */
export async function linkBonusToInvoice(input: LinkBonusInput): Promise<BonusRow> {
    requireInvoicesEnabled()
    const ctx = await requireInternalOrAdminAction()
    if (!input.id || !input.invoice_id) {
        throw new Error('Brak id premii lub id faktury.')
    }

    const supabase = createClient()
    // Verify recipient owns this bonus + bonus is pending.
    const { data: bonus, error: fetchErr } = await supabase
        .from('bonuses')
        .select('*')
        .eq('id', input.id)
        .single<BonusRow>()
    if (fetchErr || !bonus) throw new Error('Premia nie znaleziona.')
    if (bonus.recipient_user_id !== ctx.userId) {
        throw new Error('Możesz linkować tylko swoje premie.')
    }
    if (bonus.status !== 'pending') {
        throw new Error(`Premia w statusie "${bonus.status}" — link tylko dla "pending".`)
    }

    // Verify invoice belongs to current user (defense-in-depth; trigger też sprawdza).
    const { data: invoice, error: invErr } = await supabase
        .from('invoices')
        .select('id, user_id, invoice_number')
        .eq('id', input.invoice_id)
        .single<{ id: string; user_id: string; invoice_number: string }>()
    if (invErr || !invoice) throw new Error('Faktura nie znaleziona.')
    if (invoice.user_id !== ctx.userId) throw new Error('To nie Twoja faktura.')

    const { data: updated, error: updErr } = await supabase
        .from('bonuses')
        .update({
            linked_invoice_id: input.invoice_id,
            status: 'paid',
        })
        .eq('id', input.id)
        .select('*')
        .single<BonusRow>()
    if (updErr || !updated) throw new Error(`Błąd linkowania premii: ${updErr?.message}`)

    await logAudit(ctx.userId, 'BONUS_LINKED_TO_INVOICE', {
        bonus_id: updated.id,
        invoice_id: input.invoice_id,
        invoice_number: invoice.invoice_number,
        amount: Number(updated.amount),
        currency: updated.currency,
    })

    // Notify proposer (optional, low priority).
    try {
        const admin = createServiceClient()
        await admin.rpc('create_notification', {
            p_user_id: updated.proposed_by,
            p_type: 'bonus_linked',
            p_title_pl: 'Premia zlinkowana z fakturą',
            p_title_en: 'Bonus linked to invoice',
            p_body_pl: `Pracownik zlinkował premię ${Number(updated.amount).toFixed(2)} ${updated.currency} z fakturą ${invoice.invoice_number}.`,
            p_body_en: `Employee linked bonus ${Number(updated.amount).toFixed(2)} ${updated.currency} to invoice ${invoice.invoice_number}.`,
            p_action_url: '/internal/admin?tab=bonuses',
            p_priority: 'low',
        })
    } catch (err) {
        logger.error({ event: 'bonus.link.notify_proposer_failed', error: err, bonus_id: updated.id })
    }

    return updated
}

/** @deprecated Phase 26 — invoice link path disabled. Gated by INVOICES_ENABLED. */
export async function unlinkBonus(id: string): Promise<BonusRow> {
    requireInvoicesEnabled()
    const ctx = await requireInternalOrAdminAction()
    const supabase = createClient()

    const { data: bonus, error: fetchErr } = await supabase
        .from('bonuses')
        .select('*')
        .eq('id', id)
        .single<BonusRow>()
    if (fetchErr || !bonus) throw new Error('Premia nie znaleziona.')
    if (bonus.recipient_user_id !== ctx.userId && !ctx.isAdmin) {
        throw new Error('Brak uprawnień do odlinkowania tej premii.')
    }
    if (bonus.status !== 'paid') {
        throw new Error(`Można odlinkować tylko premię w statusie "paid" (jest: "${bonus.status}").`)
    }

    const { data: updated, error: updErr } = await supabase
        .from('bonuses')
        .update({
            linked_invoice_id: null,
            status: 'pending',
        })
        .eq('id', id)
        .select('*')
        .single<BonusRow>()
    if (updErr || !updated) throw new Error(`Błąd odlinkowania: ${updErr?.message}`)

    await logAudit(ctx.userId, 'BONUS_UNLINKED', {
        bonus_id: updated.id,
        previous_invoice_id: bonus.linked_invoice_id,
        amount: Number(updated.amount),
        currency: updated.currency,
    })

    return updated
}

// ─── Proposer-side (manager/admin) ──────────────────────────────────────────

/** @deprecated Phase 26 — use assignBonus. proposeBonus inserts status='pending' which trigger rejects after migration. Gated by INVOICES_ENABLED. */
export async function proposeBonus(input: ProposeBonusInput): Promise<BonusRow> {
    requireInvoicesEnabled()
    const ctx = await requireBonusProposerAction()
    validateProposeInput(input)
    if (input.recipient_user_id === ctx.userId) {
        throw new Error('Nie można proponować premii dla siebie.')
    }

    // Team scope check (manager only; admin can propose for anyone).
    if (!ctx.isAdmin) {
        const recipient = await fetchRecipientContact(input.recipient_user_id)
        if (!recipient) throw new Error('Odbiorca premii nie znaleziony.')
        if (recipient.manager_id !== ctx.userId) {
            throw new Error('Możesz proponować premie tylko dla swoich podwładnych.')
        }
    }

    const supabase = createClient()
    const { data: inserted, error } = await supabase
        .from('bonuses')
        .insert({
            recipient_user_id: input.recipient_user_id,
            proposed_by: ctx.userId,
            amount: input.amount,
            currency: input.currency ?? 'PLN',
            reason: input.reason.trim(),
            notes: input.notes ?? null,
        })
        .select('*')
        .single<BonusRow>()
    if (error || !inserted) throw new Error(`Błąd dodawania premii: ${error?.message}`)

    await logAudit(ctx.userId, 'BONUS_PROPOSED', {
        bonus_id: inserted.id,
        recipient_user_id: inserted.recipient_user_id,
        amount: Number(inserted.amount),
        currency: inserted.currency,
        reason: inserted.reason,
    })

    // Fire-and-forget notifications (don't block response on email/push failure).
    const recipient = await fetchRecipientContact(input.recipient_user_id)
    if (recipient?.email) {
        const proposerName = await fetchUserDisplayName(ctx.userId, ctx.email)
        await notifyRecipient({
            recipientId: input.recipient_user_id,
            recipientEmail: recipient.email,
            recipientName: recipient.full_name ?? 'Pracownik',
            proposerName,
            bonusId: inserted.id,
            amount: Number(inserted.amount),
            currency: inserted.currency,
            reason: inserted.reason,
            kind: 'proposed',
        })
    }

    return inserted
}

export async function cancelBonus(input: CancelBonusInput): Promise<BonusRow> {
    // Admin/finanse: anulują dowolną premię.
    // Manager: anuluje tylko premie które sam przypisał (proposed_by = ctx.userId).
    const ctx = await requireInternalOrAdminAction()
    if (!ctx.isAdmin && ctx.role !== 'finanse' && !ctx.isManager) {
        throw new Error('Wymagane uprawnienia: administrator, finanse lub manager.')
    }
    if (!input.id) throw new Error('Brak id premii.')
    const cancellationReason = (input.cancellation_reason ?? '').trim()
    if (cancellationReason.length < 3) {
        throw new Error('Powód anulowania musi mieć co najmniej 3 znaki.')
    }
    if (cancellationReason.length > 500) {
        throw new Error('Powód anulowania za długi (max 500 znaków).')
    }

    const supabase = createClient()
    const { data: bonus, error: fetchErr } = await supabase
        .from('bonuses')
        .select('*')
        .eq('id', input.id)
        .single<BonusRow>()
    if (fetchErr || !bonus) throw new Error('Premia nie znaleziona.')

    if (!ctx.isAdmin && ctx.role !== 'finanse' && bonus.proposed_by !== ctx.userId) {
        throw new Error('Manager może anulować tylko premie, które sam przypisał.')
    }

    // Status must be assigned or pending (legacy).
    if (bonus.status !== 'assigned' && bonus.status !== 'pending') {
        throw new Error(
            `Można anulować tylko premie w statusie "assigned" lub "pending" (jest: "${bonus.status}").`,
        )
    }

    // Service-client write: bonuses UPDATE RLS is proposer/admin-only, so finanse
    // must go through the service client. The DB stage-transition trigger still
    // enforces a valid transition.
    const admin = createServiceClient()
    const { data: updated, error: updErr } = await admin
        .from('bonuses')
        .update({
            status: 'cancelled',
            cancelled_by: ctx.userId,
            cancellation_reason: cancellationReason,
        })
        .eq('id', input.id)
        .select('*')
        .single<BonusRow>()
    if (updErr || !updated) throw new Error(`Błąd anulowania: ${updErr?.message}`)

    const isChampionsLeague = updated.category === 'champions_league'
    const auditAction = isChampionsLeague ? 'CHAMPIONS_LEAGUE_CANCELLED' : 'BONUS_CANCELLED'
    await logAudit(ctx.userId, auditAction, {
        bonus_id: updated.id,
        recipient_user_id: updated.recipient_user_id,
        amount: Number(updated.amount),
        currency: updated.currency,
        cancellation_reason: cancellationReason,
        period_year: updated.period_year,
        period_month: updated.period_month,
        period_quarter: updated.period_quarter,
        place_rank: updated.place_rank,
        category: updated.category,
    })

    // Notify recipient.
    const recipient = await fetchRecipientContact(updated.recipient_user_id)
    if (recipient?.email) {
        const proposerName = await fetchUserDisplayName(ctx.userId, ctx.email)
        if (isChampionsLeague && updated.period_quarter && updated.place_rank) {
            await notifyChampionsLeagueRecipient({
                recipientId: updated.recipient_user_id,
                recipientEmail: recipient.email,
                recipientName: recipient.full_name ?? 'Pracownik',
                proposerName,
                bonusId: updated.id,
                amount: Number(updated.amount),
                currency: updated.currency,
                reason: updated.reason,
                periodYear: updated.period_year ?? new Date().getFullYear(),
                periodQuarter: updated.period_quarter as 1 | 2 | 3 | 4,
                placeRank: updated.place_rank as 1 | 2 | 3,
                kind: 'cancelled',
                cancellationReason,
            })
        } else {
            await notifyRecipient({
                recipientId: updated.recipient_user_id,
                recipientEmail: recipient.email,
                recipientName: recipient.full_name ?? 'Pracownik',
                proposerName,
                bonusId: updated.id,
                amount: Number(updated.amount),
                currency: updated.currency,
                reason: updated.reason,
                kind: 'cancelled',
                cancellationReason,
                periodYear: updated.period_year ?? undefined,
                periodMonth: updated.period_month ?? undefined,
            })
        }
    }

    return updated
}

// ─── Phase 26 — assignBonus (primary new path) ──────────────────────────────

/**
 * Phase 26 — manager przypisuje premię z auto-akceptem (status='assigned', terminal).
 *
 * Manager scope: tylko bezpośredni podwładni (profiles.manager_id = ctx.userId).
 * Admin: anyone.
 *
 * Period: past 12 months + current. Walidowane server-side.
 * Duplicate: UNIQUE (recipient_user_id, period_year, period_month) WHERE status='assigned' — DB enforce.
 */
export async function assignBonus(input: AssignBonusInput): Promise<BonusRow> {
    const ctx = await requireBonusProposerAction()
    validateAssignInput(input)
    if (input.recipient_user_id === ctx.userId) {
        throw new Error('Nie możesz przypisać premii samemu sobie.')
    }

    // Team scope check (manager only).
    if (!ctx.isAdmin) {
        const recipient = await fetchRecipientContact(input.recipient_user_id)
        if (!recipient) throw new Error('Odbiorca premii nie znaleziony.')
        if (recipient.manager_id !== ctx.userId) {
            throw new Error('Możesz przypisać premię tylko swoim bezpośrednim podwładnym.')
        }
    }

    const supabase = createClient()
    const reason = (input.reason ?? '').trim()

    // Phase 27b — build per-category insert payload.
    const categoryPayload = buildCategoryInsertPayload(input)

    // Phase 31 — period_year zawsze; reszta zależy od kategorii (miesiąc vs kwartał).
    const isChampionsLeague = input.category === 'champions_league'
    const periodFields = isChampionsLeague
        ? {
            period_year: input.period_year,
            period_month: null as number | null,
            period_quarter: input.period_quarter,
            place_rank: input.place_rank,
        }
        : {
            period_year: input.period_year,
            period_month: input.period_month,
            period_quarter: null as number | null,
            place_rank: null as number | null,
        }

    const { data: inserted, error } = await supabase
        .from('bonuses')
        .insert({
            recipient_user_id: input.recipient_user_id,
            proposed_by: ctx.userId,
            amount: input.amount,
            currency: input.currency ?? 'PLN',
            reason,
            notes: input.notes ?? null,
            status: 'assigned',
            category: input.category,
            ...periodFields,
            ...categoryPayload,
        })
        .select('*')
        .single<BonusRow>()

    if (error || !inserted) {
        // Phase 31 — friendly error przy konflikcie partial UNIQUE dla champions_league.
        if (
            isChampionsLeague &&
            error?.code === '23505' &&
            (error.message?.includes('bonuses_champions_league_unique') ?? false)
        ) {
            const existingWinnerName = await findChampionsLeagueWinnerName(
                input.period_year,
                input.period_quarter,
                input.place_rank,
            )
            const placeLabel = CHAMPIONS_LEAGUE_PLACE_SHORT_PL[input.place_rank]
            const quarterLabel = quarterLabelPl(input.period_year, input.period_quarter)
            const occupiedBy = existingWinnerName ? ` przez ${existingWinnerName}` : ''
            throw new Error(
                `${placeLabel} miejsce w ${quarterLabel} jest już zajęte${occupiedBy}. Najpierw anuluj poprzednią premię.`,
            )
        }
        throw new Error(`Błąd przypisania premii: ${error?.message}`)
    }

    // Phase 31 — osobny action type dla audytu CL ułatwia filtrowanie.
    const auditAction = isChampionsLeague ? 'CHAMPIONS_LEAGUE_ASSIGNED' : 'BONUS_ASSIGNED'
    await logAudit(ctx.userId, auditAction, {
        bonus_id: inserted.id,
        recipient_user_id: inserted.recipient_user_id,
        amount: Number(inserted.amount),
        currency: inserted.currency,
        reason: inserted.reason,
        period_year: inserted.period_year,
        period_month: inserted.period_month,
        period_quarter: inserted.period_quarter,
        place_rank: inserted.place_rank,
        category: inserted.category,
    })

    const recipient = await fetchRecipientContact(input.recipient_user_id)
    if (recipient?.email) {
        const proposerName = await fetchUserDisplayName(ctx.userId, ctx.email)
        if (isChampionsLeague) {
            await notifyChampionsLeagueRecipient({
                recipientId: input.recipient_user_id,
                recipientEmail: recipient.email,
                recipientName: recipient.full_name ?? 'Pracownik',
                proposerName,
                bonusId: inserted.id,
                amount: Number(inserted.amount),
                currency: inserted.currency,
                reason: inserted.reason,
                periodYear: inserted.period_year ?? input.period_year,
                periodQuarter: (inserted.period_quarter ?? input.period_quarter) as 1 | 2 | 3 | 4,
                placeRank: (inserted.place_rank ?? input.place_rank) as 1 | 2 | 3,
                kind: 'assigned',
            })
        } else {
            await notifyRecipient({
                recipientId: input.recipient_user_id,
                recipientEmail: recipient.email,
                recipientName: recipient.full_name ?? 'Pracownik',
                proposerName,
                bonusId: inserted.id,
                amount: Number(inserted.amount),
                currency: inserted.currency,
                reason: inserted.reason,
                kind: 'assigned',
                periodYear: inserted.period_year ?? undefined,
                periodMonth: inserted.period_month ?? undefined,
            })
        }
    }

    return inserted
}

/** Phase 31 — lookup full_name istniejącego zwycięzcy CL dla friendly error przy konflikcie UNIQUE. */
async function findChampionsLeagueWinnerName(
    year: number,
    quarter: 1 | 2 | 3 | 4,
    placeRank: 1 | 2 | 3,
): Promise<string | null> {
    const admin = createServiceClient()
    const { data } = await admin
        .from('bonuses')
        .select('recipient_user_id')
        .eq('category', 'champions_league')
        .eq('status', 'assigned')
        .eq('period_year', year)
        .eq('period_quarter', quarter)
        .eq('place_rank', placeRank)
        .maybeSingle<{ recipient_user_id: string }>()
    if (!data?.recipient_user_id) return null
    const { data: profile } = await admin
        .from('profiles')
        .select('full_name, email')
        .eq('id', data.recipient_user_id)
        .single<{ full_name: string | null; email: string }>()
    return profile?.full_name ?? profile?.email ?? null
}

/**
 * Phase 26 — edit existing assigned bonus (amount/reason/notes).
 * Period + recipient są immutable (DB trigger guard).
 */
export async function updateBonus(input: UpdateBonusInput): Promise<BonusRow> {
    // Phase 32 — po przypisaniu premię może edytować TYLKO administrator lub finanse
    // (manager traci prawo po assign — patrz cancelBonus comment).
    const ctx = await requireFinanseOrAdminAction()
    if (!input.id) throw new Error('Brak id premii.')

    const hasAmount = input.amount !== undefined
    const hasReason = input.reason !== undefined
    const hasNotes = input.notes !== undefined
    // Phase 32 — period correction (finanse/admin). Oba pola wymagane razem.
    const hasPeriod = input.period_year !== undefined || input.period_month !== undefined
    if (hasPeriod && (input.period_year === undefined || input.period_month === undefined)) {
        throw new Error('Aby zmienić miesiąc premii, podaj rok i miesiąc.')
    }
    if (!hasAmount && !hasReason && !hasNotes && !hasPeriod) {
        throw new Error('Brak zmian do zapisania.')
    }

    if (hasAmount) validateAmount(input.amount as number)
    if (hasPeriod) validatePeriod(input.period_year as number, input.period_month as number)
    const trimmedReason = hasReason ? validateReason(input.reason as string) : undefined

    const supabase = createClient()
    const { data: bonus, error: fetchErr } = await supabase
        .from('bonuses')
        .select('*')
        .eq('id', input.id)
        .single<BonusRow>()
    if (fetchErr || !bonus) throw new Error('Premia nie znaleziona.')
    if (bonus.status !== 'assigned') {
        throw new Error(
            `Można edytować tylko premie w statusie "assigned" (jest: "${bonus.status}").`,
        )
    }

    const patch: Partial<BonusRow> = {}
    if (hasAmount) patch.amount = input.amount as number
    if (hasReason) patch.reason = trimmedReason as string
    if (hasNotes) patch.notes = input.notes ?? null
    if (hasPeriod) {
        // Champions League ma okres kwartalny (period_quarter) i edytuje się osobnym
        // formularzem — tu blokujemy zmianę miesiąca dla CL (defensywnie, UI i tak nie wysyła).
        if (bonus.category === 'champions_league') {
            throw new Error(
                'Okres premii Champions League zmienia się przez osobny formularz (kwartał + miejsce).',
            )
        }
        patch.period_year = input.period_year as number
        patch.period_month = input.period_month as number
    }

    // Service-client write: a recipient's manager who is not the proposer is
    // blocked by the bonuses UPDATE RLS (proposer/admin only) but is authorized
    // above. The DB stage-transition trigger still enforces a valid transition.
    const admin = createServiceClient()
    const { data: updated, error: updErr } = await admin
        .from('bonuses')
        .update(patch)
        .eq('id', input.id)
        .select('*')
        .single<BonusRow>()
    if (updErr || !updated) throw new Error(`Błąd edycji premii: ${updErr?.message}`)

    // Build changes summary for audit + notification.
    const changes: Record<string, [unknown, unknown]> = {}
    if (hasAmount && Number(bonus.amount) !== Number(updated.amount)) {
        changes.amount = [Number(bonus.amount), Number(updated.amount)]
    }
    if (hasReason && bonus.reason !== updated.reason) {
        changes.reason = [bonus.reason, updated.reason]
    }
    if (hasNotes && (bonus.notes ?? null) !== (updated.notes ?? null)) {
        changes.notes = [bonus.notes, updated.notes]
    }
    if (
        hasPeriod &&
        (Number(bonus.period_year) !== Number(updated.period_year) ||
            Number(bonus.period_month) !== Number(updated.period_month))
    ) {
        changes.period = [
            `${bonus.period_year}-${String(bonus.period_month).padStart(2, '0')}`,
            `${updated.period_year}-${String(updated.period_month).padStart(2, '0')}`,
        ]
    }

    const isChampionsLeague = updated.category === 'champions_league'
    const auditAction = isChampionsLeague ? 'CHAMPIONS_LEAGUE_UPDATED' : 'BONUS_UPDATED'
    await logAudit(ctx.userId, auditAction, {
        bonus_id: updated.id,
        recipient_user_id: updated.recipient_user_id,
        period_year: updated.period_year,
        period_month: updated.period_month,
        period_quarter: updated.period_quarter,
        place_rank: updated.place_rank,
        category: updated.category,
        changes,
    })

    const recipient = await fetchRecipientContact(updated.recipient_user_id)
    if (recipient?.email) {
        const proposerName = await fetchUserDisplayName(ctx.userId, ctx.email)
        const changesSummaryParts: string[] = []
        if (changes.amount) {
            changesSummaryParts.push(
                `kwota: ${(changes.amount[0] as number).toFixed(2)} → ${(changes.amount[1] as number).toFixed(2)} ${updated.currency}`,
            )
        }
        if (changes.reason) changesSummaryParts.push('zmieniono uzasadnienie')
        if (changes.period) {
            changesSummaryParts.push(`miesiąc: ${changes.period[0]} → ${changes.period[1]}`)
        }
        const changesSummary = changesSummaryParts.join('; ') || 'edytowano'

        // Phase 31 — dla CL używamy generic bonus_updated emaila (treść po staremu),
        // bo zmiany dotyczą tylko amount/reason/notes (place_rank/quarter immutable).
        // Email helper sendBonusUpdated obsługuje monthly period; dla CL używamy stub
        // który mapuje period_quarter na month=quarter*3 dla tytułu (lub można dodać
        // dedykowany sendChampionsLeagueUpdated w przyszłości jeśli mocniejszy branding).
        const fallbackMonth = isChampionsLeague && updated.period_quarter
            ? updated.period_quarter * 3
            : updated.period_month ?? new Date().getMonth() + 1

        await notifyRecipient({
            recipientId: updated.recipient_user_id,
            recipientEmail: recipient.email,
            recipientName: recipient.full_name ?? 'Pracownik',
            proposerName,
            bonusId: updated.id,
            amount: Number(updated.amount),
            currency: updated.currency,
            reason: updated.reason,
            kind: 'updated',
            periodYear: updated.period_year ?? undefined,
            periodMonth: fallbackMonth,
            changesSummary,
        })
    }

    return updated
}

/** Phase 26 — list employees the current user can assign bonuses to. */
export async function listEligibleEmployeesForBonus(): Promise<EligibleEmployeeForBonus[]> {
    const ctx = await requireBonusProposerAction()
    const admin = createServiceClient()

    let q = admin
        .from('profiles')
        .select('id, full_name, email, role, employment_status')
        .neq('id', ctx.userId)
        .neq('employment_status', 'exited')
        .order('full_name', { ascending: true })

    if (!ctx.isAdmin) {
        q = q.eq('manager_id', ctx.userId)
    }

    const { data, error } = await q
    if (error) throw new Error(`Błąd pobierania pracowników: ${error.message}`)

    // cast through unknown because db.types.ts is stale wrt Phase 22 columns (employment_status)
    return ((data ?? []) as unknown as Array<{
        id: string
        full_name: string | null
        email: string | null
        role: string
        employment_status: string | null
    }>)
        .filter((p): p is { id: string; full_name: string | null; email: string; role: string; employment_status: string | null } =>
            !!p.email && p.role !== 'consultant',
        )
        .map((p) => ({
            user_id: p.id,
            full_name: p.full_name,
            email: p.email,
            role: p.role,
        }))
}

// ─── Manager / admin / finanse views ────────────────────────────────────────

export async function listTeamBonuses(filter?: BonusListFilter): Promise<BonusWithUsers[]> {
    const ctx = await requireInternalOrAdminAction()
    // RLS handles team scoping (manager sees own team, finanse/admin see all).
    if (!ctx.isAdmin && !ctx.isManager && ctx.role !== 'finanse') {
        throw new Error('Brak uprawnień do podglądu premii zespołu.')
    }

    const supabase = createClient()
    let q = supabase
        .from('bonuses')
        .select('*')
        .order('created_at', { ascending: false })

    if (filter?.status) q = q.eq('status', filter.status)
    if (filter?.recipient_user_id) q = q.eq('recipient_user_id', filter.recipient_user_id)

    const { data, error } = await q
    if (error) throw new Error(`Błąd pobierania premii zespołu: ${error.message}`)

    return enrichBonusesWithUsers((data ?? []) as BonusRow[])
}

export async function listAllBonusesForFinance(filter?: BonusListFilter): Promise<BonusWithUsers[]> {
    await requireBonusReadAllAction()
    const supabase = createClient()

    let q = supabase
        .from('bonuses')
        .select('*')
        .order('created_at', { ascending: false })

    if (filter?.status) q = q.eq('status', filter.status)
    if (filter?.recipient_user_id) q = q.eq('recipient_user_id', filter.recipient_user_id)

    const { data, error } = await q
    if (error) throw new Error(`Błąd pobierania premii: ${error.message}`)

    return enrichBonusesWithUsers((data ?? []) as BonusRow[])
}

// ─── Util: enrich bonus rows with user names + invoice numbers ──────────────

async function enrichBonusesWithUsers(rows: BonusRow[]): Promise<BonusWithUsers[]> {
    if (rows.length === 0) return []

    const admin = createServiceClient()
    const userIds = new Set<string>()
    const invoiceIds = new Set<string>()
    for (const r of rows) {
        userIds.add(r.recipient_user_id)
        userIds.add(r.proposed_by)
        if (r.linked_invoice_id) invoiceIds.add(r.linked_invoice_id)
    }

    const [profilesRes, invoicesRes] = await Promise.all([
        admin
            .from('profiles')
            .select('id, full_name, email')
            .in('id', Array.from(userIds)),
        invoiceIds.size > 0
            ? admin
                  .from('invoices')
                  .select('id, invoice_number')
                  .in('id', Array.from(invoiceIds))
            : Promise.resolve({ data: [] as Array<{ id: string; invoice_number: string }>, error: null }),
    ])

    const profileMap = new Map<string, { full_name: string | null; email: string | null }>()
    for (const p of (profilesRes.data ?? []) as Array<{
        id: string
        full_name: string | null
        email: string | null
    }>) {
        profileMap.set(p.id, { full_name: p.full_name, email: p.email })
    }

    const invoiceMap = new Map<string, string>()
    for (const i of (invoicesRes.data ?? []) as Array<{ id: string; invoice_number: string }>) {
        invoiceMap.set(i.id, i.invoice_number)
    }

    return rows.map((r) => ({
        ...r,
        recipient_full_name: profileMap.get(r.recipient_user_id)?.full_name ?? null,
        recipient_email: profileMap.get(r.recipient_user_id)?.email ?? '',
        proposer_full_name: profileMap.get(r.proposed_by)?.full_name ?? null,
        proposer_email: profileMap.get(r.proposed_by)?.email ?? null,
        linked_invoice_number: r.linked_invoice_id ? (invoiceMap.get(r.linked_invoice_id) ?? null) : null,
    }))
}

// ─── For form: list of recipients the current user can propose for ──────────

export async function listProposableRecipients(): Promise<
    Array<{ id: string; full_name: string | null; email: string; role: string }>
> {
    const ctx = await requireBonusProposerAction()
    const admin = createServiceClient()

    let q = admin
        .from('profiles')
        .select('id, full_name, email, role')
        .neq('id', ctx.userId)
        .order('full_name', { ascending: true })

    if (!ctx.isAdmin) {
        // Manager: only direct reports.
        q = q.eq('manager_id', ctx.userId)
    }

    const { data, error } = await q
    if (error) throw new Error(`Błąd pobierania pracowników: ${error.message}`)

    return ((data ?? []) as Array<{
        id: string
        full_name: string | null
        email: string | null
        role: string
    }>)
        .filter((p): p is { id: string; full_name: string | null; email: string; role: string } =>
            !!p.email,
        )
}

// ─── For link modal: list of recipient's own invoices (any status) ──────────

export async function listMyInvoicesForBonusLinking(): Promise<
    Array<{
        id: string
        invoice_number: string
        amount: number
        period_year: number
        period_month: number
        status: string
    }>
> {
    const ctx = await requireInternalOrAdminAction()
    const supabase = createClient()
    const { data, error } = await supabase
        .from('invoices')
        .select('id, invoice_number, amount, period_year, period_month, status')
        .eq('user_id', ctx.userId)
        .order('created_at', { ascending: false })
        .limit(50)
    if (error) throw new Error(`Błąd pobierania faktur: ${error.message}`)
    return ((data ?? []) as Array<{
        id: string
        invoice_number: string
        amount: number | string
        period_year: number
        period_month: number
        status: string
    }>).map((i) => ({ ...i, amount: Number(i.amount) }))
}

// ─── Phase 27b — Attachment lifecycle (upload, signed URL, remove) ────────

const BONUS_ATTACHMENTS_BUCKET = 'bonus-attachments'
const SIGNED_URL_TTL_SECONDS = 60

function sanitizeFilename(name: string): string {
    return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100)
}

/**
 * Phase 27b — upload attachment for an existing bonus.
 * Guard: proposer or admin only. Storage RLS also enforces this.
 * Flow: 1) assignBonus inserts bonus → 2) UI uploads attachment via this action.
 */
export async function uploadBonusAttachment(
    bonusId: string,
    file: File,
): Promise<{ path: string; filename: string; size: number; mime: string }> {
    const ctx = await requireInternalOrAdminAction()
    if (!bonusId) throw new Error('Brak id premii.')
    if (!file || !(file instanceof File)) throw new Error('Brak pliku.')

    // Validate file
    if (file.size === 0) throw new Error('Plik jest pusty.')
    if (file.size > BONUS_ATTACHMENT_MAX_BYTES) {
        throw new Error(`Plik za duży (max ${BONUS_ATTACHMENT_MAX_BYTES / 1024 / 1024} MB).`)
    }
    const mime = file.type || 'application/octet-stream'
    if (!BONUS_ATTACHMENT_ALLOWED_MIME.includes(mime as (typeof BONUS_ATTACHMENT_ALLOWED_MIME)[number])) {
        throw new Error(
            `Niedozwolony typ pliku (${mime}). Dozwolone: PDF, JPG, PNG, WEBP.`,
        )
    }

    const admin = createServiceClient()

    // Verify bonus exists + user is proposer or admin.
    const { data: bonus, error: fetchErr } = await admin
        .from('bonuses')
        .select('id, proposed_by, attachment_path')
        .eq('id', bonusId)
        .single<{ id: string; proposed_by: string; attachment_path: string | null }>()
    if (fetchErr || !bonus) throw new Error('Premia nie znaleziona.')
    if (bonus.proposed_by !== ctx.userId && !ctx.isAdmin) {
        throw new Error('Tylko proposer lub administrator może dodać załącznik.')
    }

    const timestamp = Date.now()
    const safeName = sanitizeFilename(file.name)
    const path = `${bonusId}/${timestamp}_${safeName}`

    // Upload via admin client (bypass RLS — server already verified ownership).
    const buffer = Buffer.from(await file.arrayBuffer())
    const { error: uploadErr } = await admin.storage
        .from(BONUS_ATTACHMENTS_BUCKET)
        .upload(path, buffer, {
            contentType: mime,
            upsert: false,
        })
    if (uploadErr) throw new Error(`Błąd uploadu: ${uploadErr.message}`)

    // Update bonus row with attachment metadata.
    // Phase 27b — cast through unknown until database.types.ts is regenerated.
    const { error: updateErr } = await admin
        .from('bonuses')
        .update({
            attachment_path: path,
            attachment_filename: file.name,
            attachment_size_bytes: file.size,
            attachment_mime: mime,
        } as unknown as never)
        .eq('id', bonusId)
    if (updateErr) {
        // Best-effort cleanup if metadata update fails.
        await admin.storage.from(BONUS_ATTACHMENTS_BUCKET).remove([path]).catch(() => undefined)
        throw new Error(`Błąd zapisu metadanych: ${updateErr.message}`)
    }

    // Remove previous attachment file if it existed (replace flow).
    if (bonus.attachment_path && bonus.attachment_path !== path) {
        admin.storage
            .from(BONUS_ATTACHMENTS_BUCKET)
            .remove([bonus.attachment_path])
            .catch((e) => logCompat.error('[uploadBonusAttachment] cleanup previous failed:', e))
    }

    await logAudit(ctx.userId, 'BONUS_ATTACHMENT_UPLOADED', {
        bonus_id: bonusId,
        filename: file.name,
        size_bytes: file.size,
        mime,
    })

    return {
        path,
        filename: file.name,
        size: file.size,
        mime,
    }
}

/**
 * Phase 27b — generate signed URL for downloading a bonus attachment.
 * Guard: recipient, proposer, manager_of(recipient), finanse, admin (mirrors RLS).
 * TTL 60s — short-lived URLs prevent leaked-link reuse.
 */
export async function getBonusAttachmentSignedUrl(bonusId: string): Promise<string> {
    const ctx = await requireInternalOrAdminAction()
    if (!bonusId) throw new Error('Brak id premii.')

    const admin = createServiceClient()
    const { data: bonus, error: fetchErr } = await admin
        .from('bonuses')
        .select('id, recipient_user_id, proposed_by, attachment_path')
        .eq('id', bonusId)
        .single<{
            id: string
            recipient_user_id: string
            proposed_by: string
            attachment_path: string | null
        }>()
    if (fetchErr || !bonus) throw new Error('Premia nie znaleziona.')
    if (!bonus.attachment_path) throw new Error('Ta premia nie ma załącznika.')

    // Authorization: recipient, proposer, admin/finanse, or manager_of(recipient).
    const isRecipient = bonus.recipient_user_id === ctx.userId
    const isProposer = bonus.proposed_by === ctx.userId
    const isFinance = ctx.role === 'finanse'
    let isManagerOfRecipient = false
    if (ctx.isManager && !isRecipient && !isProposer && !ctx.isAdmin && !isFinance) {
        const { data: target } = await admin
            .from('profiles')
            .select('manager_id')
            .eq('id', bonus.recipient_user_id)
            .single<{ manager_id: string | null }>()
        isManagerOfRecipient = target?.manager_id === ctx.userId
    }

    if (!isRecipient && !isProposer && !ctx.isAdmin && !isFinance && !isManagerOfRecipient) {
        throw new Error('Brak uprawnień do pobrania załącznika.')
    }

    const { data: signed, error: signErr } = await admin.storage
        .from(BONUS_ATTACHMENTS_BUCKET)
        .createSignedUrl(bonus.attachment_path, SIGNED_URL_TTL_SECONDS)
    if (signErr || !signed?.signedUrl) {
        throw new Error(`Błąd generowania linka: ${signErr?.message ?? 'unknown'}`)
    }
    return signed.signedUrl
}

/**
 * Phase 27b — admin removes attachment from a bonus (keeps bonus row, drops file + metadata).
 */
export async function removeBonusAttachment(bonusId: string): Promise<void> {
    const ctx = await requireInternalOrAdminAction()
    if (!ctx.isAdmin) throw new Error('Tylko administrator może usunąć załącznik.')
    if (!bonusId) throw new Error('Brak id premii.')

    const admin = createServiceClient()
    const { data: bonus, error: fetchErr } = await admin
        .from('bonuses')
        .select('id, attachment_path, attachment_filename, category, custom_email_memo')
        .eq('id', bonusId)
        .single<{
            id: string
            attachment_path: string | null
            attachment_filename: string | null
            category: BonusCategory
            custom_email_memo: string | null
        }>()
    if (fetchErr || !bonus) throw new Error('Premia nie znaleziona.')
    if (!bonus.attachment_path) throw new Error('Ta premia nie ma załącznika.')

    // For 'custom' category — DB CHECK requires memo OR attachment. If memo is empty,
    // we'd violate constraint by removing. Block here with friendly message.
    if (bonus.category === 'custom' && !bonus.custom_email_memo) {
        throw new Error(
            'Premia niestandardowa wymaga memo lub załącznika. Dodaj memo zanim usuniesz załącznik.',
        )
    }

    const { error: removeStorageErr } = await admin.storage
        .from(BONUS_ATTACHMENTS_BUCKET)
        .remove([bonus.attachment_path])
    if (removeStorageErr) {
        logCompat.error('[removeBonusAttachment] storage remove failed:', removeStorageErr)
        // Continue anyway — clear metadata even if file was already missing.
    }

    // Phase 27b — cast through unknown until database.types.ts is regenerated.
    const { error: updateErr } = await admin
        .from('bonuses')
        .update({
            attachment_path: null,
            attachment_filename: null,
            attachment_size_bytes: null,
            attachment_mime: null,
        } as unknown as never)
        .eq('id', bonusId)
    if (updateErr) throw new Error(`Błąd czyszczenia metadanych: ${updateErr.message}`)

    await logAudit(ctx.userId, 'BONUS_ATTACHMENT_REMOVED', {
        bonus_id: bonusId,
        filename: bonus.attachment_filename,
    })
}
