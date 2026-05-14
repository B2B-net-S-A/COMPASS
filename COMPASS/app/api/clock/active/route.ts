import { NextResponse } from 'next/server'
import {
    getActiveClockSession,
    getRecentlyAutoClosedSession,
} from '@/lib/actions/internal-clock'

export const dynamic = 'force-dynamic'

// Phase 17 — fetch the currently live work-clock session for the authenticated
// user. Used by useWorkClock on mount to resume a session after page reload.
//
// Phase 17b R2: also returns `lastClosedSession` when the most recent session
// was auto-closed by idle_timeout/sleep_detected within the last 30 min and
// not yet user_disregarded — used by IdleResumeDialog to show 4-option modal.
export async function GET() {
    try {
        const [session, lastClosedSession] = await Promise.all([
            getActiveClockSession(),
            getRecentlyAutoClosedSession(),
        ])
        return NextResponse.json({ session, lastClosedSession })
    } catch (e) {
        const message = e instanceof Error ? e.message : 'unknown_error'
        const status = message === 'Unauthorized' || message.includes('uprawnienia') ? 401 : 500
        return NextResponse.json({ error: message }, { status })
    }
}
