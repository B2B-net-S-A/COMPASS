'use server'

// Phase 27c — Payroll aggregation per user per month + CSV export.
//
// Computes monthly summary: hours_total × rate + assigned bonuses.
// Currency handling: bonuses can be in any currency (PLN/EUR/USD); rate has its own.
// We group bonuses per currency. `grand_total` is meaningful only when all bonus currencies
// match the rate currency. Otherwise UI displays per-currency breakdown.
//
// Auth:
//   - getPayrollSummaryForUser : owner | manager_of(user) | finanse | admin
//   - getPayrollSummaryForManager : manager only (own team)
//   - getPayrollSummaryAll    : finanse + admin
//   - exportPayrollCsv        : finanse + admin

import { createServiceClient } from '@/lib/supabase/admin'
import {
    requireInternalOrAdminAction,
    requireFinanseOrAdminAction,
} from '@/lib/auth/internal-guard'
import { logAudit } from '@/lib/actions/audit'
import type {
    PayrollSummary,
    PayrollBonusLine,
    RateCurrency,
} from '@/lib/types/rates'
import type { BonusCategory } from '@/lib/types/bonus'

function validatePeriod(year: number, month: number): void {
    if (!Number.isInteger(year) || year < 2020 || year > 2100) {
        throw new Error('Niepoprawny rok.')
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
        throw new Error('Miesiąc musi być w zakresie 1-12.')
    }
}

async function assertCanViewPayrollFor(userId: string): Promise<void> {
    const ctx = await requireInternalOrAdminAction()
    if (ctx.userId === userId) return
    if (ctx.isAdmin || ctx.role === 'finanse') return
    if (ctx.isManager) {
        const admin = createServiceClient()
        const { data } = await admin
            .from('profiles')
            .select('manager_id')
            .eq('id', userId)
            .single<{ manager_id: string | null }>()
        if (data?.manager_id === ctx.userId) return
    }
    throw new Error('Brak uprawnień do podglądu rozliczenia tego pracownika.')
}

async function buildSummary(
    admin: ReturnType<typeof createServiceClient>,
    userId: string,
    year: number,
    month: number,
): Promise<PayrollSummary> {
    const { data: profile } = await admin
        .from('profiles')
        .select('id, full_name, email, role, manager_id')
        .eq('id', userId)
        .single<{
            id: string
            full_name: string | null
            email: string
            role: string
            manager_id: string | null
        }>()
    if (!profile) throw new Error('Pracownik nie istnieje.')

    // Timesheet for the period.
    const { data: timesheet } = await admin
        .from('timesheets')
        .select('id, status')
        .eq('user_id', userId)
        .eq('year', year)
        .eq('month', month)
        .maybeSingle<{ id: string; status: string }>()

    let hoursTotal = 0
    let tsStatus: PayrollSummary['timesheet_status'] = 'missing'
    if (timesheet) {
        tsStatus = (timesheet.status as PayrollSummary['timesheet_status']) ?? 'missing'
        const { data: entries } = await admin
            .from('timesheet_entries')
            .select('hours')
            .eq('timesheet_id', timesheet.id)
        for (const e of (entries ?? []) as Array<{ hours: number | string }>) {
            hoursTotal += Number(e.hours)
        }
    }

    // Active rate for the month.
    // Phase 27c — RPC function not in database.types.ts; cast through any.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rateRow } = await admin.rpc('get_user_rate_for_month' as any, {
        p_user_id: userId,
        p_year: year,
        p_month: month,
    })
    const rate = rateRow != null ? Number(rateRow) : null

    // Resolve rate currency: pull the rate row that covers the month.
    let rateCurrency: RateCurrency | null = null
    if (rate != null) {
        const targetDate = `${year}-${String(month).padStart(2, '0')}-01`
        const { data: covering } = await admin
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .from('user_rates' as any)
            .select('currency')
            .eq('user_id', userId)
            .lte('effective_from', targetDate)
            .order('effective_from', { ascending: false })
            .limit(1)
        const row = ((covering ?? []) as unknown as Array<{ currency: string }>)[0]
        rateCurrency = (row?.currency as RateCurrency) ?? null
    }

    // Bonuses for the period (status='assigned').
    // Phase 27c — `category` column added in Phase 27b but types.ts may lag.
    const { data: bonusRows } = await admin
        .from('bonuses')
        .select('id, amount, currency, category, reason, created_at')
        .eq('recipient_user_id', userId)
        .eq('status', 'assigned')
        .eq('period_year', year)
        .eq('period_month', month)
    const bonuses: PayrollBonusLine[] = (((bonusRows ?? []) as unknown) as Array<{
        id: string
        amount: number | string
        currency: string
        category: BonusCategory
        reason: string
        created_at: string
    }>).map((b) => ({
        id: b.id,
        amount: Number(b.amount),
        currency: b.currency,
        category: b.category,
        reason: b.reason,
        created_at: b.created_at,
    }))

    const bonusTotalsByCurrency: Record<string, number> = {}
    for (const b of bonuses) {
        bonusTotalsByCurrency[b.currency] = (bonusTotalsByCurrency[b.currency] ?? 0) + b.amount
    }

    const baseAmount = rate != null ? Number((hoursTotal * rate).toFixed(2)) : null

    // grand_total only meaningful when all bonus currencies match rate currency.
    let grandTotal: number | null = null
    if (baseAmount != null && rateCurrency) {
        const currencies = Object.keys(bonusTotalsByCurrency)
        if (currencies.length === 0) {
            grandTotal = baseAmount
        } else if (currencies.length === 1 && currencies[0] === rateCurrency) {
            grandTotal = Number((baseAmount + bonusTotalsByCurrency[rateCurrency]).toFixed(2))
        }
        // else: mixed currencies → keep grand_total null, UI shows breakdown.
    }

    return {
        user_id: userId,
        full_name: profile.full_name,
        email: profile.email,
        role: profile.role,
        manager_id: profile.manager_id,
        year,
        month,
        hours_total: Number(hoursTotal.toFixed(2)),
        timesheet_status: tsStatus,
        rate,
        rate_currency: rateCurrency,
        base_amount: baseAmount,
        bonuses,
        bonus_totals_by_currency: bonusTotalsByCurrency,
        grand_total: grandTotal,
    }
}

export async function getPayrollSummaryForUser(
    userId: string,
    year: number,
    month: number,
): Promise<PayrollSummary> {
    await assertCanViewPayrollFor(userId)
    validatePeriod(year, month)
    const admin = createServiceClient()
    return buildSummary(admin, userId, year, month)
}

export async function getMyPayrollSummary(year: number, month: number): Promise<PayrollSummary> {
    const ctx = await requireInternalOrAdminAction()
    validatePeriod(year, month)
    const admin = createServiceClient()
    return buildSummary(admin, ctx.userId, year, month)
}

export async function getPayrollSummaryForManager(
    year: number,
    month: number,
): Promise<PayrollSummary[]> {
    const ctx = await requireInternalOrAdminAction()
    validatePeriod(year, month)
    if (!ctx.isManager && !ctx.isAdmin) {
        throw new Error('Wymagane uprawnienia: manager lub administrator.')
    }
    const admin = createServiceClient()
    const { data: team } = await admin
        .from('profiles')
        .select('id, employment_status')
        .eq('manager_id', ctx.userId)
    const memberIds = (((team ?? []) as unknown) as Array<{ id: string; employment_status: string | null }>)
        .filter((p) => p.employment_status !== 'exited')
        .map((p) => p.id)
    if (memberIds.length === 0) return []
    const results: PayrollSummary[] = []
    for (const uid of memberIds) {
        results.push(await buildSummary(admin, uid, year, month))
    }
    return results
}

export interface PayrollAllFilters {
    role?: string
    manager_id?: string
}

export async function getPayrollSummaryAll(
    year: number,
    month: number,
    filters?: PayrollAllFilters,
): Promise<PayrollSummary[]> {
    await requireFinanseOrAdminAction()
    validatePeriod(year, month)
    const admin = createServiceClient()
    let q = admin
        .from('profiles')
        .select('id, employment_status, role, manager_id')
        .in('role', ['admin', 'internal', 'finanse', 'manager', 'talent_community', 'consultant'])
        .order('full_name')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (filters?.role) q = q.eq('role', filters.role as any)
    if (filters?.manager_id) q = q.eq('manager_id', filters.manager_id)
    const { data: profiles, error } = await q
    if (error) throw new Error(`Błąd pobierania profili: ${error.message}`)
    const ids = ((profiles ?? []) as unknown as Array<{
        id: string
        employment_status: string | null
    }>)
        .filter((p) => p.employment_status !== 'exited')
        .map((p) => p.id)
    if (ids.length === 0) return []
    const results: PayrollSummary[] = []
    for (const uid of ids) {
        results.push(await buildSummary(admin, uid, year, month))
    }
    return results
}

// ─── CSV export ───────────────────────────────────────────────────────────

export interface PayrollCsvResult {
    filename: string
    content: string
    row_count: number
}

function escapeCsv(value: string | number | null | undefined): string {
    if (value === null || value === undefined) return ''
    const s = String(value)
    if (/[",\n\r]/.test(s)) {
        return `"${s.replace(/"/g, '""')}"`
    }
    return s
}

export async function exportPayrollCsv(
    year: number,
    month: number,
    scope: 'team' | 'all',
): Promise<PayrollCsvResult> {
    const ctx = await requireInternalOrAdminAction()
    validatePeriod(year, month)
    let summaries: PayrollSummary[]
    if (scope === 'team') {
        summaries = await getPayrollSummaryForManager(year, month)
    } else {
        await requireFinanseOrAdminAction()
        summaries = await getPayrollSummaryAll(year, month)
    }

    const lines: string[] = []
    lines.push(
        [
            'Email',
            'Pracownik',
            'Rola',
            'Rok',
            'Miesiąc',
            'Godziny',
            'Stawka',
            'Waluta stawki',
            'Kwota podstawowa',
            'Suma premii (PLN)',
            'Suma premii (EUR)',
            'Suma premii (USD)',
            'Suma całkowita (gdy waluty pasują)',
            'Status timesheet',
        ]
            .map(escapeCsv)
            .join(','),
    )
    let rowCount = 0
    for (const s of summaries) {
        lines.push(
            [
                s.email,
                s.full_name ?? '',
                s.role,
                s.year,
                s.month,
                s.hours_total.toFixed(2),
                s.rate != null ? s.rate.toFixed(2) : '',
                s.rate_currency ?? '',
                s.base_amount != null ? s.base_amount.toFixed(2) : '',
                (s.bonus_totals_by_currency.PLN ?? 0).toFixed(2),
                (s.bonus_totals_by_currency.EUR ?? 0).toFixed(2),
                (s.bonus_totals_by_currency.USD ?? 0).toFixed(2),
                s.grand_total != null ? s.grand_total.toFixed(2) : '',
                s.timesheet_status,
            ]
                .map(escapeCsv)
                .join(','),
        )
        rowCount++
    }

    const content = '﻿' + lines.join('\r\n') + '\r\n'
    const filename = `payroll_${scope}_${year}-${String(month).padStart(2, '0')}.csv`

    await logAudit(ctx.userId, 'PAYROLL_EXPORTED_CSV', {
        scope,
        year,
        month,
        rows: rowCount,
    })

    return { filename, content, row_count: rowCount }
}
