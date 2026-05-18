'use server'

import { logCompat } from '@/lib/logger'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/admin'
import {
    requireAdminAction,
    requireInternalOrAdminAction,
} from '@/lib/auth/internal-guard'
import { logAudit } from '@/lib/actions/audit'
import {
    sendLeaveCancelledByUser,
    sendLeaveCreatedOnBehalf,
    sendLeaveDecision,
    sendLeaveRequestSubmitted,
    sendSubstituteAssigned,
} from '@/lib/email'
import { createLeaveEvent, deleteLeaveEvent } from '@/lib/calendar/graph-events'
import {
    buildDefaultOofMessages,
    disableOutOfOffice,
    setOutOfOffice,
} from '@/lib/mailbox/graph-oof'
import { postToTeamsAlert } from '@/lib/teams/webhook'
import { sendPushToUserId } from '@/lib/actions/push-subscriptions'
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
    // Phase 25a — substitute + Outlook OOF
    substitute_id?: string | null
    oof_internal_message?: string | null
    oof_external_message?: string | null
    graph_oof_set?: boolean
    graph_oof_set_at?: string | null
    graph_sync_error?: string | null
}

export interface PendingLeaveRow extends LeaveRequestRow {
    user_full_name: string | null
    user_email: string
    user_avatar_url: string | null
    // Phase 25d — substitute info for display in admin queue
    substitute_full_name?: string | null
    substitute_email?: string | null
}

// Phase 25d — active leaves with substitute info for global banner
export interface ActiveLeaveRow {
    id: string
    user_id: string
    user_full_name: string | null
    user_email: string
    user_avatar_url: string | null
    start_date: string
    end_date: string
    leave_type: LeaveType
    substitute_id: string | null
    substitute_full_name: string | null
    substitute_email: string | null
    graph_oof_set: boolean
    graph_sync_error: string | null
}

// Phase 25d — my leave with substitute name resolved (used in MyLeaveList)
export interface MyLeaveRow extends LeaveRequestRow {
    substitute_full_name?: string | null
    substitute_email?: string | null
}

export interface CreateLeaveInput {
    startDate: string
    endDate: string
    leaveType: LeaveType
    halfDay?: 'morning' | 'afternoon' | null
    note?: string | null
    documentationUrl?: string | null
    // Phase 25a — optional substitute + custom OOF messages
    substituteId?: string | null
    oofInternalMessage?: string | null
    oofExternalMessage?: string | null
}

/**
 * Statystyki urlopowe per rok (B2B — brak limitu dni, tylko info do planowania).
 * `annual_leave_days` / `remaining_days` / `projected_remaining_days` zostały
 * usunięte gdy zespół przeszedł na B2B (wszyscy mają nielimitowane urlopy
 * pod warunkiem zgłoszenia wniosku).
 */
export interface MyLeaveBalance {
    year: number
    /** Dni vacation już wykorzystane (zatwierdzone, start_date ≤ today). */
    used_days: number
    /** Dni vacation zatwierdzone na przyszłość (start_date > today). */
    pending_approved_future_days: number
    /** Dni vacation z wniosków oczekujących na akceptację. */
    pending_request_days: number
}

// ─── Validation ──────────────────────────────────────────────────────────────

function validateDateString(value: string, label: string): void {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new Error(`${label} musi być w formacie YYYY-MM-DD.`)
    }
}

function validateLeaveType(value: string): asserts value is LeaveType {
    const allowed: LeaveType[] = ['vacation', 'parental_leave', 'unpaid_leave', 'other']
    if (!(allowed as string[]).includes(value)) {
        throw new Error(`Nieprawidłowy typ urlopu: ${value}`)
    }
}

// ─── H2.4: upload dokumentu (zwolnienie L4 / akt ślubu / itd.) ──────────────

const ALLOWED_DOC_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const
const MAX_DOC_SIZE_BYTES = 5 * 1024 * 1024 // 5 MB

/**
 * H2.4: upload dokumentu (zwolnienie L4, akt ślubu, etc.) jako załącznika do
 * leave_request. Zwraca storage path do zapisania w `leave_requests.documentation_url`.
 *
 * Bucket: `documents`. Path format: `leave-proofs/{user_id}/{timestamp}_{safe_filename}`.
 * Auth: tylko zalogowani internal/admin.
 */
export async function uploadLeaveProof(formData: FormData): Promise<{ path: string }> {
    const ctx = await requireInternalOrAdminAction()
    const file = formData.get('file')
    if (!(file instanceof File)) {
        throw new Error('Brak pliku.')
    }
    if (file.size === 0) {
        throw new Error('Plik jest pusty.')
    }
    if (file.size > MAX_DOC_SIZE_BYTES) {
        throw new Error('Plik jest za duży (max 5 MB).')
    }
    if (!ALLOWED_DOC_MIME_TYPES.includes(file.type as (typeof ALLOWED_DOC_MIME_TYPES)[number])) {
        throw new Error('Dozwolone formaty: PDF, JPG, PNG, WebP.')
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80)
    const path = `leave-proofs/${ctx.userId}/${Date.now()}_${safeName}`

    const supabase = createClient()
    const { error } = await supabase.storage.from('documents').upload(path, file)
    if (error) throw new Error(`Upload nieudany: ${error.message}`)

    return { path }
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

    // Phase 25a: validate substitute (must be a real HR-zone employee in tenant,
    // not the requester himself). Optional — sick_leave / single-day urlopy
    // mogą iść bez.
    if (input.substituteId) {
        if (input.substituteId === ctx.userId) {
            throw new Error('Nie możesz wybrać siebie jako zastępcy.')
        }
        const adminClient = createServiceClient()
        const { data: sub } = await adminClient
            .from('profiles')
            .select('id, role')
            .eq('id', input.substituteId)
            .maybeSingle<{ id: string; role: string }>()
        if (!sub) {
            throw new Error('Wybrany zastępca nie istnieje.')
        }
        if (!['admin', 'internal', 'manager', 'finanse', 'talent_community'].includes(sub.role)) {
            throw new Error('Zastępca musi mieć dostęp do strefy HR (internal/manager/admin/finanse/TCM).')
        }
    }

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
            substitute_id: input.substituteId ?? null,
            oof_internal_message: input.oofInternalMessage?.trim() || null,
            oof_external_message: input.oofExternalMessage?.trim() || null,
        })
        .select('id, status')
        .single<{ id: string; status: LeaveStatus }>()

    if (error || !inserted) {
        throw new Error(`Błąd zapisu wniosku: ${error?.message ?? 'unknown'}`)
    }

    if (input.substituteId) {
        await logAudit(ctx.userId, 'LEAVE_SUBSTITUTE_ASSIGNED', {
            leave_id: inserted.id,
            substitute_id: input.substituteId,
        })
    }

    const autoApproved = inserted.status === 'approved'

    if (autoApproved) {
        await syncAttendanceFromLeave(inserted.id, ctx.userId, 'create')
    } else {
        const adminEmails = await fetchAdminEmails()
        const requesterName = await fetchUserDisplayName(ctx.userId, ctx.email)
        if (adminEmails.length > 0) {
            sendLeaveRequestSubmitted(
                adminEmails,
                requesterName,
                input.leaveType,
                input.startDate,
                input.endDate,
                input.note ?? null,
            ).catch((e) => logCompat.error('[createLeaveRequest] notify failed:', e))
        }
        // H3.3: Push do adminów
        const adminClient = createServiceClient()
        const { data: admins } = await adminClient.from('profiles').select('id').eq('role', 'admin')
        for (const a of (admins ?? []) as Array<{ id: string }>) {
            sendPushToUserId(a.id, {
                title: 'Nowy wniosek urlopowy',
                body: `${requesterName}: ${input.startDate} – ${input.endDate}`,
                url: '/internal/admin?tab=leave-requests',
                tag: `leave-new-${inserted.id}`,
            }).catch((e) => logCompat.error('[createLeaveRequest] admin push failed:', e))
        }
    }

    return { id: inserted.id, autoApproved }
}

// ─── cancelMyLeaveRequest ────────────────────────────────────────────────────

/**
 * H2.3: User może anulować:
 *  - własne wnioski w statusie 'pending' (bez ograniczeń),
 *  - własne wnioski w statusie 'approved' tylko gdy start_date > today
 *    (przyszły urlop). Przeszły/bieżący — admin musi anulować ręcznie.
 *
 * Po anulowaniu approved: usuwamy auto-utworzone attendance records + notyfikacja
 * admin (email + push) że user anulował zatwierdzony urlop.
 */
export async function cancelMyLeaveRequest(id: string): Promise<void> {
    const ctx = await requireInternalOrAdminAction()
    const supabase = createClient()

    const { data: row, error: fetchErr } = await supabase
        .from('leave_requests')
        .select('id, user_id, status, start_date, end_date, leave_type, outlook_event_id, graph_oof_set')
        .eq('id', id)
        .single<{
            id: string
            user_id: string
            status: LeaveStatus
            start_date: string
            end_date: string
            leave_type: LeaveType
            outlook_event_id: string | null
            graph_oof_set: boolean | null
        }>()
    if (fetchErr || !row) throw new Error('Wniosek nie istnieje.')
    if (row.user_id !== ctx.userId) throw new Error('To nie jest Twój wniosek.')

    if (row.status === 'pending') {
        // Standard cancel — pending wymaga tylko zmiany status
        const { error } = await supabase
            .from('leave_requests')
            .update({ status: 'cancelled' })
            .eq('id', id)
        if (error) throw new Error(`Błąd anulowania: ${error.message}`)

        await logAudit(ctx.userId, 'LEAVE_CANCELLED', { leave_id: id })
        return
    }

    if (row.status === 'approved') {
        // H2.3: tylko future approved leaves można anulować self-service
        const today = new Date().toISOString().slice(0, 10)
        if (row.start_date <= today) {
            throw new Error(
                'Nie można anulować urlopu którego start jest dziś lub w przeszłości — skontaktuj się z adminem.',
            )
        }

        const { error } = await supabase
            .from('leave_requests')
            .update({ status: 'cancelled' })
            .eq('id', id)
        if (error) throw new Error(`Błąd anulowania: ${error.message}`)

        // Cleanup attendance records (remove op)
        await syncAttendanceFromLeave(id, row.user_id, 'remove').catch((e) =>
            logCompat.error('[cancelMyLeaveRequest] attendance cleanup failed:', e),
        )

        // PR2: remove Outlook calendar event (best-effort, never blocks cancel).
        if (row.outlook_event_id) {
            deleteLeaveEvent({
                userEmail: ctx.email,
                eventId: row.outlook_event_id,
            }).catch((e) => logCompat.error('[cancelMyLeaveRequest] calendar delete failed:', e))
        }

        // Phase 25: revert Outlook OOF if it was set on approve.
        if (row.graph_oof_set) {
            disableOutOfOffice({ userEmail: ctx.email })
                .then(async (r) => {
                    if (r.success && !r.skipped) {
                        await supabase
                            .from('leave_requests')
                            .update({ graph_oof_set: false } as never)
                            .eq('id', id)
                        await logAudit(ctx.userId, 'LEAVE_OOF_DISABLED', {
                            leave_id: id,
                            reason: 'self_cancel',
                        })
                    }
                })
                .catch((e) => logCompat.error('[cancelMyLeaveRequest] OOF disable failed:', e))
        }

        await logAudit(ctx.userId, 'LEAVE_CANCELLED', {
            leave_id: id,
            was_approved: true,
            start_date: row.start_date,
            end_date: row.end_date,
        })

        // Notify admins (email + push) — admin powinien wiedzieć że user wyrzucił approved leave
        const adminEmails = await fetchAdminEmails()
        const userName = await fetchUserDisplayName(ctx.userId, ctx.email)
        if (adminEmails.length > 0) {
            sendLeaveCancelledByUser(adminEmails, userName, row.leave_type, row.start_date, row.end_date).catch((e) =>
                logCompat.error('[cancelMyLeaveRequest] admin email failed:', e),
            )
        }

        // Push do adminów
        const adminClient = createServiceClient()
        const { data: admins } = await adminClient
            .from('profiles')
            .select('id')
            .eq('role', 'admin')
        for (const a of (admins ?? []) as Array<{ id: string }>) {
            sendPushToUserId(a.id, {
                title: 'Anulowano zatwierdzony urlop',
                body: `${userName}: ${row.start_date} – ${row.end_date}`,
                url: '/internal/admin?tab=leave-requests',
                tag: `leave-cancelled-${id}`,
            }).catch((e) => logCompat.error('[cancelMyLeaveRequest] admin push failed:', e))
        }
        return
    }

    throw new Error(`Nie można anulować wniosku w statusie "${row.status}".`)
}

// ─── Phase 25: list HR-zone users eligible to be a substitute ───────────────

export interface EligibleSubstitute {
    id: string
    full_name: string | null
    email: string
    role: string
}

/**
 * Returns active HR-zone employees (excluding self + konsultant IT) that the
 * user can pick as their substitute when going on leave.
 */
export async function listEligibleSubstitutes(): Promise<EligibleSubstitute[]> {
    const ctx = await requireInternalOrAdminAction()
    const admin = createServiceClient()
    const { data, error } = await admin
        .from('profiles')
        .select('id, full_name, email, role, employment_status')
        .in('role', ['admin', 'internal', 'manager', 'finanse', 'talent_community'])
        .neq('id', ctx.userId)
        .order('full_name', { ascending: true })
    if (error) throw new Error(`Błąd pobierania pracowników: ${error.message}`)
    return ((data ?? []) as unknown as Array<EligibleSubstitute & { employment_status: string | null }>)
        .filter((p) => p.employment_status !== 'exited' && p.employment_status !== 'offboarding')
        .map(({ id, full_name, email, role }) => ({ id, full_name, email, role }))
}

// ─── Phase 25b: createLeaveOnBehalf (manager/admin wpisuje za pracownika) ────

const ON_BEHALF_HR_ROLES = ['admin', 'internal', 'manager', 'finanse', 'talent_community'] as const

export interface CreateLeaveOnBehalfInput {
    targetUserId: string
    startDate: string
    endDate: string
    leaveType: LeaveType
    halfDay?: 'morning' | 'afternoon' | null
    note?: string | null
    substituteId?: string | null
}

/**
 * Phase 25b: Manager (dla swojego zespołu) lub Admin (globalnie) wpisuje
 * urlop w imieniu pracownika z auto-approve. Pracownik czasem zapomina
 * wysłać wniosek — manager wie że jest na urlopie, rejestruje fakt.
 *
 * Side-effecty inteligentnie wg daty:
 *  - ZAWSZE: attendance sync, audit log, email + push do pracownika, Teams alert.
 *  - JEŚLI end_date >= today: + Outlook calendar event + OOF + email do zastępcy.
 *  - JEŚLI end_date < today (urlop zakończony): pomijamy Outlook/OOF/substitute
 *    bo nie ma sensu ustawiać auto-reply na okres który minął.
 */
export async function createLeaveOnBehalf(input: CreateLeaveOnBehalfInput): Promise<{ id: string }> {
    const ctx = await requireInternalOrAdminAction()
    if (!ctx.isAdmin && !ctx.isManager) {
        throw new Error('Wymagane uprawnienia: administrator lub manager.')
    }
    if (input.targetUserId === ctx.userId) {
        throw new Error('Nie wpisuj urlopu sam sobie — użyj standardowego formularza wniosku.')
    }

    // Walidacje wspólne z createLeaveRequest.
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
    if (input.leaveType === ('sick_leave' as LeaveType)) {
        throw new Error('L4 musi wpisać pracownik z dołączonym zwolnieniem lekarskim.')
    }

    const admin = createServiceClient()

    // Fetch target — potrzebujemy email + full_name do side-effects, role do
    // wykluczenia konsultantów IT, manager_id do team-scope check, employment_status
    // do wykluczenia exited/offboarding.
    const { data: target, error: targetErr } = await admin
        .from('profiles')
        .select('id, role, manager_id, employment_status, email, full_name')
        .eq('id', input.targetUserId)
        .single<{
            id: string
            role: string
            manager_id: string | null
            employment_status: string | null
            email: string | null
            full_name: string | null
        }>()
    if (targetErr || !target) {
        throw new Error('Pracownik nie istnieje.')
    }
    if (!target.email) {
        throw new Error('Pracownik nie ma adresu email w systemie.')
    }
    if (!(ON_BEHALF_HR_ROLES as readonly string[]).includes(target.role)) {
        throw new Error('Wybrany pracownik nie ma dostępu do strefy HR (konsultanci IT nie mają urlopów w COMPASS).')
    }
    if (target.employment_status === 'exited' || target.employment_status === 'offboarding') {
        throw new Error('Pracownik jest w trakcie offboardingu lub już opuścił firmę.')
    }

    // Team-scope check dla managera (admin pomija). Pattern z approveTimesheet.
    if (!ctx.isAdmin) {
        if (target.manager_id !== ctx.userId) {
            throw new Error('Możesz wpisać urlop tylko swojemu zespołowi.')
        }
    }

    // Duplicate detection — czy istnieje już zatwierdzony urlop nakładający się
    // na ten zakres? Wystarczy overlap: existing.end >= input.start AND existing.start <= input.end.
    const { data: overlapping } = await admin
        .from('leave_requests')
        .select('id, start_date, end_date, leave_type')
        .eq('user_id', input.targetUserId)
        .eq('status', 'approved')
        .gte('end_date', input.startDate)
        .lte('start_date', input.endDate)
    if (overlapping && overlapping.length > 0) {
        const first = overlapping[0] as { start_date: string; end_date: string }
        throw new Error(
            `Pracownik ma już zatwierdzony urlop nakładający się na ten zakres (${first.start_date} – ${first.end_date}).`,
        )
    }

    // Substitute walidacja (tylko gdy podano i urlop ongoing/future — past leave
    // ignorujemy substituteId niżej przy side-effects).
    if (input.substituteId) {
        if (input.substituteId === input.targetUserId) {
            throw new Error('Pracownik nie może być sam swoim zastępcą.')
        }
        const { data: sub } = await admin
            .from('profiles')
            .select('id, role')
            .eq('id', input.substituteId)
            .maybeSingle<{ id: string; role: string }>()
        if (!sub) {
            throw new Error('Wybrany zastępca nie istnieje.')
        }
        if (!(ON_BEHALF_HR_ROLES as readonly string[]).includes(sub.role)) {
            throw new Error('Zastępca musi mieć dostęp do strefy HR.')
        }
    }

    const today = new Date().toISOString().slice(0, 10)
    const isOngoingOrFuture = input.endDate >= today
    const actorName = ctx.email
    const decisionNote = `Wpisany przez ${actorName}`

    const { data: inserted, error: insertErr } = await admin
        .from('leave_requests')
        .insert({
            user_id: input.targetUserId,
            start_date: input.startDate,
            end_date: input.endDate,
            leave_type: input.leaveType,
            half_day: input.halfDay ?? null,
            note: input.note ?? null,
            substitute_id: isOngoingOrFuture ? (input.substituteId ?? null) : null,
            status: 'approved',
            decided_by: ctx.userId,
            decided_at: new Date().toISOString(),
            decision_note: decisionNote,
            created_by: ctx.userId,
            created_on_behalf: true,
        } as never)
        .select('id')
        .single<{ id: string }>()

    if (insertErr || !inserted) {
        throw new Error(`Błąd zapisu wniosku: ${insertErr?.message ?? 'unknown'}`)
    }

    // Audit ZAWSZE — kluczowe dla transparentności (kto wpisał za kogo).
    await logAudit(ctx.userId, 'LEAVE_CREATED_ON_BEHALF', {
        leave_id: inserted.id,
        target_user_id: input.targetUserId,
        leave_type: input.leaveType,
        start_date: input.startDate,
        end_date: input.endDate,
        actor_role: ctx.role,
        is_past_leave: !isOngoingOrFuture,
    })

    // Attendance sync ZAWSZE — krytyczne dla spójności (timesheet musi się zgadzać).
    await syncAttendanceFromLeave(inserted.id, input.targetUserId, 'create').catch((e) =>
        logCompat.error('[createLeaveOnBehalf] attendance sync failed:', e),
    )

    // Email do pracownika ZAWSZE — transparentność, audit + RODO.
    const targetDisplayName = target.full_name ?? target.email
    sendLeaveCreatedOnBehalf(
        target.email,
        targetDisplayName,
        actorName,
        input.leaveType,
        input.startDate,
        input.endDate,
        input.note ?? null,
        !isOngoingOrFuture,
    ).catch((e) => logCompat.error('[createLeaveOnBehalf] email failed:', e))

    // Push do pracownika ZAWSZE.
    sendPushToUserId(input.targetUserId, {
        title: isOngoingOrFuture
            ? 'Wpisano za Ciebie urlop'
            : 'Wpisano za Ciebie urlop (wstecznie)',
        body: `${actorName}: ${input.startDate} – ${input.endDate}`,
        url: '/internal?tab=leave',
        tag: `leave-on-behalf-${inserted.id}`,
    }).catch((e) => logCompat.error('[createLeaveOnBehalf] push failed:', e))

    // Branch — tylko ongoing/future: Outlook event + OOF + email do zastępcy.
    if (isOngoingOrFuture) {
        // Outlook calendar event — soft fail (best-effort).
        createLeaveEvent({
            userEmail: target.email,
            startDate: input.startDate,
            endDate: input.endDate,
            leaveType: input.leaveType,
            note: decisionNote,
            transactionId: `leave-${inserted.id}`,
        })
            .then(async (r) => {
                if (r.success && r.eventId) {
                    await admin
                        .from('leave_requests')
                        .update({ outlook_event_id: r.eventId })
                        .eq('id', inserted.id)
                } else if (!r.success && !r.skipped) {
                    await admin
                        .from('leave_requests')
                        .update({ graph_sync_error: `calendar: ${r.error}` } as never)
                        .eq('id', inserted.id)
                }
            })
            .catch((e) => logCompat.error('[createLeaveOnBehalf] calendar push failed:', e))

        // Outlook OOF + opcjonalny email do zastępcy.
        let substituteName: string | null = null
        let substituteEmail: string | null = null
        if (input.substituteId) {
            const { data: sub } = await admin
                .from('profiles')
                .select('full_name, email')
                .eq('id', input.substituteId)
                .maybeSingle<{ full_name: string | null; email: string }>()
            if (sub) {
                substituteName = sub.full_name ?? sub.email
                substituteEmail = sub.email
            }
        }

        const defaults = buildDefaultOofMessages({
            employeeName: targetDisplayName,
            endDate: input.endDate,
            substituteName,
            substituteEmail,
        })

        setOutOfOffice({
            userEmail: target.email,
            startDate: input.startDate,
            endDate: input.endDate,
            internalReply: defaults.internal,
            externalReply: defaults.external,
        })
            .then(async (r) => {
                if (r.success && !r.skipped) {
                    await admin
                        .from('leave_requests')
                        .update({
                            graph_oof_set: true,
                            graph_oof_set_at: new Date().toISOString(),
                        } as never)
                        .eq('id', inserted.id)
                    await logAudit(ctx.userId, 'LEAVE_OOF_SET', {
                        leave_id: inserted.id,
                        target_user_id: input.targetUserId,
                        has_substitute: Boolean(input.substituteId),
                        via: 'on_behalf',
                    })
                } else if (!r.success && !r.skipped) {
                    await admin
                        .from('leave_requests')
                        .update({ graph_sync_error: `oof: ${r.error}` } as never)
                        .eq('id', inserted.id)
                    await logAudit(ctx.userId, 'LEAVE_OOF_FAILED', {
                        leave_id: inserted.id,
                        target_user_id: input.targetUserId,
                        error: r.error,
                    })
                }
            })
            .catch((e) => logCompat.error('[createLeaveOnBehalf] OOF set failed:', e))

        if (substituteEmail) {
            sendSubstituteAssigned(
                substituteEmail,
                substituteName ?? substituteEmail,
                targetDisplayName,
                target.email,
                input.startDate,
                input.endDate,
            ).catch((e) => logCompat.error('[createLeaveOnBehalf] substitute notify failed:', e))
        }
    }

    // Teams alert ZAWSZE — info dla zespołu (niebieski "informacyjny", nie zielony "approved").
    postToTeamsAlert({
        title: `Urlop wpisany przez ${actorName}`,
        text: `${targetDisplayName} — urlop ${input.startDate} – ${input.endDate}${isOngoingOrFuture ? '' : ' (wstecznie)'}`,
        themeColor: '3B82F6',
        facts: [
            { name: 'Typ', value: input.leaveType },
            { name: 'Pracownik', value: targetDisplayName },
            { name: 'Wpisał', value: actorName },
            { name: 'Tryb', value: isOngoingOrFuture ? 'Zaplanowany' : 'Wsteczny' },
            ...(input.note ? [{ name: 'Notatka', value: input.note.slice(0, 200) }] : []),
        ],
        actionUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://compass.dynaminds.pl'}/internal/admin?tab=leave-on-behalf`,
    }).catch((e) => logCompat.error('[createLeaveOnBehalf] teams alert failed:', e))

    return { id: inserted.id }
}

// ─── Phase 25b: listTeamMembersForLeaveOnBehalf ─────────────────────────────

export interface LeaveOnBehalfCandidate {
    id: string
    full_name: string | null
    email: string
    role: string
    manager_id: string | null
}

/**
 * Phase 25b. Lista pracowników, dla których current user może wpisać urlop:
 *  - Admin: wszyscy aktywni HR-zone employees (oprócz siebie samego).
 *  - Manager: tylko bezpośredni podwładni (profiles.manager_id = ctx.userId).
 */
export async function listTeamMembersForLeaveOnBehalf(): Promise<LeaveOnBehalfCandidate[]> {
    const ctx = await requireInternalOrAdminAction()
    if (!ctx.isAdmin && !ctx.isManager) {
        throw new Error('Wymagane uprawnienia: administrator lub manager.')
    }
    const admin = createServiceClient()
    let query = admin
        .from('profiles')
        .select('id, full_name, email, role, manager_id, employment_status')
        .in('role', ['admin', 'internal', 'manager', 'finanse', 'talent_community'])
        .neq('id', ctx.userId)
        .order('full_name', { ascending: true })
    if (!ctx.isAdmin) {
        query = query.eq('manager_id', ctx.userId)
    }
    const { data, error } = await query
    if (error) {
        throw new Error(`Błąd pobierania pracowników: ${error.message}`)
    }
    return ((data ?? []) as unknown as Array<LeaveOnBehalfCandidate & { employment_status: string | null }>)
        .filter((p) => p.employment_status !== 'exited' && p.employment_status !== 'offboarding')
        .map(({ id, full_name, email, role, manager_id }) => ({ id, full_name, email, role, manager_id }))
}

// ─── listMyLeaveRequests ─────────────────────────────────────────────────────

export async function listMyLeaveRequests(year?: number): Promise<MyLeaveRow[]> {
    const ctx = await requireInternalOrAdminAction()
    const supabase = createClient()

    const targetYear = year ?? new Date().getFullYear()
    const yearStart = `${targetYear}-01-01`
    const yearEnd = `${targetYear}-12-31`

    const { data, error } = await supabase
        .from('leave_requests')
        .select(`
            *,
            substitute:profiles!leave_requests_substitute_id_fkey(full_name, email)
        `)
        .eq('user_id', ctx.userId)
        .gte('start_date', yearStart)
        .lte('start_date', yearEnd)
        .order('start_date', { ascending: false })
    if (error) throw new Error(`Błąd pobierania wniosków: ${error.message}`)

    return ((data ?? []) as unknown as Array<
        LeaveRequestRow & { substitute: { full_name: string | null; email: string } | null }
    >).map((row) => ({
        ...row,
        substitute_full_name: row.substitute?.full_name ?? null,
        substitute_email: row.substitute?.email ?? null,
    }))
}

// ─── getMyLeaveBalance ───────────────────────────────────────────────────────

export async function getMyLeaveBalance(): Promise<MyLeaveBalance> {
    const ctx = await requireInternalOrAdminAction()
    const supabase = createClient()
    const today = new Date().toISOString().slice(0, 10)
    const year = new Date().getFullYear()
    const yearStart = `${year}-01-01`
    const yearEnd = `${year}-12-31`

    const [leavesRes, pendingRes, holidaysRes] = await Promise.all([
        // Zatwierdzone urlopy wypoczynkowe (cały rok, do liczenia used + future)
        supabase
            .from('leave_requests')
            .select('start_date, end_date, half_day, leave_type')
            .eq('user_id', ctx.userId)
            .eq('status', 'approved')
            .eq('leave_type', 'vacation')
            .gte('start_date', yearStart)
            .lte('start_date', yearEnd),
        // Pending wnioski wypoczynkowe (jeszcze nie zatwierdzone)
        supabase
            .from('leave_requests')
            .select('start_date, end_date, half_day, leave_type')
            .eq('user_id', ctx.userId)
            .eq('status', 'pending')
            .eq('leave_type', 'vacation')
            .gte('start_date', yearStart)
            .lte('start_date', yearEnd),
        supabase
            .from('public_holidays')
            .select('date, name_pl')
            .gte('date', yearStart)
            .lte('date', yearEnd),
    ])

    const allApproved = (leavesRes.data ?? []) as LeaveSpan[]
    const pending = (pendingRes.data ?? []) as LeaveSpan[]
    const holidays = (holidaysRes.data ?? []) as PublicHolidayDate[]

    const past = allApproved.filter((s) => s.start_date <= today)
    const future = allApproved.filter((s) => s.start_date > today)

    return {
        year,
        used_days: totalVacationDaysUsed(past, holidays),
        pending_approved_future_days: totalVacationDaysUsed(future, holidays),
        pending_request_days: totalVacationDaysUsed(pending, holidays),
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
            substitute_id, oof_internal_message, oof_external_message,
            graph_oof_set, graph_oof_set_at, graph_sync_error,
            profiles:profiles!leave_requests_user_id_fkey(full_name, email, avatar_url),
            substitute:profiles!leave_requests_substitute_id_fkey(full_name, email)
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
        substitute_id: row.substitute_id,
        oof_internal_message: row.oof_internal_message,
        oof_external_message: row.oof_external_message,
        graph_oof_set: row.graph_oof_set,
        graph_oof_set_at: row.graph_oof_set_at,
        graph_sync_error: row.graph_sync_error,
        user_full_name: row.profiles?.full_name ?? null,
        user_email: row.profiles?.email ?? '',
        user_avatar_url: row.profiles?.avatar_url ?? null,
        substitute_full_name: row.substitute?.full_name ?? null,
        substitute_email: row.substitute?.email ?? null,
    }))
}

// ─── Admin: approve / reject ─────────────────────────────────────────────────

export async function approveLeaveRequest(id: string, decisionNote?: string): Promise<void> {
    const ctx = await requireAdminAction()
    const admin = createServiceClient()

    const { data: row, error: fetchErr } = await admin
        .from('leave_requests')
        .select('id, user_id, leave_type, start_date, end_date, status, substitute_id, oof_internal_message, oof_external_message')
        .eq('id', id)
        .single<
            Pick<
                LeaveRequestRow,
                | 'id'
                | 'user_id'
                | 'leave_type'
                | 'start_date'
                | 'end_date'
                | 'status'
                | 'substitute_id'
                | 'oof_internal_message'
                | 'oof_external_message'
            >
        >()
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
            graph_sync_error: null, // clear stale error from previous attempts (Phase 25a column, types stale)
        } as never)
        .eq('id', id)
    if (error) throw new Error(`Błąd akceptacji: ${error.message}`)

    await syncAttendanceFromLeave(id, row.user_id, 'create').catch((e) =>
        logCompat.error('[approveLeaveRequest] attendance sync failed:', e),
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
        ).catch((e) => logCompat.error('[approveLeaveRequest] notify failed:', e))

        // PR2: Outlook calendar event. Soft fail — never blocks approve.
        // Persist eventId for later delete (cancel/reject after approve).
        createLeaveEvent({
            userEmail: userInfo.email,
            startDate: row.start_date,
            endDate: row.end_date,
            leaveType: row.leave_type,
            note: decisionNote,
            transactionId: `leave-${id}`,
        })
            .then(async (r) => {
                if (r.success && r.eventId) {
                    await admin
                        .from('leave_requests')
                        .update({ outlook_event_id: r.eventId })
                        .eq('id', id)
                } else if (!r.success && !r.skipped) {
                    await admin
                        .from('leave_requests')
                        .update({ graph_sync_error: `calendar: ${r.error}` } as never)
                        .eq('id', id)
                }
            })
            .catch((e) => logCompat.error('[approveLeaveRequest] calendar push failed:', e))

        // Phase 25 — Outlook Out-of-Office auto-reply (skip for half-day single-day urlopy,
        // ale ustawiamy nawet bez substitute — fallback "kontakt z managerem").
        // Sick leave (L4) ma auto-approve flow; OOF też ustawiamy bo to opisany urlop.
        const shouldSetOof = row.start_date !== row.end_date || !row.start_date.includes('XXX')
        if (shouldSetOof) {
            // Resolve substitute info if assigned.
            let substituteName: string | null = null
            let substituteEmail: string | null = null
            if (row.substitute_id) {
                const { data: sub } = await admin
                    .from('profiles')
                    .select('full_name, email')
                    .eq('id', row.substitute_id)
                    .maybeSingle<{ full_name: string | null; email: string }>()
                if (sub) {
                    substituteName = sub.full_name ?? sub.email
                    substituteEmail = sub.email
                }
            }

            const defaults = buildDefaultOofMessages({
                employeeName: userInfo.full_name ?? userInfo.email,
                endDate: row.end_date,
                substituteName,
                substituteEmail,
            })

            setOutOfOffice({
                userEmail: userInfo.email,
                startDate: row.start_date,
                endDate: row.end_date,
                internalReply: row.oof_internal_message?.trim() || defaults.internal,
                externalReply: row.oof_external_message?.trim() || defaults.external,
            })
                .then(async (r) => {
                    if (r.success && !r.skipped) {
                        await admin
                            .from('leave_requests')
                            .update({
                                graph_oof_set: true,
                                graph_oof_set_at: new Date().toISOString(),
                            } as never)
                            .eq('id', id)
                        await logAudit(ctx.userId, 'LEAVE_OOF_SET', {
                            leave_id: id,
                            target_user_id: row.user_id,
                            has_substitute: Boolean(row.substitute_id),
                        })
                    } else if (!r.success && !r.skipped) {
                        await admin
                            .from('leave_requests')
                            .update({
                                graph_sync_error: `oof: ${r.error}`,
                            } as never)
                            .eq('id', id)
                        await logAudit(ctx.userId, 'LEAVE_OOF_FAILED', {
                            leave_id: id,
                            target_user_id: row.user_id,
                            error: r.error,
                        })
                    }
                })
                .catch((e) => logCompat.error('[approveLeaveRequest] OOF set failed:', e))

            // Email do zastępcy (fire-and-forget).
            if (substituteEmail) {
                sendSubstituteAssigned(
                    substituteEmail,
                    substituteName ?? substituteEmail,
                    userInfo.full_name ?? userInfo.email,
                    userInfo.email,
                    row.start_date,
                    row.end_date,
                ).catch((e) => logCompat.error('[approveLeaveRequest] substitute notify failed:', e))
            }
        }
    }
    // H3.3: Push notification (fire-and-forget)
    sendPushToUserId(row.user_id, {
        title: 'Urlop zatwierdzony',
        body: `Twój wniosek (${row.start_date} – ${row.end_date}) został zaakceptowany.`,
        url: '/internal?tab=leave',
        tag: `leave-${id}`,
    }).catch((e) => logCompat.error('[approveLeaveRequest] push failed:', e))

    // PR3: Teams alert (#compass-alerts channel). Fire-and-forget.
    postToTeamsAlert({
        title: 'Urlop zatwierdzony',
        text: `${userInfo?.full_name ?? userInfo?.email ?? 'Konsultant'} — urlop ${row.start_date} – ${row.end_date}`,
        themeColor: '22C55E',
        facts: [
            { name: 'Typ', value: row.leave_type },
            { name: 'Decyzja', value: 'Zatwierdzony' },
            ...(decisionNote ? [{ name: 'Komentarz', value: decisionNote }] : []),
        ],
        actionUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://compass.dynaminds.pl'}/internal/admin?tab=leave-requests`,
    }).catch((e) => logCompat.error('[approveLeaveRequest] teams alert failed:', e))
}

export async function rejectLeaveRequest(id: string, decisionNote: string): Promise<void> {
    const ctx = await requireAdminAction()
    if (!decisionNote?.trim()) {
        throw new Error('Powód odrzucenia jest wymagany.')
    }
    const admin = createServiceClient()

    const { data: row, error: fetchErr } = await admin
        .from('leave_requests')
        .select('id, user_id, leave_type, start_date, end_date, status, outlook_event_id')
        .eq('id', id)
        .single<Pick<LeaveRequestRow, 'id' | 'user_id' | 'leave_type' | 'start_date' | 'end_date' | 'status'> & { outlook_event_id: string | null }>()
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
        ).catch((e) => logCompat.error('[rejectLeaveRequest] notify failed:', e))

        // PR2: cleanup Outlook event (defensive — rejects normally happen
        // from 'pending' so event shouldn't exist, but if admin approved
        // then changed mind and rejected via a different path, remove).
        if (row.outlook_event_id) {
            deleteLeaveEvent({
                userEmail: userInfo.email,
                eventId: row.outlook_event_id,
            }).catch((e) => logCompat.error('[rejectLeaveRequest] calendar delete failed:', e))
        }
    }
    // H3.3: Push (fire-and-forget)
    sendPushToUserId(row.user_id, {
        title: 'Urlop odrzucony',
        body: `Powód: ${decisionNote.slice(0, 100)}`,
        url: '/internal?tab=leave',
        tag: `leave-${id}`,
    }).catch((e) => logCompat.error('[rejectLeaveRequest] push failed:', e))

    // PR3: Teams alert
    postToTeamsAlert({
        title: 'Urlop odrzucony',
        text: `${userInfo?.full_name ?? userInfo?.email ?? 'Konsultant'} — urlop ${row.start_date} – ${row.end_date}`,
        themeColor: 'F59E0B',
        facts: [
            { name: 'Typ', value: row.leave_type },
            { name: 'Decyzja', value: 'Odrzucony' },
            { name: 'Powód', value: decisionNote.slice(0, 200) },
        ],
        actionUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://compass.dynaminds.pl'}/internal/admin?tab=leave-requests`,
    }).catch((e) => logCompat.error('[rejectLeaveRequest] teams alert failed:', e))
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
        if (error) logCompat.error('[syncAttendanceFromLeave] upsert error:', error)
    } else {
        const { error } = await admin
            .from('attendance_records')
            .delete()
            .eq('user_id', userId)
            .gte('date', leave.start_date)
            .lte('date', leave.end_date)
            .in('status', ['vacation', 'sick_leave', 'parental_leave', 'unpaid_leave', 'training', 'other'])
        if (error) logCompat.error('[syncAttendanceFromLeave] delete error:', error)
    }
}

// ─── Phase 25d: active leaves (with substitute) for global banner ───────────

/**
 * Returns currently-active approved leaves (start_date <= today <= end_date)
 * within scope:
 *  - admin / talent_community: all
 *  - manager: own team (profiles.manager_id = ctx.userId)
 *  - finanse / internal / consultant: own colleagues + own manager
 *
 * Used by ActiveLeavesBanner on /internal to inform users who's away and
 * who's substituting.
 */
export async function listActiveLeaves(): Promise<ActiveLeaveRow[]> {
    const ctx = await requireInternalOrAdminAction()
    const admin = createServiceClient()
    const today = new Date().toISOString().slice(0, 10)

    // Determine scope: which user_ids to include in the banner.
    let scopeUserIds: string[] | null = null
    if (!ctx.isAdmin && !ctx.isTalentCommunity) {
        // Build relevant set: own manager + colleagues in same manager's team + self.
        const { data: selfProfile } = await admin
            .from('profiles')
            .select('manager_id, role')
            .eq('id', ctx.userId)
            .single<{ manager_id: string | null; role: string }>()

        const ids = new Set<string>([ctx.userId])
        if (selfProfile?.manager_id) ids.add(selfProfile.manager_id)

        // Manager → all direct reports
        if (ctx.isManager) {
            const { data: team } = await admin
                .from('profiles')
                .select('id')
                .eq('manager_id', ctx.userId)
            for (const t of (team ?? []) as Array<{ id: string }>) ids.add(t.id)
        }

        // Colleagues with same manager
        if (selfProfile?.manager_id) {
            const { data: peers } = await admin
                .from('profiles')
                .select('id')
                .eq('manager_id', selfProfile.manager_id)
            for (const p of (peers ?? []) as Array<{ id: string }>) ids.add(p.id)
        }

        scopeUserIds = Array.from(ids)
    }

    let query = admin
        .from('leave_requests')
        .select(`
            id, user_id, start_date, end_date, leave_type,
            substitute_id, graph_oof_set, graph_sync_error,
            profiles:profiles!leave_requests_user_id_fkey(full_name, email, avatar_url),
            substitute:profiles!leave_requests_substitute_id_fkey(full_name, email)
        `)
        .eq('status', 'approved')
        .lte('start_date', today)
        .gte('end_date', today)
        .order('start_date', { ascending: true })
        .limit(20)

    if (scopeUserIds && scopeUserIds.length > 0) {
        query = query.in('user_id', scopeUserIds)
    }

    const { data, error } = await query
    if (error) throw new Error(`Błąd pobierania aktywnych urlopów: ${error.message}`)

    return (data ?? []).map((row: any) => ({
        id: row.id,
        user_id: row.user_id,
        user_full_name: row.profiles?.full_name ?? null,
        user_email: row.profiles?.email ?? '',
        user_avatar_url: row.profiles?.avatar_url ?? null,
        start_date: row.start_date,
        end_date: row.end_date,
        leave_type: row.leave_type,
        substitute_id: row.substitute_id,
        substitute_full_name: row.substitute?.full_name ?? null,
        substitute_email: row.substitute?.email ?? null,
        graph_oof_set: Boolean(row.graph_oof_set),
        graph_sync_error: row.graph_sync_error ?? null,
    }))
}

// ─── Phase 25d: leaves with Graph sync issues (admin queue) ────────────────

export async function listLeavesWithSyncIssues(): Promise<PendingLeaveRow[]> {
    await requireAdminAction()
    const admin = createServiceClient()
    const today = new Date().toISOString().slice(0, 10)

    const { data, error } = await admin
        .from('leave_requests')
        .select(`
            id, user_id, start_date, end_date, leave_type, half_day, note,
            documentation_url, status, decided_by, decided_at, decision_note, created_at,
            substitute_id, oof_internal_message, oof_external_message,
            graph_oof_set, graph_oof_set_at, graph_sync_error, outlook_event_id,
            profiles:profiles!leave_requests_user_id_fkey(full_name, email, avatar_url),
            substitute:profiles!leave_requests_substitute_id_fkey(full_name, email)
        `)
        .eq('status', 'approved')
        .gte('end_date', today)
        .not('graph_sync_error', 'is', null)
        .order('start_date', { ascending: true })
        .limit(50)

    if (error) throw new Error(`Błąd: ${error.message}`)
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
        substitute_id: row.substitute_id,
        oof_internal_message: row.oof_internal_message,
        oof_external_message: row.oof_external_message,
        graph_oof_set: row.graph_oof_set,
        graph_oof_set_at: row.graph_oof_set_at,
        graph_sync_error: row.graph_sync_error,
        user_full_name: row.profiles?.full_name ?? null,
        user_email: row.profiles?.email ?? '',
        user_avatar_url: row.profiles?.avatar_url ?? null,
        substitute_full_name: row.substitute?.full_name ?? null,
        substitute_email: row.substitute?.email ?? null,
    }))
}

// ─── Phase 25d: retry Graph sync for a leave (admin only) ───────────────────

export async function retryLeaveGraphSync(id: string): Promise<{ oof: boolean; calendar: boolean; error?: string }> {
    const ctx = await requireAdminAction()
    const admin = createServiceClient()

    const { data: row, error: fetchErr } = await admin
        .from('leave_requests')
        .select(`
            id, user_id, start_date, end_date, leave_type, status,
            substitute_id, oof_internal_message, oof_external_message,
            outlook_event_id
        `)
        .eq('id', id)
        .single<{
            id: string
            user_id: string
            start_date: string
            end_date: string
            leave_type: LeaveType
            status: LeaveStatus
            substitute_id: string | null
            oof_internal_message: string | null
            oof_external_message: string | null
            outlook_event_id: string | null
        }>()
    if (fetchErr || !row) throw new Error('Wniosek nie istnieje.')
    if (row.status !== 'approved') {
        throw new Error('Retry działa tylko dla zaakceptowanych wniosków.')
    }

    const userInfo = await fetchUserContact(row.user_id)
    if (!userInfo) throw new Error('Pracownik bez emaila — nie można wywołać Graph.')

    // Resolve substitute (for default OOF text).
    let substituteName: string | null = null
    let substituteEmail: string | null = null
    if (row.substitute_id) {
        const { data: sub } = await admin
            .from('profiles')
            .select('full_name, email')
            .eq('id', row.substitute_id)
            .maybeSingle<{ full_name: string | null; email: string }>()
        if (sub) {
            substituteName = sub.full_name ?? sub.email
            substituteEmail = sub.email
        }
    }

    const defaults = buildDefaultOofMessages({
        employeeName: userInfo.full_name ?? userInfo.email,
        endDate: row.end_date,
        substituteName,
        substituteEmail,
    })

    let oofOk = false
    let calOk = false
    const errors: string[] = []

    const oofRes = await setOutOfOffice({
        userEmail: userInfo.email,
        startDate: row.start_date,
        endDate: row.end_date,
        internalReply: row.oof_internal_message?.trim() || defaults.internal,
        externalReply: row.oof_external_message?.trim() || defaults.external,
    })
    if (oofRes.success) {
        oofOk = true
        await admin
            .from('leave_requests')
            .update({
                graph_oof_set: true,
                graph_oof_set_at: new Date().toISOString(),
            } as never)
            .eq('id', id)
    } else if (oofRes.error) {
        errors.push(`oof: ${oofRes.error}`)
    }

    if (!row.outlook_event_id) {
        const calRes = await createLeaveEvent({
            userEmail: userInfo.email,
            startDate: row.start_date,
            endDate: row.end_date,
            leaveType: row.leave_type,
            note: null,
            transactionId: `leave-retry-${id}-${Date.now()}`,
        })
        if (calRes.success) {
            calOk = true
            if (calRes.eventId) {
                await admin
                    .from('leave_requests')
                    .update({ outlook_event_id: calRes.eventId } as never)
                    .eq('id', id)
            }
        } else if (calRes.error) {
            errors.push(`calendar: ${calRes.error}`)
        }
    } else {
        calOk = true // already has event
    }

    if (errors.length > 0) {
        await admin
            .from('leave_requests')
            .update({ graph_sync_error: errors.join('; ') } as never)
            .eq('id', id)
    } else {
        await admin
            .from('leave_requests')
            .update({ graph_sync_error: null } as never)
            .eq('id', id)
    }

    await logAudit(ctx.userId, oofOk && calOk ? 'LEAVE_OOF_SET' : 'LEAVE_OOF_FAILED', {
        leave_id: id,
        retry: true,
        oof_ok: oofOk,
        calendar_ok: calOk,
        errors: errors.length > 0 ? errors.join('; ') : undefined,
    })

    return {
        oof: oofOk,
        calendar: calOk,
        error: errors.length > 0 ? errors.join('; ') : undefined,
    }
}
