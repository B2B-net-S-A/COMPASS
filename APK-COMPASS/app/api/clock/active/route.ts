import { NextResponse } from 'next/server'
import { getActiveClockSession } from '@/lib/actions/internal-clock'

export const dynamic = 'force-dynamic'

// Phase 17 — fetch the currently live work-clock session for the authenticated
// user. Used by useWorkClock on mount to resume a session after page reload.
export async function GET() {
    try {
        const session = await getActiveClockSession()
        return NextResponse.json({ session })
    } catch (e) {
        const message = e instanceof Error ? e.message : 'unknown_error'
        const status = message === 'Unauthorized' || message.includes('uprawnienia') ? 401 : 500
        return NextResponse.json({ error: message }, { status })
    }
}
