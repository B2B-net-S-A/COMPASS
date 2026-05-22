'use server'

// Phase 24a/b — admin-defined globalne prefill opisu usług.
// SELECT: każdy authenticated user (do prefillu w UI).
// INSERT/UPDATE/DELETE: tylko admin (RLS enforced).
//
// resolve_role_default(role, project) DB helper zwraca najbardziej specyficzny
// aktywny default. Pracownik klikając "Wypełnij domyślne" w editor dostaje
// 8h × dzień + opis z resolve_role_default(własna_rola, NULL).

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/admin'
import { requireAdminAction, requireInternalOrAdminAction } from '@/lib/auth/internal-guard'
import { logAudit } from '@/lib/actions/audit'
import { format } from 'date-fns'
import { workingDaysInMonth, type PublicHolidayDate } from '@/lib/hr/working-days'
import type { AppRole } from '@/lib/types/role'

const HOURS_BLOCKING_STATUSES = ['vacation', 'sick_leave', 'parental_leave', 'unpaid_leave', 'holiday_in_lieu']

export interface TimesheetRoleDefault {
    id: string
    label: string
    applies_to_role: AppRole | null
    project: string | null
    default_description: string
    is_active: boolean
    sort_order: number
    created_by: string | null
    created_at: string
    updated_at: string
}

export interface CreateRoleDefaultInput {
    label: string
    appliesToRole?: AppRole | null
    project?: string | null
    defaultDescription: string
    isActive?: boolean
    sortOrder?: number
}

export interface UpdateRoleDefaultInput {
    id: string
    label?: string
    appliesToRole?: AppRole | null
    project?: string | null
    defaultDescription?: string
    isActive?: boolean
    sortOrder?: number
}

function validateRoleDefaultFields(label: string | undefined, description: string | undefined) {
    if (label !== undefined) {
        const trimmed = label.trim()
        if (trimmed.length < 1 || trimmed.length > 120) {
            throw new Error('Etykieta musi mieć 1–120 znaków.')
        }
    }
    if (description !== undefined) {
        const trimmed = description.trim()
        if (trimmed.length < 1 || trimmed.length > 2000) {
            throw new Error('Domyślny opis musi mieć 1–2000 znaków.')
        }
    }
}

export async function listRoleDefaults(): Promise<TimesheetRoleDefault[]> {
    await requireInternalOrAdminAction()
    const supabase = createClient()
    const { data, error } = await supabase
        .from('timesheet_role_defaults')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('label', { ascending: true })
    if (error) throw new Error(`Błąd pobierania defaultów: ${error.message}`)
    return (data ?? []) as TimesheetRoleDefault[]
}

export async function createRoleDefault(
    input: CreateRoleDefaultInput,
): Promise<TimesheetRoleDefault> {
    const ctx = await requireAdminAction()
    validateRoleDefaultFields(input.label, input.defaultDescription)
    const supabase = createClient()
    const { data, error } = await supabase
        .from('timesheet_role_defaults')
        .insert({
            label: input.label.trim(),
            applies_to_role: input.appliesToRole ?? null,
            project: input.project?.trim() || null,
            default_description: input.defaultDescription.trim(),
            is_active: input.isActive ?? true,
            sort_order: input.sortOrder ?? 0,
            created_by: ctx.userId,
        })
        .select('*')
        .single<TimesheetRoleDefault>()
    if (error || !data) {
        throw new Error(`Błąd tworzenia defaultu: ${error?.message ?? 'unknown'}`)
    }
    await logAudit(ctx.userId, 'ROLE_DEFAULT_CREATED', {
        role_default_id: data.id,
        label: data.label,
        applies_to_role: data.applies_to_role,
        project: data.project,
    })
    return data
}

export async function updateRoleDefault(input: UpdateRoleDefaultInput): Promise<void> {
    const ctx = await requireAdminAction()
    validateRoleDefaultFields(input.label, input.defaultDescription)
    const supabase = createClient()
    const updates: Record<string, unknown> = {}
    if (input.label !== undefined) updates.label = input.label.trim()
    if (input.appliesToRole !== undefined) updates.applies_to_role = input.appliesToRole
    if (input.project !== undefined) updates.project = input.project?.trim() || null
    if (input.defaultDescription !== undefined) updates.default_description = input.defaultDescription.trim()
    if (input.isActive !== undefined) updates.is_active = input.isActive
    if (input.sortOrder !== undefined) updates.sort_order = input.sortOrder
    if (Object.keys(updates).length === 0) return

    const { error } = await supabase
        .from('timesheet_role_defaults')
        .update(updates)
        .eq('id', input.id)
    if (error) throw new Error(`Błąd aktualizacji: ${error.message}`)
    await logAudit(ctx.userId, 'ROLE_DEFAULT_UPDATED', {
        role_default_id: input.id,
        changes: Object.keys(updates),
    })
}

export async function deleteRoleDefault(id: string): Promise<void> {
    const ctx = await requireAdminAction()
    const supabase = createClient()
    const { error } = await supabase.from('timesheet_role_defaults').delete().eq('id', id)
    if (error) throw new Error(`Błąd usuwania: ${error.message}`)
    await logAudit(ctx.userId, 'ROLE_DEFAULT_DELETED', { role_default_id: id })
}

// ─── Apply defaults to timesheet (bulk fill working days with default text) ─

export interface ApplyDefaultsResult {
    inserted: number
    skipped_existing: number
    skipped_leave: number
    skipped_pending_leave: number
    used_default_label: string | null
    used_default_description: string | null
    total_working_days: number
}

/**
 * Fill all empty working days of a timesheet (draft only) with 8h + the most
 * specific active default description for the user's role + optional project.
 * Skips weekends, holidays, leave days, pending leaves, and existing entries.
 *
 * Use case: pracownik wchodzi w nowy miesiąc, wybiera projekt z dropdown
 * "Wypełnij defaultem", klika — dni robocze mają 8h + opis "Konsultacje SAP
 * S/4HANA, projekt B2B".
 */
export async function applyDefaultsToTimesheet(
    timesheetId: string,
    project: string | null = null,
): Promise<ApplyDefaultsResult> {
    const ctx = await requireInternalOrAdminAction()
    const supabase = createClient()
    const admin = createServiceClient()

    const { data: header, error: hErr } = await supabase
        .from('timesheets')
        .select('id, user_id, year, month, status')
        .eq('id', timesheetId)
        .single<{
            id: string
            user_id: string
            year: number
            month: number
            status: string
        }>()
    if (hErr || !header) throw new Error('Timesheet nie istnieje.')
    if (header.user_id !== ctx.userId && !ctx.isAdmin) {
        throw new Error('To nie jest Twój timesheet.')
    }
    if (header.status !== 'draft') {
        throw new Error('Można wypełnić tylko timesheet w statusie "draft".')
    }

    // Resolve role default for user.
    const { data: profile } = await admin
        .from('profiles')
        .select('role')
        .eq('id', header.user_id)
        .single<{ role: AppRole }>()
    const userRole = profile?.role ?? ('consultant' as AppRole)

    // Generated Supabase types nie znają jeszcze resolve_role_default po phase 24a —
    // dlatego rpc() jest opakowane w cast. RLS GRANT na funkcji obowiązuje.
    interface ResolvedRoleDefault {
        id: string
        label: string
        default_description: string
        project: string | null
        applies_to_role: AppRole | null
    }
    const rpcRes = await (
        admin as unknown as {
            rpc: (
                name: string,
                args: Record<string, unknown>,
            ) => Promise<{ data: ResolvedRoleDefault[] | null; error: { message: string } | null }>
        }
    ).rpc('resolve_role_default', {
        target_role: userRole,
        target_project: project,
    })
    if (rpcRes.error) throw new Error(`Błąd resolving defaultu: ${rpcRes.error.message}`)
    const resolved = (rpcRes.data ?? [])[0]
    if (!resolved) {
        return {
            inserted: 0,
            skipped_existing: 0,
            skipped_leave: 0,
            skipped_pending_leave: 0,
            used_default_label: null,
            used_default_description: null,
            total_working_days: 0,
        }
    }

    const monthStart = `${header.year}-${String(header.month).padStart(2, '0')}-01`
    const monthEndDate = new Date(header.year, header.month, 0)
    const monthEnd = format(monthEndDate, 'yyyy-MM-dd')

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
        supabase
            .from('timesheet_entries')
            .select('work_date')
            .eq('timesheet_id', timesheetId),
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
    const pendingLeaveDates = new Set<string>()
    for (const lr of (pendingLeavesRes.data ?? []) as Array<{
        start_date: string
        end_date: string
    }>) {
        const start = new Date(
            Math.max(new Date(lr.start_date).getTime(), new Date(monthStart).getTime()),
        )
        const end = new Date(
            Math.min(new Date(lr.end_date).getTime(), new Date(monthEnd).getTime()),
        )
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

    const finalProject = resolved.project ?? project ?? null

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
            timesheet_id: timesheetId,
            work_date: iso,
            hours: 8,
            project: finalProject,
            description: resolved.default_description,
        })
    }

    if (rows.length > 0) {
        const { error } = await supabase.from('timesheet_entries').insert(rows)
        if (error) throw new Error(`Błąd wypełniania defaultem: ${error.message}`)
    }

    await logAudit(ctx.userId, 'TIMESHEET_APPLIED_DEFAULT', {
        timesheet_id: timesheetId,
        role_default_id: resolved.id,
        inserted: rows.length,
    })

    return {
        inserted: rows.length,
        skipped_existing: skippedExisting,
        skipped_leave: skippedLeave,
        skipped_pending_leave: skippedPendingLeave,
        used_default_label: resolved.label,
        used_default_description: resolved.default_description,
        total_working_days: totalWorkingDays,
    }
}
