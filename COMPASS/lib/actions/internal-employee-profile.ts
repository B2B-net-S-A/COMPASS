'use server'

// Phase 24c — employee HR profile (admin/manager view) + CSV export for accounting.
// Auth scope:
//   - admin: dowolny pracownik
//   - manager: tylko pracownicy z manager_id = ctx.userId (team scope)
//   - finanse: dowolny pracownik (do księgowości — read-only)
//   - pracownik: tylko swój własny profil (exportMyTimesheetsCSV)

import { createServiceClient } from '@/lib/supabase/admin'
import {
    requireInternalOrAdminAction,
    requireTimesheetApproverAction,
} from '@/lib/auth/internal-guard'
import { logAudit } from '@/lib/actions/audit'
import { loadTimesheetHistoryFor, type TimesheetHistoryRow } from './internal-timesheet'
import type { InvoiceRow, InvoiceStatus } from './internal-invoice'
import type { LeaveRequestRow } from './internal-leave'
import type { AppRole } from '@/lib/types/role'

export interface EmployeeProfileSummary {
    user_id: string
    full_name: string | null
    email: string
    role: AppRole
    manager_id: string | null
    manager_full_name: string | null
    employment_status: string | null
    hired_at: string | null
}

export interface EmployeeHRSnapshot {
    profile: EmployeeProfileSummary
    timesheets: TimesheetHistoryRow[]
    invoices: InvoiceHistoryRow[]
    leaves: LeaveHistoryRow[]
    bonuses: BonusHistoryRow[]
    /** Phase 26: viewer (admin or this user's manager) can assign new bonuses for this employee. */
    viewer_can_assign_bonus: boolean
}

export interface InvoiceHistoryRow {
    id: string
    period_year: number
    period_month: number
    amount: number
    currency: string
    status: InvoiceStatus
    invoice_number: string | null
    created_at: string
    reviewed_at: string | null
    manager_reviewed_at: string | null
    rejection_reason: string | null
}

export interface LeaveHistoryRow {
    id: string
    leave_type: string
    start_date: string
    end_date: string
    status: string
    decided_at: string | null
    decision_note: string | null
}

/** Phase 26 — bonus row in employee profile snapshot. */
export interface BonusHistoryRow {
    id: string
    amount: number
    currency: string
    reason: string
    status: 'assigned' | 'pending' | 'paid' | 'cancelled'
    period_year: number | null
    period_month: number | null
    created_at: string
    cancelled_at: string | null
    cancellation_reason: string | null
    proposer_full_name: string | null
}

async function assertCanViewEmployee(userId: string): Promise<void> {
    const ctx = await requireInternalOrAdminAction()
    if (ctx.isAdmin || ctx.role === 'finanse') return
    if (ctx.userId === userId) return
    if (ctx.isManager) {
        const admin = createServiceClient()
        const { data } = await admin
            .from('profiles')
            .select('manager_id')
            .eq('id', userId)
            .single<{ manager_id: string | null }>()
        if (data?.manager_id === ctx.userId) return
    }
    throw new Error('Brak uprawnień do podglądu tego pracownika.')
}

export async function getEmployeeProfile(
    userId: string,
    monthsBack = 12,
): Promise<EmployeeHRSnapshot> {
    await assertCanViewEmployee(userId)
    if (!Number.isInteger(monthsBack) || monthsBack < 1 || monthsBack > 60) {
        throw new Error('monthsBack musi być w zakresie 1–60.')
    }

    const admin = createServiceClient()

    const { data: profileRow, error: pErr } = await admin
        .from('profiles')
        .select(`
            id, full_name, email, role, manager_id, employment_status, hired_at,
            manager:profiles!profiles_manager_id_fkey(full_name)
        `)
        .eq('id', userId)
        .single<{
            id: string
            full_name: string | null
            email: string
            role: AppRole
            manager_id: string | null
            employment_status: string | null
            hired_at: string | null
            manager: { full_name: string | null } | null
        }>()
    if (pErr || !profileRow) throw new Error('Pracownik nie istnieje.')

    const profile: EmployeeProfileSummary = {
        user_id: profileRow.id,
        full_name: profileRow.full_name,
        email: profileRow.email,
        role: profileRow.role,
        manager_id: profileRow.manager_id,
        manager_full_name: profileRow.manager?.full_name ?? null,
        employment_status: profileRow.employment_status,
        hired_at: profileRow.hired_at,
    }

    const timesheets = await loadTimesheetHistoryFor(userId, monthsBack)

    const cutoffYear = new Date().getFullYear()
    const earliestYear = cutoffYear - Math.ceil(monthsBack / 12)

    const ctx = await requireInternalOrAdminAction()
    const viewer_can_assign_bonus =
        ctx.userId !== userId &&
        (ctx.isAdmin || (ctx.isManager && profileRow.manager_id === ctx.userId))

    const [invoicesRes, leavesRes, bonusesRes] = await Promise.all([
        admin
            .from('invoices')
            .select(
                'id, period_year, period_month, amount, currency, status, invoice_number, created_at, reviewed_at, manager_reviewed_at, rejection_reason',
            )
            .eq('user_id', userId)
            .gte('period_year', earliestYear)
            .order('period_year', { ascending: false })
            .order('period_month', { ascending: false }),
        admin
            .from('leave_requests')
            .select('id, leave_type, start_date, end_date, status, decided_at, decision_note')
            .eq('user_id', userId)
            .gte('start_date', `${earliestYear}-01-01`)
            .order('start_date', { ascending: false }),
        // Phase 26 — bonuses for past months. Proposer name joined separately to avoid PostgREST
        // multi-FK ambiguity (bonuses has 3 FKs to profiles: proposed_by, recipient_user_id, cancelled_by).
        admin
            .from('bonuses')
            .select(
                'id, proposed_by, amount, currency, reason, status, period_year, period_month, created_at, cancelled_at, cancellation_reason',
            )
            .eq('recipient_user_id', userId)
            .gte('created_at', `${earliestYear}-01-01`)
            .order('created_at', { ascending: false }),
    ])

    // Resolve proposer names in a single follow-up query.
    const bonusRows = ((bonusesRes.data ?? []) as unknown as Array<{
        id: string
        proposed_by: string
        amount: number | string
        currency: string
        reason: string
        status: 'assigned' | 'pending' | 'paid' | 'cancelled'
        period_year: number | null
        period_month: number | null
        created_at: string
        cancelled_at: string | null
        cancellation_reason: string | null
    }>)
    const proposerIds = Array.from(new Set(bonusRows.map((b) => b.proposed_by)))
    const proposerNameMap = new Map<string, string | null>()
    if (proposerIds.length > 0) {
        const { data: proposers } = await admin
            .from('profiles')
            .select('id, full_name')
            .in('id', proposerIds)
        for (const p of (proposers ?? []) as Array<{ id: string; full_name: string | null }>) {
            proposerNameMap.set(p.id, p.full_name)
        }
    }
    const bonuses: BonusHistoryRow[] = bonusRows.map((b) => ({
        id: b.id,
        amount: Number(b.amount),
        currency: b.currency,
        reason: b.reason,
        status: b.status,
        period_year: b.period_year,
        period_month: b.period_month,
        created_at: b.created_at,
        cancelled_at: b.cancelled_at,
        cancellation_reason: b.cancellation_reason,
        proposer_full_name: proposerNameMap.get(b.proposed_by) ?? null,
    }))

    return {
        profile,
        timesheets,
        invoices: (invoicesRes.data ?? []) as InvoiceHistoryRow[],
        leaves: (leavesRes.data ?? []) as LeaveHistoryRow[],
        bonuses,
        viewer_can_assign_bonus,
    }
}

// ─── CSV export (admin/manager) ─────────────────────────────────────────────

export interface CSVExportRange {
    fromYear: number
    fromMonth: number
    toYear: number
    toMonth: number
}

export interface CSVExportResult {
    filename: string
    content: string
    row_count: number
}

function validateRange(range: CSVExportRange): void {
    const { fromYear, fromMonth, toYear, toMonth } = range
    if (!Number.isInteger(fromYear) || fromYear < 2024 || fromYear > 2100) {
        throw new Error('Nieprawidłowy rok początkowy.')
    }
    if (!Number.isInteger(toYear) || toYear < 2024 || toYear > 2100) {
        throw new Error('Nieprawidłowy rok końcowy.')
    }
    if (!Number.isInteger(fromMonth) || fromMonth < 1 || fromMonth > 12) {
        throw new Error('Miesiąc początkowy musi być w zakresie 1–12.')
    }
    if (!Number.isInteger(toMonth) || toMonth < 1 || toMonth > 12) {
        throw new Error('Miesiąc końcowy musi być w zakresie 1–12.')
    }
    const fromKey = fromYear * 12 + fromMonth
    const toKey = toYear * 12 + toMonth
    if (fromKey > toKey) {
        throw new Error('Okres "od" musi być przed lub równy okresowi "do".')
    }
    if (toKey - fromKey > 24) {
        throw new Error('Zakres maksymalny: 24 miesiące.')
    }
}

function escapeCsv(value: string | number | null | undefined): string {
    if (value === null || value === undefined) return ''
    const s = String(value)
    if (/[",\n\r]/.test(s)) {
        return `"${s.replace(/"/g, '""')}"`
    }
    return s
}

/**
 * Generate CSV with all timesheet entries for the given user across a month
 * range. Header row + one row per entry. Suitable for księgowość/biuro
 * rachunkowe imports. UTF-8 BOM prepended for Excel compatibility.
 */
export async function exportEmployeeTimesheetsCSV(
    userId: string,
    range: CSVExportRange,
): Promise<CSVExportResult> {
    // Anyone with timesheet approver scope can export; team scope still applies
    // for managers (via assertCanViewEmployee).
    await requireTimesheetApproverAction()
    await assertCanViewEmployee(userId)
    validateRange(range)

    const admin = createServiceClient()

    const { data: profile } = await admin
        .from('profiles')
        .select('full_name, email')
        .eq('id', userId)
        .single<{ full_name: string | null; email: string }>()

    // Fetch all timesheets in range with entries.
    const fromKey = range.fromYear * 12 + range.fromMonth
    const toKey = range.toYear * 12 + range.toMonth

    const { data: timesheets, error: tErr } = await admin
        .from('timesheets')
        .select(`
            id, year, month, status,
            timesheet_entries(work_date, hours, project, description)
        `)
        .eq('user_id', userId)
        .order('year', { ascending: true })
        .order('month', { ascending: true })
    if (tErr) throw new Error(`Błąd pobierania timesheetów: ${tErr.message}`)

    const rows = (timesheets ?? []) as Array<{
        id: string
        year: number
        month: number
        status: string
        timesheet_entries: Array<{
            work_date: string
            hours: number
            project: string | null
            description: string
        }>
    }>

    const lines: string[] = []
    lines.push(
        [
            'Pracownik',
            'Email',
            'Rok',
            'Miesiąc',
            'Status',
            'Data',
            'Projekt',
            'Godziny',
            'Opis',
        ]
            .map(escapeCsv)
            .join(','),
    )

    let rowCount = 0
    for (const ts of rows) {
        const key = ts.year * 12 + ts.month
        if (key < fromKey || key > toKey) continue
        for (const entry of ts.timesheet_entries) {
            lines.push(
                [
                    profile?.full_name ?? '',
                    profile?.email ?? '',
                    ts.year,
                    ts.month,
                    ts.status,
                    entry.work_date,
                    entry.project ?? '',
                    Number(entry.hours).toFixed(2),
                    entry.description,
                ]
                    .map(escapeCsv)
                    .join(','),
            )
            rowCount++
        }
    }

    const content = '﻿' + lines.join('\r\n') + '\r\n'
    const slug = (profile?.email ?? userId).replace(/[^a-zA-Z0-9._-]/g, '_')
    const filename = `timesheet_${slug}_${range.fromYear}-${String(range.fromMonth).padStart(2, '0')}_${range.toYear}-${String(range.toMonth).padStart(2, '0')}.csv`

    // Audit
    const ctx = await requireInternalOrAdminAction()
    await logAudit(ctx.userId, 'TIMESHEET_EXPORTED_CSV', {
        target_user_id: userId,
        from: `${range.fromYear}-${range.fromMonth}`,
        to: `${range.toYear}-${range.toMonth}`,
        rows: rowCount,
    })

    return { filename, content, row_count: rowCount }
}

/**
 * Convenience: export current user's own timesheets without team-scope check.
 */
export async function exportMyTimesheetsCSV(range: CSVExportRange): Promise<CSVExportResult> {
    const ctx = await requireInternalOrAdminAction()
    return exportEmployeeTimesheetsCSV(ctx.userId, range)
}
