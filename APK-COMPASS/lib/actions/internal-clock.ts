'use server'

// Phase 17 + 17b — Work-clock server actions.
//
// This module is the only place that holds Supabase access for the work-clock
// feature. All pure logic (date math, validation, bucketing, decision rules)
// lives in `@/lib/clock/*.ts`; this file just orchestrates auth + DB + audit +
// email and delegates the maths to those pure helpers.

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/admin'
import { requireAdminAction, requireInternalOrAdminAction } from '@/lib/auth/internal-guard'
import { logAudit } from '@/lib/actions/audit'
import { sendCorrectionDecision } from '@/lib/email'
import { headers } from 'next/headers'
import {
    aggregateHeartbeats,
    isCorrectionRequired,
    type PausedRange,
} from '@/lib/clock/aggregation'
import {
    WORK_MONITORING_TERMS_VERSION,
    type ClockClosedReason,
    type ClockConsentState,
    type ClockDailyAggregate,
    type ClockLocation,
    type ClockMonthData,
    type ClockSessionListItem,
    type ClockSessionLive,
    type ClockSessionRow,
    type CorrectionEntryView,
    type FlagCorrectionInput,
    type StartClockInput,
    type StartClockResult,
    type SuggestEntriesInput,
    type SuggestEntriesResult,
} from '@/lib/clock/constants'
import {
    cleanClientTz,
    cleanDeviceLabel,
    decideLocation,
    getAuditActionForStop,
    isAttendanceBlocking,
    isSustainedIdleFromTail,
    mapToSessionListItem,
    summarizeClockMonth,
    validateStartClockInput,
} from '@/lib/clock/session-lifecycle'
import {
    bucketActivityRates,
    cleanRoutePath,
    cleanRouteTitle,
    selectSuggestableEntries,
} from '@/lib/clock/daily-summary'
import {
    calculatePausedUntil,
    validatePauseDurationMinutes,
    type PauseClockInput,
    type PauseClockResult,
} from '@/lib/clock/pause-resume'
import {
    assertIsoDate,
    current5MinBucketIso,
    getDayIsoRange,
    getMonthDateRange,
    getMonthIsoRange,
    todayIsoDate,
} from '@/lib/clock/time-zones'

// Re-export DTOs for client consumers that historically imported from this file.
export type { ActivityRateBucket } from '@/lib/clock/daily-summary'
export type { PauseClockInput, PauseClockResult } from '@/lib/clock/pause-resume'

type AdminClient = ReturnType<typeof createServiceClient>

// Async helper for client components that can't import from 'use server' files.
export async function getWorkMonitoringTermsVersion(): Promise<string> {
    return WORK_MONITORING_TERMS_VERSION
}

// ─── DB-bound helpers (private to this module) ──────────────────────────────

async function fetchHeartbeatsForSession(admin: AdminClient, sessionId: string) {
    const { data, error } = await admin
        .from('work_clock_heartbeats')
        .select('ts, was_active')
        .eq('session_id', sessionId)
        .order('ts')
    if (error) throw new Error(`Błąd pobierania heartbeats: ${error.message}`)
    return (data ?? []) as Array<{ ts: string; was_active: boolean }>
}

async function fetchPausedRangesForSession(
    admin: AdminClient,
    sessionId: string,
): Promise<PausedRange[]> {
    const { data, error } = await admin
        .from('work_clock_session_pauses')
        .select('paused_at, resumed_at')
        .eq('session_id', sessionId)
        .order('paused_at')
    if (error) {
        console.error('[internal-clock] fetchPausedRangesForSession failed', error)
        return []
    }
    const now = new Date().toISOString()
    return ((data ?? []) as Array<{ paused_at: string; resumed_at: string | null }>).map((r) => ({
        from: r.paused_at,
        to: r.resumed_at ?? now,
    }))
}

async function recomputeActiveSeconds(admin: AdminClient, sessionId: string) {
    const [heartbeats, pausedRanges] = await Promise.all([
        fetchHeartbeatsForSession(admin, sessionId),
        fetchPausedRangesForSession(admin, sessionId),
    ])
    const agg = aggregateHeartbeats(heartbeats, pausedRanges)
    return {
        activeSeconds: agg.activeSeconds,
        idleSeconds: agg.idleSeconds,
        skippedDuringPause: agg.skippedDuringPause,
        isSustainedIdle: isSustainedIdleFromTail(heartbeats),
    }
}

function captureRequestMetadata(): { ip: string | null; ua: string | null } {
    try {
        const h = headers()
        const ip =
            h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || null
        const ua = h.get('user-agent')
        return { ip, ua }
    } catch {
        return { ip: null, ua: null }
    }
}

async function fetchTimesheetOwner(admin: AdminClient, timesheetId: string) {
    const { data } = await admin
        .from('timesheets')
        .select('user_id, profiles!inner(email, full_name)')
        .eq('id', timesheetId)
        .single<{ user_id: string; profiles: { email: string; full_name: string | null } }>()
    if (!data) return null
    return { email: data.profiles.email, full_name: data.profiles.full_name }
}

// ─── Consent ────────────────────────────────────────────────────────────────

export async function getMyConsentState(): Promise<ClockConsentState> {
    const ctx = await requireInternalOrAdminAction()
    const supabase = createClient()
    const { data, error } = await supabase
        .from('work_clock_consents')
        .select('terms_version, accepted_at, revoked_at')
        .eq('user_id', ctx.userId)
        .maybeSingle<{ terms_version: string; accepted_at: string; revoked_at: string | null }>()
    if (error) throw new Error(`Błąd pobierania zgody: ${error.message}`)
    if (!data) return { hasConsent: false, termsVersion: null, acceptedAt: null, revokedAt: null }
    return {
        hasConsent: data.revoked_at == null && data.terms_version === WORK_MONITORING_TERMS_VERSION,
        termsVersion: data.terms_version,
        acceptedAt: data.accepted_at,
        revokedAt: data.revoked_at,
    }
}

export async function acceptMonitoringConsent(termsVersion: string): Promise<void> {
    const ctx = await requireInternalOrAdminAction()
    if (termsVersion !== WORK_MONITORING_TERMS_VERSION) {
        throw new Error(
            `Nieprawidłowa wersja regulaminu (oczekiwano ${WORK_MONITORING_TERMS_VERSION}).`,
        )
    }
    const { ip, ua } = captureRequestMetadata()
    const supabase = createClient()
    const { error } = await supabase.from('work_clock_consents').upsert(
        {
            user_id: ctx.userId,
            accepted_at: new Date().toISOString(),
            accepted_ip: ip,
            accepted_ua: ua,
            terms_version: termsVersion,
            revoked_at: null,
            revoked_reason: null,
        },
        { onConflict: 'user_id' },
    )
    if (error) throw new Error(`Błąd zapisu zgody: ${error.message}`)
    await logAudit(ctx.userId, 'WORK_CLOCK_CONSENT_ACCEPTED', { terms_version: termsVersion, ip })
}

export async function revokeMonitoringConsent(reason?: string): Promise<void> {
    const ctx = await requireInternalOrAdminAction()
    const supabase = createClient()
    const { error } = await supabase
        .from('work_clock_consents')
        .update({
            revoked_at: new Date().toISOString(),
            revoked_reason: reason?.trim() || null,
        })
        .eq('user_id', ctx.userId)
    if (error) throw new Error(`Błąd cofnięcia zgody: ${error.message}`)

    const admin = createServiceClient()
    const { data: liveSession } = await admin
        .from('work_clock_sessions')
        .select('id')
        .eq('user_id', ctx.userId)
        .is('ended_at', null)
        .maybeSingle<{ id: string }>()
    if (liveSession) {
        const recomp = await recomputeActiveSeconds(admin, liveSession.id)
        await admin
            .from('work_clock_sessions')
            .update({
                ended_at: new Date().toISOString(),
                closed_reason: 'admin_close',
                active_seconds: recomp.activeSeconds,
                idle_seconds: recomp.idleSeconds,
            })
            .eq('id', liveSession.id)
    }
    await logAudit(ctx.userId, 'WORK_CLOCK_CONSENT_REVOKED', { reason: reason?.trim() ?? null })
}

// ─── Sessions: start / get / stop / transfer ────────────────────────────────

export async function startClockSession(input: StartClockInput): Promise<StartClockResult> {
    const ctx = await requireInternalOrAdminAction()
    validateStartClockInput(input)

    const consent = await getMyConsentState()
    if (!consent.hasConsent) {
        throw new Error('Wymagana zgoda na monitoring czasu pracy. Zaakceptuj regulamin.')
    }

    const supabase = createClient()
    const today = todayIsoDate()

    const { data: todayAttendance } = await supabase
        .from('attendance_records')
        .select('status')
        .eq('user_id', ctx.userId)
        .eq('date', today)
        .maybeSingle<{ status: string }>()
    if (todayAttendance && isAttendanceBlocking(todayAttendance.status)) {
        throw new Error('Masz dziś urlop/L4 — anuluj wniosek przed rozpoczęciem pracy.')
    }

    const { data: existing } = await supabase
        .from('work_clock_sessions')
        .select('id, started_at, location')
        .eq('user_id', ctx.userId)
        .is('ended_at', null)
        .maybeSingle<{ id: string; started_at: string; location: ClockLocation }>()
    if (existing) {
        return {
            sessionId: existing.id,
            startedAt: existing.started_at,
            location: existing.location,
            resumedExisting: true,
        }
    }

    let location: ClockLocation = input.location ?? 'onsite'
    if (!input.location) {
        const { data: profile } = await supabase
            .from('profiles')
            .select('default_location')
            .eq('id', ctx.userId)
            .single<{ default_location: ClockLocation | null }>()
        location = decideLocation(input.location, profile?.default_location ?? null)
    }

    const now = new Date().toISOString()
    const { data: created, error } = await supabase
        .from('work_clock_sessions')
        .insert({
            user_id: ctx.userId,
            started_at: now,
            last_heartbeat: now,
            active_seconds: 0,
            idle_seconds: 0,
            device_label: cleanDeviceLabel(input.deviceLabel),
            client_tz: cleanClientTz(input.clientTz),
            location,
            created_by: ctx.userId,
        })
        .select('id, started_at, location')
        .single<{ id: string; started_at: string; location: ClockLocation }>()
    if (error || !created) {
        if (error?.code === '23505') {
            throw new Error(
                'Masz już aktywną sesję na innym urządzeniu. Użyj "Przejmij sesję" aby ją przenieść.',
            )
        }
        throw new Error(`Błąd uruchomienia zegara: ${error?.message ?? 'unknown'}`)
    }

    await supabase.from('attendance_records').upsert(
        {
            user_id: ctx.userId,
            date: today,
            status: 'active',
            location,
            created_by: ctx.userId,
        },
        { onConflict: 'user_id,date' },
    )

    await logAudit(ctx.userId, 'WORK_CLOCK_STARTED', {
        session_id: created.id,
        device_label: input.deviceLabel,
        location,
    })

    return {
        sessionId: created.id,
        startedAt: created.started_at,
        location: created.location,
        resumedExisting: false,
    }
}

export async function getActiveClockSession(): Promise<ClockSessionLive | null> {
    const ctx = await requireInternalOrAdminAction()
    const supabase = createClient()
    const { data: row } = await supabase
        .from('work_clock_sessions')
        .select('*')
        .eq('user_id', ctx.userId)
        .is('ended_at', null)
        .maybeSingle<ClockSessionRow>()
    if (!row) return null

    const admin = createServiceClient()
    const recomp = await recomputeActiveSeconds(admin, row.id)
    return {
        ...row,
        ended_at: null,
        closed_reason: null,
        recomputedActiveSeconds: recomp.activeSeconds,
        isSustainedIdle: recomp.isSustainedIdle,
    }
}

export async function stopClockSession(
    sessionId: string,
    reason: ClockClosedReason = 'manual',
): Promise<{ activeSeconds: number; activeHours: number }> {
    const ctx = await requireInternalOrAdminAction()
    const admin = createServiceClient()

    const { data: row, error: fetchErr } = await admin
        .from('work_clock_sessions')
        .select('id, user_id, ended_at')
        .eq('id', sessionId)
        .single<{ id: string; user_id: string; ended_at: string | null }>()
    if (fetchErr || !row) throw new Error('Sesja nie istnieje.')
    if (row.user_id !== ctx.userId && !ctx.isAdmin) {
        throw new Error('To nie jest Twoja sesja.')
    }
    if (row.ended_at) {
        const { data: closed } = await admin
            .from('work_clock_sessions')
            .select('active_seconds')
            .eq('id', sessionId)
            .single<{ active_seconds: number }>()
        const seconds = closed?.active_seconds ?? 0
        return { activeSeconds: seconds, activeHours: seconds / 3600 }
    }

    const recomp = await recomputeActiveSeconds(admin, sessionId)
    const { error: updateErr } = await admin
        .from('work_clock_sessions')
        .update({
            ended_at: new Date().toISOString(),
            closed_reason: reason,
            active_seconds: recomp.activeSeconds,
            idle_seconds: recomp.idleSeconds,
        })
        .eq('id', sessionId)
    if (updateErr) throw new Error(`Błąd zamykania sesji: ${updateErr.message}`)

    await logAudit(ctx.userId, getAuditActionForStop(reason), {
        session_id: sessionId,
        reason,
        active_seconds: recomp.activeSeconds,
    })
    return { activeSeconds: recomp.activeSeconds, activeHours: recomp.activeSeconds / 3600 }
}

export async function transferClockSession(
    deviceLabel: string,
    clientTz: string,
    location?: ClockLocation,
): Promise<StartClockResult> {
    const ctx = await requireInternalOrAdminAction()
    const admin = createServiceClient()

    const { data: existing } = await admin
        .from('work_clock_sessions')
        .select('id')
        .eq('user_id', ctx.userId)
        .is('ended_at', null)
        .maybeSingle<{ id: string }>()
    if (existing) {
        const recomp = await recomputeActiveSeconds(admin, existing.id)
        await admin
            .from('work_clock_sessions')
            .update({
                ended_at: new Date().toISOString(),
                closed_reason: 'taken_over',
                active_seconds: recomp.activeSeconds,
                idle_seconds: recomp.idleSeconds,
            })
            .eq('id', existing.id)
        await logAudit(ctx.userId, 'WORK_CLOCK_TRANSFERRED', {
            old_session_id: existing.id,
            active_seconds: recomp.activeSeconds,
        })
    }

    return startClockSession({ deviceLabel, clientTz, location })
}

// ─── Monthly aggregates ─────────────────────────────────────────────────────

export async function getMyClockMonth(year: number, month: number): Promise<ClockMonthData> {
    const ctx = await requireInternalOrAdminAction()
    const supabase = createClient()
    const { start, end } = getMonthDateRange(year, month)
    const { data, error } = await supabase
        .from('work_clock_daily')
        .select('*')
        .eq('user_id', ctx.userId)
        .gte('work_date', start)
        .lte('work_date', end)
        .order('work_date')
    if (error) throw new Error(`Błąd pobierania zegara: ${error.message}`)
    return summarizeClockMonth(year, month, (data ?? []) as ClockDailyAggregate[])
}

export async function getMyClockSessionsForMonth(
    year: number,
    month: number,
): Promise<ClockSessionListItem[]> {
    const ctx = await requireInternalOrAdminAction()
    const supabase = createClient()
    const { startIso, endIso } = getMonthIsoRange(year, month)
    const { data, error } = await supabase
        .from('work_clock_sessions')
        .select('*')
        .eq('user_id', ctx.userId)
        .gte('started_at', startIso)
        .lte('started_at', endIso)
        .order('started_at', { ascending: false })
    if (error) throw new Error(`Błąd pobierania sesji: ${error.message}`)
    return ((data ?? []) as ClockSessionRow[]).map(mapToSessionListItem)
}

// ─── Suggest timesheet entries from clock ───────────────────────────────────

export async function suggestTimesheetEntriesFromClock(
    input: SuggestEntriesInput,
): Promise<SuggestEntriesResult> {
    const ctx = await requireInternalOrAdminAction()
    const supabase = createClient()

    const { data: header, error: fetchErr } = await supabase
        .from('timesheets')
        .select('id, user_id, year, month, status')
        .eq('id', input.timesheetId)
        .single<{ id: string; user_id: string; year: number; month: number; status: string }>()
    if (fetchErr || !header) throw new Error('Timesheet nie istnieje.')
    if (header.user_id !== ctx.userId && !ctx.isAdmin) {
        throw new Error('To nie jest Twój timesheet.')
    }
    if (header.status !== 'draft') {
        throw new Error('Timesheet musi być w statusie "draft".')
    }

    const { start, end } = getMonthDateRange(header.year, header.month)

    if (input.overwriteSuggestions) {
        await supabase
            .from('timesheet_entries')
            .delete()
            .eq('timesheet_id', input.timesheetId)
            .in('source', ['clock_suggested', 'clock_accepted'])
    }

    const [dailyRes, attendanceRes, existingRes] = await Promise.all([
        supabase
            .from('work_clock_daily')
            .select('work_date, hours, session_count')
            .eq('user_id', header.user_id)
            .gte('work_date', start)
            .lte('work_date', end),
        supabase
            .from('attendance_records')
            .select('date, status')
            .eq('user_id', header.user_id)
            .gte('date', start)
            .lte('date', end),
        supabase
            .from('timesheet_entries')
            .select('work_date, source')
            .eq('timesheet_id', input.timesheetId),
    ])
    if (dailyRes.error) throw new Error(`Błąd pobierania zegara: ${dailyRes.error.message}`)
    if (attendanceRes.error) throw new Error(`Błąd pobierania obecności: ${attendanceRes.error.message}`)
    if (existingRes.error) throw new Error(`Błąd pobierania wpisów: ${existingRes.error.message}`)

    const decision = selectSuggestableEntries({
        days: (dailyRes.data ?? []) as Array<{ work_date: string; hours: number; session_count: number }>,
        attendance: (attendanceRes.data ?? []) as Array<{ date: string; status: string }>,
        existingEntries: (existingRes.data ?? []) as Array<{ work_date: string; source: string }>,
    })

    if (decision.entries.length > 0) {
        const rows = decision.entries.map((e) => ({
            timesheet_id: input.timesheetId,
            work_date: e.work_date,
            hours: e.hours,
            project: null,
            description: e.description,
            source: 'clock_suggested' as const,
            tracked_hours: e.hours,
        }))
        const { error } = await supabase.from('timesheet_entries').insert(rows)
        if (error) throw new Error(`Błąd zapisu wpisów: ${error.message}`)
    }

    return {
        inserted: decision.entries.length,
        skipped_existing: decision.skippedExisting,
        total_days_with_tracking: decision.totalDaysWithTracking,
    }
}

// ─── Admin: discrepancy review ──────────────────────────────────────────────

export async function listClockSessionsForReview(
    year: number,
    month: number,
): Promise<CorrectionEntryView[]> {
    await requireAdminAction()
    const admin = createServiceClient()
    const { start, end } = getMonthDateRange(year, month)

    const { data, error } = await admin
        .from('timesheet_entries')
        .select(`
            id, timesheet_id, work_date, hours, tracked_hours, description, project, source, created_at,
            timesheets!inner(user_id, year, month),
            timesheets:timesheet_id(user_id, profiles!inner(full_name, email))
        `)
        .eq('correction_required', true)
        .gte('work_date', start)
        .lte('work_date', end)
        .order('work_date')
    if (error) throw new Error(`Błąd pobierania korekt: ${error.message}`)

    type Row = {
        id: string
        timesheet_id: string
        work_date: string
        hours: number
        tracked_hours: number | null
        description: string
        project: string | null
        source: 'manual' | 'clock_suggested' | 'clock_accepted'
        created_at: string
        timesheets: {
            user_id: string
            profiles: { full_name: string | null; email: string }
        }
    }

    return ((data ?? []) as unknown as Row[]).map((r) => ({
        entry_id: r.id,
        timesheet_id: r.timesheet_id,
        user_id: r.timesheets.user_id,
        user_full_name: r.timesheets.profiles.full_name,
        user_email: r.timesheets.profiles.email,
        work_date: r.work_date,
        hours: Number(r.hours),
        tracked_hours: r.tracked_hours == null ? null : Number(r.tracked_hours),
        declared_minus_tracked:
            r.tracked_hours == null ? null : Number(r.hours) - Number(r.tracked_hours),
        description: r.description,
        project: r.project,
        source: r.source,
        created_at: r.created_at,
    }))
}

async function fetchCorrectionEntry(admin: AdminClient, entryId: string) {
    const { data: row, error } = await admin
        .from('timesheet_entries')
        .select('id, work_date, hours, tracked_hours, correction_required, timesheet_id')
        .eq('id', entryId)
        .single<{
            id: string
            work_date: string
            hours: number
            tracked_hours: number | null
            correction_required: boolean
            timesheet_id: string
        }>()
    if (error || !row) throw new Error('Wpis nie istnieje.')
    if (!row.correction_required) throw new Error('Wpis nie wymaga korekty.')
    return row
}

export async function approveCorrection(entryId: string, note?: string): Promise<void> {
    const ctx = await requireAdminAction()
    const admin = createServiceClient()
    const row = await fetchCorrectionEntry(admin, entryId)

    const { error } = await admin
        .from('timesheet_entries')
        .update({
            correction_required: false,
            correction_decided_by: ctx.userId,
            correction_decided_at: new Date().toISOString(),
            correction_decision_note: note?.trim() || null,
        })
        .eq('id', entryId)
    if (error) throw new Error(`Błąd zatwierdzenia: ${error.message}`)

    await logAudit(ctx.userId, 'TIMESHEET_CORRECTION_APPROVED', {
        entry_id: entryId,
        timesheet_id: row.timesheet_id,
        work_date: row.work_date,
        declared: row.hours,
        tracked: row.tracked_hours,
    })

    const owner = await fetchTimesheetOwner(admin, row.timesheet_id)
    if (owner) {
        sendCorrectionDecision(
            owner.email,
            owner.full_name ?? owner.email,
            'approved',
            row.work_date,
            Number(row.hours),
            row.tracked_hours == null ? null : Number(row.tracked_hours),
            note,
        ).catch((e) => console.error('[approveCorrection] notify failed:', e))
    }
}

export async function rejectCorrection(entryId: string, note: string): Promise<void> {
    const ctx = await requireAdminAction()
    if (!note?.trim()) throw new Error('Uzasadnienie odrzucenia jest wymagane.')
    const admin = createServiceClient()
    const row = await fetchCorrectionEntry(admin, entryId)

    const updates: Record<string, unknown> = {
        correction_required: false,
        correction_decided_by: ctx.userId,
        correction_decided_at: new Date().toISOString(),
        correction_decision_note: note.trim(),
    }
    if (row.tracked_hours != null) updates.hours = row.tracked_hours

    const { error } = await admin.from('timesheet_entries').update(updates).eq('id', entryId)
    if (error) throw new Error(`Błąd odrzucenia: ${error.message}`)

    await logAudit(ctx.userId, 'TIMESHEET_CORRECTION_REJECTED', {
        entry_id: entryId,
        timesheet_id: row.timesheet_id,
        work_date: row.work_date,
        declared: row.hours,
        tracked: row.tracked_hours,
        reverted_to_tracked: row.tracked_hours != null,
    })

    const owner = await fetchTimesheetOwner(admin, row.timesheet_id)
    if (owner) {
        sendCorrectionDecision(
            owner.email,
            owner.full_name ?? owner.email,
            'rejected',
            row.work_date,
            Number(row.hours),
            row.tracked_hours == null ? null : Number(row.tracked_hours),
            note,
        ).catch((e) => console.error('[rejectCorrection] notify failed:', e))
    }
}

export async function applyCorrectionFlag(input: FlagCorrectionInput): Promise<void> {
    await requireInternalOrAdminAction()
    const admin = createServiceClient()
    const flag = isCorrectionRequired(input.declaredHours, input.trackedHours)
    await admin
        .from('timesheet_entries')
        .update({
            correction_required: flag,
            ...(flag
                ? {}
                : {
                      correction_decided_by: null,
                      correction_decided_at: null,
                      correction_decision_note: null,
                  }),
        })
        .eq('id', input.entryId)
}

// ─── Preferences ────────────────────────────────────────────────────────────

export async function setMyClockSummaryEmailPreference(enabled: boolean): Promise<void> {
    const ctx = await requireInternalOrAdminAction()
    const admin = createServiceClient()
    const { error } = await admin
        .from('profiles')
        .update({ clock_daily_summary_email: enabled })
        .eq('id', ctx.userId)
    if (error) throw new Error(`Błąd zapisu preferencji: ${error.message}`)
}

// ─── Timeline (R12) + route ingestion ───────────────────────────────────────

export interface TimelineBlockDTO {
    start: string
    end: string
    activeSeconds: number
    primaryRoute: string | null
    label: string
}

export async function getMyTimelineForDay(date: string): Promise<TimelineBlockDTO[]> {
    const ctx = await requireInternalOrAdminAction()
    assertIsoDate(date)
    const admin = createServiceClient()
    const { clusterTimeline } = await import('@/lib/clock/timeline-clusterer')
    const { startIso: dayStart, endIso: dayEnd } = getDayIsoRange(date)

    const { data: sessions } = await admin
        .from('work_clock_sessions')
        .select('id')
        .eq('user_id', ctx.userId)
        .or(`started_at.lte.${dayEnd},ended_at.gte.${dayStart}`)
    const sessionIds = ((sessions ?? []) as Array<{ id: string }>).map((s) => s.id)
    if (sessionIds.length === 0) return []

    const [{ data: hb }, { data: routes }] = await Promise.all([
        admin
            .from('work_clock_heartbeats')
            .select('ts, was_active')
            .in('session_id', sessionIds)
            .gte('ts', dayStart)
            .lte('ts', dayEnd),
        admin
            .from('work_clock_route_metadata')
            .select('ts_bucket_5min, route_path, page_title')
            .in('session_id', sessionIds)
            .gte('ts_bucket_5min', dayStart)
            .lte('ts_bucket_5min', dayEnd),
    ])

    return clusterTimeline(
        (hb ?? []) as Array<{ ts: string; was_active: boolean }>,
        (routes ?? []) as Array<{
            ts_bucket_5min: string
            route_path: string
            page_title: string | null
        }>,
    )
}

export async function recordRouteVisit(
    sessionId: string,
    routePath: string,
    pageTitle?: string,
): Promise<void> {
    const ctx = await requireInternalOrAdminAction()
    const cleanRoute = cleanRoutePath(routePath)
    const cleanTitle = cleanRouteTitle(pageTitle)

    const admin = createServiceClient()
    const { data: session } = await admin
        .from('work_clock_sessions')
        .select('id, user_id, ended_at, route_tracking_enabled')
        .eq('id', sessionId)
        .single<{
            id: string
            user_id: string
            ended_at: string | null
            route_tracking_enabled: boolean
        }>()
    if (!session) throw new Error('Sesja nie istnieje.')
    if (session.user_id !== ctx.userId) throw new Error('To nie jest Twoja sesja.')
    if (session.ended_at) throw new Error('Sesja już zakończona.')
    if (!session.route_tracking_enabled) return

    const { error } = await admin.from('work_clock_route_metadata').insert({
        session_id: sessionId,
        ts_bucket_5min: current5MinBucketIso(),
        route_path: cleanRoute,
        page_title: cleanTitle,
    })
    if (error && error.code !== '23505') {
        throw new Error(`Błąd zapisu route: ${error.message}`)
    }
}

export async function enableRouteTrackingForSession(sessionId: string): Promise<void> {
    const ctx = await requireInternalOrAdminAction()
    const admin = createServiceClient()
    const { data: session } = await admin
        .from('work_clock_sessions')
        .select('id, user_id, ended_at')
        .eq('id', sessionId)
        .single<{ id: string; user_id: string; ended_at: string | null }>()
    if (!session) throw new Error('Sesja nie istnieje.')
    if (session.user_id !== ctx.userId) throw new Error('To nie jest Twoja sesja.')
    if (session.ended_at) throw new Error('Sesja już zakończona.')
    await admin
        .from('work_clock_sessions')
        .update({ route_tracking_enabled: true })
        .eq('id', sessionId)
}

// ─── Auto-fill timesheet idempotency (R8) ───────────────────────────────────

export async function markTimesheetAutoFilled(timesheetId: string): Promise<void> {
    const ctx = await requireInternalOrAdminAction()
    const admin = createServiceClient()
    const { data: header } = await admin
        .from('timesheets')
        .select('id, user_id, auto_filled_at')
        .eq('id', timesheetId)
        .single<{ id: string; user_id: string; auto_filled_at: string | null }>()
    if (!header) throw new Error('Timesheet nie istnieje.')
    if (header.user_id !== ctx.userId && !ctx.isAdmin) {
        throw new Error('To nie jest Twój timesheet.')
    }
    if (header.auto_filled_at) return
    await admin
        .from('timesheets')
        .update({ auto_filled_at: new Date().toISOString() })
        .eq('id', timesheetId)
}

export async function clearAutoFilledTimesheet(timesheetId: string): Promise<void> {
    const ctx = await requireInternalOrAdminAction()
    const admin = createServiceClient()
    const { data: header } = await admin
        .from('timesheets')
        .select('id, user_id, status')
        .eq('id', timesheetId)
        .single<{ id: string; user_id: string; status: string }>()
    if (!header) throw new Error('Timesheet nie istnieje.')
    if (header.user_id !== ctx.userId && !ctx.isAdmin) {
        throw new Error('To nie jest Twój timesheet.')
    }
    if (header.status !== 'draft') {
        throw new Error('Timesheet nie jest w statusie draft.')
    }
    await admin
        .from('timesheet_entries')
        .delete()
        .eq('timesheet_id', timesheetId)
        .in('source', ['clock_suggested', 'clock_accepted'])
    await admin
        .from('timesheets')
        .update({ user_cleared_auto_fill: true })
        .eq('id', timesheetId)
}

// ─── Activity rate sparkline (R4) — user-only ───────────────────────────────

/**
 * Privacy contract: this function ALWAYS returns data for the caller
 * (ctx.userId) — even an admin caller cannot pass a targetUserId. Activity
 * rate per bucket is considered surveillance-grade for admins (Hubstaff);
 * Compass policy: aggregate hours visible to admin via timesheets, granular
 * rate is private.
 */
export async function getMyActivityRateForDay(date: string) {
    const ctx = await requireInternalOrAdminAction()
    assertIsoDate(date)
    const admin = createServiceClient()
    const { startIso: dayStart, endIso: dayEnd } = getDayIsoRange(date)

    const { data: sessions } = await admin
        .from('work_clock_sessions')
        .select('id')
        .eq('user_id', ctx.userId)
        .or(`started_at.lte.${dayEnd},ended_at.gte.${dayStart}`)
    const sessionIds = ((sessions ?? []) as Array<{ id: string }>).map((s) => s.id)
    if (sessionIds.length === 0) return []

    const { data: hb } = await admin
        .from('work_clock_heartbeats')
        .select('ts, was_active')
        .in('session_id', sessionIds)
        .gte('ts', dayStart)
        .lte('ts', dayEnd)
        .order('ts')
    return bucketActivityRates((hb ?? []) as Array<{ ts: string; was_active: boolean }>)
}

// ─── Idle resume modal (R2) ─────────────────────────────────────────────────

const RESUME_GRACE_MINUTES = 30

export interface RecentlyClosedSessionDTO {
    id: string
    started_at: string
    ended_at: string
    closed_reason: 'idle_timeout' | 'sleep_detected'
    active_seconds: number
}

export async function getRecentlyAutoClosedSession(): Promise<RecentlyClosedSessionDTO | null> {
    const ctx = await requireInternalOrAdminAction()
    const supabase = createClient()
    const cutoff = new Date(Date.now() - RESUME_GRACE_MINUTES * 60 * 1000).toISOString()
    const { data } = await supabase
        .from('work_clock_sessions')
        .select('id, started_at, ended_at, closed_reason, active_seconds, user_disregarded')
        .eq('user_id', ctx.userId)
        .in('closed_reason', ['idle_timeout', 'sleep_detected'])
        .gt('ended_at', cutoff)
        .eq('user_disregarded', false)
        .order('ended_at', { ascending: false })
        .limit(1)
        .maybeSingle<{
            id: string
            started_at: string
            ended_at: string
            closed_reason: 'idle_timeout' | 'sleep_detected'
            active_seconds: number
            user_disregarded: boolean
        }>()
    if (!data) return null
    return {
        id: data.id,
        started_at: data.started_at,
        ended_at: data.ended_at,
        closed_reason: data.closed_reason,
        active_seconds: data.active_seconds,
    }
}

export async function discardAutoClosedSession(sessionId: string): Promise<void> {
    const ctx = await requireInternalOrAdminAction()
    const admin = createServiceClient()
    const { data: row } = await admin
        .from('work_clock_sessions')
        .select('id, user_id, ended_at, user_disregarded')
        .eq('id', sessionId)
        .single<{ id: string; user_id: string; ended_at: string | null; user_disregarded: boolean }>()
    if (!row) throw new Error('Sesja nie istnieje.')
    if (row.user_id !== ctx.userId && !ctx.isAdmin) {
        throw new Error('To nie jest Twoja sesja.')
    }
    if (row.user_disregarded) return
    await admin
        .from('work_clock_sessions')
        .update({ user_disregarded: true })
        .eq('id', sessionId)
    await logAudit(ctx.userId, 'WORK_CLOCK_RESUME_DISCARDED', { session_id: sessionId })
}

export async function mergeWithPreviousSession(
    prevSessionId: string,
    deviceLabel: string,
    clientTz: string,
): Promise<StartClockResult> {
    const ctx = await requireInternalOrAdminAction()
    const admin = createServiceClient()

    const { data: prev } = await admin
        .from('work_clock_sessions')
        .select('id, user_id, ended_at, location')
        .eq('id', prevSessionId)
        .single<{ id: string; user_id: string; ended_at: string | null; location: ClockLocation }>()
    if (!prev) throw new Error('Poprzednia sesja nie istnieje.')
    if (prev.user_id !== ctx.userId) throw new Error('To nie jest Twoja sesja.')
    if (!prev.ended_at) throw new Error('Poprzednia sesja jest jeszcze aktywna — nie można scalić.')

    const { data: existing } = await admin
        .from('work_clock_sessions')
        .select('id')
        .eq('user_id', ctx.userId)
        .is('ended_at', null)
        .maybeSingle<{ id: string }>()
    if (existing) throw new Error('Masz już aktywną sesję — nie można scalić.')

    const now = new Date().toISOString()
    const { data: created, error } = await admin
        .from('work_clock_sessions')
        .insert({
            user_id: ctx.userId,
            started_at: now,
            last_heartbeat: now,
            active_seconds: 0,
            idle_seconds: 0,
            device_label: cleanDeviceLabel(deviceLabel),
            client_tz: cleanClientTz(clientTz),
            location: prev.location,
            created_by: ctx.userId,
            merged_from_session_id: prevSessionId,
        })
        .select('id, started_at, location')
        .single<{ id: string; started_at: string; location: ClockLocation }>()
    if (error || !created) throw new Error(`Błąd scalenia: ${error?.message ?? 'unknown'}`)

    await logAudit(ctx.userId, 'WORK_CLOCK_RESUME_MERGED', {
        new_session_id: created.id,
        merged_from: prevSessionId,
    })
    return {
        sessionId: created.id,
        startedAt: created.started_at,
        location: created.location,
        resumedExisting: false,
    }
}

// ─── Pause / Resume (R3) ────────────────────────────────────────────────────

export async function pauseClockSession(input: PauseClockInput): Promise<PauseClockResult> {
    const ctx = await requireInternalOrAdminAction()
    validatePauseDurationMinutes(input.durationMinutes)
    const admin = createServiceClient()

    const { data: session } = await admin
        .from('work_clock_sessions')
        .select('id, user_id, ended_at, paused_until')
        .eq('id', input.sessionId)
        .single<{
            id: string
            user_id: string
            ended_at: string | null
            paused_until: string | null
        }>()
    if (!session) throw new Error('Sesja nie istnieje.')
    if (session.user_id !== ctx.userId) throw new Error('To nie jest Twoja sesja.')
    if (session.ended_at) throw new Error('Sesja już zakończona.')

    const pausedUntil = calculatePausedUntil(input.durationMinutes)

    if (session.paused_until) {
        await admin
            .from('work_clock_session_pauses')
            .update({ resumed_at: new Date().toISOString() })
            .eq('session_id', input.sessionId)
            .is('resumed_at', null)
    }

    const { error: insertErr } = await admin.from('work_clock_session_pauses').insert({
        session_id: input.sessionId,
        paused_at: new Date().toISOString(),
        pause_reason: input.reason,
        created_by: ctx.userId,
    })
    if (insertErr) throw new Error(`Błąd pauzy: ${insertErr.message}`)

    const { error: updateErr } = await admin
        .from('work_clock_sessions')
        .update({ paused_until: pausedUntil, pause_reason: input.reason })
        .eq('id', input.sessionId)
    if (updateErr) throw new Error(`Błąd zapisu pauzy: ${updateErr.message}`)

    await logAudit(ctx.userId, 'WORK_CLOCK_PAUSED', {
        session_id: input.sessionId,
        duration_minutes: input.durationMinutes,
        reason: input.reason,
        paused_until: pausedUntil,
    })

    return { pausedUntil, pauseReason: input.reason }
}

export async function resumeClockSession(
    sessionId: string,
    viaAutomatic = false,
): Promise<void> {
    const ctx = await requireInternalOrAdminAction()
    const admin = createServiceClient()

    const { data: session } = await admin
        .from('work_clock_sessions')
        .select('id, user_id, ended_at, paused_until')
        .eq('id', sessionId)
        .single<{ id: string; user_id: string; ended_at: string | null; paused_until: string | null }>()
    if (!session) throw new Error('Sesja nie istnieje.')
    if (session.user_id !== ctx.userId && !ctx.isAdmin) {
        throw new Error('To nie jest Twoja sesja.')
    }
    if (!session.paused_until) return

    const now = new Date().toISOString()
    await admin
        .from('work_clock_session_pauses')
        .update({ resumed_at: now })
        .eq('session_id', sessionId)
        .is('resumed_at', null)

    await admin
        .from('work_clock_sessions')
        .update({ paused_until: null, pause_reason: null, last_heartbeat: now })
        .eq('id', sessionId)

    await logAudit(ctx.userId, 'WORK_CLOCK_RESUMED', {
        session_id: sessionId,
        via_automatic: viaAutomatic,
    })
}
