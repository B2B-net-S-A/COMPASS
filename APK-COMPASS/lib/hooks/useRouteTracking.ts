'use client'

// Phase 17b R12 (PR-D follow-up) — Auto-call recordRouteVisit on Compass route
// changes. Only fires when:
//   1. user has active session (from useWorkClock state)
//   2. session has route_tracking_enabled=true (server-side check via no-op)
//   3. route is a Compass internal route (starts with /internal or /home)
//
// Privacy: never sends external URLs, query params stripped server-side,
// page title from document.title (capped 200 chars server-side).

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

interface Options {
    sessionId: string | null
    enabled: boolean
}

const TRACKED_PREFIXES = ['/internal', '/home', '/akademia']

export function useRouteTracking({ sessionId, enabled }: Options): void {
    const pathname = usePathname()
    const lastReportedRef = useRef<string | null>(null)

    useEffect(() => {
        if (!enabled || !sessionId || typeof window === 'undefined') return
        if (!pathname) return

        // Only track Compass-internal routes (privacy whitelist)
        const allowed = TRACKED_PREFIXES.some((p) => pathname.startsWith(p))
        if (!allowed) return

        // Debounce identical paths (route refresh shouldn't double-report)
        if (lastReportedRef.current === pathname) return
        lastReportedRef.current = pathname

        const pageTitle = document.title?.slice(0, 200) ?? null

        // Fire and forget — server is silent no-op when route_tracking_enabled=false
        ;(async () => {
            try {
                const { recordRouteVisit } = await import('@/lib/actions/internal-clock')
                await recordRouteVisit(sessionId, pathname, pageTitle ?? undefined)
            } catch (e) {
                // Non-fatal — server may have rejected (session ended, opt-out, etc.)
                console.warn('[useRouteTracking] silent fail', e)
            }
        })()
    }, [pathname, sessionId, enabled])
}
