'use server'

import { logger, logCompat } from '@/lib/logger'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/admin'
import {
    requireInternalOrAdminAction,
    requireBonusProposerAction,
    requireBonusReadAllAction,
} from '@/lib/auth/internal-guard'
import { logAudit } from '@/lib/actions/audit'
import { sendBonusProposed, sendBonusCancelled } from '@/lib/email'
import { sendPushToUserId } from '@/lib/actions/push-subscriptions'
import type {
    BonusRow,
    BonusStatus,
    BonusWithUsers,
    ProposeBonusInput,
    CancelBonusInput,
    LinkBonusInput,
    BonusListFilter,
} from '@/lib/types/bonus'
import {
    BONUS_MIN_AMOUNT,
    BONUS_MAX_AMOUNT,
    BONUS_REASON_MIN_LENGTH,
    BONUS_REASON_MAX_LENGTH,
} from '@/lib/types/bonus'

// ─── Validation ─────────────────────────────────────────────────────────────

function validateProposeInput(input: ProposeBonusInput): void {
    if (!input.recipient_user_id) throw new Error('Pracownik jest wymagany.')
    if (!Number.isFinite(input.amount) || input.amount < BONUS_MIN_AMOUNT) {
        throw new Error(`Kwota musi być >= ${BONUS_MIN_AMOUNT}.`)
    }
    if (input.amount > BONUS_MAX_AMOUNT) {
        throw new Error(`Kwota za duża (max ${BONUS_MAX_AMOUNT}).`)
    }
    const reason = (input.reason ?? '').trim()
    if (reason.length < BONUS_REASON_MIN_LENGTH) {
        throw new Error(`Powód musi mieć co najmniej ${BONUS_REASON_MIN_LENGTH} znaki.`)
    }
    if (reason.length > BONUS_REASON_MAX_LENGTH) {
        throw new Error(`Powód za długi (max ${BONUS_REASON_MAX_LENGTH} znaków).`)
    }
    if (input.currency && !/^[A-Z]{3}$/.test(input.currency)) {
        throw new Error('Waluta musi być w formacie ISO (np. PLN, EUR).')
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
    kind: 'proposed' | 'cancelled'
    cancellationReason?: string
}): Promise<void> {
    const supabase = createServiceClient()

    const isProposed = args.kind === 'proposed'
    const titlePl = isProposed ? 'Masz nową premię' : 'Premia została anulowana'
    const titleEn = isProposed ? 'New bonus assigned' : 'Bonus cancelled'
    const reasonBody = isProposed ? args.reason : (args.cancellationReason ?? '')
    const bodyPl = `${args.amount.toFixed(2)} ${args.currency} — ${truncate(reasonBody, 120)}`
    const bodyEn = bodyPl
    const notificationType = isProposed ? 'bonus_proposed' : 'bonus_cancelled'

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
    const emailPromise = isProposed
        ? sendBonusProposed(
              args.recipientEmail,
              args.recipientName,
              args.proposerName,
              args.amount,
              args.currency,
              args.reason,
          )
        : sendBonusCancelled(
              args.recipientEmail,
              args.recipientName,
              args.proposerName,
              args.amount,
              args.currency,
              args.cancellationReason ?? 'Brak podanego powodu.',
          )

    // 3. Web push (best-effort, recipient must have subscription).
    const pushPromise = sendPushToUserId(args.recipientId, {
        title: titlePl,
        body: bodyPl,
        url: '/internal?tab=bonuses',
        tag: `bonus-${args.kind}-${args.bonusId}`,
    } as any).catch((err) => {
        logCompat.error('Bonus push notification failed:', err)
        return { success: false }
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

export async function linkBonusToInvoice(input: LinkBonusInput): Promise<BonusRow> {
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

export async function unlinkBonus(id: string): Promise<BonusRow> {
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

export async function proposeBonus(input: ProposeBonusInput): Promise<BonusRow> {
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
    const ctx = await requireInternalOrAdminAction()
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

    // Authorization: proposer (manager) or admin can cancel; only when pending.
    if (bonus.status !== 'pending') {
        throw new Error(`Można anulować tylko premie w statusie "pending" (jest: "${bonus.status}").`)
    }
    if (bonus.proposed_by !== ctx.userId && !ctx.isAdmin) {
        throw new Error('Możesz anulować tylko premie, które sam zaproponowałeś.')
    }

    const { data: updated, error: updErr } = await supabase
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

    await logAudit(ctx.userId, 'BONUS_CANCELLED', {
        bonus_id: updated.id,
        recipient_user_id: updated.recipient_user_id,
        amount: Number(updated.amount),
        currency: updated.currency,
        cancellation_reason: cancellationReason,
    })

    // Notify recipient.
    const recipient = await fetchRecipientContact(updated.recipient_user_id)
    if (recipient?.email) {
        const proposerName = await fetchUserDisplayName(ctx.userId, ctx.email)
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
        })
    }

    return updated
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
