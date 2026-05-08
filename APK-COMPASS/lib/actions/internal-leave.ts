'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/admin'
import {
    requireAdminAction,
    requireInternalOrAdminAction,
} from '@/lib/auth/internal-guard'
import { logAudit } from '@/lib/actions/audit'
import { sendLeaveDecision, sendLeaveRequestSubmitted } from '@/lib/email'
import { totalVacationDaysUsed, type LeaveSpan } from '@/lib/hr/leave-balance'
import { workingDaysBetween, type PublicHolidayDate } from '@/lib/hr/working-days'
import { format, parseISO } from 'date-fns'

export type LeaveType =
    | 'vacation'
    | 'sick_leave'
    | 'parental_leave'
    | 'unpaid_leave'
    | 'training'
    | 'other'

export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'

export interface LeaveRequestRow {
    id: string
    user_id: string
    start_date: string
    end_date: string
    leave_type: LeaveType
    half_day: 'morning' | 'afternoon' | null
    note: string | null
    documentation_url: string | null
    status: LeaveStatus
    decided_by: string | null
    decided_at: string | null
    decision_note: string | null
    created_at: string
}

export interface PendingLeaveRow extends LeaveRequestRow {
    user_full_name: string | null
    user_email: string
    user_avatar_url: string | null
}

export interface CreateLeaveInput {
    startDate: string
    endDate: string
    leaveType: LeaveType
    halfDay?: 'morning' | 'afternoon' | null
    note?: string | null
    documentationUrl?: string | null
}

export interface MyLeaveBalance {
    annual_leave_days: number
    used_days: number
    remaining_days: number
    year: number
}

// ─── Validation ──────────────────────────────────────────────────────────────

function validateDateString(value: string, label: string): void {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new Error(`${label} musi być w formacie YYYY-MM-DD.`)
    }
}

function validateLeaveType(value: string): asserts value is LeaveType {
    const allowed: LeaveType[] = ['vacation', 'sick_leave', 'parental_leave', 'unpaid_leave', 'training', 'other']
    if (!(allowed as string[]).includes(value)) {
        throw new Error(`Nieprawidłowy typ urlopu: ${value}`)
    }
}

// ─── createLeaveRequest ──────────────────────────────────────────────────────

export async function createLeaveRequest(input: CreateLeaveInput): Promise<{ id: string; autoApproved: boolean }> {
    const ctx = await requireInternalOrAdminAction()
    validateDateString(input.startDate, 'start_date')
    validateDateString(input.endDate, 'end_date')
    validateLeaveType(input.leaveType)
    if (input.endDate < input.startDate) {
        throw new Error('Data końca musi być >= data początku.')
    }
    if (input.halfDay && input.startDate !== input.endDate) {
        throw new Error('Half-day można zaznaczyć tylko gdy start_date == end_date.')
    }
    if (input.halfDay && !['morning', 'afternoon'].includes(input.halfDay)) {
        throw new Error('half_day musi być "morning" lub "afternoon".')
    }

    const supabase = createClient()
    const { data: inserted, error } = await supabase
        .from('leave_requests')
        .insert({
            user_id: ctx.userId,
            start_date: input.startDate,
            end_date: input.endDate,
            leave_type: input.leaveType,
            half_day: input.halfDay ?? null,
            note: input.note ?? null,
            documentation_url: input.documentationUrl ?? null,
        })
        .select('id, status')
        .single<{ id: string; status: LeaveStatus }>()

    if (error || !inserted) {
        throw new Error(`Błąd zapisu wniosku: ${error?.message ?? 'unknown'}`)
    }

    const autoApproved = inserted.status === 'approved'

    if (autoApproved) {
        await syncAttendanceFromLeave(inserted.id, ctx.userId, 'create')
    } else {
        const adminEmails = await fetchAdminEmails()
        if (adminEmails.length > 0) {
            const requesterName = await fetchUserDisplayName(ctx.userId, ctx.email)
            sendLeaveRequestSubmitted(
                adminEmails,
                requesterName,
                input.leaveType,
                input.startDate,
                input.endDate,
                input.note ?? null,
            ).catch((e) => console.error('[createLeaveRequest] notify failed:', e))
        }
    }

    return { id: inserted.id, autoApproved }
}

// ─── cancelMyLeaveRequest ────────────────────────────────────────────────────

export async function cancelMyLeaveRequest(id: string): Promise<void> {
    const ctx = await requireInternalOrAdminAction()
    const supabase = createClient()

    const { data: row, error: fetchErr } = await supabase
        .from('leave_requests')
        .select('id, user_id, status')
        .eq('id', id)
        .single<{ id: string; user_id: string; status: LeaveStatus }>()
    if (fetchErr || !row) throw new Error('Wniosek nie istnieje.')
    if (row.user_id !== ctx.userId) throw new Error('To nie jest Twój wniosek.')
    if (row.status !== 'pending') throw new Error('Można anulować tylko wnioski w statusie "pending".')

    const { error } = await supabase
        .from('leave_requests')
        .update({ status: 'cancelled' })
        .eq('id', id)
    if (error) throw new Error(`Błąd anulowania: ${error.message}`)

    await logAudit(ctx.userId, 'LEAVE_CANCELLED', { leave_id: id })
}

// ─── listMyLeaveRequests ─────────────────────────────────────────────────────

export async function listMyLeaveRequests(year?: number): Promise<LeaveRequestRow[]> {
    const ctx = await requireInternalOrAdminAction()
    const supabase = createClient()

    const targetYear = year ?? new Date().getFullYear()
    const yearStart = `${targetYear}-01-01`
    const yearEnd = `${targetYear}-12-31`

    const { data, error } = await supabase
        .from('leave_requests')
        .select('*')
        .eq('user_id', ctx.userId)
        .gte('start_date', yearStart)
        .lte('start_date', yearEnd)
        .order('start_date', { ascending: false })
    if (error) throw new Error(`Błąd pobierania wniosków: ${error.message}`)
    return (data ?? []) as LeaveRequestRow[]
}

// ─── getMyLeaveBalance ───────────────────────────────────────────────────────

export async function getMyLeaveBalance(): Promise<MyLeaveBalance> {
    const ctx = await requireInternalOrAdminAction()
    const supabase = createClient()
    const year = new Date().getFullYear()
    const yearStart = `${year}-01-01`
    const yearEnd = `${year}-12-31`

    const [profileRes, leavesRes, holidaysRes] = await Promise.all([
        supabase
            .from('profiles')
            .select('annual_leave_days')
            .eq('id', ctx.userId)
            .single<{ annual_leave_days: number | null }>(),
        supabase
            .from('leave_requests')
            .select('start_date, end_date, half_day, leave_type')
            .eq('user_id', ctx.userId)
            .eq('status', 'approved')
            .eq('leave_type', 'vacation')
            .gte('start_date', yearStart)
            .lte('start_date', yearEnd),
        supabase
            .from('public_holidays')
            .select('date, name_pl')
            .gte('date', yearStart)
            .lte('date', yearEnd),
    ])

    const annual = profileRes.data?.annual_leave_days ?? 26
    const spans = (leavesRes.data ?? []) as LeaveSpan[]
    const holidays = (holidaysRes.data ?? []) as PublicHolidayDate[]
    const used = totalVacationDaysUsed(spans, holidays)

    return {
        annual_leave_days: annual,
        used_days: used,
        remaining_days: Math.max(0, annual - used),
        year,
    }
}

// ─── Admin: listPendingLeaveRequests ─────────────────────────────────────────

export async function listPendingLeaveRequests(): Promise<PendingLeaveRow[]> {
    await requireAdminAction()
    const admin = createServiceClient()

    const { data, error } = await admin
        .from('leave_requests')
        .select(`
            id, user_id, start_date, end_date, leave_type, half_day, note,
            documentation_url, status, decided_by, decided_at, decision_note, created_at,
            profiles:profiles!leave_requests_user_id_fkey(full_name, email, avatar_url)
        `)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })

    if (error) throw new Error(`Błąd pobierania kolejki wniosków: ${error.message}`)

    return (data ?? []).map((row: any) => ({
        id: row.id,
        user_id: row.user_id,
        start_date: row.start_date,
        end_date: row.end_date,
        leave_type: row.leave_type,
        half_day: row.half_day,
        note: row.note,
        documentation_url: row.documentation_url,
        status: row.status,
        decided_by: row.decided_by,
        decided_at: row.decided_at,
        decision_note: row.decision_note,
        created_at: row.created_at,
        user_full_name: row.profiles?.full_name ?? null,
        user_email: row.profiles?.email ?? '',
        user_avatar_url: row.profiles?.avatar_url ?? null,
    }))
}

// ─── Admin: approve / reject ─────────────────────────────────────────────────

export async function approveLeaveRequest(id: string, decisionNote?: string): Promise<void> {
    const ctx = await requireAdminAction()
    const admin = createServiceClient()

    const { data: row, error: fetchErr } = await admin
        .from('leave_requests')
        .select('id, user_id, leave_type, start_date, end_date, status')
        .eq('id', id)
        .single<Pick<LeaveRequestRow, 'id' | 'user_id' | 'leave_type' | 'start_date' | 'end_date' | 'status'>>()
    if (fetchErr || !row) throw new Error('Wniosek nie istnieje.')
    if (row.status !== 'pending') {
        throw new Error(`Nie można zaakceptować wniosku w statusie ${row.status}.`)
    }

    const { error } = await admin
        .from('leave_requests')
        .update({
            status: 'approved',
            decided_by: ctx.userId,
            decided_at: new Date().toISOString(),
            decision_note: decisionNote ?? null,
        })
        .eq('id', id)
    if (error) throw new Error(`Błąd akceptacji: ${error.message}`)

    await syncAttendanceFromLeave(id, row.user_id, 'create').catch((e) =>
        console.error('[approveLeaveRequest] attendance sync failed:', e),
    )

    await logAudit(ctx.userId, 'LEAVE_APPROVED', { leave_id: id, target_user_id: row.user_id })

    // Email notify
    const userInfo = await fetchUserContact(row.user_id)
    if (userInfo) {
        sendLeaveDecision(
            userInfo.email,
            userInfo.full_name ?? userInfo.email,
            'approved',
            row.leave_type,
            row.start_date,
            row.end_date,
            decisionNote,
        ).catch((e) => console.error('[approveLeaveRequest] notify failed:', e))
    }
}

export async function rejectLeaveRequest(id: string, decisionNote: string): Promise<void> {
    const ctx = await requireAdminAction()
    if (!decisionNote?.trim()) {
        throw new Error('Powód odrzucenia jest wymagany.')
    }
    const admin = createServiceClient()

    const { data: row, error: fetchErr } = await admin
        .from('leave_requests')
        .select('id, user_id, leave_type, start_date, end_date, status')
        .eq('id', id)
        .single<Pick<LeaveRequestRow, 'id' | 'user_id' | 'leave_type' | 'start_date' | 'end_date' | 'status'>>()
    if (fetchErr || !row) throw new Error('Wniosek nie istnieje.')
    if (row.status !== 'pending') {
        throw new Error(`Nie można odrzucić wniosku w statusie ${row.status}.`)
    }

    const { error } = await admin
        .from('leave_requests')
        .update({
            status: 'rejected',
            decided_by: ctx.userId,
            decided_at: new Date().toISOString(),
            decision_note: decisionNote,
        })
        .eq('id', id)
    if (error) throw new Error(`Błąd odrzucenia: ${error.message}`)

    await logAudit(ctx.userId, 'LEAVE_REJECTED', { leave_id: id, target_user_id: row.user_id, reason: decisionNote })

    const userInfo = await fetchUserContact(row.user_id)
    if (userInfo) {
        sendLeaveDecision(
            userInfo.email,
            userInfo.full_name ?? userInfo.email,
            'rejected',
            row.leave_type,
            row.start_date,
            row.end_date,
            decisionNote,
        ).catch((e) => console.error('[rejectLeaveRequest] notify failed:', e))
    }
}

// ─── Internal helpers ────────────────────────────────────────────────────────

async function fetchAdminEmails(): Promise<string[]> {
    const admin = createServiceClient()
    const { data } = await admin
        .from('profiles')
        .select('email')
        .eq('role', 'admin')
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

async function syncAttendanceFromLeave(
    leaveId: string,
    userId: string,
    op: 'create' | 'remove',
): Promise<void> {
    const admin = createServiceClient()
    const { data: leave } = await admin
        .from('leave_requests')
        .select('start_date, end_date, leave_type, half_day')
        .eq('id', leaveId)
        .single<{
            start_date: string
            end_date: string
            leave_type: LeaveType
            half_day: 'morning' | 'afternoon' | null
        }>()
    if (!leave) return

    const { data: holidayRows } = await admin
        .from('public_holidays')
        .select('date, name_pl')
        .gte('date', leave.start_date)
        .lte('date', leave.end_date)
    const holidays: PublicHolidayDate[] = (holidayRows ?? []) as PublicHolidayDate[]

    const days = workingDaysBetween(parseISO(leave.start_date), parseISO(leave.end_date), holidays)

    if (op === 'create') {
        if (days.length === 0) return
        const rows = days.map((d) => ({
            user_id: userId,
            date: format(d, 'yyyy-MM-dd'),
            status: leave.leave_type,
            location: null as string | null,
            note: 'Z wniosku urlopowego',
            created_by: userId,
        }))
        const { error } = await admin
            .from('attendance_records')
            .upsert(rows, { onConflict: 'user_id,date' })
        if (error) console.error('[syncAttendanceFromLeave] upsert error:', error)
    } else {
        const { error } = await admin
            .from('attendance_records')
            .delete()
            .eq('user_id', userId)
            .gte('date', leave.start_date)
            .lte('date', leave.end_date)
            .in('status', ['vacation', 'sick_leave', 'parental_leave', 'unpaid_leave', 'training', 'other'])
        if (error) console.error('[syncAttendanceFromLeave] delete error:', error)
    }
}
