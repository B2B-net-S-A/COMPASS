'use server'

// Phase 27c — User rates server actions (set, list history, list directory, get my rate).
//
// Authorization:
//   - setUserRate           : finanse + admin
//   - listAllActiveRates    : finanse + admin
//   - listUserRateDirectory : finanse + admin
//   - listUserRateHistory   : owner | manager_of | finanse | admin (RLS enforces)
//   - getMyCurrentRate      : owner only
//
// Side effects on setUserRate:
//   - Email + push to the employee
//   - Email broadcast to all finanse + admin (other than the actor)
//   - Audit log USER_RATE_CHANGED

import { logCompat } from '@/lib/logger'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/admin'
import {
    requireInternalOrAdminAction,
    requireFinanseOrAdminAction,
} from '@/lib/auth/internal-guard'
import { logAudit } from '@/lib/actions/audit'
import { sendRateChanged, sendRateChangedToFinance } from '@/lib/email'
import { sendPushToUserId } from '@/lib/push/dispatch'
import type {
    UserRateRow,
    UserRateWithUser,
    UserRateDirectoryRow,
    SetUserRateInput,
    RateCurrency,
    EmploymentType,
    RateProgressionEntry,
    SetRateProgressionInput,
    CopyProgressionInput,
    CopyProgressionResult,
} from '@/lib/types/rates'
import { EMPLOYMENT_TYPE_LABELS_PL } from '@/lib/types/rates'
import {
    firstDayOfNextMonth,
    addMonths,
    buildChangePoints,
    validateProgressionEntries,
    buildCopyEntries,
} from '@/lib/rates/progression'

// ─── Validation ──────────────────────────────────────────────────────────

const ALLOWED_CURRENCIES: RateCurrency[] = ['PLN', 'EUR', 'USD']
const RATE_MAX = 9_999_999.99 // NUMERIC(12,2) upper bound

function validateRateInput(input: SetUserRateInput): void {
    if (!input.user_id) throw new Error('Brak user_id.')
    if (!Number.isFinite(input.hourly_rate) || input.hourly_rate < 0) {
        throw new Error('Stawka musi być >= 0.')
    }
    if (input.hourly_rate > RATE_MAX) {
        throw new Error(`Stawka za duża (max ${RATE_MAX}).`)
    }
    if (input.currency && !ALLOWED_CURRENCIES.includes(input.currency)) {
        throw new Error(`Niedozwolona waluta. Wybierz: ${ALLOWED_CURRENCIES.join(', ')}.`)
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effective_from)) {
        throw new Error('effective_from musi być w formacie YYYY-MM-DD.')
    }
    const day = Number(input.effective_from.slice(8, 10))
    if (day !== 1) {
        throw new Error('Stawka może wejść w życie tylko 1. dnia miesiąca.')
    }
    // Must be ≥ first day of next month (server-side fast-fail; DB trigger duplicates this).
    const nextMonthFirst = (() => {
        const now = new Date()
        return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
            .toISOString()
            .slice(0, 10)
    })()
    if (input.effective_from < nextMonthFirst) {
        throw new Error(`Stawka może wejść w życie najwcześniej ${nextMonthFirst} (1. dzień przyszłego miesiąca).`)
    }
    if (input.reason && input.reason.length > 500) {
        throw new Error('Notatka za długa (max 500 znaków).')
    }
}

// ─── setUserRate ──────────────────────────────────────────────────────────

/**
 * Phase 27c — set a new hourly rate for a user. Trigger auto-closes the previous
 * active rate. Sends email + push to the employee and broadcasts email to finanse + admin.
 */
export async function setUserRate(input: SetUserRateInput): Promise<UserRateRow> {
    const ctx = await requireFinanseOrAdminAction()
    validateRateInput(input)

    const admin = createServiceClient()

    // Fetch previous active rate (for "old rate" in notification).
    const { data: prevRate } = await admin
        // Phase 27c — database.types.ts not yet regenerated; cast table name.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('user_rates' as any)
        .select('hourly_rate, currency')
        .eq('user_id', input.user_id)
        .is('effective_to', null)
        .maybeSingle<{ hourly_rate: number | string; currency: string }>()

    // Verify target user exists + grab name/email for notifications.
    const { data: target, error: targetErr } = await admin
        .from('profiles')
        .select('id, full_name, email, employment_status')
        .eq('id', input.user_id)
        .single<{ id: string; full_name: string | null; email: string; employment_status: string | null }>()
    if (targetErr || !target) throw new Error('Pracownik nie istnieje.')

    // Insert new rate (trigger closes the previous one).
    const { data: inserted, error: insertErr } = await admin
        // Phase 27c — database.types.ts not yet regenerated; cast table name.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('user_rates' as any)
        .insert({
            user_id: input.user_id,
            hourly_rate: input.hourly_rate,
            currency: input.currency ?? 'PLN',
            effective_from: input.effective_from,
            set_by: ctx.userId,
            reason: input.reason?.trim() || null,
        })
        .select('*')
        .single<UserRateRow>()
    if (insertErr || !inserted) {
        throw new Error(`Błąd zapisu stawki: ${insertErr?.message ?? 'unknown'}`)
    }

    // Resolve setter display name.
    const { data: setterRow } = await admin
        .from('profiles')
        .select('full_name')
        .eq('id', ctx.userId)
        .single<{ full_name: string | null }>()
    const setByName = setterRow?.full_name ?? ctx.email

    await logAudit(ctx.userId, 'USER_RATE_CHANGED', {
        rate_id: inserted.id,
        target_user_id: input.user_id,
        new_hourly_rate: Number(inserted.hourly_rate),
        new_currency: inserted.currency,
        effective_from: inserted.effective_from,
        previous_hourly_rate: prevRate ? Number(prevRate.hourly_rate) : null,
        previous_currency: prevRate?.currency ?? null,
    })

    // Fire-and-forget notifications (channel failure does not block others).
    const oldRate = prevRate ? Number(prevRate.hourly_rate) : null
    const currency = inserted.currency

    // Email + push to employee.
    sendRateChanged({
        recipientEmail: target.email,
        recipientName: target.full_name ?? target.email,
        oldRate,
        newRate: Number(inserted.hourly_rate),
        currency,
        effectiveFrom: inserted.effective_from,
        setByName,
        reason: inserted.reason,
    }).catch((e) => logCompat.error('[setUserRate] employee email failed:', e))

    sendPushToUserId(input.user_id, {
        title: 'Zmiana stawki godzinowej',
        body: `Od ${inserted.effective_from}: ${Number(inserted.hourly_rate).toFixed(2)} ${currency}/h`,
        url: '/internal/payroll',
        tag: `rate-changed-${inserted.id}`,
    }).catch((e) => logCompat.error('[setUserRate] employee push failed:', e))

    // Broadcast email to other finanse + admin.
    const { data: financeAdmins } = await admin
        .from('profiles')
        .select('id, email')
        .in('role', ['finanse', 'admin'])
    for (const fa of (financeAdmins ?? []) as Array<{ id: string; email: string | null }>) {
        if (!fa.email || fa.id === ctx.userId) continue
        sendRateChangedToFinance({
            recipientEmail: fa.email,
            targetName: target.full_name ?? target.email,
            targetEmail: target.email,
            oldRate,
            newRate: Number(inserted.hourly_rate),
            currency,
            effectiveFrom: inserted.effective_from,
            setByName,
        }).catch((e) => logCompat.error('[setUserRate] finance email failed:', e))
    }

    return inserted
}

// ─── Read actions ────────────────────────────────────────────────────────

/**
 * Phase 27c — full rate history for a user. RLS enforces visibility:
 * owner / manager_of / finanse / admin.
 */
export async function listUserRateHistory(userId: string): Promise<UserRateWithUser[]> {
    await requireInternalOrAdminAction()
    if (!userId) throw new Error('Brak user_id.')

    const supabase = createClient()
    const { data, error } = await supabase
        // Phase 27c — database.types.ts not yet regenerated; cast table name.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('user_rates' as any)
        .select('*')
        .eq('user_id', userId)
        .order('effective_from', { ascending: false })
    if (error) throw new Error(`Błąd pobierania historii: ${error.message}`)

    return enrichRates(((data ?? []) as unknown) as UserRateRow[])
}

/**
 * Phase 27c — current rate for the calling user (own only).
 */
export async function getMyCurrentRate(): Promise<UserRateRow | null> {
    const ctx = await requireInternalOrAdminAction()
    const supabase = createClient()
    const { data, error } = await supabase
        // Phase 27c — database.types.ts not yet regenerated; cast table name.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('user_rates' as any)
        .select('*')
        .eq('user_id', ctx.userId)
        .is('effective_to', null)
        .maybeSingle<UserRateRow>()
    if (error) throw new Error(`Błąd pobierania stawki: ${error.message}`)
    return data
}

/**
 * Phase 27c — current rate for any user (scope: owner | manager_of | finanse | admin).
 * Returns null when no rate set.
 */
export async function getCurrentRateForUser(userId: string): Promise<UserRateRow | null> {
    await requireInternalOrAdminAction()
    const supabase = createClient()
    const { data, error } = await supabase
        // Phase 27c — database.types.ts not yet regenerated; cast table name.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('user_rates' as any)
        .select('*')
        .eq('user_id', userId)
        .is('effective_to', null)
        .maybeSingle<UserRateRow>()
    if (error) throw new Error(`Błąd pobierania stawki: ${error.message}`)
    return data
}

/**
 * Phase 27c — directory of HR-zone users with their current rate (or null).
 * Finanse + admin only. Used by /internal/admin/rates.
 */
export async function listUserRateDirectory(): Promise<UserRateDirectoryRow[]> {
    await requireFinanseOrAdminAction()
    const admin = createServiceClient()

    const { data: profiles, error: pErr } = await admin
        .from('profiles')
        .select('id, full_name, email, role, manager_id, employment_status, employment_type')
        .in('role', ['admin', 'internal', 'finanse', 'manager', 'talent_community', 'consultant'])
        .order('full_name')
    if (pErr) throw new Error(`Błąd pobierania profili: ${pErr.message}`)

    const rows = ((profiles ?? []) as unknown) as Array<{
        id: string
        full_name: string | null
        email: string
        role: string
        manager_id: string | null
        employment_status: string | null
        employment_type: string | null
    }>

    // Hide exited employees from the directory.
    const activeRows = rows.filter((p) => p.employment_status !== 'exited')

    if (activeRows.length === 0) return []

    const userIds = activeRows.map((p) => p.id)
    const managerIds = Array.from(
        new Set(activeRows.map((p) => p.manager_id).filter((id): id is string => !!id)),
    )

    // Fetch ALL rate rows for the listed users (bounded: rates are sparse, ≤ ~24/user).
    // We compute the rate active *this month* separately from future scheduled change-points,
    // because a user mid-progression has an open row dated in the future.
    const thisMonthFirst = addMonths(firstDayOfNextMonth(), -1)
    const [ratesRes, managersRes] = await Promise.all([
        admin
            // Phase 27c — database.types.ts not yet regenerated; cast table name.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .from('user_rates' as any)
            .select('user_id, hourly_rate, currency, effective_from, effective_to')
            .in('user_id', userIds)
            .order('effective_from', { ascending: true }),
        managerIds.length > 0
            ? admin.from('profiles').select('id, full_name').in('id', managerIds)
            : Promise.resolve({ data: [] as Array<{ id: string; full_name: string | null }>, error: null }),
    ])

    type RateRow = { hourly_rate: number; currency: string; effective_from: string }
    const rowsByUser = new Map<string, RateRow[]>()
    for (const r of ((ratesRes.data ?? []) as unknown) as Array<{
        user_id: string
        hourly_rate: number | string
        currency: string
        effective_from: string
    }>) {
        const list = rowsByUser.get(r.user_id) ?? []
        list.push({ hourly_rate: Number(r.hourly_rate), currency: r.currency, effective_from: r.effective_from })
        rowsByUser.set(r.user_id, list)
    }
    const managerMap = new Map<string, string | null>()
    for (const m of (managersRes.data ?? []) as Array<{ id: string; full_name: string | null }>) {
        managerMap.set(m.id, m.full_name)
    }

    return activeRows.map((p) => {
        const userRows = rowsByUser.get(p.id) ?? [] // ascending by effective_from
        let current: RateRow | null = null
        const future: RateRow[] = []
        for (const r of userRows) {
            if (r.effective_from <= thisMonthFirst) current = r
            else future.push(r)
        }
        const next = future[0] ?? null
        return {
            user_id: p.id,
            full_name: p.full_name,
            email: p.email,
            role: p.role,
            manager_full_name: p.manager_id ? managerMap.get(p.manager_id) ?? null : null,
            employment_status: p.employment_status,
            employment_type: (p.employment_type as EmploymentType | null) ?? null,
            current_rate: current?.hourly_rate ?? null,
            current_currency: current ? (current.currency as RateCurrency) : null,
            current_effective_from: current?.effective_from ?? null,
            scheduled_changes_count: future.length,
            next_scheduled_from: next?.effective_from ?? null,
            next_scheduled_rate: next?.hourly_rate ?? null,
            is_progressive: future.length > 0,
        }
    })
}

// ─── Util: enrich rates with user names ──────────────────────────────────

async function enrichRates(rows: UserRateRow[]): Promise<UserRateWithUser[]> {
    if (rows.length === 0) return []
    const admin = createServiceClient()
    const userIds = new Set<string>()
    for (const r of rows) {
        userIds.add(r.user_id)
        userIds.add(r.set_by)
    }
    const { data, error } = await admin
        .from('profiles')
        .select('id, full_name, email')
        .in('id', Array.from(userIds))
    if (error) throw new Error(`Błąd enrich rates: ${error.message}`)
    const map = new Map<string, { full_name: string | null; email: string | null }>()
    for (const p of (data ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>) {
        map.set(p.id, { full_name: p.full_name, email: p.email })
    }
    return rows.map((r) => ({
        ...r,
        user_full_name: map.get(r.user_id)?.full_name ?? null,
        user_email: map.get(r.user_id)?.email ?? '',
        set_by_full_name: map.get(r.set_by)?.full_name ?? null,
        set_by_email: map.get(r.set_by)?.email ?? null,
    }))
}

// ─── Phase 27h — internal helpers ──────────────────────────────────────────

type AdminClient = ReturnType<typeof createServiceClient>

interface RateTarget {
    id: string
    full_name: string | null
    email: string
}

async function fetchRateTarget(admin: AdminClient, userId: string): Promise<RateTarget> {
    const { data, error } = await admin
        .from('profiles')
        .select('id, full_name, email')
        .eq('id', userId)
        .single<RateTarget>()
    if (error || !data) throw new Error('Pracownik nie istnieje.')
    return data
}

interface OpenRate {
    hourly_rate: number
    currency: RateCurrency
    effective_from: string
}

/** The user's open rate (effective_to IS NULL) = their latest scheduled row (max effective_from). */
async function fetchOpenRate(admin: AdminClient, userId: string): Promise<OpenRate | null> {
    const { data } = await admin
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('user_rates' as any)
        .select('hourly_rate, currency, effective_from')
        .eq('user_id', userId)
        .is('effective_to', null)
        .maybeSingle<{ hourly_rate: number | string; currency: string; effective_from: string }>()
    if (!data) return null
    return {
        hourly_rate: Number(data.hourly_rate),
        currency: data.currency as RateCurrency,
        effective_from: data.effective_from,
    }
}

interface InsertProgressionParams {
    admin: AdminClient
    ctx: { userId: string; email: string }
    target: RateTarget
    currency: RateCurrency
    changePoints: RateProgressionEntry[] // ascending, deduped
    reason: string | null
    auditAction: 'USER_RATE_PROGRESSION_SET' | 'USER_RATE_PROGRESSION_COPIED'
    prevRate: OpenRate | null
    extraAudit?: Record<string, unknown>
}

/**
 * Insert a batch of ascending change-points atomically (RPC + trigger), then notify.
 * Notification reuses the single-rate email/push for the EARLIEST change (most imminent);
 * the push body summarises the count. Later change-points are visible in rate history.
 */
async function insertProgressionAndNotify(params: InsertProgressionParams): Promise<number> {
    const { admin, ctx, target, currency, changePoints, reason, auditAction, prevRate, extraAudit } = params

    // database.types.ts not yet regenerated for this RPC — cast client for the call.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: insertedCount, error } = await (admin as any).rpc('set_user_rate_progression', {
        p_user_id: target.id,
        p_currency: currency,
        p_entries: changePoints,
        p_set_by: ctx.userId,
        p_reason: reason,
    })
    if (error) throw new Error(`Błąd zapisu progresji: ${error.message}`)

    const { data: setterRow } = await admin
        .from('profiles')
        .select('full_name')
        .eq('id', ctx.userId)
        .single<{ full_name: string | null }>()
    const setByName = setterRow?.full_name ?? ctx.email

    const first = changePoints[0]
    const last = changePoints[changePoints.length - 1]
    const oldRate = prevRate?.hourly_rate ?? null

    await logAudit(ctx.userId, auditAction, {
        target_user_id: target.id,
        currency,
        count: changePoints.length,
        first_from: first.effective_from,
        first_rate: first.hourly_rate,
        last_from: last.effective_from,
        last_rate: last.hourly_rate,
        previous_hourly_rate: oldRate,
        ...extraAudit,
    })

    // Email + push to the employee.
    sendRateChanged({
        recipientEmail: target.email,
        recipientName: target.full_name ?? target.email,
        oldRate,
        newRate: first.hourly_rate,
        currency,
        effectiveFrom: first.effective_from,
        setByName,
        reason,
    }).catch((e) => logCompat.error('[setRateProgression] employee email failed:', e))

    const pushBody =
        changePoints.length === 1
            ? `Od ${first.effective_from}: ${first.hourly_rate.toFixed(2)} ${currency}/h`
            : `${changePoints.length} zmian, najbliższa od ${first.effective_from}: ${first.hourly_rate.toFixed(2)} ${currency}/h`
    sendPushToUserId(target.id, {
        title: 'Zaktualizowano harmonogram stawek',
        body: pushBody,
        url: '/internal/payroll',
        tag: `rate-progression-${target.id}-${first.effective_from}`,
    }).catch((e) => logCompat.error('[setRateProgression] employee push failed:', e))

    // Broadcast email to other finanse + admin (for the imminent change).
    const { data: financeAdmins } = await admin
        .from('profiles')
        .select('id, email')
        .in('role', ['finanse', 'admin'])
    for (const fa of (financeAdmins ?? []) as Array<{ id: string; email: string | null }>) {
        if (!fa.email || fa.id === ctx.userId) continue
        sendRateChangedToFinance({
            recipientEmail: fa.email,
            targetName: target.full_name ?? target.email,
            targetEmail: target.email,
            oldRate,
            newRate: first.hourly_rate,
            currency,
            effectiveFrom: first.effective_from,
            setByName,
        }).catch((e) => logCompat.error('[setRateProgression] finance email failed:', e))
    }

    return Number(insertedCount ?? changePoints.length)
}

// ─── Phase 27h — contract type ─────────────────────────────────────────────

/** Set a user's contract type (UoP / Zlecenie / B2B). Finanse + admin. */
export async function setUserContractType(userId: string, employmentType: EmploymentType): Promise<void> {
    const ctx = await requireFinanseOrAdminAction()
    if (!userId) throw new Error('Brak user_id.')
    if (!['uop', 'b2b', 'zlecenie'].includes(employmentType)) {
        throw new Error('Niedozwolony typ umowy. Wybierz: UoP, Zlecenie lub B2B.')
    }
    const admin = createServiceClient()
    const { data: prev, error: prevErr } = await admin
        .from('profiles')
        .select('employment_type')
        .eq('id', userId)
        .single<{ employment_type: string | null }>()
    if (prevErr || !prev) throw new Error('Pracownik nie istnieje.')

    const { error } = await admin.from('profiles').update({ employment_type: employmentType }).eq('id', userId)
    if (error) throw new Error(`Błąd zmiany typu umowy: ${error.message}`)

    await logAudit(ctx.userId, 'EMPLOYMENT_TYPE_CHANGED', {
        target_user_id: userId,
        previous: prev.employment_type ?? null,
        next: employmentType,
        next_label: EMPLOYMENT_TYPE_LABELS_PL[employmentType],
    })
}

// ─── Phase 27h — rate progression ──────────────────────────────────────────

/** Future change-points (effective_from > current month) for a user. Finanse + admin. */
export async function listScheduledRateChanges(userId: string): Promise<RateProgressionEntry[]> {
    await requireFinanseOrAdminAction()
    if (!userId) throw new Error('Brak user_id.')
    const admin = createServiceClient()
    const thisMonthFirst = addMonths(firstDayOfNextMonth(), -1)
    const { data, error } = await admin
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('user_rates' as any)
        .select('hourly_rate, effective_from')
        .eq('user_id', userId)
        .gt('effective_from', thisMonthFirst)
        .order('effective_from', { ascending: true })
    if (error) throw new Error(`Błąd pobierania harmonogramu: ${error.message}`)
    return (((data ?? []) as unknown) as Array<{ hourly_rate: number | string; effective_from: string }>).map((r) => ({
        effective_from: r.effective_from,
        hourly_rate: Number(r.hourly_rate),
    }))
}

/**
 * Set a forward rate progression (batch of monthly change-points). Append-only:
 * every entry must be a future month, no earlier than next month, and strictly later
 * than the user's latest scheduled month. Equal-to-running-rate months collapse.
 */
export async function setRateProgression(
    input: SetRateProgressionInput,
): Promise<{ inserted_count: number; applied: RateProgressionEntry[] }> {
    const ctx = await requireFinanseOrAdminAction()
    if (!input.user_id) throw new Error('Brak user_id.')
    if (!Array.isArray(input.entries) || input.entries.length === 0) {
        throw new Error('Brak miesięcy w progresji.')
    }
    const admin = createServiceClient()
    const target = await fetchRateTarget(admin, input.user_id)
    const openRate = await fetchOpenRate(admin, input.user_id)

    validateProgressionEntries(input.entries, {
        nextMonthFirst: firstDayOfNextMonth(),
        latestExistingEffectiveFrom: openRate?.effective_from ?? null,
    })

    const currency: RateCurrency = input.currency ?? openRate?.currency ?? 'PLN'
    const changePoints = buildChangePoints(openRate?.hourly_rate ?? null, input.entries)
    if (changePoints.length === 0) {
        throw new Error('Brak zmian — wszystkie wskazane miesiące mają stawkę identyczną z obecną.')
    }

    const inserted = await insertProgressionAndNotify({
        admin,
        ctx,
        target,
        currency,
        changePoints,
        reason: input.reason?.trim() || null,
        auditAction: 'USER_RATE_PROGRESSION_SET',
        prevRate: openRate,
    })
    return { inserted_count: inserted, applied: changePoints }
}

// ─── Phase 27h — copy progression from another user ────────────────────────

interface ComputedCopy {
    applied: RateProgressionEntry[]
    skipped: CopyProgressionResult['skipped']
    targetOpenRate: OpenRate | null
    currency: RateCurrency
}

async function computeCopy(input: CopyProgressionInput, admin: AdminClient): Promise<ComputedCopy> {
    const nextMonthFirst = firstDayOfNextMonth()
    const { data: srcData } = await admin
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('user_rates' as any)
        .select('hourly_rate, currency, effective_from')
        .eq('user_id', input.from_user_id)
        .gte('effective_from', nextMonthFirst)
        .order('effective_from', { ascending: true })

    const srcRows = ((srcData ?? []) as unknown) as Array<{
        hourly_rate: number | string
        currency: string
        effective_from: string
    }>
    const sourceFuture: RateProgressionEntry[] = srcRows.map((r) => ({
        effective_from: r.effective_from,
        hourly_rate: Number(r.hourly_rate),
    }))

    const targetOpenRate = await fetchOpenRate(admin, input.to_user_id)
    const currency: RateCurrency =
        (srcRows[0]?.currency as RateCurrency | undefined) ?? targetOpenRate?.currency ?? 'PLN'

    const { applied, skipped } = buildCopyEntries({
        sourceFutureChangePoints: sourceFuture,
        targetCurrentOpenRate: targetOpenRate?.hourly_rate ?? null,
        targetLatestEffectiveFrom: targetOpenRate?.effective_from ?? null,
        nextMonthFirst,
    })
    return { applied, skipped, targetOpenRate, currency }
}

/** Preview what copying a source user's forward schedule onto a target would apply/skip. */
export async function previewCopyProgression(input: CopyProgressionInput): Promise<CopyProgressionResult> {
    await requireFinanseOrAdminAction()
    if (!input.from_user_id || !input.to_user_id) throw new Error('Wybierz pracownika źródłowego i docelowego.')
    if (input.from_user_id === input.to_user_id) throw new Error('Pracownik źródłowy i docelowy muszą być różni.')
    const admin = createServiceClient()
    const { applied, skipped } = await computeCopy(input, admin)
    return { applied, skipped, inserted_count: 0 }
}

/** Apply a copied progression (append-only) and notify. */
export async function copyRateProgression(input: CopyProgressionInput): Promise<CopyProgressionResult> {
    const ctx = await requireFinanseOrAdminAction()
    if (!input.from_user_id || !input.to_user_id) throw new Error('Wybierz pracownika źródłowego i docelowego.')
    if (input.from_user_id === input.to_user_id) throw new Error('Pracownik źródłowy i docelowy muszą być różni.')
    const admin = createServiceClient()
    const target = await fetchRateTarget(admin, input.to_user_id)
    const { applied, skipped, targetOpenRate, currency } = await computeCopy(input, admin)

    if (applied.length === 0) {
        return { applied: [], skipped, inserted_count: 0 }
    }

    // Defensive re-validation before the atomic insert.
    validateProgressionEntries(applied, {
        nextMonthFirst: firstDayOfNextMonth(),
        latestExistingEffectiveFrom: targetOpenRate?.effective_from ?? null,
    })

    const inserted = await insertProgressionAndNotify({
        admin,
        ctx,
        target,
        currency,
        changePoints: applied,
        reason: 'Skopiowano progresję od innego pracownika',
        auditAction: 'USER_RATE_PROGRESSION_COPIED',
        prevRate: targetOpenRate,
        extraAudit: { source_user_id: input.from_user_id, skipped_count: skipped.length },
    })
    return { applied, skipped, inserted_count: inserted }
}

// ─── Phase 30b — Vacation pool (per-user) for Rates panel ──────────────────
// Pozwala finanse+admin edytować pulę płatnych urlopów per pracownik bezpośrednio
// z `/internal/admin?tab=rates`. Narrow scope — tylko 3 pool fields, NIE rozszerza
// uprawnień do zmiany roli/employment_type (te zostają w `setEmployeeProfile`
// gated na SuperAdmin).

export interface UserVacationPoolFields {
    employment_type: 'uop' | 'b2b' | 'zlecenie' | null
    leave_entitlement_days: number | null
    leave_carried_over_days: number
    leave_used_initial_days: number
}

export interface UpdateUserVacationPoolInput {
    leave_entitlement_days?: number | null
    leave_carried_over_days?: number
    leave_used_initial_days?: number
}

export async function getUserVacationPool(targetUserId: string): Promise<UserVacationPoolFields> {
    await requireFinanseOrAdminAction()
    const admin = createServiceClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (admin.from('profiles') as any)
        .select('employment_type, leave_entitlement_days, leave_carried_over_days, leave_used_initial_days')
        .eq('id', targetUserId)
        .single()
    if (error) throw new Error(`Nie udało się odczytać puli urlopowej: ${error.message}`)
    const row = data as {
        employment_type: 'uop' | 'b2b' | 'zlecenie' | null
        leave_entitlement_days: number | null
        leave_carried_over_days: number | string | null
        leave_used_initial_days: number | string | null
    }
    return {
        employment_type: row?.employment_type ?? null,
        leave_entitlement_days: row?.leave_entitlement_days ?? null,
        leave_carried_over_days: Number(row?.leave_carried_over_days ?? 0),
        leave_used_initial_days: Number(row?.leave_used_initial_days ?? 0),
    }
}

export async function setUserVacationPool(
    targetUserId: string,
    input: UpdateUserVacationPoolInput,
): Promise<void> {
    const ctx = await requireFinanseOrAdminAction()

    const updates: Record<string, unknown> = {}
    if (input.leave_entitlement_days !== undefined) {
        const v = input.leave_entitlement_days
        if (v !== null && (!Number.isInteger(v) || v < 0 || v > 366)) {
            throw new Error('Wymiar urlopu musi być liczbą całkowitą 0–366 lub pusty (brak puli).')
        }
        updates.leave_entitlement_days = v
    }
    if (input.leave_carried_over_days !== undefined) {
        const v = input.leave_carried_over_days
        if (!Number.isFinite(v) || v < 0 || v > 366) {
            throw new Error('Urlop zaległy musi być liczbą 0–366.')
        }
        updates.leave_carried_over_days = v
    }
    if (input.leave_used_initial_days !== undefined) {
        const v = input.leave_used_initial_days
        if (!Number.isFinite(v) || v < 0 || v > 366) {
            throw new Error('"Już zużyte" musi być liczbą 0–366.')
        }
        updates.leave_used_initial_days = v
    }
    if (Object.keys(updates).length === 0) return

    const admin = createServiceClient()
    const { data: target } = await admin
        .from('profiles')
        .select('email, full_name, leave_entitlement_days, leave_carried_over_days, leave_used_initial_days')
        .eq('id', targetUserId)
        .single<{
            email: string | null
            full_name: string | null
            leave_entitlement_days: number | null
            leave_carried_over_days: number | string | null
            leave_used_initial_days: number | string | null
        }>()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (admin.from('profiles') as any).update(updates).eq('id', targetUserId)
    if (error) throw new Error(`Błąd zapisu puli urlopowej: ${error.message}`)

    await logAudit(ctx.userId, 'USER_VACATION_POOL_UPDATED', {
        target_user_id: targetUserId,
        target_email: target?.email ?? null,
        previous: {
            leave_entitlement_days: target?.leave_entitlement_days ?? null,
            leave_carried_over_days: Number(target?.leave_carried_over_days ?? 0),
            leave_used_initial_days: Number(target?.leave_used_initial_days ?? 0),
        },
        updated: updates,
    })
}
