'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/admin'
import { requireInternalOrAdminAction } from '@/lib/auth/internal-guard'
import { logAudit } from '@/lib/actions/audit'
import {
    type ClockClosedReason,
    type ClockLocation,
    type ClockSessionLive,
    type ClockSessionRow,
    type StartClockInput,
    type StartClockResult,
} from '@/lib/clock/constants'
import {
    cleanClientTz,
    cleanDeviceLabel,
    decideLocation,
    getAuditActionForStop,
    isAttendanceBlocking,
    validateStartClockInput,
} from '@/lib/clock/session-lifecycle'
import { todayIsoDate } from '@/lib/clock/time-zones'
import { recomputeActiveSeconds } from './_shared'
import { getMyConsentState } from './consent'

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
