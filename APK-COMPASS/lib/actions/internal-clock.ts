'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/admin'
import { requireAdminAction, requireInternalOrAdminAction } from '@/lib/auth/internal-guard'
import { logAudit } from '@/lib/actions/audit'
import { sendCorrectionDecision } from '@/lib/email'
import { aggregateHeartbeats, isCorrectionRequired } from '@/lib/clock/aggregation'
import {
    HOURS_BLOCKING_ATTENDANCE,
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
import { headers } from 'next/headers'
import { endOfMonth, format, startOfMonth } from 'date-fns'

// Re-export the consent terms version constant via a small async helper so
// client components ('use client') can read it without importing from a
// 'use server' module (they already import the constants module directly).
export async function getWorkMonitoringTermsVersion(): Promise<string> {
    return WORK_MONITORING_TERMS_VERSION
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function fetchHeartbeatsForSession(
    supabaseAdmin: ReturnType<typeof createServiceClient>,
    sessionId: string,
): Promise<Array<{ ts: string; was_active: boolean }>> {
    const { data, error } = await supabaseAdmin
        .from('work_clock_heartbeats')
        .select('ts, was_active')
        .eq('session_id', sessionId)
        .order('ts')
    if (error) throw new Error(`Błąd pobierania heartbeats: ${error.message}`)
    return (data ?? []) as Array<{ ts: string; was_active: boolean }>
}

async function recomputeActiveSeconds(
    supabaseAdmin: ReturnType<typeof createServiceClient>,
    sessionId: string,
): Promise<{ activeSeconds: number; idleSeconds: number; isSustainedIdle: boolean }> {
    const heartbeats = await fetchHeartbeatsForSession(supabaseAdmin, sessionId)
    const agg = aggregateHeartbeats(heartbeats)
    return {
        activeSeconds: agg.activeSeconds,
        idleSeconds: agg.idleSeconds,
        isSustainedIdle: heartbeats.length >= 120 && heartbeats.slice(-120).every((h) => !h.was_active),
    }
}

function captureRequestMetadata(): { ip: string | null; ua: string | null } {
    try {
        const h = headers()
        const ip =
            h.get('x-forwarded-for')?.split(',')[0]?.trim() ||
            h.get('x-real-ip') ||
            null
        const ua = h.get('user-agent')
        return { ip, ua }
    } catch {
        return { ip: null, ua: null }
    }
}

// ─── Consent ─────────────────────────────────────────────────────────────────

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
        throw new Error(`Nieprawidłowa wersja regulaminu (oczekiwano ${WORK_MONITORING_TERMS_VERSION}).`)
    }
    const { ip, ua } = captureRequestMetadata()
    const supabase = createClient()

    const { error } = await supabase
        .from('work_clock_consents')
        .upsert(
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

    await logAudit(ctx.userId, 'WORK_CLOCK_CONSENT_ACCEPTED', {
        terms_version: termsVersion,
        ip,
    })
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

    // Close any live session
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

// ─── Sessions ────────────────────────────────────────────────────────────────

/**
 * Start a new work session. Idempotent: if user already has a live session,
 * returns it instead of creating a duplicate (UNIQUE index would block insert anyway).
 */
export async function startClockSession(input: StartClockInput): Promise<StartClockResult> {
    const ctx = await requireInternalOrAdminAction()
    if (!input.deviceLabel?.trim()) throw new Error('deviceLabel jest wymagany.')
    if (!input.clientTz?.trim()) throw new Error('clientTz jest wymagany.')

    const consent = await getMyConsentState()
    if (!consent.hasConsent) {
        throw new Error('Wymagana zgoda na monitoring czasu pracy. Zaakceptuj regulamin.')
    }

    const supabase = createClient()
    const today = format(new Date(), 'yyyy-MM-dd')

    // Block start if today's attendance is leave-blocking.
    const { data: todayAttendance } = await supabase
        .from('attendance_records')
        .select('status')
        .eq('user_id', ctx.userId)
        .eq('date', today)
        .maybeSingle<{ status: string }>()

    if (todayAttendance && HOURS_BLOCKING_ATTENDANCE.includes(todayAttendance.status)) {
        throw new Error('Masz dziś urlop/L4 — anuluj wniosek przed rozpoczęciem pracy.')
    }

    // Resume existing live session (idempotency).
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

    // Determine location: explicit input > profile default > 'onsite' fallback
    let location: ClockLocation = input.location ?? 'onsite'
    if (!input.location) {
        const { data: profile } = await supabase
            .from('profiles')
            .select('default_location')
            .eq('id', ctx.userId)
            .single<{ default_location: ClockLocation | null }>()
        location = profile?.default_location ?? 'onsite'
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
            device_label: input.deviceLabel.trim().slice(0, 100),
            client_tz: input.clientTz.trim().slice(0, 64),
            location,
            created_by: ctx.userId,
        })
        .select('id, started_at, location')
        .single<{ id: string; started_at: string; location: ClockLocation }>()

    if (error || !created) {
        // Race condition: UNIQUE WHERE ended_at IS NULL kicked in
        if (error?.code === '23505') {
            throw new Error('Masz już aktywną sesję na innym urządzeniu. Użyj "Przejmij sesję" aby ją przenieść.')
        }
        throw new Error(`Błąd uruchomienia zegara: ${error?.message ?? 'unknown'}`)
    }

    // Auto-create attendance_record(active) if missing
    await supabase
        .from('attendance_records')
        .upsert(
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
        // Idempotent — already closed
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

    const auditAction =
        reason === 'manual' ? 'WORK_CLOCK_STOPPED' : 'WORK_CLOCK_AUTO_STOPPED'
    await logAudit(ctx.userId, auditAction, {
        session_id: sessionId,
        reason,
        active_seconds: recomp.activeSeconds,
    })

    return { activeSeconds: recomp.activeSeconds, activeHours: recomp.activeSeconds / 3600 }
}

/**
 * Take over a session that was started on a different device. Closes the old
 * one with reason='taken_over' and creates a fresh one on the current device.
 */
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

// ─── Aggregates / monthly views ──────────────────────────────────────────────

export async function getMyClockMonth(year: number, month: number): Promise<ClockMonthData> {
    const ctx = await requireInternalOrAdminAction()
    const supabase = createClient()
    const ref = new Date(year, month - 1, 1)
    const start = format(startOfMonth(ref), 'yyyy-MM-dd')
    const end = format(endOfMonth(ref), 'yyyy-MM-dd')

    const { data, error } = await supabase
        .from('work_clock_daily')
        .select('*')
        .eq('user_id', ctx.userId)
        .gte('work_date', start)
        .lte('work_date', end)
        .order('work_date')

    if (error) throw new Error(`Błąd pobierania zegara: ${error.message}`)
    const days = (data ?? []) as ClockDailyAggregate[]

    return {
        year,
        month,
        days,
        totalHours: days.reduce((sum, d) => sum + Number(d.hours), 0),
        sessionCount: days.reduce((sum, d) => sum + Number(d.session_count), 0),
    }
}

export async function getMyClockSessionsForMonth(
    year: number,
    month: number,
): Promise<ClockSessionListItem[]> {
    const ctx = await requireInternalOrAdminAction()
    const supabase = createClient()
    const ref = new Date(year, month - 1, 1)
    const start = format(startOfMonth(ref), 'yyyy-MM-dd') + 'T00:00:00Z'
    const end = format(endOfMonth(ref), 'yyyy-MM-dd') + 'T23:59:59Z'

    const { data, error } = await supabase
        .from('work_clock_sessions')
        .select('*')
        .eq('user_id', ctx.userId)
        .gte('started_at', start)
        .lte('started_at', end)
        .order('started_at', { ascending: false })

    if (error) throw new Error(`Błąd pobierania sesji: ${error.message}`)
    const rows = (data ?? []) as ClockSessionRow[]
    return rows.map((row) => ({
        ...row,
        duration_minutes: Math.round(row.active_seconds / 60),
    }))
}

// ─── Suggest timesheet entries from clock ────────────────────────────────────

/**
 * Generate timesheet_entries from work_clock_daily for the timesheet's month.
 * Skips dates where:
 *  - User has blocking attendance (vacation/sick/parental/unpaid)
 *  - A manual entry already exists for that day
 *
 * If overwriteSuggestions=true, deletes existing clock_suggested entries first.
 * Hours are stored at full precision (NUMERIC 4,2).
 */
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

    const ref = new Date(header.year, header.month - 1, 1)
    const start = format(startOfMonth(ref), 'yyyy-MM-dd')
    const end = format(endOfMonth(ref), 'yyyy-MM-dd')

    // 1. Optionally clear existing clock-suggested entries
    if (input.overwriteSuggestions) {
        await supabase
            .from('timesheet_entries')
            .delete()
            .eq('timesheet_id', input.timesheetId)
            .in('source', ['clock_suggested', 'clock_accepted'])
    }

    // 2. Fetch all needed data in parallel
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

    const blockedDates = new Set(
        ((attendanceRes.data ?? []) as Array<{ date: string; status: string }>)
            .filter((a) => HOURS_BLOCKING_ATTENDANCE.includes(a.status))
            .map((a) => a.date),
    )
    const existingByDate = new Map(
        ((existingRes.data ?? []) as Array<{ work_date: string; source: string }>).map((e) => [
            e.work_date,
            e.source,
        ]),
    )

    const days = (dailyRes.data ?? []) as Array<{
        work_date: string
        hours: number
        session_count: number
    }>

    const rowsToInsert: Array<{
        timesheet_id: string
        work_date: string
        hours: number
        project: null
        description: string
        source: 'clock_suggested'
        tracked_hours: number
    }> = []

    let skippedExisting = 0
    for (const d of days) {
        if (blockedDates.has(d.work_date)) continue
        const existingSource = existingByDate.get(d.work_date)
        if (existingSource) {
            skippedExisting++
            continue
        }
        const hours = Math.max(0.01, Math.min(24, Number(d.hours)))
        rowsToInsert.push({
            timesheet_id: input.timesheetId,
            work_date: d.work_date,
            hours,
            project: null,
            description: `Auto z work clock — ${d.session_count} ${d.session_count === 1 ? 'sesja' : 'sesje'}`,
            source: 'clock_suggested',
            tracked_hours: hours,
        })
    }

    if (rowsToInsert.length > 0) {
        const { error } = await supabase.from('timesheet_entries').insert(rowsToInsert)
        if (error) throw new Error(`Błąd zapisu wpisów: ${error.message}`)
    }

    return {
        inserted: rowsToInsert.length,
        skipped_existing: skippedExisting,
        total_days_with_tracking: days.length,
    }
}

// ─── Admin: discrepancy review ───────────────────────────────────────────────

export async function listClockSessionsForReview(
    year: number,
    month: number,
): Promise<CorrectionEntryView[]> {
    await requireAdminAction()
    const admin = createServiceClient()
    const ref = new Date(year, month - 1, 1)
    const start = format(startOfMonth(ref), 'yyyy-MM-dd')
    const end = format(endOfMonth(ref), 'yyyy-MM-dd')

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

export async function approveCorrection(entryId: string, note?: string): Promise<void> {
    const ctx = await requireAdminAction()
    const admin = createServiceClient()

    const { data: row, error: fetchErr } = await admin
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
    if (fetchErr || !row) throw new Error('Wpis nie istnieje.')
    if (!row.correction_required) throw new Error('Wpis nie wymaga korekty.')

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

    const userInfo = await fetchEntryOwner(admin, row.timesheet_id)
    if (userInfo) {
        sendCorrectionDecision(
            userInfo.email,
            userInfo.full_name ?? userInfo.email,
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

    const { data: row, error: fetchErr } = await admin
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
    if (fetchErr || !row) throw new Error('Wpis nie istnieje.')
    if (!row.correction_required) throw new Error('Wpis nie wymaga korekty.')

    // Revert hours to tracked_hours when admin rejects (if tracked is known)
    const updates: Record<string, unknown> = {
        correction_required: false,
        correction_decided_by: ctx.userId,
        correction_decided_at: new Date().toISOString(),
        correction_decision_note: note.trim(),
    }
    if (row.tracked_hours != null) {
        updates.hours = row.tracked_hours
    }

    const { error } = await admin
        .from('timesheet_entries')
        .update(updates)
        .eq('id', entryId)
    if (error) throw new Error(`Błąd odrzucenia: ${error.message}`)

    await logAudit(ctx.userId, 'TIMESHEET_CORRECTION_REJECTED', {
        entry_id: entryId,
        timesheet_id: row.timesheet_id,
        work_date: row.work_date,
        declared: row.hours,
        tracked: row.tracked_hours,
        reverted_to_tracked: row.tracked_hours != null,
    })

    const userInfo = await fetchEntryOwner(admin, row.timesheet_id)
    if (userInfo) {
        sendCorrectionDecision(
            userInfo.email,
            userInfo.full_name ?? userInfo.email,
            'rejected',
            row.work_date,
            Number(row.hours),
            row.tracked_hours == null ? null : Number(row.tracked_hours),
            note,
        ).catch((e) => console.error('[rejectCorrection] notify failed:', e))
    }
}

async function fetchEntryOwner(
    admin: ReturnType<typeof createServiceClient>,
    timesheetId: string,
): Promise<{ email: string; full_name: string | null } | null> {
    const { data } = await admin
        .from('timesheets')
        .select('user_id, profiles!inner(email, full_name)')
        .eq('id', timesheetId)
        .single<{ user_id: string; profiles: { email: string; full_name: string | null } }>()
    if (!data) return null
    return { email: data.profiles.email, full_name: data.profiles.full_name }
}

// ─── Discrepancy detection helper (called from internal-timesheet.updateEntry) ──

/**
 * Apply discrepancy detection logic and update correction_required flag.
 * Called from internal-timesheet.updateEntry after a successful update.
 *
 * Rule: declared > 13h (KP art. 129) OR |declared - tracked| > 1.0h.
 * Reset to false when user brings hours back within tolerance.
 */
export async function applyCorrectionFlag(input: FlagCorrectionInput): Promise<void> {
    await requireInternalOrAdminAction()
    const admin = createServiceClient()
    const flag = isCorrectionRequired(input.declaredHours, input.trackedHours)

    await admin
        .from('timesheet_entries')
        .update({
            correction_required: flag,
            // Clear stale decision metadata if flag transitions back to false
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
