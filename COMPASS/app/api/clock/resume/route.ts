import { NextResponse } from 'next/server'
import { resumeClockSession } from '@/lib/actions/internal-clock'

export const dynamic = 'force-dynamic'

// Phase 17b R3 — explicit user resume (or programmatic auto-resume from client tick).
// Body: { sessionId, viaAutomatic?: boolean }
export async function POST(request: Request) {
    let body: { sessionId?: string; viaAutomatic?: boolean }
    try {
        body = (await request.json()) as typeof body
    } catch {
        return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
    }
    if (!body.sessionId) {
        return NextResponse.json({ error: 'invalid_payload' }, { status: 400 })
    }
    try {
        await resumeClockSession(body.sessionId, body.viaAutomatic ?? false)
        return NextResponse.json({ ok: true })
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'unknown_error'
        const status = msg === 'Unauthorized' || msg.includes('uprawnienia') ? 401 : 400
        return NextResponse.json({ error: msg }, { status })
    }
}
