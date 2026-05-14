import { logCompat } from '@/lib/logger'
import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/admin'
import { logAudit } from '@/lib/actions/audit'
import { sendClockAutoStopped } from '@/lib/email'
import { aggregateHeartbeats, isSustainedIdle } from '@/lib/clock/aggregation'

export const dynamic = 'force-dynamic'

// Phase 17 — work clock heartbeat endpoint.
// Called every ~30s by useWorkClock hook (or sendBeacon on unload).
// Rate-limited per session to 25s minimum interval (in-memory; resets on cold start).

interface HeartbeatRequest {
    sessionId: string
    ts?: string // ISO; falls back to server time
    wasActive: boolean
    pageVisible?: boolean
    isTrusted?: boolean
    final?: boolean // true on beforeunload — also closes session if isolated final beat
}

const RATE_LIMIT_WINDOW_MS = 25_000
const lastBeatAt = new Map<string, number>()
const RATE_LIMIT_CACHE_MAX = 5_000

function rateLimitedRecently(sessionId: string): boolean {
    const last = lastBeatAt.get(sessionId)
    if (!last) return false
    return Date.now() - last < RATE_LIMIT_WINDOW_MS
}

function recordBeat(sessionId: string): void {
    if (lastBeatAt.size >= RATE_LIMIT_CACHE_MAX) {
        // Crude eviction — drop oldest 10%
        const toEvict = Math.floor(RATE_LIMIT_CACHE_MAX * 0.1)
        const keys = Array.from(lastBeatAt.keys()).slice(0, toEvict)
        for (const k of keys) lastBeatAt.delete(k)
    }
    lastBeatAt.set(sessionId, Date.now())
}

export async function POST(request: Request) {
    let body: HeartbeatRequest
    try {
        body = (await request.json()) as HeartbeatRequest
    } catch {
        return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
    }

    if (!body.sessionId || typeof body.wasActive !== 'boolean') {
        return NextResponse.json({ error: 'invalid_payload' }, { status: 400 })
    }

    // Authenticate
    const supabase = createClient()
    const { data: auth } = await supabase.auth.getUser()
    const user = auth?.user
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    if (rateLimitedRecently(body.sessionId)) {
        return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
    }

    const admin = createServiceClient()

    // Verify ownership + live session
    const { data: session, error: fetchErr } = await admin
        .from('work_clock_sessions')
        .select('id, user_id, ended_at, started_at')
        .eq('id', body.sessionId)
        .single<{ id: string; user_id: string; ended_at: string | null; started_at: string }>()

    if (fetchErr || !session) {
        return NextResponse.json({ error: 'session_not_found' }, { status: 404 })
    }
    if (session.user_id !== user.id) {
        return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    if (session.ended_at) {
        return NextResponse.json({ error: 'session_already_closed' }, { status: 410 })
    }

    const ts = body.ts ? new Date(body.ts).toISOString() : new Date().toISOString()
    const isTrusted = body.isTrusted !== false // default true
    const pageVisible = body.pageVisible !== false

    // Insert heartbeat (idempotent via UNIQUE(session_id, ts))
    const { error: insertErr } = await admin.from('work_clock_heartbeats').insert({
        session_id: body.sessionId,
        ts,
        was_active: body.wasActive,
        page_visible: pageVisible,
        is_trusted: isTrusted,
    })
    if (insertErr && insertErr.code !== '23505') {
        // 23505 = duplicate (idempotent — OK)
        return NextResponse.json({ error: 'insert_failed', detail: insertErr.message }, { status: 500 })
    }

    recordBeat(body.sessionId)

    // Flag tampering as audit + Sentry breadcrumb (no error, just observability).
    if (!isTrusted) {
        await logAudit(user.id, 'WORK_CLOCK_TAMPERED', {
            session_id: body.sessionId,
            ts,
        })
        Sentry.addBreadcrumb({
            category: 'work-clock',
            level: 'warning',
            message: 'Heartbeat with isTrusted=false',
            data: { sessionId: body.sessionId, userId: user.id },
        })
    }

    // Update last_heartbeat
    await admin
        .from('work_clock_sessions')
        .update({ last_heartbeat: ts })
        .eq('id', body.sessionId)

    // Sustained idle check — close session if last 60min are all idle
    const { data: recent } = await admin
        .from('work_clock_heartbeats')
        .select('ts, was_active')
        .eq('session_id', body.sessionId)
        .order('ts', { ascending: false })
        .limit(120)

    const recentList = ((recent ?? []) as Array<{ ts: string; was_active: boolean }>).reverse()
    let sessionEnded: 'idle_timeout' | 'final' | null = null

    if (isSustainedIdle(recentList, 120)) {
        const agg = aggregateHeartbeats(recentList)
        await admin
            .from('work_clock_sessions')
            .update({
                ended_at: new Date().toISOString(),
                closed_reason: 'idle_timeout',
                active_seconds: agg.activeSeconds,
                idle_seconds: agg.idleSeconds,
            })
            .eq('id', body.sessionId)
        sessionEnded = 'idle_timeout'
        await logAudit(user.id, 'WORK_CLOCK_AUTO_STOPPED', {
            session_id: body.sessionId,
            reason: 'idle_timeout',
            active_seconds: agg.activeSeconds,
        })
        // Email user (fire-and-forget)
        try {
            const { data: profile } = await admin
                .from('profiles')
                .select('email, full_name')
                .eq('id', user.id)
                .single<{ email: string; full_name: string | null }>()
            if (profile?.email) {
                sendClockAutoStopped(
                    profile.email,
                    profile.full_name ?? profile.email,
                    'idle_timeout',
                    agg.activeSeconds / 3600,
                ).catch((e) => logCompat.error('[heartbeat] auto-stop email failed:', e))
            }
        } catch (e) {
            logCompat.error('[heartbeat] profile lookup failed:', e)
        }
    } else if (body.final) {
        // Manual final beacon — close session
        const { data: allHb } = await admin
            .from('work_clock_heartbeats')
            .select('ts, was_active')
            .eq('session_id', body.sessionId)
        const agg = aggregateHeartbeats((allHb ?? []) as Array<{ ts: string; was_active: boolean }>)
        await admin
            .from('work_clock_sessions')
            .update({
                ended_at: new Date().toISOString(),
                closed_reason: 'manual',
                active_seconds: agg.activeSeconds,
                idle_seconds: agg.idleSeconds,
            })
            .eq('id', body.sessionId)
        sessionEnded = 'final'
    }

    return NextResponse.json({ ok: true, sessionEnded })
}
