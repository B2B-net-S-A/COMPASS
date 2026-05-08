'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/admin'
import {
    requireAdminAction,
    requireInternalOrAdminAction,
} from '@/lib/auth/internal-guard'
import { logAudit } from '@/lib/actions/audit'
import { sendTimesheetDecision, sendTimesheetSubmitted } from '@/lib/email'
import { computeTimesheetHash } from '@/lib/hr/timesheet-hash'
import { workingDaysInMonth, type PublicHolidayDate } from '@/lib/hr/working-days'
import { format } from 'date-fns'

export type TimesheetStatus = 'draft' | 'submitted' | 'approved' | 'rejected'

export interface TimesheetHeader {
    id: string
    user_id: string
    year: number
    month: number
    status: TimesheetStatus
    submitted_at: string | null
    approved_by: string | null
    approved_at: string | null
    rejection_note: string | null
    pdf_hash: string | null
    created_at: string
    updated_at: string
}

export interface TimesheetEntryRow {
    id: string
    timesheet_id: string
    work_date: string
    hours: number
    project: string | null
    description: string
    created_at: string
}

export interface TimesheetWithEntries extends TimesheetHeader {
    entries: TimesheetEntryRow[]
}

export interface TimesheetWithEntriesAndUser extends TimesheetWithEntries {
    user_full_name: string | null
    user_email: string
}

const HOURS_BLOCKING_STATUSES = ['vacation', 'sick_leave', 'parental_leave', 'unpaid_leave']

// ─── Helpers ────────────────────────────────────────────────────────────────

function validateMonth(month: number) {
    if (!Number.isInteger(month) || month < 1 || month > 12) {
        throw new Error('Miesiąc musi być w zakresie 1–12.')
    }
}
function validateYear(year: number) {
    if (!Number.isInteger(year) || year < 2024 || year > 2100) {
        throw new Error('Nieprawidłowy rok.')
    }
}

async function fetchEntries(timesheetId: string): Promise<TimesheetEntryRow[]> {
    const supabase = createClient()
    const { data, error } = await supabase
        .from('timesheet_entries')
        .select('*')
        .eq('timesheet_id', timesheetId)
        .order('work_date')
    if (error) throw new Error(`Błąd pobierania entries: ${error.message}`)
    return (data ?? []) as TimesheetEntryRow[]
}

async function checkAttendanceAllowsWork(
    userId: string,
    workDate: string,
): Promise<void> {
    const supabase = createClient()
    const { data } = await supabase
        .from('attendance_records')
        .select('status')
        .eq('user_id', userId)
        .eq('date', workDate)
        .maybeSingle<{ status: string }>()
    if (data && HOURS_BLOCKING_STATUSES.includes(data.status)) {
        throw new Error(
            `Nie możesz logować godzin na ${workDate} — ten dzień ma status urlopowy/L4. Anuluj wniosek lub wybierz inny dzień.`,
        )
    }
}

// ─── User-side ──────────────────────────────────────────────────────────────

export async function getOrCreateMyTimesheet(
    year: number,
    month: number,
): Promise<TimesheetWithEntries> {
    const ctx = await requireInternalOrAdminAction()
    validateYear(year)
    validateMonth(month)
    const supabase = createClient()

    let header: TimesheetHeader | null = null
    const fetchRes = await supabase
        .from('timesheets')
        .select('*')
        .eq('user_id', ctx.userId)
        .eq('year', year)
        .eq('month', month)
        .maybeSingle<TimesheetHeader>()

    if (fetchRes.error) throw new Error(`Błąd pobierania timesheetu: ${fetchRes.error.message}`)
    header = fetchRes.data

    if (!header) {
        const insertRes = await supabase
            .from('timesheets')
            .insert({ user_id: ctx.userId, year, month })
            .select('*')
            .single<TimesheetHeader>()
        if (insertRes.error) throw new Error(`Błąd tworzenia timesheetu: ${insertRes.error.message}`)
        header = insertRes.data
    }

    const entries = await fetchEntries(header.id)
    return { ...header, entries }
}

export async function listMyTimesheets(): Promise<TimesheetHeader[]> {
    const ctx = await requireInternalOrAdminAction()
    const supabase = createClient()
    const { data, error } = await supabase
        .from('timesheets')
        .select('*')
        .eq('user_id', ctx.userId)
        .order('year', { ascending: false })
        .order('month', { ascending: false })
    if (error) throw new Error(`Błąd pobierania historii: ${error.message}`)
    return (data ?? []) as TimesheetHeader[]
}

export async function getMyTimesheet(
    year: number,
    month: number,
): Promise<TimesheetWithEntries | null> {
    const ctx = await requireInternalOrAdminAction()
    validateYear(year)
    validateMonth(month)
    const supabase = createClient()
    const { data: header } = await supabase
        .from('timesheets')
        .select('*')
        .eq('user_id', ctx.userId)
        .eq('year', year)
        .eq('month', month)
        .maybeSingle<TimesheetHeader>()
    if (!header) return null
    const entries = await fetchEntries(header.id)
    return { ...header, entries }
}

export interface AddEntryInput {
    timesheetId: string
    workDate: string
    hours: number
    project?: string | null
    description: string
}

export async function addEntry(input: AddEntryInput): Promise<TimesheetEntryRow> {
    const ctx = await requireInternalOrAdminAction()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.workDate)) {
        throw new Error('work_date musi być w formacie YYYY-MM-DD.')
    }
    if (!Number.isFinite(input.hours) || input.hours <= 0 || input.hours > 24) {
        throw new Error('Liczba godzin musi być w zakresie (0, 24].')
    }
    if (!input.description?.trim()) {
        throw new Error('Opis jest wymagany.')
    }

    const supabase = createClient()
    const { data: header, error: headerErr } = await supabase
        .from('timesheets')
        .select('id, user_id, year, month, status')
        .eq('id', input.timesheetId)
        .single<Pick<TimesheetHeader, 'id' | 'user_id' | 'year' | 'month' | 'status'>>()
    if (headerErr || !header) throw new Error('Timesheet nie istnieje.')
    if (header.user_id !== ctx.userId && !ctx.isAdmin) {
        throw new Error('To nie jest Twój timesheet.')
    }
    if (header.status !== 'draft') {
        throw new Error('Można edytować tylko timesheet w statusie "draft".')
    }

    // Soft constraint: blokuj jeśli dzień to urlop/L4
    await checkAttendanceAllowsWork(header.user_id, input.workDate)

    const { data, error } = await supabase
        .from('timesheet_entries')
        .insert({
            timesheet_id: input.timesheetId,
            work_date: input.workDate,
            hours: input.hours,
            project: input.project?.trim() || null,
            description: input.description.trim(),
        })
        .select('*')
        .single<TimesheetEntryRow>()
    if (error || !data) throw new Error(`Błąd dodania wpisu: ${error?.message ?? 'unknown'}`)
    return data
}

// ─── Phase 12.1: quick-fill whole month with 8h on working days ─────────────

const DEFAULT_QUICK_FILL_DESCRIPTION = 'Praca standardowa'

export interface QuickFillMonthInput {
    timesheetId: string
    hoursPerDay?: number
    project?: string | null
    description?: string
    /** When true, removes existing entries first; otherwise skips dates that already have entries. */
    overwrite?: boolean
}

export interface QuickFillMonthResult {
    inserted: number
    skipped_existing: number
    skipped_leave: number
    total_working_days: number
}

/**
 * Bulk-fill the timesheet for every working day of its month with N hours
 * (default 8). Skips weekends, public holidays, and days the user has on
 * approved/auto leave (vacation, sick, parental, unpaid). Description defaults
 * to "Praca standardowa" — DB requires NOT NULL.
 */
export async function quickFillMonth(input: QuickFillMonthInput): Promise<QuickFillMonthResult> {
    const ctx = await requireInternalOrAdminAction()
    const supabase = createClient()

    const hours = input.hoursPerDay ?? 8
    if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
        throw new Error('hoursPerDay musi być w zakresie (0, 24].')
    }
    const description = (input.description ?? '').trim() || DEFAULT_QUICK_FILL_DESCRIPTION
    const project = input.project?.trim() || null

    const { data: header, error: fetchErr } = await supabase
        .from('timesheets')
        .select('id, user_id, year, month, status')
        .eq('id', input.timesheetId)
        .single<Pick<TimesheetHeader, 'id' | 'user_id' | 'year' | 'month' | 'status'>>()
    if (fetchErr || !header) throw new Error('Timesheet nie istnieje.')
    if (header.user_id !== ctx.userId && !ctx.isAdmin) {
        throw new Error('To nie jest Twój timesheet.')
    }
    if (header.status !== 'draft') {
        throw new Error('Można wypełnić tylko timesheet w statusie "draft".')
    }

    const monthStart = `${header.year}-${String(header.month).padStart(2, '0')}-01`
    const monthEndDate = new Date(header.year, header.month, 0)
    const monthEnd = format(monthEndDate, 'yyyy-MM-dd')

    if (input.overwrite) {
        const { error } = await supabase
            .from('timesheet_entries')
            .delete()
            .eq('timesheet_id', input.timesheetId)
        if (error) throw new Error(`Błąd czyszczenia wpisów: ${error.message}`)
    }

    const [holidaysRes, attendanceRes, existingRes] = await Promise.all([
        supabase
            .from('public_holidays')
            .select('date, name_pl')
            .gte('date', monthStart)
            .lte('date', monthEnd),
        supabase
            .from('attendance_records')
            .select('date, status')
            .eq('user_id', header.user_id)
            .gte('date', monthStart)
            .lte('date', monthEnd),
        input.overwrite
            ? Promise.resolve({ data: [] as Array<{ work_date: string }> })
            : supabase
                  .from('timesheet_entries')
                  .select('work_date')
                  .eq('timesheet_id', input.timesheetId),
    ])

    const holidays = (holidaysRes.data ?? []) as PublicHolidayDate[]
    const blockedDates = new Set(
        ((attendanceRes.data ?? []) as Array<{ date: string; status: string }>)
            .filter((a) => HOURS_BLOCKING_STATUSES.includes(a.status))
            .map((a) => a.date),
    )
    const existingDates = new Set(
        ((existingRes.data ?? []) as Array<{ work_date: string }>).map((e) => e.work_date),
    )

    const allWorkingDays = workingDaysInMonth(header.year, header.month, holidays)
    const totalWorkingDays = allWorkingDays.length

    const rows: Array<{
        timesheet_id: string
        work_date: string
        hours: number
        project: string | null
        description: string
    }> = []
    let skippedLeave = 0
    let skippedExisting = 0

    for (const day of allWorkingDays) {
        const iso = format(day, 'yyyy-MM-dd')
        if (blockedDates.has(iso)) {
            skippedLeave++
            continue
        }
        if (existingDates.has(iso)) {
            skippedExisting++
            continue
        }
        rows.push({
            timesheet_id: input.timesheetId,
            work_date: iso,
            hours,
            project,
            description,
        })
    }

    if (rows.length > 0) {
        const { error } = await supabase.from('timesheet_entries').insert(rows)
        if (error) throw new Error(`Błąd wypełniania timesheetu: ${error.message}`)
    }

    return {
        inserted: rows.length,
        skipped_existing: skippedExisting,
        skipped_leave: skippedLeave,
        total_working_days: totalWorkingDays,
    }
}

export interface UpdateEntryInput {
    entryId: string
    workDate?: string
    hours?: number
    project?: string | null
    description?: string
}

export async function updateEntry(input: UpdateEntryInput): Promise<void> {
    await requireInternalOrAdminAction()
    const supabase = createClient()
    const updates: Record<string, unknown> = {}
    if (input.workDate !== undefined) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(input.workDate)) {
            throw new Error('work_date musi być w formacie YYYY-MM-DD.')
        }
        updates.work_date = input.workDate
    }
    if (input.hours !== undefined) {
        if (!Number.isFinite(input.hours) || input.hours <= 0 || input.hours > 24) {
            throw new Error('Liczba godzin musi być w zakresie (0, 24].')
        }
        updates.hours = input.hours
    }
    if (input.project !== undefined) updates.project = input.project?.trim() || null
    if (input.description !== undefined) {
        if (!input.description.trim()) throw new Error('Opis nie może być pusty.')
        updates.description = input.description.trim()
    }
    if (Object.keys(updates).length === 0) return

    const { error } = await supabase
        .from('timesheet_entries')
        .update(updates)
        .eq('id', input.entryId)
    if (error) throw new Error(`Błąd aktualizacji wpisu: ${error.message}`)
}

export async function deleteEntry(entryId: string): Promise<void> {
    await requireInternalOrAdminAction()
    const supabase = createClient()
    const { error } = await supabase.from('timesheet_entries').delete().eq('id', entryId)
    if (error) throw new Error(`Błąd usunięcia wpisu: ${error.message}`)
}

// ─── Submit / approve / reject ──────────────────────────────────────────────

export async function submitTimesheet(timesheetId: string): Promise<void> {
    const ctx = await requireInternalOrAdminAction()
    const supabase = createClient()
    const { data: header, error: fetchErr } = await supabase
        .from('timesheets')
        .select('id, user_id, year, month, status')
        .eq('id', timesheetId)
        .single<Pick<TimesheetHeader, 'id' | 'user_id' | 'year' | 'month' | 'status'>>()
    if (fetchErr || !header) throw new Error('Timesheet nie istnieje.')
    if (header.user_id !== ctx.userId && !ctx.isAdmin) {
        throw new Error('To nie jest Twój timesheet.')
    }
    if (header.status !== 'draft') {
        throw new Error('Można złożyć tylko timesheet w statusie "draft".')
    }

    const entries = await fetchEntries(timesheetId)
    if (entries.length === 0) {
        throw new Error('Timesheet musi zawierać przynajmniej jeden wpis.')
    }

    const { error } = await supabase
        .from('timesheets')
        .update({
            status: 'submitted',
            submitted_at: new Date().toISOString(),
        })
        .eq('id', timesheetId)
    if (error) throw new Error(`Błąd składania: ${error.message}`)

    await logAudit(ctx.userId, 'TIMESHEET_SUBMITTED', {
        timesheet_id: timesheetId,
        year: header.year,
        month: header.month,
    })

    // Notify admins
    const adminEmails = await fetchAdminEmails()
    if (adminEmails.length > 0) {
        const requesterName = await fetchUserDisplayName(ctx.userId, ctx.email)
        sendTimesheetSubmitted(adminEmails, requesterName, header.year, header.month).catch((e) =>
            console.error('[submitTimesheet] notify failed:', e),
        )
    }
}

export async function approveTimesheet(timesheetId: string): Promise<void> {
    const ctx = await requireAdminAction()
    const admin = createServiceClient()

    const { data: header, error: fetchErr } = await admin
        .from('timesheets')
        .select('id, user_id, year, month, status')
        .eq('id', timesheetId)
        .single<Pick<TimesheetHeader, 'id' | 'user_id' | 'year' | 'month' | 'status'>>()
    if (fetchErr || !header) throw new Error('Timesheet nie istnieje.')
    if (header.status !== 'submitted') {
        throw new Error('Można zaakceptować tylko timesheet w statusie "submitted".')
    }

    const { data: entries } = await admin
        .from('timesheet_entries')
        .select('work_date, hours, project, description')
        .eq('timesheet_id', timesheetId)
    const hash = computeTimesheetHash((entries ?? []) as any)

    const { error } = await admin
        .from('timesheets')
        .update({
            status: 'approved',
            approved_by: ctx.userId,
            approved_at: new Date().toISOString(),
            pdf_hash: hash,
            rejection_note: null,
        })
        .eq('id', timesheetId)
    if (error) throw new Error(`Błąd akceptacji: ${error.message}`)

    await logAudit(ctx.userId, 'TIMESHEET_APPROVED', {
        timesheet_id: timesheetId,
        target_user_id: header.user_id,
        year: header.year,
        month: header.month,
    })

    const userInfo = await fetchUserContact(header.user_id)
    if (userInfo) {
        sendTimesheetDecision(
            userInfo.email,
            userInfo.full_name ?? userInfo.email,
            'approved',
            header.year,
            header.month,
        ).catch((e) => console.error('[approveTimesheet] notify failed:', e))
    }
}

export async function rejectTimesheet(timesheetId: string, reason: string): Promise<void> {
    const ctx = await requireAdminAction()
    if (!reason?.trim()) throw new Error('Powód odrzucenia jest wymagany.')
    const admin = createServiceClient()

    const { data: header, error: fetchErr } = await admin
        .from('timesheets')
        .select('id, user_id, year, month, status')
        .eq('id', timesheetId)
        .single<Pick<TimesheetHeader, 'id' | 'user_id' | 'year' | 'month' | 'status'>>()
    if (fetchErr || !header) throw new Error('Timesheet nie istnieje.')
    if (header.status !== 'submitted') {
        throw new Error('Można odrzucić tylko timesheet w statusie "submitted".')
    }

    const { error } = await admin
        .from('timesheets')
        .update({
            status: 'rejected',
            rejection_note: reason.trim(),
            approved_by: null,
            approved_at: null,
            pdf_hash: null,
        })
        .eq('id', timesheetId)
    if (error) throw new Error(`Błąd odrzucenia: ${error.message}`)

    await logAudit(ctx.userId, 'TIMESHEET_REJECTED', {
        timesheet_id: timesheetId,
        target_user_id: header.user_id,
        reason: reason.trim(),
    })

    // Po reject status idzie z 'submitted' → 'rejected'. Owner odzyska edycję
    // przez `unlockTimesheet` (admin) lub osobny user action `reopenTimesheet` (TODO MVP).
    // Na MVP — admin musi reopenować, lub user zlozyl ponownie po decyzji.

    const userInfo = await fetchUserContact(header.user_id)
    if (userInfo) {
        sendTimesheetDecision(
            userInfo.email,
            userInfo.full_name ?? userInfo.email,
            'rejected',
            header.year,
            header.month,
            reason,
        ).catch((e) => console.error('[rejectTimesheet] notify failed:', e))
    }
}

export async function unlockTimesheet(timesheetId: string): Promise<void> {
    const ctx = await requireAdminAction()
    const admin = createServiceClient()

    const { error } = await admin
        .from('timesheets')
        .update({
            status: 'draft',
            approved_at: null,
            approved_by: null,
            pdf_hash: null,
            submitted_at: null,
        })
        .eq('id', timesheetId)
    if (error) throw new Error(`Błąd odblokowania: ${error.message}`)

    await logAudit(ctx.userId, 'TIMESHEET_UNLOCKED', { timesheet_id: timesheetId })
}

// ─── Admin: monthly listing ─────────────────────────────────────────────────

export async function listAllTimesheetsForMonth(
    year: number,
    month: number,
): Promise<TimesheetWithEntriesAndUser[]> {
    await requireAdminAction()
    validateYear(year)
    validateMonth(month)
    const admin = createServiceClient()

    const { data, error } = await admin
        .from('timesheets')
        .select(`
            *,
            profiles:profiles!timesheets_user_id_fkey(full_name, email)
        `)
        .eq('year', year)
        .eq('month', month)
        .order('status')
    if (error) throw new Error(`Błąd pobierania timesheetów: ${error.message}`)

    const headers = (data ?? []) as Array<TimesheetHeader & { profiles: { full_name: string | null; email: string } | null }>

    // Fetch entries per timesheet (sequential for simplicity; small N)
    const result: TimesheetWithEntriesAndUser[] = []
    for (const h of headers) {
        const { data: entries } = await admin
            .from('timesheet_entries')
            .select('*')
            .eq('timesheet_id', h.id)
            .order('work_date')
        result.push({
            id: h.id,
            user_id: h.user_id,
            year: h.year,
            month: h.month,
            status: h.status,
            submitted_at: h.submitted_at,
            approved_by: h.approved_by,
            approved_at: h.approved_at,
            rejection_note: h.rejection_note,
            pdf_hash: h.pdf_hash,
            created_at: h.created_at,
            updated_at: h.updated_at,
            entries: (entries ?? []) as TimesheetEntryRow[],
            user_full_name: h.profiles?.full_name ?? null,
            user_email: h.profiles?.email ?? '',
        })
    }
    return result
}

// ─── Internal helpers ───────────────────────────────────────────────────────

async function fetchAdminEmails(): Promise<string[]> {
    const admin = createServiceClient()
    const { data } = await admin.from('profiles').select('email').eq('role', 'admin')
    return (data ?? [])
        .map((r: { email: string | null }) => r.email)
        .filter((e): e is string => !!e)
}

async function fetchUserDisplayName(userId: string, fallbackEmail: string): Promise<string> {
    const admin = createServiceClient()
    const { data } = await admin
        .from('profiles')
        .select('full_name')
        .eq('id', userId)
        .single<{ full_name: string | null }>()
    return data?.full_name ?? fallbackEmail
}

async function fetchUserContact(userId: string): Promise<{ email: string; full_name: string | null } | null> {
    const admin = createServiceClient()
    const { data } = await admin
        .from('profiles')
        .select('email, full_name')
        .eq('id', userId)
        .single<{ email: string | null; full_name: string | null }>()
    if (!data?.email) return null
    return { email: data.email, full_name: data.full_name }
}
