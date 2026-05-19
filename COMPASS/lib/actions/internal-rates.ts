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
import { sendPushToUserId } from '@/lib/actions/push-subscriptions'
import type {
    UserRateRow,
    UserRateWithUser,
    UserRateDirectoryRow,
    SetUserRateInput,
    RateCurrency,
} from '@/lib/types/rates'

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
        .select('id, full_name, email, role, manager_id, employment_status')
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
    }>

    // Hide exited employees from the directory.
    const activeRows = rows.filter((p) => p.employment_status !== 'exited')

    if (activeRows.length === 0) return []

    const userIds = activeRows.map((p) => p.id)
    const managerIds = Array.from(
        new Set(activeRows.map((p) => p.manager_id).filter((id): id is string => !!id)),
    )

    const [ratesRes, managersRes] = await Promise.all([
        admin
            // Phase 27c — database.types.ts not yet regenerated; cast table name.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('user_rates' as any)
            .select('user_id, hourly_rate, currency, effective_from')
            .in('user_id', userIds)
            .is('effective_to', null),
        managerIds.length > 0
            ? admin.from('profiles').select('id, full_name').in('id', managerIds)
            : Promise.resolve({ data: [] as Array<{ id: string; full_name: string | null }>, error: null }),
    ])

    const rateMap = new Map<
        string,
        { hourly_rate: number; currency: string; effective_from: string }
    >()
    for (const r of ((ratesRes.data ?? []) as unknown) as Array<{
        user_id: string
        hourly_rate: number | string
        currency: string
        effective_from: string
    }>) {
        rateMap.set(r.user_id, {
            hourly_rate: Number(r.hourly_rate),
            currency: r.currency,
            effective_from: r.effective_from,
        })
    }
    const managerMap = new Map<string, string | null>()
    for (const m of (managersRes.data ?? []) as Array<{ id: string; full_name: string | null }>) {
        managerMap.set(m.id, m.full_name)
    }

    return activeRows.map((p) => {
        const rate = rateMap.get(p.id)
        return {
            user_id: p.id,
            full_name: p.full_name,
            email: p.email,
            role: p.role,
            manager_full_name: p.manager_id ? managerMap.get(p.manager_id) ?? null : null,
            employment_status: p.employment_status,
            current_rate: rate?.hourly_rate ?? null,
            current_currency: rate ? (rate.currency as RateCurrency) : null,
            current_effective_from: rate?.effective_from ?? null,
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
