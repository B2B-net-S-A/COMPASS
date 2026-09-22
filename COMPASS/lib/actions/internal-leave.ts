'use server'

import { logCompat } from '@/lib/logger'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/admin'
import {
    requireAdminAction,
    requireInternalOrAdminAction,
    requireLeaveApproverAction,
} from '@/lib/auth/internal-guard'
import { logAudit } from '@/lib/actions/audit'
import { logSystemAudit } from '@/lib/audit/system-log'
import { ExpectedError, runAction, type ActionResult } from '@/lib/actions/action-result'
import {
    HR_LEAVE_TYPE_LABEL,
    sendLeaveCancelledByUser,
    sendLeaveCreatedOnBehalf,
    sendLeaveDecision,
    sendLeaveRequestSubmitted,
    sendSubstituteAssigned,
    sendSubstituteCancelled,
} from '@/lib/email'
import { createLeaveEvent, deleteLeaveEvent, updateLeaveEvent } from '@/lib/calendar/graph-events'
import {
    disableOutOfOffice,
    setOutOfOffice,
} from '@/lib/mailbox/graph-oof'
import { buildDefaultOofMessages, shouldSetOofForLeave } from '@/lib/mailbox/oof-template'
import { closeForwardRule, openForwardRule } from '@/lib/mailbox/forward-rule-sync'
import { createForwardRule } from '@/lib/mailbox/graph-inbox-rules'
import { planForwardRuleEdit, shouldForwardBeActive } from '@/lib/oof/forward-window'
import { recordLeaveCleanupFailure } from '@/lib/oof/leave-cleanup'
import { postToTeamsAlert } from '@/lib/teams/webhook'
import { sendPushToUserId } from '@/lib/push/dispatch'
import {
    totalVacationDaysUsed,
    workingDaysInLeave,
    computeRemaining,
    computePaidUnpaidSplit,
    VACATION_POOL_TYPES,
    type LeaveSpan,
} from '@/lib/hr/leave-balance'
import { nextWorkingDayAfter, type PublicHolidayDate } from '@/lib/hr/working-days'
import {
    splitLeaveWorkingDays,
    PAID_LEAVE_ENTRY_SOURCE,
    PAID_LEAVE_ENTRY_DESCRIPTION,
    type PaidLeaveDay,
} from '@/lib/hr/leave-timesheet-split'
import { recomputeTimesheetHashIfSet } from '@/lib/hr/recompute-timesheet-hash'
import { selectInChunks } from '@/lib/supabase/select-in-chunks'
// Audyt 2026-08 — lista wspólna z blokadą godzin w timesheecie (jedno źródło prawdy).
import { LEAVE_ATTENDANCE_STATUSES } from '@/lib/hr/leave-attendance-statuses'
import { addDays, endOfMonth, format, parseISO } from 'date-fns'

export type LeaveType =
    | 'vacation' // Urlop wypoczynkowy
    | 'on_demand' // Urlop na żądanie (część puli wypoczynkowej)
    | 'occasional' // Urlop okolicznościowy
    | 'childcare' // Opieka nad dzieckiem (art. 188 KP)
    | 'care_leave' // Urlop opiekuńczy
    | 'force_majeure' // Siła wyższa
    | 'sick_leave' // L4 / chorobowe
    | 'maternity' // Urlop macierzyński
    | 'paternity' // Urlop ojcowski
    | 'parental_leave' // Urlop rodzicielski
    | 'childrearing' // Urlop wychowawczy
    | 'unpaid_leave' // Urlop bezpłatny
    | 'blood_donation' // Krwiodawstwo
    | 'training' // Urlop szkoleniowy
    | 'holiday_in_lieu' // Odbiór dnia za święto (tylko UoP)
    | 'other' // Inne

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
    // Phase 25d — Compass świadomie nie nadpisał OOF (np. 'user_custom').
    graph_oof_skip_reason?: string | null
    // Phase 41 — ID reguły Outlooka przekierowującej pocztę do zastępcy.
    // NULL = brak aktywnego przekierowania. Reguła nie wygasa sama — kasuje ją
    // cancel/edycja albo cron (oof-reconcile), stąd potrzeba trwałego ID.
    outlook_forward_rule_id?: string | null
    // Phase 41c — zgoda pracownika na przekierowanie (opt-in). Intencja; stan
    // faktyczny reguły to outlook_forward_rule_id. Czyta się je razem: "chce
    // przekierowania" vs "reguła faktycznie istnieje w skrzynce".
    forward_mail_enabled?: boolean
    // Phase 30 — split płatny/bezpłatny (0/0 dla historycznych przed Phase 30
    // oraz dla non-vacation leave types out of scope of paid vacation pool).
    paid_days?: number
    unpaid_days?: number
}

export interface PendingLeaveRow extends LeaveRequestRow {
    user_full_name: string | null
    user_email: string
    user_avatar_url: string | null
    // Phase 25d — substitute info for display in admin queue
    substitute_full_name?: string | null
    substitute_email?: string | null
    // Phase 30 — pool snapshot dla badge'a "Pula 2026: 15/20 → po akceptacji 10/20"
    pool_employment_type?: string | null
    pool_entitlement_days?: number | null
    pool_carried_over_days?: number
    pool_used_initial_days?: number
    pool_already_booked_paid_days_in_year?: number
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
    /**
     * Phase 41c — forward incoming mail to the substitute for the leave's duration.
     * Opt-in: absent/false means the substitute is only named in the OOF reply, which
     * is what picking one has meant since Phase 25. Ignored without a substitute.
     */
    forwardMail?: boolean
}

/**
 * Statystyki urlopowe per rok (B2B — brak limitu dni, tylko info do planowania).
 * `annual_leave_days` / `remaining_days` / `projected_remaining_days` zostały
 * usunięte gdy zespół przeszedł na B2B (wszyscy mają nielimitowane urlopy
 * pod warunkiem zgłoszenia wniosku).
 */
export interface MyLeaveBalance {
    year: number
    /** Dni z puli wypoczynkowej (vacation + na żądanie) wykorzystane (zatwierdzone, start_date ≤ today). */
    used_days: number
    /** Dni zatwierdzone na przyszłość (start_date > today). */
    pending_approved_future_days: number
    /** Dni z wniosków oczekujących na akceptację. */
    pending_request_days: number
    // Phase 27k + 30 — limit/saldo. has_limit=false → brak puli (B2B/zlecenie bez kontraktu;
    // UoP NULL entitlement = unlimited).
    employment_type: string | null
    has_limit: boolean
    /** Roczny wymiar urlopu (np. 20/26). null gdy brak limitu. */
    entitlement_days: number | null
    /** Urlop zaległy z poprzedniego roku (dodawany do wymiaru). */
    carried_over_days: number
    /** Phase 30. Hybrydowy backfill — admin-set "już zużyte przed włączeniem feature". */
    used_initial_days: number
    /** entitlement + carried − used_initial − used − approved_future. null gdy brak limitu. */
    remaining_days: number | null
}

// ─── Phase 25d: persist Graph OOF result (success / user_custom skip / failure) ──

type OofPersistArgs = {
    admin: ReturnType<typeof createServiceClient>
    leaveRequestId: string
    actorUserId: string
    targetUserId: string
    result: { success: boolean; skipped?: boolean; skipReason?: string; error?: string }
    auditExtra?: Record<string, unknown>
}

/**
 * Single source of truth for "what happened after we called setOutOfOffice".
 * Handles 3 outcomes:
 *   - success (PATCH wrote our OOF): graph_oof_set=true + LEAVE_OOF_SET audit
 *   - skipped user_custom (Phase 25d): graph_oof_skip_reason='user_custom' +
 *     LEAVE_OOF_SKIPPED_USER_CUSTOM audit. Does NOT set graph_oof_set so the
 *     cancel-flow won't disable an OOF Compass never owned.
 *   - failure: graph_sync_error='oof: <msg>' + LEAVE_OOF_FAILED audit
 *   - skipped no_credentials: silent (dev/local — nothing persisted)
 */
async function persistOofResult(args: OofPersistArgs): Promise<void> {
    const { admin, leaveRequestId, actorUserId, targetUserId, result, auditExtra } = args

    if (result.success && !result.skipped) {
        await admin
            .from('leave_requests')
            .update({
                graph_oof_set: true,
                graph_oof_set_at: new Date().toISOString(),
                graph_oof_skip_reason: null,
            } as never)
            .eq('id', leaveRequestId)
        await logAudit(actorUserId, 'LEAVE_OOF_SET', {
            leave_id: leaveRequestId,
            target_user_id: targetUserId,
            ...auditExtra,
        })
        return
    }

    if (result.skipped && result.skipReason === 'user_custom') {
        await admin
            .from('leave_requests')
            .update({ graph_oof_skip_reason: 'user_custom' } as never)
            .eq('id', leaveRequestId)
        await logAudit(actorUserId, 'LEAVE_OOF_SKIPPED_USER_CUSTOM', {
            leave_id: leaveRequestId,
            target_user_id: targetUserId,
            reason: 'user_custom',
            ...auditExtra,
        })
        return
    }

    if (!result.success && !result.skipped) {
        await admin
            .from('leave_requests')
            .update({ graph_sync_error: `oof: ${result.error}` } as never)
            .eq('id', leaveRequestId)
        await logAudit(actorUserId, 'LEAVE_OOF_FAILED', {
            leave_id: leaveRequestId,
            target_user_id: targetUserId,
            error: result.error,
            ...auditExtra,
        })
    }
    // skipReason='no_credentials' → silent (dev/local).
}

/**
 * Phase 53 — assemble the default OOF texts for a leave. Beyond what the row
 * carries, the template needs the return date (first working day after
 * end_date, public_holidays-aware) and — when no substitute is assigned — the
 * employee's manager as the urgent-contact fallback. Soft-fail everywhere:
 * a failed lookup degrades to weekend-only return date / office contact,
 * because building a default text must never block the approval flow.
 */
async function buildOofDefaultsFor(args: {
    admin: ReturnType<typeof createServiceClient>
    userId: string
    employeeName: string
    endDate: string
    substituteName: string | null
    substituteEmail: string | null
}): Promise<{ internal: string; external: string }> {
    let holidays: PublicHolidayDate[] = []
    try {
        // 40 days covers every possible PL non-working streak after endDate.
        const horizon = format(addDays(parseISO(args.endDate), 40), 'yyyy-MM-dd')
        const { data } = await args.admin
            .from('public_holidays')
            .select('date, name_pl')
            .gte('date', args.endDate)
            .lte('date', horizon)
        holidays = (data ?? []) as PublicHolidayDate[]
    } catch (e) {
        logCompat.error('[buildOofDefaultsFor] holidays fetch failed:', e)
    }

    let managerName: string | null = null
    let managerEmail: string | null = null
    if (!args.substituteEmail) {
        try {
            const { data: prof } = await args.admin
                .from('profiles')
                .select('manager_id')
                .eq('id', args.userId)
                .maybeSingle<{ manager_id: string | null }>()
            if (prof?.manager_id) {
                const { data: mgr } = await args.admin
                    .from('profiles')
                    .select('full_name, email, employment_status')
                    .eq('id', prof.manager_id)
                    .maybeSingle<{
                        full_name: string | null
                        email: string | null
                        employment_status: string | null
                    }>()
                // An archived manager would be a dead-end contact (Phase 43:
                // "here and now" people lists exclude exited).
                if (mgr?.email && mgr.employment_status !== 'exited') {
                    managerName = mgr.full_name ?? mgr.email
                    managerEmail = mgr.email
                }
            }
        } catch (e) {
            logCompat.error('[buildOofDefaultsFor] manager lookup failed:', e)
        }
    }

    return buildDefaultOofMessages({
        employeeName: args.employeeName,
        endDate: args.endDate,
        returnDate: nextWorkingDayAfter(args.endDate, holidays),
        substituteName: args.substituteName,
        substituteEmail: args.substituteEmail,
        managerName,
        managerEmail,
    })
}

// ─── Validation ──────────────────────────────────────────────────────────────

function validateDateString(value: string, label: string): void {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new ExpectedError(`${label} musi być w formacie YYYY-MM-DD.`)
    }
}

// Phase 27k — self-service selectable leave types (full Kodeks pracy set).
const SELF_SERVICE_LEAVE_TYPES: LeaveType[] = [
    'vacation', 'on_demand', 'occasional', 'childcare', 'care_leave', 'force_majeure',
    'sick_leave', 'maternity', 'paternity', 'parental_leave', 'childrearing',
    'unpaid_leave', 'blood_donation', 'training', 'holiday_in_lieu', 'other',
]

/**
 * "Odbiór dnia za święto" (holiday_in_lieu) przysługuje tylko pracownikom na
 * umowie o pracę (UoP). Rzuca błąd, gdy wskazany pracownik nie ma employment_type='uop'.
 */
function assertHolidayInLieuEligible(employmentType: string | null, forSelf: boolean): void {
    if (employmentType === 'uop') return
    throw new ExpectedError(
        forSelf
            ? 'Odbiór dnia za święto przysługuje tylko pracownikom na umowie o pracę (UoP).'
            : 'Odbiór dnia za święto można wpisać tylko pracownikowi na umowie o pracę (UoP).',
    )
}

/**
 * Phase 29: B2B i zlecenie mogą wnioskować TYLKO o urlop wypoczynkowy
 * (leave_type='vacation'). Pełen katalog statutowy (L4, urlop okolicznościowy,
 * opiekuńczy, macierzyński itd.) jest zarezerwowany dla pracowników UoP.
 *
 * NULL employment_type → traktujemy jak UoP (bezpieczna strona; admin powinien
 * uzupełnić). DB trigger enforce_b2b_zlecenie_vacation_only jest ostatnią linią
 * obrony, ten guard daje friendly error message.
 */
function assertB2bZlecenieVacationOnly(
    employmentType: string | null,
    leaveType: LeaveType,
    forSelf: boolean,
): void {
    if (leaveType === 'vacation') return
    if (employmentType !== 'b2b' && employmentType !== 'zlecenie') return
    const label = employmentType === 'b2b' ? 'B2B' : 'umowie zlecenie'
    throw new ExpectedError(
        forSelf
            ? `Na umowie ${label} możesz wnioskować wyłącznie o urlop wypoczynkowy.`
            : `Pracownikowi na umowie ${label} możesz wpisać wyłącznie urlop wypoczynkowy (vacation).`,
    )
}

function validateLeaveType(value: string): asserts value is LeaveType {
    if (!(SELF_SERVICE_LEAVE_TYPES as string[]).includes(value)) {
        throw new ExpectedError(`Nieprawidłowy typ urlopu: ${value}`)
    }
}

// Phase 30 — pool snapshot dla calc paid/unpaid split + walidacji UoP hard-limit.
interface PoolSnapshot {
    employmentType: string | null
    entitlementDays: number | null
    carriedOverDays: number
    usedInitialDays: number
    alreadyBookedDaysInYear: number
}

/**
 * Phase 30 — fetch pool snapshot + compute paid/unpaid split for a leave request.
 * Wykonuje 3 zapytania (profile + existing leaves in year + holidays). Returns:
 *   - paid: dni płatne (z puli)
 *   - unpaid: dni bezpłatne (poza pulą)
 *   - workingDays: total dni roboczych w przedziale
 *   - snapshot: pool fields dla walidacji UoP / display w queue / preview
 *
 * Bezpiecznie wywołać dla każdego leave_type — non-vacation types dostają 0/0/0.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function computeLeaveRequestSplit(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: any,
    userId: string,
    leaveType: LeaveType,
    startDate: string,
    endDate: string,
    halfDay: 'morning' | 'afternoon' | null,
    options?: { excludeRequestId?: string },
): Promise<{ paid: number; unpaid: number; workingDays: number; snapshot: PoolSnapshot }> {
    // Tylko vacation + on_demand są pool-relevant
    const isPoolType = (VACATION_POOL_TYPES as readonly string[]).includes(leaveType)
    if (!isPoolType) {
        return {
            paid: 0,
            unpaid: 0,
            workingDays: 0,
            snapshot: {
                employmentType: null,
                entitlementDays: null,
                carriedOverDays: 0,
                usedInitialDays: 0,
                alreadyBookedDaysInYear: 0,
            },
        }
    }

    const startYear = startDate.slice(0, 4)
    const endYear = endDate.slice(0, 4)

    const [profRes, existingRes, holRes] = await Promise.all([
        supabase
            .from('profiles')
            .select('employment_type, leave_entitlement_days, leave_carried_over_days, leave_used_initial_days')
            .eq('id', userId)
            .maybeSingle(),
        supabase
            .from('leave_requests')
            .select('id, start_date, end_date, half_day, leave_type')
            .eq('user_id', userId)
            .in('status', ['approved', 'pending'])
            .in('leave_type', [...VACATION_POOL_TYPES])
            .gte('start_date', `${startYear}-01-01`)
            .lte('start_date', `${startYear}-12-31`),
        supabase
            .from('public_holidays')
            .select('date, name_pl')
            .gte('date', `${startYear}-01-01`)
            .lte('date', `${endYear}-12-31`),
    ])

    const prof = (profRes.data ?? null) as {
        employment_type: string | null
        leave_entitlement_days: number | null
        leave_carried_over_days: number | string | null
        leave_used_initial_days: number | string | null
    } | null
    const holidays = (holRes.data ?? []) as PublicHolidayDate[]
    let existing = (existingRes.data ?? []) as Array<LeaveSpan & { id: string }>
    if (options?.excludeRequestId) {
        existing = existing.filter((r) => r.id !== options.excludeRequestId)
    }

    const alreadyBooked = totalVacationDaysUsed(existing as LeaveSpan[], holidays)
    const workingDays = workingDaysInLeave(
        { start_date: startDate, end_date: endDate, half_day: halfDay, leave_type: leaveType },
        holidays,
    )

    const snapshot: PoolSnapshot = {
        employmentType: prof?.employment_type ?? null,
        entitlementDays: prof?.leave_entitlement_days ?? null,
        carriedOverDays: Number(prof?.leave_carried_over_days ?? 0),
        usedInitialDays: Number(prof?.leave_used_initial_days ?? 0),
        alreadyBookedDaysInYear: alreadyBooked,
    }

    const split = computePaidUnpaidSplit({
        employmentType: snapshot.employmentType,
        entitlementDays: snapshot.entitlementDays,
        carriedOverDays: snapshot.carriedOverDays,
        usedInitialDays: snapshot.usedInitialDays,
        alreadyBookedDaysInYear: snapshot.alreadyBookedDaysInYear,
        requestedWorkingDays: workingDays,
    })

    return { paid: split.paid, unpaid: split.unpaid, workingDays, snapshot }
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
export async function uploadLeaveProof(formData: FormData): Promise<ActionResult<{ path: string }>> {
    return runAction('uploadLeaveProof', async () => {
        const ctx = await requireInternalOrAdminAction()
        const file = formData.get('file')
        if (!(file instanceof File)) {
            throw new ExpectedError('Brak pliku.')
        }
        if (file.size === 0) {
            throw new ExpectedError('Plik jest pusty.')
        }
        if (file.size > MAX_DOC_SIZE_BYTES) {
            throw new ExpectedError('Plik jest za duży (max 5 MB).')
        }
        if (!ALLOWED_DOC_MIME_TYPES.includes(file.type as (typeof ALLOWED_DOC_MIME_TYPES)[number])) {
            throw new ExpectedError('Dozwolone formaty: PDF, JPG, PNG, WebP.')
        }

        const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80)
        const path = `leave-proofs/${ctx.userId}/${Date.now()}_${safeName}`

        const supabase = createClient()
        const { error } = await supabase.storage.from('documents').upload(path, file)
        if (error) throw new Error(`Upload nieudany: ${error.message}`)

        return { path }
    })
}

/**
 * Audyt 2026-08 (A4.1): `leave_requests.documentation_url` trzyma GOŁĄ ścieżkę
 * w prywatnym buckecie `documents`, a LeaveQueue renderowała ją wprost w href —
 * kadry klikały „Załącznik" i dostawały 404. Upload i odczyt muszą być naprawione
 * razem, inaczej funkcja nadal nie działa, tylko w drugą stronę.
 *
 * Dostęp: właściciel wniosku albo osoba akceptująca (admin / manager / finanse) —
 * to one weryfikują zwolnienie przy decyzji. Link ważny 5 minut, jak w module
 * kontraktorów (getContractorInterviewFileUrl).
 */
export async function getLeaveProofSignedUrl(leaveId: string): Promise<ActionResult<string>> {
    return runAction('getLeaveProofSignedUrl', async () => {
        const ctx = await requireInternalOrAdminAction()
        const admin = createServiceClient()

        const { data: leave, error } = await admin
            .from('leave_requests')
            .select('user_id, documentation_url')
            .eq('id', leaveId)
            .single<{ user_id: string; documentation_url: string | null }>()

        if (error || !leave) throw new ExpectedError('Nie znaleziono wniosku urlopowego.')
        if (!leave.documentation_url) throw new ExpectedError('Ten wniosek nie ma załącznika.')

        // Zakres jest WĄSKI celowo: załącznikiem bywa skan zwolnienia L4, czyli dane
        // o zdrowiu (art. 9 RODO). `ctx.isManager` znaczy tylko „ma rolę manager",
        // a nie „jest przełożonym TEJ osoby" — bez sprawdzenia manager_id kierownik
        // zespołu A mógłby pobrać podpisany link do L4 pracownika z zespołu B.
        const isOwner = leave.user_id === ctx.userId
        let allowed = isOwner || ctx.isAdmin || ctx.role === 'finanse'

        if (!allowed && ctx.isManager) {
            const { data: target } = await admin
                .from('profiles')
                .select('manager_id')
                .eq('id', leave.user_id)
                .single<{ manager_id: string | null }>()
            allowed = target?.manager_id === ctx.userId
        }

        if (!allowed) {
            throw new ExpectedError('Brak uprawnień do tego załącznika.')
        }

        const { data, error: signError } = await admin.storage
            .from('documents')
            .createSignedUrl(leave.documentation_url, 300)

        if (signError || !data?.signedUrl) {
            throw new Error('Nie udało się wygenerować linku do załącznika.')
        }
        return data.signedUrl
    })
}

// ─── Overlap check (createLeaveRequest + updateTeamLeave) ─────────────────────

interface OverlappingLeave {
    id: string
    start_date: string
    end_date: string
    status: LeaveStatus
}

/**
 * Pierwszy aktywny (approved/pending) wniosek pracownika nakładający się na zakres
 * `[start, end]`, albo null. Audyt 2026-09-22 (HF-06): wcześniej zapytanie żyło tylko
 * w createLeaveRequest, więc edycją (updateTeamLeave) dało się przesunąć urlop na
 * daty innego — pula zjadana podwójnie, a anulowanie jednego kasowało attendance
 * drugiego (sprzątanie idzie po ZAKRESIE DAT). `excludeId` = edytowany wniosek.
 */
async function findOverlappingLeave(
    userId: string,
    startDate: string,
    endDate: string,
    excludeId?: string,
): Promise<OverlappingLeave | null> {
    // Service client: wołający już ustalił, że wolno mu działać na wnioskach `userId`
    // (własne — createLeaveRequest, zespół — updateTeamLeave). Klient sesyjny
    // widziałby przez RLS tylko własne wnioski, więc ścieżka managera nic by nie znalazła.
    let query = createServiceClient()
        .from('leave_requests')
        .select('id, start_date, end_date, status')
        .eq('user_id', userId)
        .in('status', ['approved', 'pending'])
        .gte('end_date', startDate)
        .lte('start_date', endDate)
    if (excludeId) query = query.neq('id', excludeId)
    const { data, error } = await query
    if (error) throw new Error(`Błąd sprawdzania kolizji urlopów: ${error.message}`)
    const rows = (data ?? []) as OverlappingLeave[]
    return rows[0] ?? null
}

// ─── createLeaveRequest ──────────────────────────────────────────────────────

export async function createLeaveRequest(input: CreateLeaveInput): Promise<ActionResult<{ id: string; autoApproved: boolean }>> {
    return runAction('createLeaveRequest', async () => {
        const ctx = await requireInternalOrAdminAction()
        validateDateString(input.startDate, 'start_date')
        validateDateString(input.endDate, 'end_date')
        validateLeaveType(input.leaveType)
        if (input.endDate < input.startDate) {
            throw new ExpectedError('Data końca musi być >= data początku.')
        }
        if (input.halfDay && input.startDate !== input.endDate) {
            throw new ExpectedError('Half-day można zaznaczyć tylko gdy start_date == end_date.')
        }
        if (input.halfDay && !['morning', 'afternoon'].includes(input.halfDay)) {
            throw new ExpectedError('half_day musi być "morning" lub "afternoon".')
        }

        const supabase = createClient()

        // Audyt 2026-08 — kontrola nakładania istniała TYLKO w ścieżce „wpisz za pracownika",
        // a w samoobsługowej nie było jej ani w akcji, ani w bazie. Dwa wnioski na ten sam
        // dzień zjadały pulę podwójnie, a przy anulowaniu jednego sprzątanie attendance
        // (kasujące po ZAKRESIE DAT) kasowało też dni drugiego. Bierzemy też `pending` —
        // dubel czekający na akceptację jest dokładnie tym, co chcemy złapać u wnioskodawcy.
        const overlapping = await findOverlappingLeave(
            ctx.userId,
            input.startDate,
            input.endDate,
        )
        if (overlapping) {
            throw new ExpectedError(
                `Masz już ${overlapping.status === 'approved' ? 'zatwierdzony' : 'oczekujący'} wniosek `
                    + `nakładający się na ten zakres (${overlapping.start_date} – ${overlapping.end_date}).`,
            )
        }

        // Phase 29 — B2B / zlecenie mogą wnioskować tylko o 'vacation'. Friendly
        // error message; DB trigger enforce_b2b_zlecenie_vacation_only jest ostatnią
        // linią obrony. Skip fetch gdy już vacation (szybki happy path).
        if (input.leaveType !== 'vacation') {
            const { data: empRow } = await supabase
                .from('profiles')
                .select('employment_type')
                .eq('id', ctx.userId)
                .maybeSingle<{ employment_type: string | null }>()
            assertB2bZlecenieVacationOnly(empRow?.employment_type ?? null, input.leaveType, true)
        }

        // Phase 27k + 30 — vacation-pool split + UoP hard-limit. Liczymy paid/unpaid dla
        // wniosku (vacation/on_demand only); non-pool types → 0/0. Dla UoP z ustawionym
        // entitlement: hard-limit (throw gdy wniosek > remaining). Dla B2B/zlecenie z pulą:
        // auto-split (paid z puli + unpaid reszta w jednym leave_request).
        const split = await computeLeaveRequestSplit(
            supabase,
            ctx.userId,
            input.leaveType,
            input.startDate,
            input.endDate,
            input.halfDay ?? null,
        )

        // UoP hard-limit (zachowanie Phase 27k bez zmian).
        if (
            split.snapshot.employmentType === 'uop'
            && split.snapshot.entitlementDays != null
            && split.workingDays > 0
        ) {
            const remainingBefore =
                split.snapshot.entitlementDays
                + split.snapshot.carriedOverDays
                - split.snapshot.usedInitialDays
                - split.snapshot.alreadyBookedDaysInYear
            if (split.workingDays > remainingBefore + 1e-9) {
                const initialNote =
                    split.snapshot.usedInitialDays > 0
                        ? ` − ${split.snapshot.usedInitialDays} zaległo zużyte`
                        : ''
                throw new ExpectedError(
                    `Przekroczono limit urlopu wypoczynkowego: pozostało ${remainingBefore.toFixed(1)} dni `
                        + `(wymiar ${split.snapshot.entitlementDays} + zaległe ${split.snapshot.carriedOverDays}${initialNote}), `
                        + `a ten wniosek to ${split.workingDays} dni roboczych. `
                        + `Dla nadwyżki użyj typu "Urlop bezpłatny".`,
                )
            }
        }

        // "Odbiór dnia za święto" — tylko dla pracowników na UoP.
        if (input.leaveType === 'holiday_in_lieu') {
            const { data: meRow } = await supabase
                .from('profiles')
                .select('employment_type')
                .eq('id', ctx.userId)
                .maybeSingle<{ employment_type: string | null }>()
            assertHolidayInLieuEligible(meRow?.employment_type ?? null, true)
        }

        // Phase 25a: validate substitute (must be a real HR-zone employee in tenant,
        // not the requester himself). Optional — sick_leave / single-day urlopy
        // mogą iść bez.
        let substituteName: string | null = null
        if (input.substituteId) {
            if (input.substituteId === ctx.userId) {
                throw new ExpectedError('Nie możesz wybrać siebie jako zastępcy.')
            }
            const adminClient = createServiceClient()
            const { data: sub } = await adminClient
                .from('profiles')
                .select('id, role, full_name, email')
                .eq('id', input.substituteId)
                .maybeSingle<{ id: string; role: string; full_name: string | null; email: string | null }>()
            if (!sub) {
                throw new ExpectedError('Wybrany zastępca nie istnieje.')
            }
            if (!['admin', 'internal', 'manager', 'finanse', 'talent_community'].includes(sub.role)) {
                throw new ExpectedError('Zastępca musi mieć dostęp do strefy HR (internal/manager/admin/finanse/TCM).')
            }
            substituteName = sub.full_name ?? sub.email ?? null
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
                // Phase 41c — consent only counts alongside a substitute; without one there
                // is nobody to forward to, and a stray true would confuse the admin panel.
                forward_mail_enabled: Boolean(input.substituteId && input.forwardMail),
                created_by: ctx.userId,
                created_on_behalf: false,
                // Phase 30 — auto-split płatny (z puli) / bezpłatny.
                paid_days: split.paid,
                unpaid_days: split.unpaid,
            } as never)
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
                    substituteName,
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

            // Parytet z timesheetami: powiadom managera wnioskodawcy (jeśli istnieje
            // i nie jest adminem — admini dostali notyfikację wyżej). Manager widzi
            // teraz kolejkę swojego zespołu i może akceptować/odrzucać.
            const { data: requester } = await adminClient
                .from('profiles')
                .select('manager_id')
                .eq('id', ctx.userId)
                .maybeSingle<{ manager_id: string | null }>()
            if (requester?.manager_id) {
                const { data: mgr } = await adminClient
                    .from('profiles')
                    .select('id, email, role')
                    .eq('id', requester.manager_id)
                    .maybeSingle<{ id: string; email: string | null; role: string }>()
                if (mgr && mgr.role !== 'admin') {
                    if (mgr.email) {
                        sendLeaveRequestSubmitted(
                            [mgr.email],
                            requesterName,
                            input.leaveType,
                            input.startDate,
                            input.endDate,
                            input.note ?? null,
                            substituteName,
                        ).catch((e) => logCompat.error('[createLeaveRequest] manager notify failed:', e))
                    }
                    sendPushToUserId(mgr.id, {
                        title: 'Nowy wniosek urlopowy (zespół)',
                        body: `${requesterName}: ${input.startDate} – ${input.endDate}`,
                        url: '/internal/admin?tab=leave-requests',
                        tag: `leave-new-${inserted.id}`,
                    }).catch((e) => logCompat.error('[createLeaveRequest] manager push failed:', e))
                }
            }
        }

        return { id: inserted.id, autoApproved }
    })
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
/**
 * Phase 47 — jednolite powiadomienie o anulowaniu urlopu. Wcześniej pending →
 * nikt, approved → tylko admini (email + push). Manager akceptujący wniosek ani
 * wybrany zastępca nie dowiadywali się, że urlop znika (case Artura: rozliczał
 * timesheet w oparciu o urlop, który okazał się anulowany).
 *
 * Odbiorcy: approverzy (admini + manager pracownika) + zastępca, a przy anulacji
 * przez przełożonego także sam pracownik. Actor jest wykluczony ze wszystkich
 * kanałów. Kanały: in-app (dzwonek — trwałe, awaited jako najpewniejszy sygnał)
 * + push + email (email tylko dla anulowanego *approved* urlopu — pending znika
 * rutynowo, nie zasypujemy skrzynek). Każdy kanał best-effort, nigdy nie blokuje
 * anulowania.
 */
async function notifyLeaveCancelled(params: {
    leaveId: string
    employeeUserId: string
    startDate: string
    endDate: string
    leaveType: LeaveType
    substituteId: string | null
    wasApproved: boolean
    actorUserId: string
    /** true = anulował przełożony/admin (poinformuj też pracownika); false = self-cancel. */
    byManager: boolean
}): Promise<void> {
    const {
        leaveId, employeeUserId, startDate, endDate, leaveType,
        substituteId, wasApproved, actorUserId, byManager,
    } = params
    const admin = createServiceClient()

    // Pracownik + jego manager (approver merytoryczny).
    const { data: employee } = await admin
        .from('profiles')
        .select('full_name, email, manager_id')
        .eq('id', employeeUserId)
        .single<{ full_name: string | null; email: string | null; manager_id: string | null }>()
    const employeeName = employee?.full_name ?? employee?.email ?? 'Pracownik'

    // Admini (approverzy globalni). Phase 43 — zarchiwizowani nie logują się, ale
    // ich mail bywa aktywny; nie wysyłamy im powiadomień (spójne z rosterami
    // powiadomień w reszcie kodu).
    const { data: admins } = await admin
        .from('profiles')
        .select('id')
        .eq('role', 'admin')
        .neq('employment_status', 'exited')
    const adminIds = ((admins ?? []) as Array<{ id: string }>).map((a) => a.id)

    // Approverzy = admini + manager pracownika. Osobno zastępca (inna treść) i
    // pracownik (tylko gdy anulował ktoś inny).
    const approverIds = new Set<string>(adminIds)
    if (employee?.manager_id) approverIds.add(employee.manager_id)

    const recipientIds = new Set<string>(approverIds)
    if (substituteId) recipientIds.add(substituteId)
    if (byManager) recipientIds.add(employeeUserId)
    recipientIds.delete(actorUserId)
    if (recipientIds.size === 0) return
    const recipients = Array.from(recipientIds)

    // Profile odbiorców (email/nazwa do kanału email).
    const { data: profs } = await admin
        .from('profiles')
        .select('id, email, full_name')
        .in('id', recipients)
    const byId = new Map(
        ((profs ?? []) as Array<{ id: string; email: string | null; full_name: string | null }>).map(
            (p) => [p.id, p],
        ),
    )

    const typeLabel = HR_LEAVE_TYPE_LABEL[leaveType] ?? leaveType
    const range = `${startDate} – ${endDate}`
    const APPROVER_URL = '/internal/admin?tab=leave-requests'
    const SELF_URL = '/internal?tab=leave'

    // ── in-app (awaited) + push (best-effort) ──
    const inAppInserts: PromiseLike<unknown>[] = []
    for (const id of recipients) {
        const kind =
            id === substituteId ? 'substitute' : id === employeeUserId ? 'employee' : 'approver'
        let titlePl: string
        let titleEn: string
        let bodyPl: string
        let bodyEn: string
        let url: string
        if (kind === 'substitute') {
            titlePl = 'Zastępstwo anulowane'
            titleEn = 'Substitution cancelled'
            bodyPl = `${employeeName}: urlop ${range} anulowany — nie zastępujesz.`
            bodyEn = `${employeeName}: leave ${range} cancelled — you are no longer covering.`
            // Zastępca będący też approverem (admin/manager) i tak trafia do kolejki.
            url = approverIds.has(id) ? APPROVER_URL : SELF_URL
        } else if (kind === 'employee') {
            titlePl = 'Anulowano Twój urlop'
            titleEn = 'Your leave was cancelled'
            bodyPl = `${range} — anulowane przez przełożonego.`
            bodyEn = `${range} — cancelled by your manager.`
            url = SELF_URL
        } else {
            titlePl = 'Anulowano urlop'
            titleEn = 'Leave cancelled'
            bodyPl = `${employeeName}: ${range} · ${typeLabel}${byManager ? ' (anulował przełożony)' : ''}`
            bodyEn = `${employeeName}: ${range} · ${typeLabel}`
            url = APPROVER_URL
        }

        // supabase-js nie rejectuje — resolwuje {error}; mapujemy na log awarii.
        inAppInserts.push(
            admin
                .from('notifications')
                .insert({
                    user_id: id,
                    type: 'leave_cancelled',
                    title_pl: titlePl,
                    title_en: titleEn,
                    body_pl: bodyPl,
                    body_en: bodyEn,
                    action_url: url,
                    priority: 'normal',
                })
                .then(({ error }) => {
                    if (error)
                        logCompat.error('[notifyLeaveCancelled] in-app insert failed:', error.message)
                }),
        )

        sendPushToUserId(id, {
            title: titlePl,
            body: bodyPl,
            url,
            tag: `leave-cancelled-${leaveId}`,
        }).catch((e) => logCompat.error('[notifyLeaveCancelled] push failed:', e))
    }
    // In-app to najpewniejszy kanał — czekamy, żeby na pewno trafił przed powrotem
    // z akcji (un-awaited insert mógłby zostać ucięty po zwróceniu odpowiedzi).
    await Promise.allSettled(inAppInserts)

    // ── email — tylko dla anulowanego *approved* urlopu ──
    if (wasApproved) {
        const approverEmails = Array.from(approverIds)
            .filter((aid) => aid !== actorUserId)
            .map((aid) => byId.get(aid)?.email)
            .filter((e): e is string => !!e)
        if (approverEmails.length > 0) {
            sendLeaveCancelledByUser(
                approverEmails,
                employeeName,
                leaveType,
                startDate,
                endDate,
                byManager,
            ).catch((e) => logCompat.error('[notifyLeaveCancelled] approver email failed:', e))
        }
        if (substituteId && substituteId !== actorUserId) {
            const sub = byId.get(substituteId)
            if (sub?.email) {
                sendSubstituteCancelled(
                    sub.email,
                    sub.full_name ?? 'Zastępco',
                    employeeName,
                    startDate,
                    endDate,
                ).catch((e) => logCompat.error('[notifyLeaveCancelled] substitute email failed:', e))
            }
        }
    }
}

export async function cancelMyLeaveRequest(id: string): Promise<ActionResult<void>> {
    return runAction('cancelMyLeaveRequest', async () => {
        const ctx = await requireInternalOrAdminAction()
        const supabase = createClient()

        const { data: row, error: fetchErr } = await supabase
            .from('leave_requests')
            .select(
                'id, user_id, status, start_date, end_date, leave_type, substitute_id, outlook_event_id, graph_oof_set, outlook_forward_rule_id',
            )
            .eq('id', id)
            .single<{
                id: string
                user_id: string
                status: LeaveStatus
                start_date: string
                end_date: string
                leave_type: LeaveType
                substitute_id: string | null
                outlook_event_id: string | null
                graph_oof_set: boolean | null
                outlook_forward_rule_id: string | null
            }>()
        if (fetchErr || !row) throw new ExpectedError('Wniosek nie istnieje.')
        if (row.user_id !== ctx.userId) throw new ExpectedError('To nie jest Twój wniosek.')

        if (row.status === 'pending') {
            // Standard cancel — pending wymaga tylko zmiany status
            const { error } = await supabase
                .from('leave_requests')
                .update({ status: 'cancelled' })
                .eq('id', id)
            if (error) throw new Error(`Błąd anulowania: ${error.message}`)

            await logAudit(ctx.userId, 'LEAVE_CANCELLED', { leave_id: id })

            // Phase 47 — powiadom approverów (i zastępcę, jeśli był), żeby wycofany
            // wniosek nie wisiał w ich głowie jako „do akceptacji". In-app + push
            // (bez emaila — pending znika rutynowo).
            await notifyLeaveCancelled({
                leaveId: id,
                employeeUserId: row.user_id,
                startDate: row.start_date,
                endDate: row.end_date,
                leaveType: row.leave_type,
                substituteId: row.substitute_id,
                wasApproved: false,
                actorUserId: ctx.userId,
                byManager: false,
            }).catch((e) => logCompat.error('[cancelMyLeaveRequest] notify (pending) failed:', e))
            return
        }

        if (row.status === 'approved') {
            // H2.3: tylko future approved leaves można anulować self-service
            const today = new Date().toISOString().slice(0, 10)
            if (row.start_date <= today) {
                throw new ExpectedError(
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
            // Audyt 2026-09-22, INT-07: helper zwraca `success:false` zamiast rzucać,
            // więc porażkę zapisujemy jawnie — cron oof-reconcile ponowi sprzątanie.
            if (row.outlook_event_id) {
                deleteLeaveEvent({
                    userEmail: ctx.email,
                    eventId: row.outlook_event_id,
                })
                    .then(async (r) => {
                        if (!r.success) {
                            await recordLeaveCleanupFailure({ leaveId: id, kind: 'calendar', error: r.error })
                        }
                    })
                    .catch((e) => logCompat.error('[cancelMyLeaveRequest] calendar delete failed:', e))
            }

            // Phase 25: revert Outlook OOF if it was set on approve.
            // INT-03: tylko OOF tego urlopu (marker + okno) — cudzy zostaje.
            if (row.graph_oof_set) {
                disableOutOfOffice({ userEmail: ctx.email, startDate: row.start_date, endDate: row.end_date })
                    .then(async (r) => {
                        if (!r.success) {
                            await recordLeaveCleanupFailure({ leaveId: id, kind: 'oof', error: r.error })
                            return
                        }
                        if (r.skipReason === 'no_credentials') return
                        // Wyłączony albo już nie nasz — w obu przypadkach ten urlop nie trzyma OOF.
                        await createServiceClient()
                            .from('leave_requests')
                            .update({ graph_oof_set: false } as never)
                            .eq('id', id)
                        if (!r.skipped) {
                            await logAudit(ctx.userId, 'LEAVE_OOF_DISABLED', {
                                leave_id: id,
                                reason: 'self_cancel',
                            })
                        }
                    })
                    .catch((e) => logCompat.error('[cancelMyLeaveRequest] OOF disable failed:', e))
            }

            // Phase 41 — tear down mail forwarding. Only future leaves can be
            // self-cancelled and the window opens on the first day (Phase 41a), so a rule
            // is rare here — but a leave cancelled on its own start date still has one.
            if (row.outlook_forward_rule_id) {
                closeForwardRule({
                    admin: createServiceClient(),
                    leaveId: id,
                    ruleId: row.outlook_forward_rule_id,
                    userEmail: ctx.email,
                    actorUserId: ctx.userId,
                    reason: 'cancelled',
                    auditExtra: { via: 'self_cancel' },
                }).catch((e) =>
                    logCompat.error('[cancelMyLeaveRequest] forward rule delete failed:', e),
                )
            }

            await logAudit(ctx.userId, 'LEAVE_CANCELLED', {
                leave_id: id,
                was_approved: true,
                start_date: row.start_date,
                end_date: row.end_date,
            })

            // Phase 47 — powiadom approverów (admini + manager pracownika) oraz
            // zastępcę, że zatwierdzony urlop został wycofany. In-app + push + email.
            await notifyLeaveCancelled({
                leaveId: id,
                employeeUserId: row.user_id,
                startDate: row.start_date,
                endDate: row.end_date,
                leaveType: row.leave_type,
                substituteId: row.substitute_id,
                wasApproved: true,
                actorUserId: ctx.userId,
                byManager: false,
            }).catch((e) => logCompat.error('[cancelMyLeaveRequest] notify (approved) failed:', e))
            return
        }

        throw new ExpectedError(`Nie można anulować wniosku w statusie "${row.status}".`)
    })
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
    /** Phase 41c — opt-in mail forwarding to the substitute. See CreateLeaveInput. */
    forwardMail?: boolean
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
export async function createLeaveOnBehalf(input: CreateLeaveOnBehalfInput): Promise<ActionResult<{ id: string }>> {
    return runAction('createLeaveOnBehalf', async () => {
        const ctx = await requireInternalOrAdminAction()
        if (!ctx.isAdmin && !ctx.isManager) {
            throw new ExpectedError('Wymagane uprawnienia: administrator lub manager.')
        }
        if (input.targetUserId === ctx.userId) {
            throw new ExpectedError('Nie wpisuj urlopu sam sobie — użyj standardowego formularza wniosku.')
        }

        // Walidacje wspólne z createLeaveRequest.
        validateDateString(input.startDate, 'start_date')
        validateDateString(input.endDate, 'end_date')
        validateLeaveType(input.leaveType)
        if (input.endDate < input.startDate) {
            throw new ExpectedError('Data końca musi być >= data początku.')
        }
        if (input.halfDay && input.startDate !== input.endDate) {
            throw new ExpectedError('Half-day można zaznaczyć tylko gdy start_date == end_date.')
        }
        if (input.halfDay && !['morning', 'afternoon'].includes(input.halfDay)) {
            throw new ExpectedError('half_day musi być "morning" lub "afternoon".')
        }
        if (input.leaveType === ('sick_leave' as LeaveType)) {
            throw new ExpectedError('L4 musi wpisać pracownik z dołączonym zwolnieniem lekarskim.')
        }

        const admin = createServiceClient()

        // Fetch target — potrzebujemy email + full_name do side-effects, role do
        // wykluczenia konsultantów IT, manager_id do team-scope check, employment_status
        // do wykluczenia exited/offboarding.
        const { data: target, error: targetErr } = await admin
            .from('profiles')
            .select('id, role, manager_id, employment_status, employment_type, email, full_name')
            .eq('id', input.targetUserId)
            .single<{
                id: string
                role: string
                manager_id: string | null
                employment_status: string | null
                employment_type: string | null
                email: string | null
                full_name: string | null
            }>()
        if (targetErr || !target) {
            throw new ExpectedError('Pracownik nie istnieje.')
        }
        if (!target.email) {
            throw new ExpectedError('Pracownik nie ma adresu email w systemie.')
        }
        if (!(ON_BEHALF_HR_ROLES as readonly string[]).includes(target.role)) {
            throw new ExpectedError('Wybrany pracownik nie ma dostępu do strefy HR (konsultanci IT nie mają urlopów w COMPASS).')
        }
        if (target.employment_status === 'exited' || target.employment_status === 'offboarding') {
            throw new ExpectedError('Pracownik jest w trakcie offboardingu lub już opuścił firmę.')
        }
        if (input.leaveType === 'holiday_in_lieu') {
            assertHolidayInLieuEligible(target.employment_type, false)
        }
        // Phase 29 — B2B / zlecenie: tylko vacation (analogicznie do self-service).
        assertB2bZlecenieVacationOnly(target.employment_type, input.leaveType, false)

        // Team-scope check dla managera (admin pomija). Pattern z approveTimesheet.
        if (!ctx.isAdmin) {
            if (target.manager_id !== ctx.userId) {
                throw new ExpectedError('Możesz wpisać urlop tylko swojemu zespołowi.')
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
            throw new ExpectedError(
                `Pracownik ma już zatwierdzony urlop nakładający się na ten zakres (${first.start_date} – ${first.end_date}).`,
            )
        }

        // Substitute walidacja (tylko gdy podano i urlop ongoing/future — past leave
        // ignorujemy substituteId niżej przy side-effects).
        if (input.substituteId) {
            if (input.substituteId === input.targetUserId) {
                throw new ExpectedError('Pracownik nie może być sam swoim zastępcą.')
            }
            const { data: sub } = await admin
                .from('profiles')
                .select('id, role')
                .eq('id', input.substituteId)
                .maybeSingle<{ id: string; role: string }>()
            if (!sub) {
                throw new ExpectedError('Wybrany zastępca nie istnieje.')
            }
            if (!(ON_BEHALF_HR_ROLES as readonly string[]).includes(sub.role)) {
                throw new ExpectedError('Zastępca musi mieć dostęp do strefy HR.')
            }
        }

        const today = new Date().toISOString().slice(0, 10)
        const isOngoingOrFuture = input.endDate >= today
        const actorName = ctx.email
        const decisionNote = `Wpisany przez ${actorName}`

        // Phase 30 — split płatny/bezpłatny (analog do createLeaveRequest). Manager
        // wpisując za pracownika UoP musi szanować hard-limit; B2B/zlecenie z pulą
        // dostaje auto-split.
        const split = await computeLeaveRequestSplit(
            admin,
            input.targetUserId,
            input.leaveType,
            input.startDate,
            input.endDate,
            input.halfDay ?? null,
        )

        if (
            split.snapshot.employmentType === 'uop'
            && split.snapshot.entitlementDays != null
            && split.workingDays > 0
        ) {
            const remainingBefore =
                split.snapshot.entitlementDays
                + split.snapshot.carriedOverDays
                - split.snapshot.usedInitialDays
                - split.snapshot.alreadyBookedDaysInYear
            if (split.workingDays > remainingBefore + 1e-9) {
                const initialNote =
                    split.snapshot.usedInitialDays > 0
                        ? ` − ${split.snapshot.usedInitialDays} zaległo zużyte`
                        : ''
                throw new ExpectedError(
                    `Pracownik przekroczyłby limit urlopu wypoczynkowego: pozostało ${remainingBefore.toFixed(1)} dni `
                        + `(wymiar ${split.snapshot.entitlementDays} + zaległe ${split.snapshot.carriedOverDays}${initialNote}), `
                        + `a ten wniosek to ${split.workingDays} dni roboczych. `
                        + `Wpisz UoP-pracownikowi "Urlop bezpłatny" dla nadwyżki.`,
                )
            }
        }

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
                // Phase 41c — mirrors the substitute above: a finished leave keeps neither,
                // since there is nothing left to forward.
                forward_mail_enabled: Boolean(
                    isOngoingOrFuture && input.substituteId && input.forwardMail,
                ),
                status: 'approved',
                decided_by: ctx.userId,
                decided_at: new Date().toISOString(),
                decision_note: decisionNote,
                created_by: ctx.userId,
                created_on_behalf: true,
                // Phase 30 — split płatny (z puli) / bezpłatny.
                paid_days: split.paid,
                unpaid_days: split.unpaid,
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
                halfDay: input.halfDay ?? null,
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

            // Phase 53 — jednodniowy półdniowy urlop nie dostaje całodniowego auto-reply.
            if (
                shouldSetOofForLeave({
                    startDate: input.startDate,
                    endDate: input.endDate,
                    halfDay: input.halfDay ?? null,
                })
            ) {
                const defaults = await buildOofDefaultsFor({
                    admin,
                    userId: input.targetUserId,
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
                    .then((r) =>
                        persistOofResult({
                            admin,
                            leaveRequestId: inserted.id,
                            actorUserId: ctx.userId,
                            targetUserId: input.targetUserId,
                            result: r,
                            auditExtra: {
                                has_substitute: Boolean(input.substituteId),
                                via: 'on_behalf',
                            },
                        }),
                    )
                    .catch((e) => logCompat.error('[createLeaveOnBehalf] OOF set failed:', e))
            } else {
                await logAudit(ctx.userId, 'LEAVE_OOF_SKIPPED_HALF_DAY', {
                    leave_id: inserted.id,
                    target_user_id: input.targetUserId,
                    via: 'on_behalf',
                })
            }

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

            // Phase 41 — mail forwarding, only once the window is actually open. An
            // on-behalf leave is inserted already approved, so a leave that started
            // earlier this week gets its rule right away; a future one waits for the cron.
            // Phase 41c — and only when the forwarding box was ticked.
            if (
                substituteEmail &&
                shouldForwardBeActive(
                    {
                        status: 'approved',
                        substituteId: input.substituteId ?? null,
                        startDate: input.startDate,
                        endDate: input.endDate,
                        forwardMailEnabled: Boolean(input.forwardMail),
                    },
                    new Date(),
                )
            ) {
                openForwardRule({
                    admin,
                    leaveId: inserted.id,
                    userEmail: target.email,
                    substituteEmail,
                    substituteName,
                    actorUserId: ctx.userId,
                    targetUserId: input.targetUserId,
                    auditExtra: { via: 'on_behalf' },
                }).catch((e) => logCompat.error('[createLeaveOnBehalf] forward rule failed:', e))
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
    })
}

// ─── Phase 25b: listTeamMembersForLeaveOnBehalf ─────────────────────────────

export interface LeaveOnBehalfCandidate {
    id: string
    full_name: string | null
    email: string
    role: string
    manager_id: string | null
    employment_type: 'uop' | 'b2b' | null
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
        .select('id, full_name, email, role, manager_id, employment_status, employment_type')
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
        .map(({ id, full_name, email, role, manager_id, employment_type }) => ({
            id,
            full_name,
            email,
            role,
            manager_id,
            employment_type: employment_type === 'uop' || employment_type === 'b2b' ? employment_type : null,
        }))
}

// ─── Phase 27j: manager/admin team-leave management (list / cancel / edit) ──

export interface TeamLeaveRow {
    id: string
    user_id: string
    user_full_name: string | null
    user_email: string
    // Phase 29 — sterowanie dostępnymi typami w edytorze (B2B/zlecenie = tylko vacation).
    employment_type: string | null
    start_date: string
    end_date: string
    leave_type: LeaveType
    half_day: 'morning' | 'afternoon' | null
    status: LeaveStatus
    note: string | null
    created_on_behalf: boolean
    created_by: string | null
    substitute_full_name: string | null
    substitute_id: string | null
    // Phase 30 — split płatny/bezpłatny dla display w TimesheetPreviewDialog.
    paid_days: number
    unpaid_days: number
}

interface TeamLeaveQueryRow {
    id: string
    user_id: string
    start_date: string
    end_date: string
    leave_type: LeaveType
    half_day: 'morning' | 'afternoon' | null
    status: LeaveStatus
    note: string | null
    created_on_behalf: boolean | null
    created_by: string | null
    substitute_id: string | null
    paid_days: number | string | null
    unpaid_days: number | string | null
    profiles: {
        full_name: string | null
        email: string | null
        manager_id: string | null
        employment_type: string | null
    } | null
    substitute: { full_name: string | null } | null
}

const TEAM_LEAVE_SELECT = `
    id, user_id, start_date, end_date, leave_type, half_day, status, note,
    created_on_behalf, created_by, substitute_id, paid_days, unpaid_days,
    profiles:profiles!leave_requests_user_id_fkey(full_name, email, manager_id, employment_type),
    substitute:profiles!leave_requests_substitute_id_fkey(full_name)
`

function mapTeamLeaveRow(r: TeamLeaveQueryRow): TeamLeaveRow {
    return {
        id: r.id,
        user_id: r.user_id,
        user_full_name: r.profiles?.full_name ?? null,
        user_email: r.profiles?.email ?? '',
        employment_type: r.profiles?.employment_type ?? null,
        start_date: r.start_date,
        end_date: r.end_date,
        leave_type: r.leave_type,
        half_day: r.half_day,
        status: r.status,
        note: r.note,
        created_on_behalf: Boolean(r.created_on_behalf),
        created_by: r.created_by,
        substitute_full_name: r.substitute?.full_name ?? null,
        substitute_id: r.substitute_id,
        paid_days: Number(r.paid_days ?? 0),
        unpaid_days: Number(r.unpaid_days ?? 0),
    }
}

/** Guard: caller must manage `targetUserId` (admin, or their direct manager). */
async function assertManagesTarget(
    admin: ReturnType<typeof createServiceClient>,
    ctx: { userId: string; isAdmin: boolean },
    targetUserId: string,
): Promise<void> {
    if (targetUserId === ctx.userId) {
        throw new ExpectedError('To Twój własny wniosek — użyj sekcji „Moje urlopy".')
    }
    if (ctx.isAdmin) return
    const { data: target } = await admin
        .from('profiles')
        .select('manager_id')
        .eq('id', targetUserId)
        .single<{ manager_id: string | null }>()
    if (target?.manager_id !== ctx.userId) {
        throw new ExpectedError('Możesz zarządzać urlopami tylko swojego zespołu.')
    }
}

/**
 * Phase 27j — actionable team leaves (pending/approved) the caller can manage.
 *  - Admin: every HR-zone employee's leaves.
 *  - Manager: only direct reports (profiles.manager_id = ctx.userId).
 * Window: ending within the last ~month or any time in the future, so recently
 * entered and upcoming leaves both show. Newest first. Excludes the caller's own.
 */
export async function listTeamLeaves(): Promise<TeamLeaveRow[]> {
    const ctx = await requireInternalOrAdminAction()
    if (!ctx.isAdmin && !ctx.isManager) {
        throw new Error('Wymagane uprawnienia: administrator lub manager.')
    }
    const admin = createServiceClient()
    const since = new Date()
    since.setDate(since.getDate() - 31)
    const sinceStr = since.toISOString().slice(0, 10)

    const { data, error } = await admin
        .from('leave_requests')
        .select(TEAM_LEAVE_SELECT)
        .in('status', ['pending', 'approved'])
        .gte('end_date', sinceStr)
        .neq('user_id', ctx.userId)
        .order('start_date', { ascending: false })
        .limit(200)
    if (error) throw new Error(`Błąd pobierania urlopów zespołu: ${error.message}`)

    return ((data ?? []) as unknown as TeamLeaveQueryRow[])
        .filter((r) => r.profiles && (ctx.isAdmin || r.profiles.manager_id === ctx.userId))
        .map(mapTeamLeaveRow)
}

// ─── Phase 47: pełna historia wniosków (w tym anulowane) ────────────────────

export interface AllLeaveRow {
    id: string
    user_id: string
    user_full_name: string | null
    user_email: string
    start_date: string
    end_date: string
    leave_type: LeaveType
    half_day: 'morning' | 'afternoon' | null
    status: LeaveStatus
    note: string | null
    created_on_behalf: boolean
    source: string | null
    substitute_full_name: string | null
    decided_at: string | null
    created_at: string
    updated_at: string | null
}

interface AllLeaveQueryRow {
    id: string
    user_id: string
    start_date: string
    end_date: string
    leave_type: LeaveType
    half_day: 'morning' | 'afternoon' | null
    status: LeaveStatus
    note: string | null
    created_on_behalf: boolean | null
    source: string | null
    decided_at: string | null
    created_at: string
    updated_at: string | null
    profiles: { full_name: string | null; email: string | null; manager_id: string | null } | null
    substitute: { full_name: string | null } | null
}

/**
 * Phase 47 — pełna historia wniosków urlopowych, wszystkie statusy (w tym
 * cancelled/rejected). Rozwiązuje problem Artura: kolejka pokazuje tylko pending,
 * więc po akceptacji (lub anulowaniu) wniosek znika i nie ma jak sprawdzić stanu.
 *
 *  - Admin: wszyscy.
 *  - Manager: tylko podwładni (profiles.manager_id = ctx.userId).
 *
 * Zwraca najświeższe ~500 wierszy (po created_at malejąco). Filtrowanie po
 * statusie i wyszukiwanie po nazwisku robi komponent kliencki — przy skali firmy
 * (~kilkadziesiąt osób) to garść setek wierszy, więc client-side jest natychmiastowe.
 */
export async function listAllLeaveRequests(): Promise<AllLeaveRow[]> {
    const ctx = await requireLeaveApproverAction()
    const admin = createServiceClient()

    let teamIds: string[] | null = null
    if (!ctx.isAdmin) {
        const { data: team } = await admin
            .from('profiles')
            .select('id')
            .eq('manager_id', ctx.userId)
        teamIds = ((team ?? []) as Array<{ id: string }>).map((t) => t.id)
        if (teamIds.length === 0) return []
    }

    let query = admin
        .from('leave_requests')
        .select(`
            id, user_id, start_date, end_date, leave_type, half_day, status, note,
            created_on_behalf, source, decided_at, created_at, updated_at,
            profiles:profiles!leave_requests_user_id_fkey(full_name, email, manager_id),
            substitute:profiles!leave_requests_substitute_id_fkey(full_name)
        `)
        .order('created_at', { ascending: false })
        .limit(500)

    if (teamIds) query = query.in('user_id', teamIds)

    const { data, error } = await query
    if (error) throw new Error(`Błąd pobierania historii wniosków: ${error.message}`)

    return ((data ?? []) as unknown as AllLeaveQueryRow[]).map((r) => ({
        id: r.id,
        user_id: r.user_id,
        user_full_name: r.profiles?.full_name ?? null,
        user_email: r.profiles?.email ?? '',
        start_date: r.start_date,
        end_date: r.end_date,
        leave_type: r.leave_type,
        half_day: r.half_day,
        status: r.status,
        note: r.note,
        created_on_behalf: Boolean(r.created_on_behalf),
        source: r.source,
        substitute_full_name: r.substitute?.full_name ?? null,
        decided_at: r.decided_at,
        created_at: r.created_at,
        updated_at: r.updated_at,
    }))
}

/**
 * Phase 27j — leaves overlapping a given month for one employee, used by the
 * timesheet preview so an approver sees (and can cancel) leave that blocks
 * logging hours. Same admin/manager-of scope as listTeamLeaves.
 */
export async function listLeavesForUserMonth(
    userId: string,
    year: number,
    month: number,
): Promise<ActionResult<TeamLeaveRow[]>> {
    return runAction('listLeavesForUserMonth', async () => {
        const ctx = await requireInternalOrAdminAction()
        if (!ctx.isAdmin && !ctx.isManager) {
            throw new ExpectedError('Wymagane uprawnienia: administrator lub manager.')
        }
        const admin = createServiceClient()
        if (!ctx.isAdmin) {
            const { data: target } = await admin
                .from('profiles')
                .select('manager_id')
                .eq('id', userId)
                .single<{ manager_id: string | null }>()
            if (target?.manager_id !== ctx.userId) return []
        }
        const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
        const monthEnd = format(endOfMonth(new Date(year, month - 1, 1)), 'yyyy-MM-dd')

        const { data, error } = await admin
            .from('leave_requests')
            .select(TEAM_LEAVE_SELECT)
            .eq('user_id', userId)
            .in('status', ['pending', 'approved'])
            .lte('start_date', monthEnd)
            .gte('end_date', monthStart)
            .order('start_date', { ascending: true })
        if (error) throw new Error(`Błąd pobierania urlopów: ${error.message}`)
        return ((data ?? []) as unknown as TeamLeaveQueryRow[]).map(mapTeamLeaveRow)
    })
}

// ─── Phase 30b: dni blokujące timesheet (split-aware) ───────────────────────

/**
 * Phase 30b — zwraca dni (yyyy-MM-dd) w danym miesiącu, które BLOKUJĄ logowanie
 * godzin w timesheet. Źródło prawdy dla overlay'a w edytorze i podglądzie admina.
 *
 * Reguła:
 *   - approved urlop → splitLeaveWorkingDays: dni płatne z puli (B2B/zlecenie) NIE
 *     blokują (mają auto-wpis godzin), nadwyżkowe/UoP/non-pool dni blokują.
 *   - pending urlop → wszystkie dni robocze blokują (zachowawczo, jak dotąd — split
 *     jest prowizoryczny dopóki wniosek nie zatwierdzony).
 *
 * Scope: własny timesheet (bez `targetUserId`) lub — dla approvera (admin / manager
 * pracownika) — wskazany pracownik.
 */
export async function getTimesheetBlockedDates(
    year: number,
    month: number,
    targetUserId?: string,
): Promise<ActionResult<string[]>> {
    return runAction('getTimesheetBlockedDates', async () => {
        const ctx = await requireInternalOrAdminAction()
        const admin = createServiceClient()

        let userId = ctx.userId
        if (targetUserId && targetUserId !== ctx.userId) {
            if (!ctx.isAdmin) {
                const { data: t } = await admin
                    .from('profiles')
                    .select('manager_id')
                    .eq('id', targetUserId)
                    .maybeSingle<{ manager_id: string | null }>()
                if (t?.manager_id !== ctx.userId) {
                    throw new ExpectedError('Brak uprawnień do timesheetu tego pracownika.')
                }
            }
            userId = targetUserId
        }

        const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
        const monthEnd = format(endOfMonth(new Date(year, month - 1, 1)), 'yyyy-MM-dd')

        const [leavesRes, profRes] = await Promise.all([
            admin
                .from('leave_requests')
                .select('start_date, end_date, half_day, leave_type, status, paid_days')
                .eq('user_id', userId)
                .in('status', ['approved', 'pending'])
                .lte('start_date', monthEnd)
                .gte('end_date', monthStart),
            admin
                .from('profiles')
                .select('employment_type')
                .eq('id', userId)
                .maybeSingle<{ employment_type: string | null }>(),
        ])

        const leaves = (leavesRes.data ?? []) as unknown as Array<{
            start_date: string
            end_date: string
            half_day: 'morning' | 'afternoon' | null
            leave_type: string
            status: LeaveStatus
            paid_days: number | string | null
        }>
        if (leaves.length === 0) return []

        // Święta dla pełnego zakresu wszystkich urlopów (urlop może zaczynać się w
        // poprzednim miesiącu — split liczy dni robocze całego urlopu, by poprawnie
        // wybrać pierwsze N płatnych).
        const minStart = leaves.reduce((m, l) => (l.start_date < m ? l.start_date : m), leaves[0].start_date)
        const maxEnd = leaves.reduce((m, l) => (l.end_date > m ? l.end_date : m), leaves[0].end_date)
        const { data: holRows } = await admin
            .from('public_holidays')
            .select('date, name_pl')
            .gte('date', minStart)
            .lte('date', maxEnd)
        const holidays = (holRows ?? []) as PublicHolidayDate[]
        const employmentType = profRes.data?.employment_type ?? null

        const blocked = new Set<string>()
        for (const lv of leaves) {
            // Pending → traktuj jak w pełni blokujący (paidDays=0); approved → realny split.
            const effectivePaid = lv.status === 'approved' ? Number(lv.paid_days ?? 0) : 0
            const split = splitLeaveWorkingDays({
                startDate: lv.start_date,
                endDate: lv.end_date,
                halfDay: lv.half_day,
                leaveType: lv.leave_type,
                paidDays: effectivePaid,
                employmentType,
                holidays,
            })
            for (const d of split.blockedDays) {
                if (d >= monthStart && d <= monthEnd) blocked.add(d)
            }
        }
        return Array.from(blocked).sort()
    })
}

/**
 * Phase 27j — manager/admin cancels a team member's leave (Dominik report:
 * managers had no way to cancel a leave they entered). Cleans attendance + (best
 * effort) Outlook event / OOF, notifies the employee via push.
 */
export async function cancelTeamLeave(id: string): Promise<ActionResult<void>> {
    return runAction('cancelTeamLeave', async () => {
        const ctx = await requireInternalOrAdminAction()
        if (!ctx.isAdmin && !ctx.isManager) {
            throw new ExpectedError('Wymagane uprawnienia: administrator lub manager.')
        }
        const admin = createServiceClient()
        const { data: row, error } = await admin
            .from('leave_requests')
            .select(
                'id, user_id, status, start_date, end_date, leave_type, substitute_id, outlook_event_id, graph_oof_set, outlook_forward_rule_id',
            )
            .eq('id', id)
            .single<{
                id: string
                user_id: string
                status: LeaveStatus
                start_date: string
                end_date: string
                leave_type: LeaveType
                substitute_id: string | null
                outlook_event_id: string | null
                graph_oof_set: boolean | null
                outlook_forward_rule_id: string | null
            }>()
        if (error || !row) throw new ExpectedError('Wniosek nie istnieje.')
        if (row.status !== 'pending' && row.status !== 'approved') {
            throw new ExpectedError(`Nie można anulować wniosku w statusie "${row.status}".`)
        }
        const wasApproved = row.status === 'approved'
        await assertManagesTarget(admin, ctx, row.user_id)

        const { error: updErr } = await admin
            .from('leave_requests')
            .update({ status: 'cancelled' })
            .eq('id', id)
        if (updErr) throw new Error(`Błąd anulowania: ${updErr.message}`)

        await syncAttendanceFromLeave(id, row.user_id, 'remove').catch((e) =>
            logCompat.error('[cancelTeamLeave] attendance cleanup failed:', e),
        )

        const contact = await fetchUserContact(row.user_id)
        // Audyt 2026-09-22, INT-07: `success:false` zapisujemy — cron ponowi sprzątanie.
        if (contact?.email && row.outlook_event_id) {
            deleteLeaveEvent({ userEmail: contact.email, eventId: row.outlook_event_id })
                .then(async (r) => {
                    if (!r.success) {
                        await recordLeaveCleanupFailure({ leaveId: id, kind: 'calendar', error: r.error })
                    }
                })
                .catch((e) => logCompat.error('[cancelTeamLeave] calendar delete failed:', e))
        }
        // INT-03: wyłączamy wyłącznie OOF tego urlopu (marker + okno).
        if (contact?.email && row.graph_oof_set) {
            disableOutOfOffice({ userEmail: contact.email, startDate: row.start_date, endDate: row.end_date })
                .then(async (r) => {
                    if (!r.success) {
                        await recordLeaveCleanupFailure({ leaveId: id, kind: 'oof', error: r.error })
                        return
                    }
                    if (r.skipReason === 'no_credentials') return
                    await admin
                        .from('leave_requests')
                        .update({ graph_oof_set: false } as never)
                        .eq('id', id)
                })
                .catch((e) => logCompat.error('[cancelTeamLeave] OOF disable failed:', e))
        }
        // Phase 41 — tear down mail forwarding.
        if (contact?.email && row.outlook_forward_rule_id) {
            closeForwardRule({
                admin,
                leaveId: id,
                ruleId: row.outlook_forward_rule_id,
                userEmail: contact.email,
                actorUserId: ctx.userId,
                reason: 'cancelled',
                auditExtra: { via: 'manager_cancel', target_user_id: row.user_id },
            }).catch((e) => logCompat.error('[cancelTeamLeave] forward rule delete failed:', e))
        }

        await logAudit(ctx.userId, 'LEAVE_CANCELLED_BY_MANAGER', {
            leave_id: id,
            target_user_id: row.user_id,
            was_approved: row.status === 'approved',
            start_date: row.start_date,
            end_date: row.end_date,
        })

        // Phase 47 — powiadom pracownika (anulował przełożony), jego zastępcę oraz
        // pozostałych approverów (admini + manager, poza actorem). In-app + push +
        // (dla approved) email — jednolicie z self-cancel.
        await notifyLeaveCancelled({
            leaveId: id,
            employeeUserId: row.user_id,
            startDate: row.start_date,
            endDate: row.end_date,
            leaveType: row.leave_type,
            substituteId: row.substitute_id,
            wasApproved,
            actorUserId: ctx.userId,
            byManager: true,
        }).catch((e) => logCompat.error('[cancelTeamLeave] notify failed:', e))
    })
}

/**
 * Audyt 2026-09-22 (HF-07) — po edycji zatwierdzonego urlopu doprowadź Outlooka do
 * nowych dat: PATCH istniejącego wydarzenia i ponowne ustawienie OOF (tylko gdy
 * Compass je ustawił — `graph_oof_set`). Błędy lądują w `graph_sync_error`, widocznym
 * w panelu synchronizacji, skąd admin może ponowić.
 */
async function resyncLeaveGraphAfterEdit(args: {
    admin: ReturnType<typeof createServiceClient>
    leaveId: string
    actorUserId: string
    userId: string
    eventId: string | null
    oofWasSet: boolean
    refreshEvent: boolean
    refreshOof: boolean
    startDate: string
    endDate: string
    leaveType: LeaveType
    halfDay: 'morning' | 'afternoon' | null
    substituteId: string | null
    oofInternalMessage: string | null
    oofExternalMessage: string | null
}): Promise<void> {
    const needsEvent = args.refreshEvent && Boolean(args.eventId)
    const needsOof = args.refreshOof && args.oofWasSet
    if (!needsEvent && !needsOof) return

    const contact = await fetchUserContact(args.userId)
    if (!contact?.email) return
    const { admin } = args

    if (needsEvent && args.eventId) {
        const res = await updateLeaveEvent({
            userEmail: contact.email,
            eventId: args.eventId,
            startDate: args.startDate,
            endDate: args.endDate,
            leaveType: args.leaveType,
        })
        if (!res.success) {
            // Wydarzenie zniknęło z kalendarza — zapominamy id, żeby ponowienie
            // synchronizacji (retryLeaveGraphSync) mogło założyć je od nowa.
            const { error } = await admin
                .from('leave_requests')
                .update({
                    graph_sync_error: `calendar: ${res.error ?? 'update failed'}`,
                    ...(res.notFound ? { outlook_event_id: null } : {}),
                } as never)
                .eq('id', args.leaveId)
            if (error) logCompat.error('[updateTeamLeave] graph_sync_error write failed:', error)
        }
    }

    if (needsOof) {
        if (
            !shouldSetOofForLeave({
                startDate: args.startDate,
                endDate: args.endDate,
                halfDay: args.halfDay,
            })
        ) {
            // Nowy zakres to pojedyncze pół dnia — takim urlopom OOF nie ustawiamy.
            // Wyłączenie istniejącego zostawiamy panelowi synchronizacji.
            logCompat.error('[updateTeamLeave] leave shrunk to a half-day; OOF left unchanged:', args.leaveId)
            return
        }
        let substituteName: string | null = null
        let substituteEmail: string | null = null
        if (args.substituteId) {
            const { data: sub } = await admin
                .from('profiles')
                .select('full_name, email')
                .eq('id', args.substituteId)
                .maybeSingle<{ full_name: string | null; email: string }>()
            if (sub) {
                substituteName = sub.full_name ?? sub.email
                substituteEmail = sub.email
            }
        }
        const defaults = await buildOofDefaultsFor({
            admin,
            userId: args.userId,
            employeeName: contact.full_name ?? contact.email,
            endDate: args.endDate,
            substituteName,
            substituteEmail,
        })
        const result = await setOutOfOffice({
            userEmail: contact.email,
            startDate: args.startDate,
            endDate: args.endDate,
            internalReply: args.oofInternalMessage?.trim() || defaults.internal,
            externalReply: args.oofExternalMessage?.trim() || defaults.external,
        })
        await persistOofResult({
            admin,
            leaveRequestId: args.leaveId,
            actorUserId: args.actorUserId,
            targetUserId: args.userId,
            result,
            auditExtra: { via: 'edit' },
        })
    }
}

export interface UpdateTeamLeaveInput {
    id: string
    leaveType?: LeaveType
    startDate?: string
    endDate?: string
    halfDay?: 'morning' | 'afternoon' | null
    note?: string | null
    /** undefined = leave unchanged; null/'' = clear substitute; uuid = set substitute. */
    substituteId?: string | null
}

/**
 * Phase 27j — manager/admin edits a team member's leave (Dominik report: a leave
 * entered with the wrong type — e.g. vacation that should be unpaid — could not
 * be fixed). Re-syncs attendance for approved leaves when type/dates/half-day change.
 */
export async function updateTeamLeave(input: UpdateTeamLeaveInput): Promise<ActionResult<void>> {
    return runAction('updateTeamLeave', async () => {
        const ctx = await requireInternalOrAdminAction()
        if (!ctx.isAdmin && !ctx.isManager) {
            throw new ExpectedError('Wymagane uprawnienia: administrator lub manager.')
        }
        const admin = createServiceClient()
        const { data: row, error } = await admin
            .from('leave_requests')
            .select(
                'id, user_id, status, start_date, end_date, leave_type, half_day, note, substitute_id, outlook_forward_rule_id, forward_mail_enabled, outlook_event_id, graph_oof_set, oof_internal_message, oof_external_message',
            )
            .eq('id', input.id)
            .single<{
                id: string
                user_id: string
                status: LeaveStatus
                start_date: string
                end_date: string
                leave_type: LeaveType
                half_day: 'morning' | 'afternoon' | null
                note: string | null
                substitute_id: string | null
                outlook_forward_rule_id: string | null
                forward_mail_enabled: boolean
                outlook_event_id: string | null
                graph_oof_set: boolean | null
                oof_internal_message: string | null
                oof_external_message: string | null
            }>()
        if (error || !row) throw new ExpectedError('Wniosek nie istnieje.')
        if (row.status !== 'pending' && row.status !== 'approved') {
            throw new ExpectedError(`Nie można edytować wniosku w statusie "${row.status}".`)
        }
        await assertManagesTarget(admin, ctx, row.user_id)

        const newType = input.leaveType ?? row.leave_type
        const newStart = input.startDate ?? row.start_date
        const newEnd = input.endDate ?? row.end_date
        let newHalfDay = input.halfDay !== undefined ? input.halfDay : row.half_day
        const newNote = input.note !== undefined ? input.note?.trim() || null : row.note
        const newSubstituteId =
            input.substituteId !== undefined ? input.substituteId || null : row.substitute_id

        if (input.leaveType) validateLeaveType(input.leaveType)
        validateDateString(newStart, 'start_date')
        validateDateString(newEnd, 'end_date')
        if (newEnd < newStart) throw new ExpectedError('Data końca musi być >= data początku.')
        // Half-day only makes sense on a single-day leave.
        if (newHalfDay && newStart !== newEnd) newHalfDay = null
        if (newHalfDay && !['morning', 'afternoon'].includes(newHalfDay)) {
            throw new ExpectedError('half_day musi być "morning" lub "afternoon".')
        }
        // Validate a (newly) chosen substitute — HR-zone, not the employee themselves.
        if (input.substituteId) {
            if (input.substituteId === row.user_id) {
                throw new ExpectedError('Pracownik nie może być sam swoim zastępcą.')
            }
            const { data: sub } = await admin
                .from('profiles')
                .select('id, role')
                .eq('id', input.substituteId)
                .maybeSingle<{ id: string; role: string }>()
            if (!sub) throw new ExpectedError('Wybrany zastępca nie istnieje.')
            if (!(ON_BEHALF_HR_ROLES as readonly string[]).includes(sub.role)) {
                throw new ExpectedError('Zastępca musi mieć dostęp do strefy HR.')
            }
        }

        // Phase 29 friendly guard — B2B/zlecenie may only hold 'vacation'. The DB
        // trigger enforce_b2b_zlecenie_vacation_only is the hard backstop, but in
        // prod it surfaces as a masked "Server Components render" error; validate
        // here for a clear message and to fail before touching attendance. Only the
        // type-change-to-non-vacation case can trip the trigger, so guard just that.
        if (newType !== row.leave_type && newType !== 'vacation') {
            const { data: empRow } = await admin
                .from('profiles')
                .select('employment_type')
                .eq('id', row.user_id)
                .maybeSingle<{ employment_type: string | null }>()
            assertB2bZlecenieVacationOnly(empRow?.employment_type ?? null, newType, false)
        }

        const spanChanged =
            newStart !== row.start_date ||
            newEnd !== row.end_date ||
            newType !== row.leave_type ||
            newHalfDay !== row.half_day
        const datesChanged = newStart !== row.start_date || newEnd !== row.end_date

        // Audyt 2026-09-22 (HF-06) — ta sama kontrola nakładania co przy składaniu
        // wniosku, z wyłączeniem edytowanego. Przed jakimkolwiek zapisem.
        if (datesChanged) {
            const overlapping = await findOverlappingLeave(
                row.user_id,
                newStart,
                newEnd,
                input.id,
            )
            if (overlapping) {
                throw new ExpectedError(
                    `Pracownik ma już ${overlapping.status === 'approved' ? 'zatwierdzony' : 'oczekujący'} wniosek `
                        + `nakładający się na ten zakres (${overlapping.start_date} – ${overlapping.end_date}).`,
                )
            }
        }

        // Audyt 2026-08 — podział płatny/bezpłatny (Faza 30) był zamrożony na wartościach
        // z chwili złożenia wniosku. Po zmianie zakresu lub typu `paid_days` zostawało stare,
        // a to WŁAŚNIE z niego syncAttendanceFromLeave wylicza, które dni blokują timesheet,
        // a które dostają auto-wpis 8h. Wydłużony urlop rozliczał się więc według krótszego.
        // Bieżący wniosek wykluczamy z „już zabookowanych", żeby nie liczyć go dwa razy.
        let paidDays: number | null = null
        let unpaidDays: number | null = null
        if (spanChanged) {
            const split = await computeLeaveRequestSplit(
                admin,
                row.user_id,
                newType,
                newStart,
                newEnd,
                newHalfDay,
                { excludeRequestId: input.id },
            )
            // UoP ma pulę jako twardy limit (Faza 27k) — ta sama reguła co przy składaniu
            // i przy wpisie za pracownika, inaczej edycją dałoby się ją obejść.
            if (
                split.snapshot.employmentType === 'uop'
                && split.snapshot.entitlementDays != null
                && split.workingDays > 0
            ) {
                const remainingBefore =
                    split.snapshot.entitlementDays
                    + split.snapshot.carriedOverDays
                    - split.snapshot.usedInitialDays
                    - split.snapshot.alreadyBookedDaysInYear
                if (split.workingDays > remainingBefore + 1e-9) {
                    throw new ExpectedError(
                        `Po tej zmianie wniosek przekracza limit urlopu wypoczynkowego: pozostało `
                            + `${remainingBefore.toFixed(1)} dni, a zmieniony zakres to ${split.workingDays} dni roboczych.`,
                    )
                }
            }
            paidDays = split.paid
            unpaidDays = split.unpaid
        }

        // Re-sync attendance: remove the old span (reads the current row, so it must run
        // before the UPDATE below), then write the new values, then recreate for the new
        // span/type (approved only — pending leaves have no attendance rows yet).
        // Audyt 2026-09-22 (HF-05) — usunięcie idzie DOPIERO po całej walidacji (kolizje,
        // podział puli, limit UoP). Wcześniej stało przed nią, więc odrzucona edycja
        // zostawiała wniosek ze starymi datami, ale bez attendance i płatnych godzin.
        if (spanChanged) {
            await syncAttendanceFromLeave(input.id, row.user_id, 'remove').catch((e) =>
                logCompat.error('[updateTeamLeave] attendance remove failed:', e),
            )
        }

        const { error: updErr } = await admin
            .from('leave_requests')
            .update({
                leave_type: newType,
                start_date: newStart,
                end_date: newEnd,
                half_day: newHalfDay,
                note: newNote,
                substitute_id: newSubstituteId,
                ...(spanChanged ? { paid_days: paidDays, unpaid_days: unpaidDays } : {}),
            } as never)
            .eq('id', input.id)
        if (updErr) throw new Error(`Błąd zapisu zmian: ${updErr.message}`)

        if (spanChanged && row.status === 'approved') {
            await syncAttendanceFromLeave(input.id, row.user_id, 'create').catch((e) =>
                logCompat.error('[updateTeamLeave] attendance create failed:', e),
            )
        }

        // Phase 41 — keep mail forwarding in step with the edit. An inbox rule points at
        // a fixed recipient and never expires, so without this: changing the substitute
        // would keep delivering mail to the PREVIOUS person, and shortening the leave
        // would keep forwarding after the employee is back.
        //
        // Awaited rather than fire-and-forget, and the replacement is gated on the
        // teardown succeeding (see below) — two live rules would double-deliver.
        const substituteChanged = newSubstituteId !== row.substitute_id
        const forwardShouldExist = shouldForwardBeActive(
            {
                status: row.status,
                substituteId: newSubstituteId,
                startDate: newStart,
                endDate: newEnd,
                // Phase 41c — an edit never grants consent; it only carries over what the
                // employee already agreed to. Turning forwarding on is its own action.
                forwardMailEnabled: row.forward_mail_enabled,
            },
            new Date(),
        )
        const { close: shouldCloseForward, open: shouldOpenForward } = planForwardRuleEdit({
            hasExistingRule: Boolean(row.outlook_forward_rule_id),
            substituteChanged,
            datesChanged,
            forwardShouldExist,
        })

        if (shouldCloseForward || shouldOpenForward) {
            const contact = await fetchUserContact(row.user_id)
            if (contact?.email) {
                // Gate the replacement on the teardown actually succeeding. closeForwardRule
                // RETURNS false on a Graph failure (it does not throw), so without this the
                // code would fall straight through and create a second rule while the first
                // one is still live — mail would then land with BOTH the old and the new
                // substitute. Better to leave the leave un-forwarded and surface
                // graph_sync_error: the admin retry and the orphan sweep both recover from
                // that, neither recovers from silent double delivery.
                let teardownOk = true
                if (shouldCloseForward && row.outlook_forward_rule_id) {
                    teardownOk = await closeForwardRule({
                        admin,
                        leaveId: input.id,
                        ruleId: row.outlook_forward_rule_id,
                        userEmail: contact.email,
                        actorUserId: ctx.userId,
                        reason: 'edited',
                        auditExtra: { target_user_id: row.user_id },
                    }).catch((e) => {
                        logCompat.error('[updateTeamLeave] forward rule delete failed:', e)
                        return false
                    })
                }
                if (teardownOk && shouldOpenForward && newSubstituteId) {
                    const { data: sub } = await admin
                        .from('profiles')
                        .select('full_name, email')
                        .eq('id', newSubstituteId)
                        .maybeSingle<{ full_name: string | null; email: string }>()
                    if (sub?.email) {
                        await openForwardRule({
                            admin,
                            leaveId: input.id,
                            userEmail: contact.email,
                            substituteEmail: sub.email,
                            substituteName: sub.full_name ?? sub.email,
                            actorUserId: ctx.userId,
                            targetUserId: row.user_id,
                            auditExtra: { via: 'edit' },
                        }).catch((e) =>
                            logCompat.error('[updateTeamLeave] forward rule create failed:', e),
                        )
                    }
                }
            }
        }

        // Audyt 2026-09-22 (HF-07) — zatwierdzony urlop ma już wydarzenie w kalendarzu
        // i (zwykle) OOF ustawione przy akceptacji. Bez tego Outlook dalej pokazywał
        // stare terminy, a auto-reply wyłączał się za wcześnie albo trwał po powrocie.
        if (row.status === 'approved' && (spanChanged || substituteChanged)) {
            await resyncLeaveGraphAfterEdit({
                admin,
                leaveId: input.id,
                actorUserId: ctx.userId,
                userId: row.user_id,
                eventId: row.outlook_event_id,
                oofWasSet: Boolean(row.graph_oof_set),
                refreshEvent: spanChanged,
                refreshOof: datesChanged || substituteChanged,
                startDate: newStart,
                endDate: newEnd,
                leaveType: newType,
                halfDay: newHalfDay,
                substituteId: newSubstituteId,
                oofInternalMessage: row.oof_internal_message,
                oofExternalMessage: row.oof_external_message,
            }).catch((e) => logCompat.error('[updateTeamLeave] graph resync failed:', e))
        }

        await logAudit(ctx.userId, 'LEAVE_UPDATED_BY_MANAGER', {
            leave_id: input.id,
            target_user_id: row.user_id,
            leave_type: newType !== row.leave_type ? [row.leave_type, newType] : undefined,
            start_date: newStart !== row.start_date ? [row.start_date, newStart] : undefined,
            end_date: newEnd !== row.end_date ? [row.end_date, newEnd] : undefined,
        })

        sendPushToUserId(row.user_id, {
            title: 'Zmieniono Twój urlop',
            body: `${newStart} – ${newEnd} — zaktualizowane przez przełożonego.`,
            url: '/internal?tab=leave',
            tag: `leave-updated-${input.id}`,
        }).catch((e) => logCompat.error('[updateTeamLeave] push failed:', e))
    })
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

    const pool = [...VACATION_POOL_TYPES]
    const [profileRes, leavesRes, pendingRes, holidaysRes] = await Promise.all([
        // Phase 27k + 30 — profil: typ umowy + wymiar urlopu + hybrydowy backfill.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase.from('profiles') as any)
            .select('employment_type, leave_entitlement_days, leave_carried_over_days, leave_used_initial_days')
            .eq('id', ctx.userId)
            .maybeSingle(),
        // Zatwierdzone urlopy z puli wypoczynkowej (vacation + na żądanie)
        supabase
            .from('leave_requests')
            .select('start_date, end_date, half_day, leave_type')
            .eq('user_id', ctx.userId)
            .eq('status', 'approved')
            .in('leave_type', pool)
            .gte('start_date', yearStart)
            .lte('start_date', yearEnd),
        // Pending wnioski z puli wypoczynkowej (jeszcze nie zatwierdzone)
        supabase
            .from('leave_requests')
            .select('start_date, end_date, half_day, leave_type')
            .eq('user_id', ctx.userId)
            .eq('status', 'pending')
            .in('leave_type', pool)
            .gte('start_date', yearStart)
            .lte('start_date', yearEnd),
        supabase
            .from('public_holidays')
            .select('date, name_pl')
            .gte('date', yearStart)
            .lte('date', yearEnd),
    ])

    const prof = (profileRes.data ?? null) as {
        employment_type: string | null
        leave_entitlement_days: number | null
        leave_carried_over_days: number | string | null
        leave_used_initial_days: number | string | null
    } | null
    const allApproved = (leavesRes.data ?? []) as LeaveSpan[]
    const pending = (pendingRes.data ?? []) as LeaveSpan[]
    const holidays = (holidaysRes.data ?? []) as PublicHolidayDate[]

    const past = allApproved.filter((s) => s.start_date <= today)
    const future = allApproved.filter((s) => s.start_date > today)
    const usedDays = totalVacationDaysUsed(past, holidays)
    const futureDays = totalVacationDaysUsed(future, holidays)
    const pendingDays = totalVacationDaysUsed(pending, holidays)

    const entitlement = prof?.leave_entitlement_days ?? null
    const carried = Number(prof?.leave_carried_over_days ?? 0)
    const usedInitial = Number(prof?.leave_used_initial_days ?? 0)
    // Phase 30 — pula dotyczy też B2B/zlecenie (odgate'owane). hasLimit = jest entitlement.
    const hasLimit = entitlement != null
    const remaining = hasLimit
        ? computeRemaining(entitlement as number, carried, usedDays + usedInitial, futureDays)
        : null

    return {
        year,
        used_days: usedDays,
        pending_approved_future_days: futureDays,
        pending_request_days: pendingDays,
        employment_type: prof?.employment_type ?? null,
        has_limit: hasLimit,
        entitlement_days: entitlement,
        carried_over_days: carried,
        used_initial_days: usedInitial,
        remaining_days: remaining,
    }
}

// ─── Phase 30: previewLeaveSplit (live preview płatny/bezpłatny w formularzu) ─

export interface LeaveSplitPreview {
    workingDays: number
    paid: number
    unpaid: number
    hasPool: boolean
    entitlementDays: number | null
    remainingBefore: number | null
    remainingAfter: number | null
    employmentType: string | null
}

/**
 * Phase 30 — preview podziału na płatne/bezpłatne dla obecnego usera, zanim
 * złoży wniosek. Używane przez LeaveRequestForm do live banner'a.
 * Auth: self-only (każdy zalogowany user widzi własną pulę).
 */
export async function previewLeaveSplit(input: {
    startDate: string
    endDate: string
    halfDay: 'morning' | 'afternoon' | null
    leaveType: LeaveType
}): Promise<LeaveSplitPreview> {
    const ctx = await requireInternalOrAdminAction()
    validateDateString(input.startDate, 'start_date')
    validateDateString(input.endDate, 'end_date')
    validateLeaveType(input.leaveType)
    if (input.endDate < input.startDate) {
        throw new Error('Data końca musi być >= data początku.')
    }

    const supabase = createClient()
    const split = await computeLeaveRequestSplit(
        supabase,
        ctx.userId,
        input.leaveType,
        input.startDate,
        input.endDate,
        input.halfDay,
    )

    const hasPool = split.snapshot.entitlementDays != null
    const remainingBefore = hasPool
        ? Number(
            (
                (split.snapshot.entitlementDays as number)
                + split.snapshot.carriedOverDays
                - split.snapshot.usedInitialDays
                - split.snapshot.alreadyBookedDaysInYear
            ).toFixed(1),
        )
        : null
    const remainingAfter = hasPool && remainingBefore != null
        ? Number((remainingBefore - split.paid).toFixed(1))
        : null

    return {
        workingDays: split.workingDays,
        paid: split.paid,
        unpaid: split.unpaid,
        hasPool,
        entitlementDays: split.snapshot.entitlementDays,
        remainingBefore,
        remainingAfter,
        employmentType: split.snapshot.employmentType,
    }
}

export interface OofMessagesPreview {
    internal: string
    external: string
    /** False for a single-day half-day leave — no auto-reply will be set at all. */
    willSetOof: boolean
}

/**
 * Phase 53 — live preview of the DEFAULT auto-reply for the leave form.
 * Runs the exact same pipeline approveLeaveRequest would use when the custom
 * text fields stay empty (same builder, same manager fallback, same
 * return-date math), so the preview never drifts from the real thing.
 * Read-only, self-only: nothing is persisted.
 */
export async function previewOofMessages(input: {
    startDate: string
    endDate: string
    halfDay: 'morning' | 'afternoon' | null
    substituteId?: string | null
}): Promise<OofMessagesPreview> {
    const ctx = await requireInternalOrAdminAction()
    validateDateString(input.startDate, 'start_date')
    validateDateString(input.endDate, 'end_date')
    if (input.endDate < input.startDate) {
        throw new Error('Data końca musi być >= data początku.')
    }

    const admin = createServiceClient()
    const me = await fetchUserContact(ctx.userId)
    const employeeName = me?.full_name ?? me?.email ?? 'Pracownik'

    let substituteName: string | null = null
    let substituteEmail: string | null = null
    if (input.substituteId) {
        // Mirrors listEligibleSubstitutes' "here and now" rule: an archived
        // profile is never a valid substitute, so it never shows in a preview.
        const { data: sub } = await admin
            .from('profiles')
            .select('full_name, email')
            .eq('id', input.substituteId)
            .neq('employment_status', 'exited')
            .maybeSingle<{ full_name: string | null; email: string }>()
        if (sub) {
            substituteName = sub.full_name ?? sub.email
            substituteEmail = sub.email
        }
    }

    const defaults = await buildOofDefaultsFor({
        admin,
        userId: ctx.userId,
        employeeName,
        endDate: input.endDate,
        substituteName,
        substituteEmail,
    })

    return {
        ...defaults,
        willSetOof: shouldSetOofForLeave({
            startDate: input.startDate,
            endDate: input.endDate,
            halfDay: input.halfDay,
        }),
    }
}

// ─── Admin: listPendingLeaveRequests ─────────────────────────────────────────

export async function listPendingLeaveRequests(): Promise<PendingLeaveRow[]> {
    const ctx = await requireLeaveApproverAction()
    const admin = createServiceClient()

    // Manager widzi kolejkę tylko swojego zespołu (profiles.manager_id = ctx.userId).
    // Admin widzi wszystkie wnioski.
    let teamIds: string[] | null = null
    if (!ctx.isAdmin) {
        const { data: team } = await admin
            .from('profiles')
            .select('id')
            .eq('manager_id', ctx.userId)
        teamIds = ((team ?? []) as Array<{ id: string }>).map((t) => t.id)
        if (teamIds.length === 0) return []
    }

    let query = admin
        .from('leave_requests')
        .select(`
            id, user_id, start_date, end_date, leave_type, half_day, note,
            documentation_url, status, decided_by, decided_at, decision_note, created_at,
            substitute_id, oof_internal_message, oof_external_message, forward_mail_enabled,
            graph_oof_set, graph_oof_set_at, graph_sync_error,
            paid_days, unpaid_days,
            profiles:profiles!leave_requests_user_id_fkey(
                full_name, email, avatar_url,
                employment_type, leave_entitlement_days, leave_carried_over_days, leave_used_initial_days
            ),
            substitute:profiles!leave_requests_substitute_id_fkey(full_name, email)
        `)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })

    if (teamIds) query = query.in('user_id', teamIds)

    const { data, error } = await query

    if (error) throw new Error(`Błąd pobierania kolejki wniosków: ${error.message}`)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (data ?? []) as any[]

    // Phase 30 — batch-fetch SUM(paid_days) per user_id × year dla badge'a
    // "Pula 2026: 15/20" w queue. Liczymy approved leaves w roku startu wniosku
    // (excluding pending, bo bilans po akceptacji jest informational only).
    const yearKeys = new Set<string>()
    const userYearMap = new Map<string, { userId: string; year: number }>()
    for (const row of rows) {
        const year = Number(row.start_date.slice(0, 4))
        const key = `${row.user_id}-${year}`
        if (!yearKeys.has(key)) {
            yearKeys.add(key)
            userYearMap.set(key, { userId: row.user_id, year })
        }
    }
    const poolUsageMap = new Map<string, number>()
    if (userYearMap.size > 0) {
        const userYearValues = Array.from(userYearMap.values())
        const userIds = Array.from(new Set(userYearValues.map((v) => v.userId)))
        const years = Array.from(new Set(userYearValues.map((v) => v.year)))
        const minYear = Math.min(...years)
        const maxYear = Math.max(...years)
        // Audyt 2026-08 — TREŚĆ, nie dekoracja: z tego wychodzi „Pula 2026: 15/20"
        // pokazywane akceptującemu W MOMENCIE decyzji o urlopie. Cicha awaria
        // pokazywała 0 zużytych dni jako fakt, czyli zachęcała do zatwierdzenia
        // wniosku ponad limit. Paczkujemy id — lista rośnie z liczbą wniosków.
        const usageRows = await selectInChunks<{
            user_id: string
            start_date: string
            paid_days: number | string | null
        }>({
            source: 'leave_requests (zużycie puli)',
            column: 'user_id',
            ids: userIds,
            query: () =>
                admin
                    .from('leave_requests')
                    .select('user_id, start_date, paid_days')
                    .eq('status', 'approved')
                    .gte('start_date', `${minYear}-01-01`)
                    .lte('start_date', `${maxYear}-12-31`),
        })
        for (const u of usageRows) {
            const y = Number(u.start_date.slice(0, 4))
            const key = `${u.user_id}-${y}`
            poolUsageMap.set(key, (poolUsageMap.get(key) ?? 0) + Number(u.paid_days ?? 0))
        }
    }

    return rows.map((row) => {
        const year = Number(row.start_date.slice(0, 4))
        const usageKey = `${row.user_id}-${year}`
        return {
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
            paid_days: Number(row.paid_days ?? 0),
            unpaid_days: Number(row.unpaid_days ?? 0),
            user_full_name: row.profiles?.full_name ?? null,
            user_email: row.profiles?.email ?? '',
            user_avatar_url: row.profiles?.avatar_url ?? null,
            substitute_full_name: row.substitute?.full_name ?? null,
            substitute_email: row.substitute?.email ?? null,
            pool_employment_type: row.profiles?.employment_type ?? null,
            pool_entitlement_days: row.profiles?.leave_entitlement_days ?? null,
            pool_carried_over_days: Number(row.profiles?.leave_carried_over_days ?? 0),
            pool_used_initial_days: Number(row.profiles?.leave_used_initial_days ?? 0),
            pool_already_booked_paid_days_in_year: poolUsageMap.get(usageKey) ?? 0,
        }
    })
}

// ─── Admin: approve / reject ─────────────────────────────────────────────────

export async function approveLeaveRequest(id: string, decisionNote?: string): Promise<ActionResult<void>> {
    return runAction('approveLeaveRequest', async () => {
        const ctx = await requireLeaveApproverAction()
        const admin = createServiceClient()

        const { data: row, error: fetchErr } = await admin
            .from('leave_requests')
            .select('id, user_id, leave_type, start_date, end_date, half_day, status, substitute_id, oof_internal_message, oof_external_message, forward_mail_enabled')
            .eq('id', id)
            .single<
                Pick<
                    LeaveRequestRow,
                    | 'id'
                    | 'user_id'
                    | 'leave_type'
                    | 'start_date'
                    | 'end_date'
                    | 'half_day'
                    | 'status'
                    | 'substitute_id'
                    | 'oof_internal_message'
                    | 'oof_external_message'
                    | 'forward_mail_enabled'
                >
            >()
        if (fetchErr || !row) throw new ExpectedError('Wniosek nie istnieje.')
        if (row.status !== 'pending') {
            throw new ExpectedError(`Nie można zaakceptować wniosku w statusie ${row.status}.`)
        }
        await assertManagerOwnsLeaveTarget(ctx, admin, row.user_id)

        const { data: decided, error } = await admin
            .from('leave_requests')
            .update({
                status: 'approved',
                decided_by: ctx.userId,
                decided_at: new Date().toISOString(),
                decision_note: decisionNote ?? null,
                graph_sync_error: null, // clear stale error from previous attempts (Phase 25a column, types stale)
            } as never)
            .eq('id', id)
            // Audyt 2026-09-22 (HF-11) — warunkowy zapis: gdy drugi recenzent zdążył
            // już zadecydować, ta decyzja przegrywa ZANIM ruszą attendance, Outlook i maile.
            .eq('status', 'pending')
            .select('id')
        if (error) throw new Error(`Błąd akceptacji: ${error.message}`)
        if (!decided || decided.length === 0) {
            throw new ExpectedError('Wniosek został już rozpatrzony przez inną osobę. Odśwież listę.')
        }

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
                halfDay: row.half_day ?? null,
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

            // Resolve substitute info if assigned. Hoisted out of the OOF block in Phase 41
            // — the forwarding rule below needs the same lookup.
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

            // Phase 25 — Outlook Out-of-Office auto-reply. Ustawiamy nawet bez substitute
            // (fallback: manager pracownika, potem biuro). Sick leave (L4) też dostaje OOF —
            // szablon celowo milczy o typie nieobecności.
            // Phase 53 — skip dla jednodniowego półdniowego urlopu w końcu DZIAŁA: stary
            // warunek (`!start_date.includes('XXX')`) był tautologią i nigdy nie skipował.
            if (
                shouldSetOofForLeave({
                    startDate: row.start_date,
                    endDate: row.end_date,
                    halfDay: row.half_day ?? null,
                })
            ) {
                const defaults = await buildOofDefaultsFor({
                    admin,
                    userId: row.user_id,
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
                    .then((r) =>
                        persistOofResult({
                            admin,
                            leaveRequestId: id,
                            actorUserId: ctx.userId,
                            targetUserId: row.user_id,
                            result: r,
                            auditExtra: {
                                has_substitute: Boolean(row.substitute_id),
                            },
                        }),
                    )
                    .catch((e) => logCompat.error('[approveLeaveRequest] OOF set failed:', e))
            } else {
                await logAudit(ctx.userId, 'LEAVE_OOF_SKIPPED_HALF_DAY', {
                    leave_id: id,
                    target_user_id: row.user_id,
                })
            }

            // Email do zastępcy (fire-and-forget). Phase 53: poza gate'em OOF —
            // zastępca półdniowego urlopu nadal zastępuje, choć auto-reply nie ustawiamy.
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

            // Phase 41 — forward incoming mail to the substitute for the leave's duration.
            // Deliberately NOT inside the OOF block: an inbox rule carries no schedule, so
            // it may only be created once the window is actually open. Approving a leave
            // that starts later leaves the rule to the daily cron.
            // Phase 41c — gated on the employee's opt-in, carried on the row since they
            // filed the request.
            if (
                substituteEmail &&
                shouldForwardBeActive(
                    {
                        status: 'approved',
                        substituteId: row.substitute_id ?? null,
                        startDate: row.start_date,
                        endDate: row.end_date,
                        forwardMailEnabled: Boolean(row.forward_mail_enabled),
                    },
                    new Date(),
                )
            ) {
                openForwardRule({
                    admin,
                    leaveId: id,
                    userEmail: userInfo.email,
                    substituteEmail,
                    substituteName,
                    actorUserId: ctx.userId,
                    targetUserId: row.user_id,
                    auditExtra: { via: 'approve' },
                }).catch((e) => logCompat.error('[approveLeaveRequest] forward rule failed:', e))
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
    })
}

export async function rejectLeaveRequest(id: string, decisionNote: string): Promise<ActionResult<void>> {
    return runAction('rejectLeaveRequest', async () => {
        const ctx = await requireLeaveApproverAction()
        if (!decisionNote?.trim()) {
            throw new ExpectedError('Powód odrzucenia jest wymagany.')
        }
        const admin = createServiceClient()

        const { data: row, error: fetchErr } = await admin
            .from('leave_requests')
            .select('id, user_id, leave_type, start_date, end_date, status, outlook_event_id')
            .eq('id', id)
            .single<Pick<LeaveRequestRow, 'id' | 'user_id' | 'leave_type' | 'start_date' | 'end_date' | 'status'> & { outlook_event_id: string | null }>()
        if (fetchErr || !row) throw new ExpectedError('Wniosek nie istnieje.')
        if (row.status !== 'pending') {
            throw new ExpectedError(`Nie można odrzucić wniosku w statusie ${row.status}.`)
        }
        await assertManagerOwnsLeaveTarget(ctx, admin, row.user_id)

        const { data: decided, error } = await admin
            .from('leave_requests')
            .update({
                status: 'rejected',
                decided_by: ctx.userId,
                decided_at: new Date().toISOString(),
                decision_note: decisionNote,
            })
            .eq('id', id)
            // HF-11 — patrz approveLeaveRequest: jedna decyzja wygrywa, druga dostaje konflikt.
            .eq('status', 'pending')
            .select('id')
        if (error) throw new Error(`Błąd odrzucenia: ${error.message}`)
        if (!decided || decided.length === 0) {
            throw new ExpectedError('Wniosek został już rozpatrzony przez inną osobę. Odśwież listę.')
        }

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
    })
}

// ─── Internal helpers ────────────────────────────────────────────────────────

/**
 * Manager może decydować (approve/reject) tylko o wnioskach swojego zespołu
 * (profiles.manager_id = ctx.userId). Admin — bez ograniczeń.
 * Rzuca, gdy manager próbuje zadecydować o wniosku spoza zespołu.
 */
async function assertManagerOwnsLeaveTarget(
    ctx: { isAdmin: boolean; userId: string },
    admin: ReturnType<typeof createServiceClient>,
    targetUserId: string,
): Promise<void> {
    if (ctx.isAdmin) return
    const { data: target } = await admin
        .from('profiles')
        .select('manager_id')
        .eq('id', targetUserId)
        .single<{ manager_id: string | null }>()
    if (target?.manager_id !== ctx.userId) {
        throw new ExpectedError('Możesz decydować tylko o wnioskach swojego zespołu.')
    }
}

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


/** Phase 30b — getOrCreate timesheet (service client) dla auto-wpisu płatnego urlopu. */
async function getOrCreateTimesheetForAutoFill(
    admin: ReturnType<typeof createServiceClient>,
    userId: string,
    year: number,
    month: number,
): Promise<{ id: string; status: string; pdf_hash: string | null } | null> {
    const { data: existing } = await admin
        .from('timesheets')
        .select('id, status, pdf_hash')
        .eq('user_id', userId)
        .eq('year', year)
        .eq('month', month)
        .maybeSingle<{ id: string; status: string; pdf_hash: string | null }>()
    if (existing) return existing
    const { data: created, error } = await admin
        .from('timesheets')
        .insert({ user_id: userId, year, month } as never)
        .select('id, status, pdf_hash')
        .single<{ id: string; status: string; pdf_hash: string | null }>()
    if (error || !created) {
        logCompat.error('[autoFillPaidLeave] timesheet getOrCreate error:', error)
        return null
    }
    return created
}

/**
 * Phase 30b — po zmianie wpisów: jeśli timesheet ma pdf_hash (był approved), przelicz
 * go, żeby walidacja integralności w PDF route nie zwracała 409 (H2.8 tamper check).
 */

/**
 * Phase 30b — auto-wpis płatnego urlopu (z puli) do timesheet jako godziny.
 * Idempotentny: dzień z istniejącym leave_paid → aktualizuje godziny; dzień z ręcznym
 * wpisem → zostawia (nie duplikuje); pusty dzień → wstawia 8h/4h. Urlop może przecinać
 * 2 miesiące → grupuje per (rok, miesiąc) i getOrCreate timesheet każdego.
 */
async function autoFillPaidLeaveEntries(
    admin: ReturnType<typeof createServiceClient>,
    userId: string,
    paidDays: ReadonlyArray<PaidLeaveDay>,
): Promise<void> {
    const byMonth = new Map<string, PaidLeaveDay[]>()
    for (const pd of paidDays) {
        const key = pd.date.slice(0, 7) // yyyy-MM
        const arr = byMonth.get(key)
        if (arr) arr.push(pd)
        else byMonth.set(key, [pd])
    }

    for (const [key, days] of Array.from(byMonth.entries())) {
        const year = Number(key.slice(0, 4))
        const month = Number(key.slice(5, 7))
        const ts = await getOrCreateTimesheetForAutoFill(admin, userId, year, month)
        if (!ts) continue

        const dates = days.map((d) => d.date)
        const { data: existing } = await admin
            .from('timesheet_entries')
            .select('id, work_date, source, hours')
            .eq('timesheet_id', ts.id)
            .in('work_date', dates)
        const existingRows = (existing ?? []) as Array<{
            id: string
            work_date: string
            source: string
            hours: number | string
        }>

        const toInsert: Array<{
            timesheet_id: string
            work_date: string
            hours: number
            project: string | null
            description: string
            source: string
        }> = []
        let changed = false

        for (const pd of days) {
            const dayEntries = existingRows.filter((e) => e.work_date === pd.date)
            const lp = dayEntries.find((e) => e.source === PAID_LEAVE_ENTRY_SOURCE)
            if (lp) {
                if (Number(lp.hours) !== pd.hours) {
                    await admin.from('timesheet_entries').update({ hours: pd.hours } as never).eq('id', lp.id)
                    changed = true
                }
                continue
            }
            if (dayEntries.length > 0) continue // ręczny wpis tego dnia — nie duplikuj
            toInsert.push({
                timesheet_id: ts.id,
                work_date: pd.date,
                hours: pd.hours,
                project: null,
                description: PAID_LEAVE_ENTRY_DESCRIPTION,
                source: PAID_LEAVE_ENTRY_SOURCE,
            })
        }

        if (toInsert.length > 0) {
            const { error } = await admin.from('timesheet_entries').insert(toInsert as never)
            if (error) logCompat.error('[autoFillPaidLeave] insert error:', error)
            else changed = true
        }

        if (changed) {
            if (ts.status !== 'draft') {
                await logSystemAudit(userId, 'TIMESHEET_PAID_LEAVE_AUTOFILL', {
                    timesheet_id: ts.id,
                    year,
                    month,
                    status: ts.status,
                    dates,
                }).catch(() => {})
            }
            await recomputeTimesheetHashIfSet(admin, ts.id)
        }
    }
}

/** Phase 30b — usuń auto-wpisy płatnego urlopu w zakresie (przy anulowaniu/odrzuceniu). */
async function removePaidLeaveEntries(
    admin: ReturnType<typeof createServiceClient>,
    userId: string,
    startDate: string,
    endDate: string,
): Promise<void> {
    const { data: tsRows } = await admin.from('timesheets').select('id').eq('user_id', userId)
    const ids = ((tsRows ?? []) as Array<{ id: string }>).map((t) => t.id)
    if (ids.length === 0) return

    const { data: affected } = await admin
        .from('timesheet_entries')
        .select('timesheet_id')
        .eq('source', PAID_LEAVE_ENTRY_SOURCE)
        .in('timesheet_id', ids)
        .gte('work_date', startDate)
        .lte('work_date', endDate)
    const affectedIds = Array.from(
        new Set(((affected ?? []) as Array<{ timesheet_id: string }>).map((e) => e.timesheet_id)),
    )
    if (affectedIds.length === 0) return

    const { error } = await admin
        .from('timesheet_entries')
        .delete()
        .eq('source', PAID_LEAVE_ENTRY_SOURCE)
        .in('timesheet_id', ids)
        .gte('work_date', startDate)
        .lte('work_date', endDate)
    if (error) {
        logCompat.error('[removePaidLeaveEntries] delete error:', error)
        return
    }
    for (const id of affectedIds) await recomputeTimesheetHashIfSet(admin, id)
}

/**
 * Phase 30c — gdy zatwierdzony urlop BLOKUJE dzień (unpaid / non-pool / UoP),
 * usuń kolidujące wpisy godzin, które istniały na tym dniu zanim urlop został
 * zatwierdzony. Klasyka: pracownik wypełnia timesheet (8h), POTEM składa/dostaje
 * urlop na ten sam dzień → dzień liczy się podwójnie (urlop + 8h pracy), bo
 * blokada edytora dotyczy tylko NOWYCH wpisów, nie istniejących.
 *
 * Pomija auto-wpisy płatnego urlopu (source='leave_paid' — te należą do logiki
 * puli i są zarządzane osobno). Przelicza pdf_hash dla approved timesheetów
 * (H2.8 tamper check) i audytuje dotknięcie non-draft timesheetu.
 *
 * NIE wołane dla połówek dnia (half_day) — wtedy pracownik może legalnie
 * przepracować drugą połowę, więc nie kasujemy automatycznie (caller pilnuje).
 */
async function removeConflictingWorkEntries(
    admin: ReturnType<typeof createServiceClient>,
    userId: string,
    blockedDates: ReadonlyArray<string>,
): Promise<void> {
    if (blockedDates.length === 0) return
    const { data: tsRows } = await admin.from('timesheets').select('id, status').eq('user_id', userId)
    const tsList = (tsRows ?? []) as Array<{ id: string; status: string }>
    if (tsList.length === 0) return
    const ids = tsList.map((t) => t.id)

    const { data: conflicting } = await admin
        .from('timesheet_entries')
        .select('id, timesheet_id, work_date, hours, description')
        .in('timesheet_id', ids)
        .in('work_date', [...blockedDates])
        .neq('source', PAID_LEAVE_ENTRY_SOURCE)
    const rows = (conflicting ?? []) as Array<{
        id: string
        timesheet_id: string
        work_date: string
        hours: number | string
        description: string | null
    }>
    if (rows.length === 0) return

    const { error } = await admin
        .from('timesheet_entries')
        .delete()
        .in(
            'id',
            rows.map((r) => r.id),
        )
    if (error) {
        logCompat.error('[removeConflictingWorkEntries] delete error:', error)
        return
    }

    const statusById = new Map(tsList.map((t) => [t.id, t.status]))
    const affectedIds = Array.from(new Set(rows.map((r) => r.timesheet_id)))
    for (const tsId of affectedIds) {
        if (statusById.get(tsId) !== 'draft') {
            await logSystemAudit(userId, 'TIMESHEET_LEAVE_CONFLICT_REMOVED', {
                timesheet_id: tsId,
                status: statusById.get(tsId),
                removed: rows
                    .filter((r) => r.timesheet_id === tsId)
                    .map((r) => ({
                        work_date: r.work_date,
                        hours: Number(r.hours),
                        description: r.description,
                    })),
            }).catch(() => {})
        }
        await recomputeTimesheetHashIfSet(admin, tsId)
    }
}

/**
 * Phase 11 + 30b — sync attendance_records + timesheet z wniosku urlopowego.
 *
 * create:
 *   - dni BLOKUJĄCE (unpaid / non-pool / UoP) → attendance_records (timesheet zablokowany).
 *   - dni PŁATNE z puli (B2B/zlecenie) → BEZ attendance + auto-wpis godzin do timesheet
 *     (pokazują się jak normalny dzień, billable). Decyzja Artura 2026-05-29.
 * remove:
 *   - usuń attendance w zakresie + usuń auto-wpisy płatnego urlopu.
 */
async function syncAttendanceFromLeave(
    leaveId: string,
    userId: string,
    op: 'create' | 'remove',
): Promise<void> {
    const admin = createServiceClient()
    const { data: leave } = await admin
        .from('leave_requests')
        .select('start_date, end_date, leave_type, half_day, paid_days')
        .eq('id', leaveId)
        .single<{
            start_date: string
            end_date: string
            leave_type: LeaveType
            half_day: 'morning' | 'afternoon' | null
            paid_days: number | string | null
        }>()
    if (!leave) return

    if (op === 'remove') {
        const { error } = await admin
            .from('attendance_records')
            .delete()
            .eq('user_id', userId)
            .gte('date', leave.start_date)
            .lte('date', leave.end_date)
            .in('status', [...LEAVE_ATTENDANCE_STATUSES])
        if (error) logCompat.error('[syncAttendanceFromLeave] delete error:', error)
        await removePaidLeaveEntries(admin, userId, leave.start_date, leave.end_date)
        return
    }

    // op === 'create'
    const [holidayRes, profRes] = await Promise.all([
        admin
            .from('public_holidays')
            .select('date, name_pl')
            .gte('date', leave.start_date)
            .lte('date', leave.end_date),
        admin
            .from('profiles')
            .select('employment_type')
            .eq('id', userId)
            .maybeSingle<{ employment_type: string | null }>(),
    ])
    const holidays: PublicHolidayDate[] = (holidayRes.data ?? []) as PublicHolidayDate[]

    const split = splitLeaveWorkingDays({
        startDate: leave.start_date,
        endDate: leave.end_date,
        halfDay: leave.half_day,
        leaveType: leave.leave_type,
        paidDays: Number(leave.paid_days ?? 0),
        employmentType: profRes.data?.employment_type ?? null,
        holidays,
    })

    // Dni blokujące → attendance_records (timesheet zablokowany jak zawsze).
    if (split.blockedDays.length > 0) {
        const rows = split.blockedDays.map((date) => ({
            user_id: userId,
            date,
            status: leave.leave_type,
            location: null as string | null,
            note: 'Z wniosku urlopowego',
            created_by: userId,
        }))
        const { error } = await admin
            .from('attendance_records')
            .upsert(rows, { onConflict: 'user_id,date' })
        if (error) logCompat.error('[syncAttendanceFromLeave] block upsert error:', error)

        // Phase 30c — usuń godziny pracy wpisane na te dni ZANIM urlop zatwierdzono
        // (TS-przed-urlopem → podwójne liczenie). Tylko pełne dni; połówki zostawiamy.
        if (!leave.half_day) {
            await removeConflictingWorkEntries(admin, userId, split.blockedDays)
        }
    }

    // Dni płatne z puli → bez blokady attendance + auto-wpis godzin do timesheet.
    if (split.paidDays.length > 0) {
        const paidDates = split.paidDays.map((p) => p.date)
        const { error: delErr } = await admin
            .from('attendance_records')
            .delete()
            .eq('user_id', userId)
            .in('date', paidDates)
            .in('status', [...LEAVE_ATTENDANCE_STATUSES])
        if (delErr) logCompat.error('[syncAttendanceFromLeave] paid attendance cleanup error:', delErr)
        await autoFillPaidLeaveEntries(admin, userId, split.paidDays)
    }
}

// ─── Phase 25d: active leaves (with substitute) for global banner ───────────

/**
 * Returns currently-active approved leaves (start_date <= today <= end_date)
 * company-wide.
 *
 * Visible to every HR-zone role (admin, internal, finanse, manager,
 * talent_community) — i.e. everyone EXCEPT Konsultant IT, who has no /internal
 * access (enforced by requireInternalOrAdminAction). All these roles see the
 * full company list, not just their own team.
 *
 * Used by ActiveLeavesBanner on /internal to inform users who's away and
 * who's substituting.
 */
export async function listActiveLeaves(): Promise<ActiveLeaveRow[]> {
    await requireInternalOrAdminAction()
    const admin = createServiceClient()
    const today = new Date().toISOString().slice(0, 10)

    const { data, error } = await admin
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

// ─── Phase 25e: lightweight count for sidebar badge ────────────────────────

/**
 * Lightweight version of listActiveLeaves — returns only count + flag whether
 * caller themselves is currently on leave. Used by sidebar badge on /internal
 * link (avoids fetching full join + substitute data when only number needed).
 *
 * Same company-wide scope as listActiveLeaves (all HR-zone roles, not just own
 * team) so the badge count matches the banner.
 */
export async function getActiveLeavesCount(): Promise<{ count: number; selfOnLeave: boolean }> {
    const ctx = await requireInternalOrAdminAction()
    const admin = createServiceClient()
    const today = new Date().toISOString().slice(0, 10)

    const { data, count, error } = await admin
        .from('leave_requests')
        .select('user_id', { count: 'exact' })
        .eq('status', 'approved')
        .lte('start_date', today)
        .gte('end_date', today)

    if (error) return { count: 0, selfOnLeave: false }

    const selfOnLeave = ((data ?? []) as Array<{ user_id: string }>).some(
        (r) => r.user_id === ctx.userId,
    )

    return { count: count ?? 0, selfOnLeave }
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
            graph_oof_set, graph_oof_set_at, graph_sync_error, graph_oof_skip_reason,
            outlook_event_id,
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
        graph_oof_skip_reason: row.graph_oof_skip_reason ?? null,
        user_full_name: row.profiles?.full_name ?? null,
        user_email: row.profiles?.email ?? '',
        user_avatar_url: row.profiles?.avatar_url ?? null,
        substitute_full_name: row.substitute?.full_name ?? null,
        substitute_email: row.substitute?.email ?? null,
    }))
}

// ─── Phase 25d: leaves where Compass preserved a user-set OOF (informational) ──
//
// Different from `listLeavesWithSyncIssues` — these are NOT errors, just
// "Compass świadomie nie ustawił OOF bo pracownik miał już swój własny". Admin
// sees them in a separate informational panel; no retry button.

export async function listLeavesWithUserCustomOof(): Promise<PendingLeaveRow[]> {
    await requireAdminAction()
    const admin = createServiceClient()
    const today = new Date().toISOString().slice(0, 10)

    const { data, error } = await admin
        .from('leave_requests')
        .select(`
            id, user_id, start_date, end_date, leave_type, half_day, note,
            documentation_url, status, decided_by, decided_at, decision_note, created_at,
            substitute_id, oof_internal_message, oof_external_message,
            graph_oof_set, graph_oof_set_at, graph_sync_error, graph_oof_skip_reason,
            outlook_event_id,
            profiles:profiles!leave_requests_user_id_fkey(full_name, email, avatar_url),
            substitute:profiles!leave_requests_substitute_id_fkey(full_name, email)
        `)
        .eq('status', 'approved')
        .gte('end_date', today)
        .eq('graph_oof_skip_reason', 'user_custom')
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
        graph_oof_skip_reason: row.graph_oof_skip_reason ?? null,
        user_full_name: row.profiles?.full_name ?? null,
        user_email: row.profiles?.email ?? '',
        user_avatar_url: row.profiles?.avatar_url ?? null,
        substitute_full_name: row.substitute?.full_name ?? null,
        substitute_email: row.substitute?.email ?? null,
    }))
}

// ─── Phase 25d: retry Graph sync for a leave (admin only) ───────────────────

export async function retryLeaveGraphSync(
    id: string,
): Promise<ActionResult<{ oof: boolean; calendar: boolean; forward: boolean; error?: string }>> {
    return runAction('retryLeaveGraphSync', async () => {
        const ctx = await requireAdminAction()
        const admin = createServiceClient()

        const { data: row, error: fetchErr } = await admin
            .from('leave_requests')
            .select(`
                id, user_id, start_date, end_date, leave_type, half_day, status,
                substitute_id, oof_internal_message, oof_external_message,
                outlook_event_id, outlook_forward_rule_id, forward_mail_enabled
            `)
            .eq('id', id)
            .single<{
                id: string
                user_id: string
                start_date: string
                end_date: string
                leave_type: LeaveType
                half_day: 'morning' | 'afternoon' | null
                status: LeaveStatus
                substitute_id: string | null
                oof_internal_message: string | null
                oof_external_message: string | null
                outlook_event_id: string | null
                outlook_forward_rule_id: string | null
                forward_mail_enabled: boolean
            }>()
        if (fetchErr || !row) throw new ExpectedError('Wniosek nie istnieje.')
        if (row.status !== 'approved') {
            throw new ExpectedError('Retry działa tylko dla zaakceptowanych wniosków.')
        }

        const userInfo = await fetchUserContact(row.user_id)
        if (!userInfo) throw new ExpectedError('Pracownik bez emaila — nie można wywołać Graph.')

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

        let oofOk = false
        let oofSkipReason: string | null = null
        let calOk = false
        let forwardOk = false
        const errors: string[] = []

        // Phase 53 — mirror the approve flow: a single-day half-day leave gets no
        // auto-reply, so there is nothing to (re)set here either.
        if (
            !shouldSetOofForLeave({
                startDate: row.start_date,
                endDate: row.end_date,
                halfDay: row.half_day ?? null,
            })
        ) {
            oofOk = true
            oofSkipReason = 'half_day'
        } else {
            const defaults = await buildOofDefaultsFor({
                admin,
                userId: row.user_id,
                employeeName: userInfo.full_name ?? userInfo.email,
                endDate: row.end_date,
                substituteName,
                substituteEmail,
            })

            const oofRes = await setOutOfOffice({
                userEmail: userInfo.email,
                startDate: row.start_date,
                endDate: row.end_date,
                internalReply: row.oof_internal_message?.trim() || defaults.internal,
                externalReply: row.oof_external_message?.trim() || defaults.external,
            })
            if (oofRes.success && !oofRes.skipped) {
                oofOk = true
                await admin
                    .from('leave_requests')
                    .update({
                        graph_oof_set: true,
                        graph_oof_set_at: new Date().toISOString(),
                        graph_oof_skip_reason: null,
                    } as never)
                    .eq('id', id)
            } else if (oofRes.success && oofRes.skipped && oofRes.skipReason === 'user_custom') {
                // Phase 25d — user has their own OOF; respect it. Retry treats this as success.
                oofOk = true
                oofSkipReason = 'user_custom'
                await admin
                    .from('leave_requests')
                    .update({ graph_oof_skip_reason: 'user_custom' } as never)
                    .eq('id', id)
            } else if (oofRes.success && oofRes.skipped) {
                // no_credentials — dev/local; nothing to persist, nothing to retry.
                oofOk = true
            } else if (oofRes.error) {
                errors.push(`oof: ${oofRes.error}`)
            }
        }

        if (!row.outlook_event_id) {
            const calRes = await createLeaveEvent({
                userEmail: userInfo.email,
                startDate: row.start_date,
                endDate: row.end_date,
                leaveType: row.leave_type,
                note: null,
                // Ten sam identyfikator co przy akceptacji — retry ma trafić w to
                // samo zdarzenie. Z `Date.now()` każde ponowienie było dla Graph
                // nową transakcją, więc wpis, który powstał, ale którego id nie
                // udało się zapisać, dorabiał w kalendarzu kolejną kopię urlopu.
                transactionId: `leave-${id}`,
                halfDay: row.half_day ?? null,
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

        // Phase 41 — forwarding rule. Same short-circuit shape as the calendar branch:
        // never recreate a rule we already track, or the mailbox ends up with two rules
        // forwarding the same mail and only one id to delete.
        if (row.outlook_forward_rule_id) {
            forwardOk = true // already has rule
        } else if (
            substituteEmail &&
            shouldForwardBeActive(
                {
                    status: row.status,
                    substituteId: row.substitute_id,
                    startDate: row.start_date,
                    endDate: row.end_date,
                    // Phase 41c — retry re-creates what consent asked for, nothing more.
                    forwardMailEnabled: Boolean(row.forward_mail_enabled),
                },
                new Date(),
            )
        ) {
            const fwdRes = await createForwardRule({
                userEmail: userInfo.email,
                substituteEmail,
                substituteName,
                leaveId: id,
            })
            if (fwdRes.success) {
                forwardOk = true
                if (fwdRes.ruleId) {
                    await admin
                        .from('leave_requests')
                        .update({ outlook_forward_rule_id: fwdRes.ruleId } as never)
                        .eq('id', id)
                    // Emitted explicitly because this path calls createForwardRule directly
                    // rather than going through openForwardRule (retry owns graph_sync_error
                    // wholesale, see the overwrite below). Every moment a mailbox starts
                    // being copied to somebody else must show up as LEAVE_FORWARD_SET —
                    // that is the whole point of this audit trail.
                    await logAudit(ctx.userId, 'LEAVE_FORWARD_SET', {
                        leave_id: id,
                        target_user_id: row.user_id,
                        substitute_email: substituteEmail,
                        retry: true,
                    })
                }
            } else if (fwdRes.error) {
                errors.push(`forward: ${fwdRes.error}`)
            }
        } else {
            // No substitute, or the leave sits outside the forwarding window — nothing owed.
            forwardOk = true
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

        const auditAction =
            oofOk && calOk && forwardOk
                ? oofSkipReason === 'user_custom'
                    ? 'LEAVE_OOF_SKIPPED_USER_CUSTOM'
                    : oofSkipReason === 'half_day'
                        ? 'LEAVE_OOF_SKIPPED_HALF_DAY'
                        : 'LEAVE_OOF_SET'
                : 'LEAVE_OOF_FAILED'
        await logAudit(ctx.userId, auditAction, {
            leave_id: id,
            retry: true,
            oof_ok: oofOk,
            oof_skip_reason: oofSkipReason ?? undefined,
            calendar_ok: calOk,
            forward_ok: forwardOk,
            errors: errors.length > 0 ? errors.join('; ') : undefined,
        })

        return {
            oof: oofOk,
            calendar: calOk,
            forward: forwardOk,
            error: errors.length > 0 ? errors.join('; ') : undefined,
        }
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 41c — ręczne sterowanie przekierowaniem poczty
// ─────────────────────────────────────────────────────────────────────────────

export interface SetLeaveMailForwardResult {
    /** Intencja po zmianie — to, co widzi UI. */
    enabled: boolean
    /** Czy reguła faktycznie istnieje teraz w skrzynce (po próbie synchronizacji). */
    ruleActive: boolean
    /**
     * Ustawione, gdy intencja została zapisana, ale Graph nie wykonał operacji.
     * UI pokazuje to jako ostrzeżenie — preferencja żyje w bazie i uzgodnienie
     * dokończy pracę później.
     */
    warning?: string
}

/**
 * Włącz lub wyłącz przekierowanie poczty do zastępcy dla konkretnego urlopu.
 *
 * Sedno Phase 41c. Reguła Outlooka nie ma warunków czasowych, więc ktoś musi ją
 * otworzyć i zamknąć — a uzgodnienie, które miało to robić, jest zakładnikiem
 * harmonogramu (weryfikacja 2026-07-27: crony tej instancji nie wykonują się).
 * Ta akcja rozmontowuje tę zależność: zmiana intencji od razu idzie do Graph,
 * więc pracownik może odciąć przekierowanie w sekundę, nie czekając na nic.
 *
 * Zapis do bazy jest pierwszy i nie zależy od Graph. Gdyby Graph odmówił,
 * intencja i tak jest utrwalona, a pass 2 uzgodnienia dokończy — nigdy odwrotnie,
 * bo utrwalona zgoda bez reguły jest nieszkodliwa, a żywa reguła bez zgody nie jest.
 *
 * Uprawnienia: właściciel urlopu, jego manager lub admin. Manager świadomie może
 * wyłączyć: gdy pracownik jest nieosiągalny, ktoś musi móc zatrzymać wyciek poczty.
 */
export async function setLeaveMailForward(
    leaveId: string,
    enabled: boolean,
): Promise<ActionResult<SetLeaveMailForwardResult>> {
    return runAction('setLeaveMailForward', async () => {
        const ctx = await requireInternalOrAdminAction()
        const admin = createServiceClient()

        const { data: row, error: fetchErr } = await admin
            .from('leave_requests')
            .select(
                'id, user_id, status, start_date, end_date, substitute_id, outlook_forward_rule_id, forward_mail_enabled',
            )
            .eq('id', leaveId)
            .single<{
                id: string
                user_id: string
                status: LeaveStatus
                start_date: string
                end_date: string
                substitute_id: string | null
                outlook_forward_rule_id: string | null
                forward_mail_enabled: boolean
            }>()
        if (fetchErr || !row) throw new ExpectedError('Wniosek nie istnieje.')

        // Właściciel zawsze; poza tym admin lub manager pracownika.
        if (row.user_id !== ctx.userId) {
            await assertManagerOwnsLeaveTarget(ctx, admin, row.user_id)
        }

        if (enabled && !row.substitute_id) {
            throw new ExpectedError(
                'Najpierw wskaż zastępcę — bez niego nie ma komu przekazywać poczty.',
            )
        }

        const { error: updErr } = await admin
            .from('leave_requests')
            .update({ forward_mail_enabled: enabled } as never)
            .eq('id', leaveId)
        if (updErr) throw new Error(`Nie udało się zapisać ustawienia: ${updErr.message}`)

        await logAudit(ctx.userId, 'LEAVE_FORWARD_PREFERENCE_SET', {
            leave_id: leaveId,
            target_user_id: row.user_id,
            enabled,
            via: row.user_id === ctx.userId ? 'self' : 'manager',
        })

        const contact = await fetchUserContact(row.user_id)
        if (!contact?.email) {
            return {
                enabled,
                ruleActive: Boolean(row.outlook_forward_rule_id),
                warning: 'Nie znaleziono adresu e-mail pracownika — ustawienie zapisane, skrzynka nietknięta.',
            }
        }

        // ─── Wyłączanie: skasuj regułę, jeśli jakąś znamy ────────────────────
        if (!enabled) {
            if (!row.outlook_forward_rule_id) return { enabled: false, ruleActive: false }

            const closed = await closeForwardRule({
                admin,
                leaveId,
                ruleId: row.outlook_forward_rule_id,
                userEmail: contact.email,
                actorUserId: ctx.userId,
                reason: 'opted_out',
                auditExtra: { via: 'manual_toggle', target_user_id: row.user_id },
            })
            return closed
                ? { enabled: false, ruleActive: false }
                : {
                      enabled: false,
                      ruleActive: true,
                      warning:
                          'Przekierowanie wyłączone w COMPASS, ale Outlook odrzucił usunięcie reguły. '
                          + 'Zostanie usunięta przy najbliższym uzgodnieniu — jeśli to pilne, skasuj ją '
                          + 'w Outlooku (Ustawienia → Poczta → Reguły).',
                  }
        }

        // ─── Włączanie: reguła tylko wtedy, gdy okno jest otwarte ────────────
        // Poza oknem zapisana zgoda wystarcza — regułę założy uzgodnienie w dniu startu.
        const windowOpen = shouldForwardBeActive(
            {
                status: row.status,
                substituteId: row.substitute_id,
                startDate: row.start_date,
                endDate: row.end_date,
                forwardMailEnabled: true,
            },
            new Date(),
        )
        if (!windowOpen || row.outlook_forward_rule_id) {
            return { enabled: true, ruleActive: Boolean(row.outlook_forward_rule_id) }
        }

        const { data: sub } = await admin
            .from('profiles')
            .select('full_name, email')
            .eq('id', row.substitute_id as string)
            .maybeSingle<{ full_name: string | null; email: string }>()
        if (!sub?.email) {
            return {
                enabled: true,
                ruleActive: false,
                warning: 'Nie znaleziono adresu e-mail zastępcy — przekierowania nie założono.',
            }
        }

        const opened = await openForwardRule({
            admin,
            leaveId,
            userEmail: contact.email,
            substituteEmail: sub.email,
            substituteName: sub.full_name ?? sub.email,
            actorUserId: ctx.userId,
            targetUserId: row.user_id,
            auditExtra: { via: 'manual_toggle' },
        })
        return opened
            ? { enabled: true, ruleActive: true }
            : {
                  enabled: true,
                  ruleActive: false,
                  warning:
                      'Zapisano zgodę, ale Outlook nie założył reguły. Ponowna próba nastąpi '
                      + 'przy najbliższym uzgodnieniu.',
              }
    })
}
