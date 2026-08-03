'use server'

import { logCompat } from '@/lib/logger'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/admin'
import {
    requireAdminAction,
    requireInternalOrAdminAction,
    requireTimesheetApproverAction,
    type InternalAuthContext,
} from '@/lib/auth/internal-guard'
import { logAudit } from '@/lib/actions/audit'
import { sendTimesheetDecision, sendTimesheetSubmitted } from '@/lib/email'
import { postToTeamsAlert } from '@/lib/teams/webhook'
import { sendPushToUserId } from '@/lib/actions/push-subscriptions'
import { computeTimesheetHash } from '@/lib/hr/timesheet-hash'
import { workingDaysInMonth, type PublicHolidayDate } from '@/lib/hr/working-days'
import {
    buildTimesheetRosterView,
    type TimesheetRosterMember,
} from '@/lib/hr/timesheet-roster'
import { format } from 'date-fns'

// Phase 27g — roles that keep a timesheet (HR zone). Consultants (IT) do not.
const TIMESHEET_HR_ROLES = ['admin', 'internal', 'manager', 'finanse', 'talent_community'] as const

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
    // Phase 17b R8 (PR-B): auto-fill default flow flags
    auto_filled_at?: string | null
    user_cleared_auto_fill?: boolean
}

export type TimesheetEntrySource = 'manual' | 'clock_suggested' | 'clock_accepted'

export interface TimesheetEntryRow {
    id: string
    timesheet_id: string
    work_date: string
    hours: number
    project: string | null
    description: string
    created_at: string
    // Phase 17 — work clock integration
    source: TimesheetEntrySource
    tracked_hours: number | null
    correction_required: boolean
    // Phase 27a — overtime override (admin-only flow)
    is_overtime_override: boolean
    override_reason: string | null
    override_by: string | null
    override_at: string | null
}

// Phase 27a — hard caps. Standard work day = 8h, admin override ceiling = 16h.
const STANDARD_DAILY_HOURS_MAX = 8
const OVERTIME_OVERRIDE_HOURS_MAX = 16
const OVERTIME_REASON_MIN_LENGTH = 5
const OVERTIME_REASON_MAX_LENGTH = 1000

export interface TimesheetWithEntries extends TimesheetHeader {
    entries: TimesheetEntryRow[]
}

export interface TimesheetWithEntriesAndUser extends TimesheetWithEntries {
    user_full_name: string | null
    user_email: string
}

const HOURS_BLOCKING_STATUSES = ['vacation', 'sick_leave', 'parental_leave', 'unpaid_leave', 'holiday_in_lieu']

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
    /**
     * Phase 33b — admin-only inline overtime. When hours > 8 the approver edit
     * flow (admin only) records this as an overtime override; reason ≥5 chars is
     * required. Ignored by the employee self-service flow (capped at 8h).
     */
    overtimeReason?: string | null
}

/**
 * Phase 45 — is the current user allowed to log overtime (>8h/day) on their own
 * timesheet? Drives the employee editor's overtime UI (raised cap + reason field).
 */
export async function getMyOvertimeAllowed(): Promise<boolean> {
    const ctx = await requireInternalOrAdminAction()
    return ctx.canLogOvertime
}

export async function addEntry(input: AddEntryInput): Promise<TimesheetEntryRow> {
    const ctx = await requireInternalOrAdminAction()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.workDate)) {
        throw new Error('work_date musi być w formacie YYYY-MM-DD.')
    }
    // Phase 45: users granted can_log_overtime may log >8h (up to 16h) on their own
    // timesheet; everyone else stays capped at 8h. Overtime rows carry the override
    // columns (reason required) — resolved below.
    const selfMaxHours = ctx.canLogOvertime ? OVERTIME_OVERRIDE_HOURS_MAX : STANDARD_DAILY_HOURS_MAX
    if (!Number.isFinite(input.hours) || input.hours <= 0 || input.hours > selfMaxHours) {
        throw new Error(
            ctx.canLogOvertime
                ? `Godziny muszą być w zakresie (0, ${OVERTIME_OVERRIDE_HOURS_MAX}].`
                : `Maksymalnie ${STANDARD_DAILY_HOURS_MAX}h/dzień. Jeśli realnie pracowałeś więcej, poproś administratora o wpisanie nadgodzin.`,
        )
    }
    if (!input.description?.trim()) {
        throw new Error('Opis jest wymagany.')
    }
    const overtime = resolveOvertimeColumns(ctx, input.hours, input.overtimeReason)

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
            ...overtime,
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
    /**
     * H2.9: dni pominięte z powodu PENDING wniosków urlopowych (jeszcze nie zatwierdzonych).
     * Pomijamy je domyślnie żeby uniknąć race condition: user wypełnia → admin zatwierdza
     * urlop → konflikt między timesheet entries a sync attendance.
     */
    skipped_pending_leave: number
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
    if (!Number.isFinite(hours) || hours <= 0 || hours > STANDARD_DAILY_HOURS_MAX) {
        throw new Error(
            `hoursPerDay musi być w zakresie (0, ${STANDARD_DAILY_HOURS_MAX}]. Dla nadgodzin użyj admin override.`,
        )
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

    const [holidaysRes, attendanceRes, existingRes, pendingLeavesRes] = await Promise.all([
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
        // H2.9: pending leave_requests przecinające miesiąc — pomijamy aby
        // nie wpisać godzin w dni których admin za chwilę zatwierdzi jako urlop.
        supabase
            .from('leave_requests')
            .select('start_date, end_date')
            .eq('user_id', header.user_id)
            .eq('status', 'pending')
            .lte('start_date', monthEnd)
            .gte('end_date', monthStart),
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

    // H2.9: rozwiń każdy pending leave do zbioru dat wewnątrz miesiąca.
    const pendingLeaveDates = new Set<string>()
    for (const lr of (pendingLeavesRes.data ?? []) as Array<{ start_date: string; end_date: string }>) {
        const start = new Date(Math.max(new Date(lr.start_date).getTime(), new Date(monthStart).getTime()))
        const end = new Date(Math.min(new Date(lr.end_date).getTime(), new Date(monthEnd).getTime()))
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            pendingLeaveDates.add(format(d, 'yyyy-MM-dd'))
        }
    }

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
    let skippedPendingLeave = 0

    for (const day of allWorkingDays) {
        const iso = format(day, 'yyyy-MM-dd')
        if (blockedDates.has(iso)) {
            skippedLeave++
            continue
        }
        if (pendingLeaveDates.has(iso)) {
            skippedPendingLeave++
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
        skipped_pending_leave: skippedPendingLeave,
        total_working_days: totalWorkingDays,
    }
}

export interface UpdateEntryInput {
    entryId: string
    workDate?: string
    hours?: number
    project?: string | null
    description?: string
    /**
     * Phase 33b — admin-only inline overtime. When hours > 8 the approver edit
     * flow (admin only) records this as an overtime override; reason ≥5 chars is
     * required. Lowering hours back to ≤8 clears the override.
     */
    overtimeReason?: string | null
}

export async function updateEntry(input: UpdateEntryInput): Promise<void> {
    const ctx = await requireInternalOrAdminAction()
    const supabase = createClient()
    const updates: Record<string, unknown> = {}
    if (input.workDate !== undefined) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(input.workDate)) {
            throw new Error('work_date musi być w formacie YYYY-MM-DD.')
        }
        updates.work_date = input.workDate
    }
    if (input.hours !== undefined) {
        // Phase 45: users granted can_log_overtime may raise a day to >8h (up to 16h);
        // the override columns are (re)set here, and cleared when lowered back to ≤8h.
        const selfMaxHours = ctx.canLogOvertime ? OVERTIME_OVERRIDE_HOURS_MAX : STANDARD_DAILY_HOURS_MAX
        if (!Number.isFinite(input.hours) || input.hours <= 0 || input.hours > selfMaxHours) {
            throw new Error(
                ctx.canLogOvertime
                    ? `Godziny muszą być w zakresie (0, ${OVERTIME_OVERRIDE_HOURS_MAX}].`
                    : `Maksymalnie ${STANDARD_DAILY_HOURS_MAX}h/dzień. Jeśli realnie pracowałeś więcej, poproś administratora o wpisanie nadgodzin.`,
            )
        }
        updates.hours = input.hours
        Object.assign(updates, resolveOvertimeColumns(ctx, input.hours, input.overtimeReason))
    }
    if (input.project !== undefined) updates.project = input.project?.trim() || null
    if (input.description !== undefined) {
        if (!input.description.trim()) throw new Error('Opis nie może być pusty.')
        updates.description = input.description.trim()
    }
    if (Object.keys(updates).length === 0) return

    // Phase 17: when user edits hours, transition source clock_suggested → clock_accepted
    // (signals the user actively reviewed the suggestion).
    if (input.hours !== undefined) {
        const { data: existing } = await supabase
            .from('timesheet_entries')
            .select('source')
            .eq('id', input.entryId)
            .maybeSingle<{ source: string }>()
        if (existing?.source === 'clock_suggested') {
            updates.source = 'clock_accepted'
        }
    }

    const { error } = await supabase
        .from('timesheet_entries')
        .update(updates)
        .eq('id', input.entryId)
    if (error) throw new Error(`Błąd aktualizacji wpisu: ${error.message}`)

    // Phase 17: discrepancy detection — fire-and-forget after successful update.
    if (input.hours !== undefined) {
        const { data: row } = await supabase
            .from('timesheet_entries')
            .select('hours, tracked_hours')
            .eq('id', input.entryId)
            .maybeSingle<{ hours: number; tracked_hours: number | null }>()
        if (row) {
            const { applyCorrectionFlag } = await import('./internal-clock')
            applyCorrectionFlag({
                entryId: input.entryId,
                declaredHours: Number(row.hours),
                trackedHours: row.tracked_hours == null ? null : Number(row.tracked_hours),
            }).catch((e) => logCompat.error('[updateEntry] correction flag failed:', e))
        }
    }
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
            // H2.7: czyść rejection_note po resubmit — user zaadresował feedback,
            // baner "był rejected" znika.
            rejection_note: null,
        })
        .eq('id', timesheetId)
    if (error) throw new Error(`Błąd składania: ${error.message}`)

    await logAudit(ctx.userId, 'TIMESHEET_SUBMITTED', {
        timesheet_id: timesheetId,
        year: header.year,
        month: header.month,
    })

    // Notify admins (email + H3.3 push)
    const adminEmails = await fetchAdminEmails()
    const requesterName = await fetchUserDisplayName(ctx.userId, ctx.email)
    if (adminEmails.length > 0) {
        sendTimesheetSubmitted(adminEmails, requesterName, header.year, header.month).catch((e) =>
            logCompat.error('[submitTimesheet] notify failed:', e),
        )
    }
    const adminClient = createServiceClient()
    const { data: admins } = await adminClient.from('profiles').select('id').eq('role', 'admin')
    for (const a of (admins ?? []) as Array<{ id: string }>) {
        sendPushToUserId(a.id, {
            title: 'Timesheet do akceptacji',
            body: `${requesterName}: ${header.year}-${String(header.month).padStart(2, '0')}`,
            url: '/internal/admin?tab=timesheets',
            tag: `timesheet-submit-${header.year}-${header.month}-${header.user_id}`,
        }).catch((e) => logCompat.error('[submitTimesheet] admin push failed:', e))
    }
}

export async function approveTimesheet(timesheetId: string): Promise<void> {
    // Phase 20: timesheet approver = admin OR manager (manager scoped to own team).
    const ctx = await requireTimesheetApproverAction()
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

    // Phase 20 + 20e: team scope check — niezależnie od roli (admin pomija).
    if (!ctx.isAdmin) {
        const { data: targetProfile } = await admin
            .from('profiles')
            .select('manager_id')
            .eq('id', header.user_id)
            .single<{ manager_id: string | null }>()
        if (targetProfile?.manager_id !== ctx.userId) {
            throw new Error('Możesz akceptować timesheety tylko swojego zespołu.')
        }
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
        ).catch((e) => logCompat.error('[approveTimesheet] notify failed:', e))
    }
    // H3.3: Push notification
    sendPushToUserId(header.user_id, {
        title: 'Timesheet zatwierdzony',
        body: `${header.year}-${String(header.month).padStart(2, '0')} został zaakceptowany.`,
        url: `/internal/timesheet/${header.year}/${header.month}/pdf`,
        tag: `timesheet-${header.year}-${header.month}`,
    }).catch((e) => logCompat.error('[approveTimesheet] push failed:', e))

    // PR3: Teams alert
    const monthLabel = `${header.year}-${String(header.month).padStart(2, '0')}`
    postToTeamsAlert({
        title: 'Timesheet zatwierdzony',
        text: `${userInfo?.full_name ?? userInfo?.email ?? 'Konsultant'} — timesheet ${monthLabel}`,
        themeColor: '22C55E',
        facts: [{ name: 'Miesiąc', value: monthLabel }],
        actionUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://compass.dynaminds.pl'}/internal/admin?tab=timesheets`,
    }).catch((e) => logCompat.error('[approveTimesheet] teams alert failed:', e))
}

export async function rejectTimesheet(timesheetId: string, reason: string): Promise<void> {
    // Phase 20: timesheet approver = admin OR manager (manager scoped to own team).
    const ctx = await requireTimesheetApproverAction()
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

    // Phase 20 + 20e: team scope check — niezależnie od roli (admin pomija).
    if (!ctx.isAdmin) {
        const { data: targetProfile } = await admin
            .from('profiles')
            .select('manager_id')
            .eq('id', header.user_id)
            .single<{ manager_id: string | null }>()
        if (targetProfile?.manager_id !== ctx.userId) {
            throw new Error('Możesz odrzucać timesheety tylko swojego zespołu.')
        }
    }

    const { error } = await admin
        .from('timesheets')
        .update({
            // H2.7: po reject wracamy do 'draft' — user może natychmiast edytować
            // i wysłać ponownie. Audit log + email zachowują info o decyzji.
            // rejection_note zostaje aż do następnego submit (czyści submitTimesheet).
            status: 'draft',
            rejection_note: reason.trim(),
            approved_by: null,
            approved_at: null,
            pdf_hash: null,
            submitted_at: null,
        })
        .eq('id', timesheetId)
    if (error) throw new Error(`Błąd odrzucenia: ${error.message}`)

    await logAudit(ctx.userId, 'TIMESHEET_REJECTED', {
        timesheet_id: timesheetId,
        target_user_id: header.user_id,
        reason: reason.trim(),
    })

    const userInfo = await fetchUserContact(header.user_id)
    if (userInfo) {
        sendTimesheetDecision(
            userInfo.email,
            userInfo.full_name ?? userInfo.email,
            'rejected',
            header.year,
            header.month,
            reason,
        ).catch((e) => logCompat.error('[rejectTimesheet] notify failed:', e))
    }
    // H3.3: Push notification
    sendPushToUserId(header.user_id, {
        title: 'Timesheet odrzucony — popraw',
        body: `Powód: ${reason.slice(0, 100)}`,
        url: `/internal/timesheet/${header.year}/${header.month}`,
        tag: `timesheet-${header.year}-${header.month}`,
    }).catch((e) => logCompat.error('[rejectTimesheet] push failed:', e))

    // PR3: Teams alert
    const monthLabel = `${header.year}-${String(header.month).padStart(2, '0')}`
    postToTeamsAlert({
        title: 'Timesheet odrzucony',
        text: `${userInfo?.full_name ?? userInfo?.email ?? 'Konsultant'} — timesheet ${monthLabel}`,
        themeColor: 'F59E0B',
        facts: [
            { name: 'Miesiąc', value: monthLabel },
            { name: 'Powód', value: reason.slice(0, 200) },
        ],
        actionUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://compass.dynaminds.pl'}/internal/admin?tab=timesheets`,
    }).catch((e) => logCompat.error('[rejectTimesheet] teams alert failed:', e))
}

export async function unlockTimesheet(timesheetId: string): Promise<void> {
    // Phase 27f: approver = admin OR manager-of-team (parytet z approve/reject),
    // żeby manager mógł cofnąć zaakceptowany/odrzucony timesheet swojego zespołu
    // do edycji bez angażowania admina.
    // Phase 32: PO AKCEPCJI manager traci prawo odblokowania — zaakceptowany
    // timesheet może cofnąć do edycji tylko administrator lub finanse, żeby
    // finanse miały stabilny obraz do wypłaty ("nic się już nie zmieni").
    const ctx = await requireTimesheetApproverAction()
    const admin = createServiceClient()

    const { data: header, error: fetchErr } = await admin
        .from('timesheets')
        .select('id, user_id, status')
        .eq('id', timesheetId)
        .single<Pick<TimesheetHeader, 'id' | 'user_id' | 'status'>>()
    if (fetchErr || !header) throw new Error('Timesheet nie istnieje.')

    if (header.status === 'approved' && !ctx.isAdmin && ctx.role !== 'finanse') {
        throw new Error(
            'Po akceptacji timesheet może odblokować tylko administrator lub finanse.',
        )
    }

    await assertApproverTeamScope(admin, ctx, header.user_id)

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

    await logAudit(ctx.userId, 'TIMESHEET_UNLOCKED', {
        timesheet_id: timesheetId,
        target_user_id: header.user_id,
    })
}

// ─── Phase 27f — Approver in-place entry editing (admin OR manager-of-team) ──
//
// Pozwala approverowi poprawić wpisy timesheetu pracownika bez czekania aż ten
// złoży go do akceptacji (np. "Martyna wczoraj 4h, nie 5h"). Odpowiedniki
// user-side addEntry/updateEntry/deleteEntry, ale:
//   1. requireTimesheetApproverAction() + team-scope (admin pomija) — parytet z
//      approveTimesheet/rejectTimesheet.
//   2. service client — RLS na timesheet_entries dopuszcza tylko owner-on-draft
//      lub admin, więc manager musi iść przez serwis z jawnym sprawdzeniem.
//   3. edycja dozwolona w statusie 'draft' LUB 'submitted'. 'approved' niesie
//      hash audytowy — najpierw odblokuj (unlockTimesheet).
// Wpisy z nadgodzinami (is_overtime_override) są poza tym flow — zostają w
// admin-only panelu nadgodzin (adminOverrideTimesheetEntry).

const APPROVER_EDITABLE_STATUSES: TimesheetStatus[] = ['draft', 'submitted']

type ServiceClient = ReturnType<typeof createServiceClient>

/** Throws unless ctx is admin or the manager of `targetUserId`. */
async function assertApproverTeamScope(
    admin: ServiceClient,
    ctx: InternalAuthContext,
    targetUserId: string,
): Promise<void> {
    if (ctx.isAdmin) return
    const { data: target } = await admin
        .from('profiles')
        .select('manager_id')
        .eq('id', targetUserId)
        .single<{ manager_id: string | null }>()
    if (target?.manager_id !== ctx.userId) {
        throw new Error('Możesz edytować timesheety tylko swojego zespołu.')
    }
}

/** Loads the timesheet, enforces team scope + editable status. */
async function loadApproverEditableTimesheet(
    admin: ServiceClient,
    ctx: InternalAuthContext,
    timesheetId: string,
): Promise<Pick<TimesheetHeader, 'id' | 'user_id' | 'year' | 'month' | 'status'>> {
    const { data: header, error } = await admin
        .from('timesheets')
        .select('id, user_id, year, month, status')
        .eq('id', timesheetId)
        .single<Pick<TimesheetHeader, 'id' | 'user_id' | 'year' | 'month' | 'status'>>()
    if (error || !header) throw new Error('Timesheet nie istnieje.')

    await assertApproverTeamScope(admin, ctx, header.user_id)

    if (!APPROVER_EDITABLE_STATUSES.includes(header.status)) {
        throw new Error(
            'Można edytować tylko timesheet w statusie szkic lub oczekujący. Zaakceptowany najpierw odblokuj.',
        )
    }
    return header
}

/** Soft constraint (parytet z user flow): blokuj wpis na dzień urlopu/L4. */
async function assertApproverDateNotBlocked(
    admin: ServiceClient,
    userId: string,
    workDate: string,
): Promise<void> {
    const { data } = await admin
        .from('attendance_records')
        .select('status')
        .eq('user_id', userId)
        .eq('date', workDate)
        .maybeSingle<{ status: string }>()
    if (data && HOURS_BLOCKING_STATUSES.includes(data.status)) {
        throw new Error(
            `Nie można logować godzin na ${workDate} — ten dzień ma status urlopowy/L4.`,
        )
    }
}

/** Override column patch returned by {@link resolveOvertimeColumns}. */
interface OvertimeColumns {
    is_overtime_override: boolean
    override_reason: string | null
    override_by: string | null
    override_at: string | null
}

/**
 * Phase 33b / 45 — resolve the overtime-override columns for an entered `hours`
 * value (approver flow or self-service). Standard days (≤8h) clear any override.
 * Days > 8h are an overtime override allowed for admins OR users granted
 * `can_log_overtime` (Phase 45): capped at {@link OVERTIME_OVERRIDE_HOURS_MAX}
 * and requiring a reason (≥{@link OVERTIME_REASON_MIN_LENGTH} chars), matching
 * the dedicated overtime panel + the DB CHECK/trigger from Phase 27a (widened in Phase 45).
 */
function resolveOvertimeColumns(
    ctx: InternalAuthContext,
    hours: number,
    reason: string | null | undefined,
): OvertimeColumns {
    if (hours <= STANDARD_DAILY_HOURS_MAX) {
        return {
            is_overtime_override: false,
            override_reason: null,
            override_by: null,
            override_at: null,
        }
    }
    // Phase 45: overtime (>8h) is admin OR a user granted can_log_overtime.
    if (!ctx.isAdmin && !ctx.canLogOvertime) {
        throw new Error(
            `Maksymalnie ${STANDARD_DAILY_HOURS_MAX}h/dzień. Nadgodziny (>8h) może wpisać tylko administrator lub osoba z nadanym uprawnieniem.`,
        )
    }
    if (hours > OVERTIME_OVERRIDE_HOURS_MAX) {
        throw new Error(`Maksymalnie ${OVERTIME_OVERRIDE_HOURS_MAX}h/dzień (nadgodziny).`)
    }
    const trimmed = (reason ?? '').trim()
    if (trimmed.length < OVERTIME_REASON_MIN_LENGTH) {
        throw new Error(
            `Uzasadnienie nadgodzin musi mieć co najmniej ${OVERTIME_REASON_MIN_LENGTH} znaki.`,
        )
    }
    if (trimmed.length > OVERTIME_REASON_MAX_LENGTH) {
        throw new Error(`Uzasadnienie za długie (max ${OVERTIME_REASON_MAX_LENGTH} znaków).`)
    }
    return {
        is_overtime_override: true,
        override_reason: trimmed,
        override_by: ctx.userId,
        override_at: new Date().toISOString(),
    }
}

export async function approverAddEntry(input: AddEntryInput): Promise<TimesheetEntryRow> {
    const ctx = await requireTimesheetApproverAction()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.workDate)) {
        throw new Error('work_date musi być w formacie YYYY-MM-DD.')
    }
    if (!Number.isFinite(input.hours) || input.hours <= 0 || input.hours > OVERTIME_OVERRIDE_HOURS_MAX) {
        throw new Error(`Godziny muszą być w zakresie (0, ${OVERTIME_OVERRIDE_HOURS_MAX}].`)
    }
    if (!input.description?.trim()) throw new Error('Opis jest wymagany.')
    // Phase 33b — >8h is an admin-only overtime override (reason required). ≤8h clears it.
    const overtime = resolveOvertimeColumns(ctx, input.hours, input.overtimeReason)

    const admin = createServiceClient()
    const header = await loadApproverEditableTimesheet(admin, ctx, input.timesheetId)
    await assertApproverDateNotBlocked(admin, header.user_id, input.workDate)

    const { data, error } = await admin
        .from('timesheet_entries')
        .insert({
            timesheet_id: header.id,
            work_date: input.workDate,
            hours: input.hours,
            project: input.project?.trim() || null,
            description: input.description.trim(),
            ...overtime,
        })
        .select('*')
        .single<TimesheetEntryRow>()
    if (error || !data) throw new Error(`Błąd dodania wpisu: ${error?.message ?? 'unknown'}`)

    await logAudit(ctx.userId, 'TIMESHEET_ENTRY_ADDED_BY_APPROVER', {
        timesheet_id: header.id,
        target_user_id: header.user_id,
        entry_id: data.id,
        work_date: input.workDate,
        hours: input.hours,
        is_overtime_override: overtime.is_overtime_override,
        ...(overtime.is_overtime_override ? { override_reason: overtime.override_reason } : {}),
    })
    return data
}

export async function approverUpdateEntry(input: UpdateEntryInput): Promise<TimesheetEntryRow> {
    const ctx = await requireTimesheetApproverAction()
    const admin = createServiceClient()

    const { data: entry, error: eErr } = await admin
        .from('timesheet_entries')
        .select('id, timesheet_id, is_overtime_override')
        .eq('id', input.entryId)
        .single<{ id: string; timesheet_id: string; is_overtime_override: boolean }>()
    if (eErr || !entry) throw new Error('Wpis nie istnieje.')
    // Confirm the approver may edit THIS timesheet (team scope + editable status) BEFORE any
    // entry-specific logic, so an out-of-scope actor is rejected first.
    const header = await loadApproverEditableTimesheet(admin, ctx, entry.timesheet_id)
    // Phase 33b / 45 — overtime rows are editable inline by admins OR users granted
    // can_log_overtime; other approvers (plain managers) cannot touch overtime entries.
    if (entry.is_overtime_override && !ctx.isAdmin && !ctx.canLogOvertime) {
        throw new Error('Ten wpis to nadgodziny — może go edytować administrator lub osoba z uprawnieniem do nadgodzin.')
    }

    const updates: Record<string, unknown> = {}
    if (input.workDate !== undefined) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(input.workDate)) {
            throw new Error('work_date musi być w formacie YYYY-MM-DD.')
        }
        updates.work_date = input.workDate
    }
    if (input.hours !== undefined) {
        if (!Number.isFinite(input.hours) || input.hours <= 0 || input.hours > OVERTIME_OVERRIDE_HOURS_MAX) {
            throw new Error(`Godziny muszą być w zakresie (0, ${OVERTIME_OVERRIDE_HOURS_MAX}].`)
        }
        updates.hours = input.hours
        // Phase 33b — >8h = admin-only overtime override (reason required); ≤8h clears it.
        const overtime = resolveOvertimeColumns(ctx, input.hours, input.overtimeReason)
        updates.is_overtime_override = overtime.is_overtime_override
        updates.override_reason = overtime.override_reason
        updates.override_by = overtime.override_by
        updates.override_at = overtime.override_at
    }
    if (input.project !== undefined) updates.project = input.project?.trim() || null
    if (input.description !== undefined) {
        if (!input.description.trim()) throw new Error('Opis nie może być pusty.')
        updates.description = input.description.trim()
    }
    if (Object.keys(updates).length === 0) {
        const { data: cur } = await admin
            .from('timesheet_entries')
            .select('*')
            .eq('id', input.entryId)
            .single<TimesheetEntryRow>()
        if (!cur) throw new Error('Wpis nie istnieje.')
        return cur
    }
    if (input.workDate !== undefined) {
        await assertApproverDateNotBlocked(admin, header.user_id, input.workDate)
    }

    const { data, error } = await admin
        .from('timesheet_entries')
        .update(updates)
        .eq('id', input.entryId)
        .select('*')
        .single<TimesheetEntryRow>()
    if (error || !data) throw new Error(`Błąd aktualizacji wpisu: ${error?.message ?? 'unknown'}`)

    await logAudit(ctx.userId, 'TIMESHEET_ENTRY_EDITED_BY_APPROVER', {
        timesheet_id: header.id,
        target_user_id: header.user_id,
        entry_id: input.entryId,
        changes: updates,
    })
    return data
}

export async function approverDeleteEntry(entryId: string): Promise<void> {
    const ctx = await requireTimesheetApproverAction()
    const admin = createServiceClient()

    const { data: entry, error: eErr } = await admin
        .from('timesheet_entries')
        .select('id, timesheet_id, work_date, hours, is_overtime_override')
        .eq('id', entryId)
        .single<{
            id: string
            timesheet_id: string
            work_date: string
            hours: number
            is_overtime_override: boolean
        }>()
    if (eErr || !entry) throw new Error('Wpis nie istnieje.')
    // Confirm the approver may edit THIS timesheet (team scope + editable status) BEFORE any
    // entry-specific logic, so an out-of-scope actor is rejected first.
    const header = await loadApproverEditableTimesheet(admin, ctx, entry.timesheet_id)
    // Phase 33b / 45 — admins OR users granted can_log_overtime may delete overtime
    // rows inline; other approvers (plain managers) cannot.
    if (entry.is_overtime_override && !ctx.isAdmin && !ctx.canLogOvertime) {
        throw new Error('Ten wpis to nadgodziny — może go usunąć administrator lub osoba z uprawnieniem do nadgodzin.')
    }

    const { error } = await admin.from('timesheet_entries').delete().eq('id', entryId)
    if (error) throw new Error(`Błąd usunięcia wpisu: ${error.message}`)

    await logAudit(ctx.userId, 'TIMESHEET_ENTRY_DELETED_BY_APPROVER', {
        timesheet_id: header.id,
        target_user_id: header.user_id,
        entry_id: entryId,
        work_date: entry.work_date,
        hours: Number(entry.hours),
    })
}

// ─── Phase 24: copy descriptions from previous approved month ──────────────

export interface CopyPreviousMonthResult {
    source_year: number
    source_month: number
    inserted: number
    skipped_existing: number
    skipped_no_source: boolean
}

/**
 * Phase 24a/b — copy description + project (NOT hours) from the most recent
 * approved timesheet of the same user. Skips days that already have entries.
 * Does NOT change attendance / quick-fill semantics — pure description fill.
 *
 * Use case: pracownik zaczyna nowy miesiąc, klika "Skopiuj z poprzedniego" —
 * dni robocze są wypełnione 8h Wand'em, a opisy przychodzą z poprzedniego
 * zaakceptowanego miesiąca (np. "Konsultacje SAP S/4HANA, projekt B2B").
 */
export async function copyPreviousMonthEntries(
    timesheetId: string,
): Promise<CopyPreviousMonthResult> {
    const ctx = await requireInternalOrAdminAction()
    const supabase = createClient()

    const { data: header, error: hErr } = await supabase
        .from('timesheets')
        .select('id, user_id, year, month, status')
        .eq('id', timesheetId)
        .single<Pick<TimesheetHeader, 'id' | 'user_id' | 'year' | 'month' | 'status'>>()
    if (hErr || !header) throw new Error('Timesheet nie istnieje.')
    if (header.user_id !== ctx.userId && !ctx.isAdmin) {
        throw new Error('To nie jest Twój timesheet.')
    }
    if (header.status !== 'draft') {
        throw new Error('Można kopiować opisy tylko do timesheetu w statusie "draft".')
    }

    // Find the most recent APPROVED timesheet for same user, before this month.
    const { data: source } = await supabase
        .from('timesheets')
        .select('id, year, month')
        .eq('user_id', header.user_id)
        .eq('status', 'approved')
        .or(
            `year.lt.${header.year},and(year.eq.${header.year},month.lt.${header.month})`,
        )
        .order('year', { ascending: false })
        .order('month', { ascending: false })
        .limit(1)
        .maybeSingle<{ id: string; year: number; month: number }>()

    if (!source) {
        return {
            source_year: 0,
            source_month: 0,
            inserted: 0,
            skipped_existing: 0,
            skipped_no_source: true,
        }
    }

    const [sourceEntriesRes, currentEntriesRes] = await Promise.all([
        supabase
            .from('timesheet_entries')
            .select('work_date, project, description')
            .eq('timesheet_id', source.id)
            .order('work_date'),
        supabase
            .from('timesheet_entries')
            .select('id, work_date')
            .eq('timesheet_id', header.id),
    ])

    const sourceEntries = (sourceEntriesRes.data ?? []) as Array<{
        work_date: string
        project: string | null
        description: string
    }>
    const currentByDay = new Map<number, { id: string; work_date: string }>()
    for (const c of (currentEntriesRes.data ?? []) as Array<{ id: string; work_date: string }>) {
        const dayOfMonth = Number(c.work_date.slice(8, 10))
        currentByDay.set(dayOfMonth, c)
    }

    // Determine mapping: same day-of-month from source → current month.
    // E.g. source 2026-04-15 → current 2026-05-15. Skip if current day already
    // has an entry (preserve user's existing work).
    const monthEndDate = new Date(header.year, header.month, 0).getDate()
    const updates: Array<{ id: string; project: string | null; description: string }> = []
    const inserts: Array<{
        timesheet_id: string
        work_date: string
        hours: number
        project: string | null
        description: string
    }> = []
    let skippedExisting = 0

    for (const src of sourceEntries) {
        const dayOfMonth = Number(src.work_date.slice(8, 10))
        if (dayOfMonth > monthEndDate) continue
        const target = currentByDay.get(dayOfMonth)
        if (target) {
            // Only update description/project — never override existing description.
            // Pattern: only fill if existing description is empty (impossible per
            // NOT NULL constraint), so we always skip — user already has data.
            skippedExisting++
            continue
        }
        const iso = `${header.year}-${String(header.month).padStart(2, '0')}-${String(dayOfMonth).padStart(2, '0')}`
        inserts.push({
            timesheet_id: header.id,
            work_date: iso,
            hours: 8,
            project: src.project,
            description: src.description,
        })
    }

    if (inserts.length > 0) {
        // Check attendance blockers (urlop/L4) — pomijamy te dni.
        const blockedRes = await supabase
            .from('attendance_records')
            .select('date, status')
            .eq('user_id', header.user_id)
            .in('date', inserts.map((i) => i.work_date))
        const blockedDates = new Set(
            ((blockedRes.data ?? []) as Array<{ date: string; status: string }>)
                .filter((a) => HOURS_BLOCKING_STATUSES.includes(a.status))
                .map((a) => a.date),
        )
        const filtered = inserts.filter((i) => !blockedDates.has(i.work_date))

        if (filtered.length > 0) {
            const { error } = await supabase.from('timesheet_entries').insert(filtered)
            if (error) throw new Error(`Błąd kopiowania wpisów: ${error.message}`)
        }

        await logAudit(ctx.userId, 'TIMESHEET_COPIED_FROM_PREVIOUS', {
            timesheet_id: header.id,
            source_year: source.year,
            source_month: source.month,
            inserted: filtered.length,
        })

        return {
            source_year: source.year,
            source_month: source.month,
            inserted: filtered.length,
            skipped_existing: skippedExisting,
            skipped_no_source: false,
        }
    }

    // Nothing inserted (all days blocked or already filled), still update updates if any
    if (updates.length > 0) {
        // Reserved for future when description-overwrite is desired.
    }

    return {
        source_year: source.year,
        source_month: source.month,
        inserted: 0,
        skipped_existing: skippedExisting,
        skipped_no_source: false,
    }
}

// ─── Phase 24: monthly history (last N months) ──────────────────────────────

export interface TimesheetHistoryRow {
    year: number
    month: number
    status: TimesheetStatus
    total_hours: number
    entry_count: number
    approved_at: string | null
    submitted_at: string | null
    rejection_note: string | null
}

/**
 * Phase 24c — return the last `monthsBack` months of timesheet history for the
 * current user, even if a month has no timesheet yet (empty status='missing').
 * Used by /internal/timesheet/archiwum page.
 */
export async function listMyTimesheetHistory(
    monthsBack = 12,
): Promise<TimesheetHistoryRow[]> {
    const ctx = await requireInternalOrAdminAction()
    if (!Number.isInteger(monthsBack) || monthsBack < 1 || monthsBack > 60) {
        throw new Error('monthsBack musi być w zakresie 1–60.')
    }
    return loadTimesheetHistoryFor(ctx.userId, monthsBack)
}

/**
 * Internal helper — shared between user-facing listMyTimesheetHistory and
 * admin-facing EmployeeProfileDialog. Reads from the user's own scope.
 */
export async function loadTimesheetHistoryFor(
    userId: string,
    monthsBack: number,
): Promise<TimesheetHistoryRow[]> {
    const supabase = createClient()
    const now = new Date()
    const startYear = now.getFullYear()
    const startMonth = now.getMonth() + 1
    const totalMonths = monthsBack

    // Compute window: from (startYear, startMonth) back by totalMonths.
    const window: Array<{ year: number; month: number }> = []
    for (let i = 0; i < totalMonths; i++) {
        let m = startMonth - i
        let y = startYear
        while (m <= 0) {
            m += 12
            y -= 1
        }
        window.push({ year: y, month: m })
    }
    const lastY = window[window.length - 1].year
    const lastM = window[window.length - 1].month

    const { data, error } = await supabase
        .from('timesheets')
        .select(`
            year, month, status, submitted_at, approved_at, rejection_note,
            timesheet_entries(hours)
        `)
        .eq('user_id', userId)
        .or(
            `and(year.eq.${startYear},month.lte.${startMonth}),and(year.lt.${startYear},year.gt.${lastY}),and(year.eq.${lastY},month.gte.${lastM})`,
        )
        .order('year', { ascending: false })
        .order('month', { ascending: false })
    if (error) throw new Error(`Błąd pobierania historii: ${error.message}`)

    const map = new Map<string, TimesheetHistoryRow>()
    for (const row of (data ?? []) as Array<{
        year: number
        month: number
        status: TimesheetStatus
        submitted_at: string | null
        approved_at: string | null
        rejection_note: string | null
        timesheet_entries: Array<{ hours: number }>
    }>) {
        const key = `${row.year}-${row.month}`
        const total = row.timesheet_entries.reduce((s, e) => s + Number(e.hours), 0)
        map.set(key, {
            year: row.year,
            month: row.month,
            status: row.status,
            total_hours: total,
            entry_count: row.timesheet_entries.length,
            approved_at: row.approved_at,
            submitted_at: row.submitted_at,
            rejection_note: row.rejection_note,
        })
    }

    return window.map(({ year, month }) => {
        const row = map.get(`${year}-${month}`)
        if (row) return row
        return {
            year,
            month,
            status: 'draft',
            total_hours: 0,
            entry_count: 0,
            approved_at: null,
            submitted_at: null,
            rejection_note: null,
        }
    })
}

// ─── Admin: monthly listing ─────────────────────────────────────────────────

export async function listAllTimesheetsForMonth(
    year: number,
    month: number,
): Promise<TimesheetWithEntriesAndUser[]> {
    // Phase 20: manager widzi tylko swój zespół; admin widzi wszystko.
    const ctx = await requireTimesheetApproverAction()
    validateYear(year)
    validateMonth(month)
    const admin = createServiceClient()

    let query = admin
        .from('timesheets')
        .select(`
            *,
            profiles:profiles!timesheets_user_id_fkey(full_name, email, manager_id)
        `)
        .eq('year', year)
        .eq('month', month)
        .order('status')

    // Phase 20e: każdy nie-admin widzi tylko swój zespół (przez manager_id link).
    if (!ctx.isAdmin) {
        const { data: teamIds } = await admin
            .from('profiles')
            .select('id')
            .eq('manager_id', ctx.userId)
        const ids = ((teamIds ?? []) as Array<{ id: string }>).map((p) => p.id)
        if (ids.length === 0) {
            return []
        }
        query = query.in('user_id', ids)
    }

    const { data, error } = await query
    if (error) throw new Error(`Błąd pobierania timesheetów: ${error.message}`)

    const headers = (data ?? []) as Array<TimesheetHeader & { profiles: { full_name: string | null; email: string } | null }>

    // Fetch entries per timesheet (sequential for simplicity; small N)
    const existing: TimesheetWithEntriesAndUser[] = []
    for (const h of headers) {
        const { data: entries } = await admin
            .from('timesheet_entries')
            .select('*')
            .eq('timesheet_id', h.id)
            .order('work_date')
        existing.push({
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
            // Phase 27a — cast through `unknown` because Supabase-generated types
            // don't yet know about override_* columns (regenerated after migration apply).
            entries: ((entries ?? []) as unknown) as TimesheetEntryRow[],
            user_full_name: h.profiles?.full_name ?? null,
            user_email: h.profiles?.email ?? '',
        })
    }

    // Phase 27g — show every team member, even those with no timesheet yet, so
    // the approver can fill one on their behalf. Placeholder rows (id='') are
    // materialized into a real draft by ensureTeamTimesheet() when opened.
    const roster = await fetchTimesheetRoster(admin, ctx)
    return buildTimesheetRosterView(existing, roster, year, month)
}

/**
 * Phase 27g — team members eligible for an on-behalf timesheet.
 *  - Admin: all active HR-zone employees (except self).
 *  - Manager: direct reports only (profiles.manager_id = ctx.userId).
 * Consultants (IT) keep no timesheet and are excluded; so are exited/offboarding.
 */
async function fetchTimesheetRoster(
    admin: ServiceClient,
    ctx: InternalAuthContext,
): Promise<TimesheetRosterMember[]> {
    let query = admin
        .from('profiles')
        .select('id, full_name, email, role, manager_id, employment_status')
        .in('role', TIMESHEET_HR_ROLES)
        .neq('id', ctx.userId)
    if (!ctx.isAdmin) {
        query = query.eq('manager_id', ctx.userId)
    }
    const { data, error } = await query
    if (error) throw new Error(`Błąd pobierania zespołu: ${error.message}`)
    return ((data ?? []) as unknown as Array<TimesheetRosterMember & { employment_status: string | null }>)
        .filter((p) => p.employment_status !== 'exited' && p.employment_status !== 'offboarding')
        .map(({ id, full_name, email }) => ({ id, full_name, email }))
}

/**
 * Phase 27g — get-or-create a team member's timesheet so the approver can fill
 * it on their behalf. Used when opening a placeholder row from the HR queue.
 * Re-checks team scope server-side (admin pomija). The created row is a normal
 * empty draft — the employee's own auto-fill-from-clock still triggers later
 * (it keys on auto_filled_at, which stays null here).
 */
export async function ensureTeamTimesheet(
    targetUserId: string,
    year: number,
    month: number,
): Promise<TimesheetWithEntriesAndUser> {
    const ctx = await requireTimesheetApproverAction()
    validateYear(year)
    validateMonth(month)
    const admin = createServiceClient()
    await assertApproverTeamScope(admin, ctx, targetUserId)

    const contact = await fetchUserContact(targetUserId)

    let header: TimesheetHeader | null = null
    const { data: existing } = await admin
        .from('timesheets')
        .select('*')
        .eq('user_id', targetUserId)
        .eq('year', year)
        .eq('month', month)
        .maybeSingle<TimesheetHeader>()
    header = existing

    if (!header) {
        const insertRes = await admin
            .from('timesheets')
            .insert({ user_id: targetUserId, year, month })
            .select('*')
            .single<TimesheetHeader>()
        if (insertRes.error || !insertRes.data) {
            // UNIQUE(user_id, year, month) race (employee opened their tab at the
            // same time) — re-fetch the row the other writer created.
            const refetch = await admin
                .from('timesheets')
                .select('*')
                .eq('user_id', targetUserId)
                .eq('year', year)
                .eq('month', month)
                .single<TimesheetHeader>()
            if (refetch.error || !refetch.data) {
                throw new Error(
                    `Błąd tworzenia timesheetu: ${insertRes.error?.message ?? 'unknown'}`,
                )
            }
            header = refetch.data
        } else {
            header = insertRes.data
            await logAudit(ctx.userId, 'TIMESHEET_CREATED_BY_APPROVER', {
                timesheet_id: header.id,
                target_user_id: targetUserId,
                year,
                month,
            })
        }
    }

    const { data: entries } = await admin
        .from('timesheet_entries')
        .select('*')
        .eq('timesheet_id', header.id)
        .order('work_date')

    return {
        ...header,
        entries: ((entries ?? []) as unknown) as TimesheetEntryRow[],
        user_full_name: contact?.full_name ?? null,
        user_email: contact?.email ?? '',
    }
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

// ─── Phase 27a — Admin overtime override ────────────────────────────────────

export interface AdminOverrideTimesheetEntryInput {
    entryId: string
    hours: number
    reason: string
}

/**
 * Phase 27a — Admin-only: enter hours > 8 for a day with audit trail.
 *
 * Standard timesheet flow blocks anything > 8h/dzień. When an employee actually
 * worked more (e.g. weekend deployment, emergency rollout), admin uses this
 * action to record the real number. Trigger `enforce_overtime_override_admin_only`
 * in the database verifies `override_by` has role='admin' (defense-in-depth).
 *
 * Updates entry to hours (0 < h ≤ 16), sets is_overtime_override=TRUE,
 * override_reason/by/at. Notifies the owner via push.
 */
export async function adminOverrideTimesheetEntry(
    input: AdminOverrideTimesheetEntryInput,
): Promise<void> {
    const ctx = await requireAdminAction()
    if (!Number.isFinite(input.hours) || input.hours <= 0 || input.hours > OVERTIME_OVERRIDE_HOURS_MAX) {
        throw new Error(`Godziny muszą być w zakresie (0, ${OVERTIME_OVERRIDE_HOURS_MAX}].`)
    }
    const reason = input.reason.trim()
    if (reason.length < OVERTIME_REASON_MIN_LENGTH) {
        throw new Error(`Uzasadnienie musi mieć co najmniej ${OVERTIME_REASON_MIN_LENGTH} znaki.`)
    }
    if (reason.length > OVERTIME_REASON_MAX_LENGTH) {
        throw new Error(`Uzasadnienie za długie (max ${OVERTIME_REASON_MAX_LENGTH} znaków).`)
    }

    const admin = createServiceClient()

    // Fetch entry + parent timesheet owner for audit + push notification.
    const { data: entry, error: fetchErr } = await admin
        .from('timesheet_entries')
        .select('id, timesheet_id, work_date, hours, timesheets!inner(user_id, year, month)')
        .eq('id', input.entryId)
        .single<{
            id: string
            timesheet_id: string
            work_date: string
            hours: number
            timesheets: { user_id: string; year: number; month: number }
        }>()
    if (fetchErr || !entry) throw new Error('Wpis nie istnieje.')

    const { error } = await admin
        .from('timesheet_entries')
        .update({
            hours: input.hours,
            is_overtime_override: true,
            override_reason: reason,
            override_by: ctx.userId,
            override_at: new Date().toISOString(),
        })
        .eq('id', input.entryId)
    if (error) throw new Error(`Błąd zapisania nadgodzin: ${error.message}`)

    await logAudit(ctx.userId, 'TIMESHEET_OVERTIME_OVERRIDE', {
        entry_id: input.entryId,
        target_user_id: entry.timesheets.user_id,
        work_date: entry.work_date,
        previous_hours: Number(entry.hours),
        new_hours: input.hours,
        reason,
    })

    // Push notification to employee (fire-and-forget).
    const monthLabel = `${entry.timesheets.year}-${String(entry.timesheets.month).padStart(2, '0')}`
    sendPushToUserId(entry.timesheets.user_id, {
        title: 'Nadgodziny wpisane przez administratora',
        body: `${entry.work_date}: ${input.hours}h (${reason.slice(0, 80)})`,
        url: `/internal?tab=timesheet&year=${entry.timesheets.year}&month=${entry.timesheets.month}`,
        tag: `timesheet-overtime-${entry.id}`,
    }).catch((e) => logCompat.error('[adminOverrideTimesheetEntry] push failed:', e))
}

/**
 * Phase 27a — Admin-only: clear overtime override on an entry.
 *
 * Sets hours back to 8 (standard cap), clears all override_* fields. Use when
 * the override was applied in error or the employee resubmitted correct hours.
 */
export async function clearOvertimeOverride(entryId: string): Promise<void> {
    const ctx = await requireAdminAction()
    const admin = createServiceClient()

    const { data: entry, error: fetchErr } = await admin
        .from('timesheet_entries')
        .select('id, work_date, hours, is_overtime_override, timesheet_id, timesheets!inner(user_id)')
        .eq('id', entryId)
        .single<{
            id: string
            work_date: string
            hours: number
            is_overtime_override: boolean
            timesheet_id: string
            timesheets: { user_id: string }
        }>()
    if (fetchErr || !entry) throw new Error('Wpis nie istnieje.')
    if (!entry.is_overtime_override) {
        throw new Error('Ten wpis nie ma aktywnego override — nic do cofnięcia.')
    }

    const { error } = await admin
        .from('timesheet_entries')
        .update({
            hours: STANDARD_DAILY_HOURS_MAX,
            is_overtime_override: false,
            override_reason: null,
            override_by: null,
            override_at: null,
        })
        .eq('id', entryId)
    if (error) throw new Error(`Błąd cofnięcia override: ${error.message}`)

    await logAudit(ctx.userId, 'TIMESHEET_OVERTIME_OVERRIDE_CLEARED', {
        entry_id: entryId,
        target_user_id: entry.timesheets.user_id,
        work_date: entry.work_date,
        previous_hours: Number(entry.hours),
    })
}
