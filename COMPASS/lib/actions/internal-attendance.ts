'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/admin'
import { requireInternalOrAdminAction } from '@/lib/auth/internal-guard'
import { logAudit } from '@/lib/actions/audit'
import { endOfMonth, format, startOfMonth } from 'date-fns'

export type AttendanceStatus =
    | 'active'
    | 'vacation'
    | 'on_demand'
    | 'occasional'
    | 'childcare'
    | 'care_leave'
    | 'force_majeure'
    | 'sick_leave'
    | 'maternity'
    | 'paternity'
    | 'parental_leave'
    | 'childrearing'
    | 'unpaid_leave'
    | 'business_trip'
    | 'blood_donation'
    | 'training'
    | 'holiday_in_lieu'
    | 'other'

export type AttendanceLocation = 'onsite' | 'remote'

export interface AttendanceRecord {
    id: string
    user_id: string
    date: string
    status: AttendanceStatus
    location: AttendanceLocation | null
    note: string | null
}

export interface PublicHolidayRow {
    date: string
    name_pl: string
}

export interface ApprovedLeaveSpan {
    id: string
    start_date: string
    end_date: string
    leave_type: string
    half_day: 'morning' | 'afternoon' | null
}

export interface MonthData {
    year: number
    month: number
    records: AttendanceRecord[]
    holidays: PublicHolidayRow[]
    leaves: ApprovedLeaveSpan[]
    defaultLocation: AttendanceLocation
}

function monthBounds(year: number, month: number): { start: string; end: string } {
    const ref = new Date(year, month - 1, 1)
    return {
        start: format(startOfMonth(ref), 'yyyy-MM-dd'),
        end: format(endOfMonth(ref), 'yyyy-MM-dd'),
    }
}

export async function getMyMonth(year: number, month: number): Promise<MonthData> {
    const ctx = await requireInternalOrAdminAction()
    const supabase = createClient()
    const { start, end } = monthBounds(year, month)

    const [recordsRes, holidaysRes, leavesRes, profileRes] = await Promise.all([
        supabase
            .from('attendance_records')
            .select('id, user_id, date, status, location, note')
            .eq('user_id', ctx.userId)
            .gte('date', start)
            .lte('date', end)
            .order('date'),
        supabase.from('public_holidays').select('date, name_pl').gte('date', start).lte('date', end),
        supabase
            .from('leave_requests')
            .select('id, start_date, end_date, leave_type, half_day')
            .eq('user_id', ctx.userId)
            .eq('status', 'approved')
            .lte('start_date', end)
            .gte('end_date', start),
        supabase
            .from('profiles')
            .select('default_location')
            .eq('id', ctx.userId)
            .single<{ default_location: AttendanceLocation | null }>(),
    ])

    if (recordsRes.error) throw new Error(`Błąd pobierania obecności: ${recordsRes.error.message}`)
    if (holidaysRes.error) throw new Error(`Błąd pobierania świąt: ${holidaysRes.error.message}`)
    if (leavesRes.error) throw new Error(`Błąd pobierania urlopów: ${leavesRes.error.message}`)

    return {
        year,
        month,
        records: (recordsRes.data ?? []) as AttendanceRecord[],
        holidays: (holidaysRes.data ?? []) as PublicHolidayRow[],
        leaves: (leavesRes.data ?? []) as ApprovedLeaveSpan[],
        defaultLocation: profileRes.data?.default_location ?? 'onsite',
    }
}

export interface UpsertAttendanceInput {
    date: string
    status: AttendanceStatus
    location?: AttendanceLocation | null
    note?: string | null
    targetUserId?: string
}

export async function upsertAttendanceDay(input: UpsertAttendanceInput): Promise<void> {
    const ctx = await requireInternalOrAdminAction()
    const targetUserId = input.targetUserId ?? ctx.userId

    if (targetUserId !== ctx.userId && !ctx.isAdmin) {
        throw new Error('Tylko admin może edytować obecność innego pracownika.')
    }

    const supabase = createClient()
    const location: AttendanceLocation | null = input.status === 'active'
        ? (input.location ?? 'onsite')
        : null

    const { error } = await supabase
        .from('attendance_records')
        .upsert(
            {
                user_id: targetUserId,
                date: input.date,
                status: input.status,
                location,
                note: input.note ?? null,
                created_by: ctx.userId,
            },
            { onConflict: 'user_id,date' },
        )

    if (error) throw new Error(`Błąd zapisu obecności: ${error.message}`)

    await logAudit(ctx.userId, 'ATTENDANCE_UPDATE', {
        target_user_id: targetUserId,
        date: input.date,
        status: input.status,
        location,
    })
}

export async function deleteAttendanceDay(date: string, targetUserId?: string): Promise<void> {
    const ctx = await requireInternalOrAdminAction()
    const userId = targetUserId ?? ctx.userId
    if (userId !== ctx.userId && !ctx.isAdmin) {
        throw new Error('Tylko admin może usuwać obecność innego pracownika.')
    }

    const supabase = createClient()
    const { error } = await supabase
        .from('attendance_records')
        .delete()
        .eq('user_id', userId)
        .eq('date', date)
    if (error) throw new Error(`Błąd usuwania obecności: ${error.message}`)

    await logAudit(ctx.userId, 'ATTENDANCE_UPDATE', {
        target_user_id: userId,
        date,
        status: 'deleted',
    })
}

// ─── Phase 4: vacation calendar (team-wide for admin+internal) ──────────────

export interface TeamCalendarEmployee {
    id: string
    full_name: string | null
    email: string
    avatar_url: string | null
    role: string
}

export interface TeamCalendarData {
    year: number
    month: number
    employees: TeamCalendarEmployee[]
    leaves: Array<ApprovedLeaveSpan & { user_id: string }>
    attendances: Array<{
        user_id: string
        date: string
        status: AttendanceStatus
        location: AttendanceLocation | null
    }>
    holidays: PublicHolidayRow[]
}

export async function getTeamCalendar(year: number, month: number): Promise<TeamCalendarData> {
    await requireInternalOrAdminAction()
    const admin = createServiceClient()
    const { start, end } = monthBounds(year, month)

    const [employeesRes, leavesRes, attendancesRes, holidaysRes] = await Promise.all([
        admin
            .from('profiles')
            // Full HR-zone roster, not just internal+admin — managers/finanse and
            // talent_community (e.g. Błażej, Paulina) belong on the team calendar too.
            .select('id, full_name, email, avatar_url, role')
            .in('role', ['admin', 'internal', 'manager', 'finanse', 'talent_community'])
            .order('full_name'),
        admin
            .from('leave_requests')
            .select('id, user_id, start_date, end_date, leave_type, half_day')
            .eq('status', 'approved')
            .lte('start_date', end)
            .gte('end_date', start),
        admin
            .from('attendance_records')
            .select('user_id, date, status, location')
            .gte('date', start)
            .lte('date', end)
            // Phase 29 / Attendance STRICT: pracownik wpisuje tylko swoją lokalizację,
            // więc team calendar overlay z attendance = wyłącznie remote workdays.
            // Każdą nieobecność (urlop/delegacja/szkolenie) pokazujemy z leave_requests.
            .eq('status', 'active')
            .eq('location', 'remote'),
        admin.from('public_holidays').select('date, name_pl').gte('date', start).lte('date', end),
    ])

    if (employeesRes.error) throw new Error(`Błąd pobierania pracowników: ${employeesRes.error.message}`)

    return {
        year,
        month,
        employees: (employeesRes.data ?? []) as TeamCalendarEmployee[],
        leaves: (leavesRes.data ?? []) as TeamCalendarData['leaves'],
        attendances: (attendancesRes.data ?? []) as TeamCalendarData['attendances'],
        holidays: (holidaysRes.data ?? []) as PublicHolidayRow[],
    }
}
