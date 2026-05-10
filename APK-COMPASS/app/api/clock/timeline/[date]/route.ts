import { NextResponse } from 'next/server'
import { getMyTimelineForDay } from '@/lib/actions/internal-clock'

export const dynamic = 'force-dynamic'

// Phase 17b R12 — get clustered daily timeline for the authenticated user.
// Returns array of TimelineBlock { start, end, activeSeconds, primaryRoute, label }.
// User-only: server action returns ctx.userId data, never another user's.
export async function GET(_request: Request, { params }: { params: { date: string } }) {
    try {
        const blocks = await getMyTimelineForDay(params.date)
        return NextResponse.json({ blocks })
    } catch (e) {
        const message = e instanceof Error ? e.message : 'unknown_error'
        const status = message === 'Unauthorized' || message.includes('uprawnienia') ? 401 : 400
        return NextResponse.json({ error: message }, { status })
    }
}
