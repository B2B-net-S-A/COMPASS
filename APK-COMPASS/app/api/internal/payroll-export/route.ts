import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * H3.5: Payroll JSON export — strukturyzowane dane do payroll/Centrali.
 *
 * GET /api/internal/payroll-export?secret=$CRON_SECRET&year=2026&month=5
 *   - Wymaga CRON_SECRET (auth)
 *   - Zwraca JSON z agregatami per pracownik dla danego miesiąca:
 *       - approved timesheet hours
 *       - approved leave days (per type: vacation, sick, parental, etc)
 *       - working days w miesiącu
 *       - payroll-ready summary
 *
 * Cron użycie (Coolify):
 *   curl -X GET "https://compass.dynaminds.pl/api/internal/payroll-export?secret=$CRON_SECRET&year=2026&month=5" \
 *     -o /tmp/payroll-2026-05.json
 *
 * Format:
 *   {
 *     "year": 2026, "month": 5,
 *     "generated_at": "2026-06-01T...",
 *     "working_days_in_month": 21,
 *     "employees": [
 *       {
 *         "user_id": "...",
 *         "full_name": "...", "email": "...",
 *         "employment_type": "uop",
 *         "timesheet_status": "approved",
 *         "timesheet_total_hours": 168.0,
 *         "leave_days_by_type": { "vacation": 5, "sick_leave": 2 },
 *         "attendance_days": { "onsite": 12, "remote": 4 },
 *         "pdf_hash": "..."
 *       }
 *     ]
 *   }
 */
export async function GET(request: NextRequest) {
    if (!process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'Not configured' }, { status: 503 })
    }
    const url = new URL(request.url)
    const headerSecret = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
    const querySecret = url.searchParams.get('secret')
    const provided = headerSecret || querySecret
    if (!provided || provided !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!headerSecret && querySecret) {
        console.warn('[internal/payroll-export] secret in query param — migrate caller to Authorization: Bearer header')
    }

    const yearParam = url.searchParams.get('year')
    const monthParam = url.searchParams.get('month')
    const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear()
    const month = monthParam
        ? parseInt(monthParam, 10)
        : (new Date().getMonth() === 0 ? 12 : new Date().getMonth())
    if (
        !Number.isInteger(year) ||
        year < 2024 ||
        year > 2100 ||
        !Number.isInteger(month) ||
        month < 1 ||
        month > 12
    ) {
        return NextResponse.json({ error: 'Invalid year/month' }, { status: 400 })
    }

    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
    const monthEndDate = new Date(year, month, 0)
    const monthEnd = monthEndDate.toISOString().slice(0, 10)

    const admin = createServiceClient()

    // Pull all UoP employees (B2B nie payroll)
    const { data: employees, error: empErr } = await admin
        .from('profiles')
        .select('id, full_name, email, employment_type, role, annual_leave_days')
        .in('role', ['internal', 'admin'])
    if (empErr) {
        return NextResponse.json({ error: empErr.message }, { status: 500 })
    }
    const uopEmployees = ((employees ?? []) as Array<{
        id: string
        full_name: string | null
        email: string
        employment_type: string | null
        role: string
        annual_leave_days: number | null
    }>).filter((e) => e.employment_type !== 'b2b')

    if (uopEmployees.length === 0) {
        return NextResponse.json({
            year,
            month,
            generated_at: new Date().toISOString(),
            working_days_in_month: 0,
            employees: [],
        })
    }

    const userIds = uopEmployees.map((e) => e.id)

    // Pull all relevant data w jednym round
    const [timesheetsRes, leavesRes, attendanceRes, holidaysRes] = await Promise.all([
        admin
            .from('timesheets')
            .select('user_id, status, pdf_hash, approved_at')
            .eq('year', year)
            .eq('month', month)
            .in('user_id', userIds),
        admin
            .from('leave_requests')
            .select('user_id, start_date, end_date, leave_type, half_day, status')
            .eq('status', 'approved')
            .lte('start_date', monthEnd)
            .gte('end_date', monthStart)
            .in('user_id', userIds),
        admin
            .from('attendance_records')
            .select('user_id, date, status')
            .gte('date', monthStart)
            .lte('date', monthEnd)
            .in('user_id', userIds),
        admin
            .from('public_holidays')
            .select('date, name_pl')
            .gte('date', monthStart)
            .lte('date', monthEnd),
    ])

    type TimesheetRow = {
        user_id: string
        status: string
        pdf_hash: string | null
        approved_at: string | null
    }
    type LeaveRow = {
        user_id: string
        start_date: string
        end_date: string
        leave_type: string
        half_day: 'morning' | 'afternoon' | null
        status: string
    }
    type AttendanceRow = {
        user_id: string
        date: string
        status: string
    }
    type HolidayRow = { date: string; name_pl: string }

    const timesheetMap = new Map<string, TimesheetRow>()
    for (const t of (timesheetsRes.data ?? []) as TimesheetRow[]) {
        timesheetMap.set(t.user_id, t)
    }
    const leaves = (leavesRes.data ?? []) as LeaveRow[]
    const attendance = (attendanceRes.data ?? []) as AttendanceRow[]
    const holidays = new Set(((holidaysRes.data ?? []) as HolidayRow[]).map((h) => h.date))

    // Compute working days w miesiącu (Mon-Fri minus holidays)
    let workingDays = 0
    for (let d = 1; d <= monthEndDate.getDate(); d++) {
        const date = new Date(year, month - 1, d)
        const day = date.getDay() // 0 Sun, 6 Sat
        const iso = date.toISOString().slice(0, 10)
        if (day !== 0 && day !== 6 && !holidays.has(iso)) workingDays += 1
    }

    // Pull timesheet entries totals per user
    const tsIds = (timesheetsRes.data ?? []).map((t) => (t as TimesheetRow).user_id)
    const { data: entriesRes } = tsIds.length > 0
        ? await admin
              .from('timesheet_entries')
              .select('hours, timesheet:timesheets!inner(user_id, year, month)')
              .eq('timesheet.year', year)
              .eq('timesheet.month', month)
              .in('timesheet.user_id', tsIds)
        : { data: [] as Array<{ hours: number; timesheet: { user_id: string }[] | { user_id: string } }> }

    type EntryRow = { hours: number; timesheet: { user_id: string }[] | { user_id: string } | null }
    const hoursPerUser = new Map<string, number>()
    for (const e of (entriesRes ?? []) as EntryRow[]) {
        const ts = Array.isArray(e.timesheet) ? e.timesheet[0] : e.timesheet
        if (!ts) continue
        hoursPerUser.set(ts.user_id, (hoursPerUser.get(ts.user_id) ?? 0) + Number(e.hours))
    }

    // Build per-employee record
    const records = uopEmployees.map((emp) => {
        const ts = timesheetMap.get(emp.id)
        const empLeaves = leaves.filter((l) => l.user_id === emp.id)
        const empAtt = attendance.filter((a) => a.user_id === emp.id)

        // Days off per type — clip do month + half-day support
        const leaveDaysByType: Record<string, number> = {}
        for (const l of empLeaves) {
            const start = new Date(Math.max(new Date(l.start_date).getTime(), new Date(monthStart).getTime()))
            const end = new Date(Math.min(new Date(l.end_date).getTime(), new Date(monthEnd).getTime()))
            let count = 0
            for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                const dow = d.getDay()
                if (dow === 0 || dow === 6) continue
                const iso = d.toISOString().slice(0, 10)
                if (holidays.has(iso)) continue
                count += 1
            }
            // Half day → 0.5
            if (l.half_day && start.getTime() === end.getTime()) {
                count = 0.5
            }
            leaveDaysByType[l.leave_type] = (leaveDaysByType[l.leave_type] ?? 0) + count
        }

        // Phase 18.7: kolumna hours_worked nie istnieje w attendance_records.
        // Filtruję po samym status='present' (granularność: dzień obecny lub
        // nie). Dokładniejsze hours przychodzą z timesheet_entries (osobne pole).
        const attendanceDays = {
            onsite: empAtt.filter((a) => a.status === 'present')
                .filter((a) => empLeaves.every((l) => !(a.date >= l.start_date && a.date <= l.end_date)))
                .length,
            remote: empAtt.filter((a) => a.status === 'present').length,
        }

        return {
            user_id: emp.id,
            full_name: emp.full_name,
            email: emp.email,
            employment_type: emp.employment_type,
            timesheet_status: ts?.status ?? 'missing',
            timesheet_total_hours: hoursPerUser.get(emp.id) ?? 0,
            timesheet_pdf_hash: ts?.pdf_hash ?? null,
            timesheet_approved_at: ts?.approved_at ?? null,
            leave_days_by_type: leaveDaysByType,
            attendance_days: attendanceDays,
        }
    })

    return NextResponse.json({
        year,
        month,
        generated_at: new Date().toISOString(),
        working_days_in_month: workingDays,
        total_employees: uopEmployees.length,
        employees: records,
    })
}
