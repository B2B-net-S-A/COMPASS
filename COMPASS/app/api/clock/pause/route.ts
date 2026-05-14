import { NextResponse } from 'next/server'
import { pauseClockSession } from '@/lib/actions/internal-clock'

export const dynamic = 'force-dynamic'

// Phase 17b R3 — pause active session for N minutes.
// Body: { sessionId, durationMinutes, reason: 'break_30'|'break_60'|'break_120'|'manual' }
export async function POST(request: Request) {
    let body: { sessionId?: string; durationMinutes?: number; reason?: string }
    try {
        body = (await request.json()) as typeof body
    } catch {
        return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
    }

    if (
        !body.sessionId ||
        typeof body.durationMinutes !== 'number' ||
        !body.reason ||
        !['break_30', 'break_60', 'break_120', 'manual'].includes(body.reason)
    ) {
        return NextResponse.json({ error: 'invalid_payload' }, { status: 400 })
    }

    try {
        const result = await pauseClockSession({
            sessionId: body.sessionId,
            durationMinutes: body.durationMinutes,
            reason: body.reason as 'break_30' | 'break_60' | 'break_120' | 'manual',
        })
        return NextResponse.json({ ok: true, ...result })
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'unknown_error'
        const status = msg === 'Unauthorized' || msg.includes('uprawnienia') ? 401 : 400
        return NextResponse.json({ error: msg }, { status })
    }
}
