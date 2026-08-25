'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { logger } from '@/lib/logger'

/** Zlepianie serii zdarzeń w jedno odświeżenie. */
const REFRESH_DEBOUNCE_MS = 400

/**
 * Phase 10 (2026-05-06): subscribe to changes on inbox tickets so the Kanban
 * board reflects live updates from other handlers. RLS gates which rows the
 * user can see; we listen on UPDATE/INSERT for `support_tickets` globally
 * and the consumer triggers a refresh.
 *
 * Audyt 2026-08 — dwie rzeczy, które łatwo cofnąć nie znając powodu:
 *
 * 1. `onChange` NIE jest w zależnościach efektu, tylko w ref-ie. Jedyny wołający
 *    przekazuje literał `() => router.refresh()`, czyli nową funkcję przy KAŻDYM
 *    renderze — z `onChange` w tablicy zależności subskrypcja rozbierała się
 *    i stawiała od nowa po każdym odświeżeniu, które sama wywołała. Kanał ma
 *    powstać raz na zamontowanie planszy.
 * 2. Zdarzenia są zlepiane (`REFRESH_DEBOUNCE_MS`). `support_tickets` trzyma też
 *    helpdesk i lustro spraw kontraktorskich, a import albo zmiana hurtem potrafi
 *    wygenerować serię zdarzeń — bez tego każde z nich to osobny `router.refresh()`,
 *    czyli osobny przelot po stronie serwera.
 */
export function useRealtimeInboxTickets({
    onChange,
    enabled = true,
}: {
    onChange: () => void
    enabled?: boolean
}) {
    const onChangeRef = useRef(onChange)
    onChangeRef.current = onChange

    useEffect(() => {
        if (!enabled) return

        let channel: ReturnType<ReturnType<typeof createClient>['channel']> | null = null
        let timer: ReturnType<typeof setTimeout> | null = null

        const scheduleRefresh = () => {
            if (timer) clearTimeout(timer)
            timer = setTimeout(() => {
                timer = null
                onChangeRef.current()
            }, REFRESH_DEBOUNCE_MS)
        }

        try {
            const supabase = createClient()
            channel = supabase
                .channel('inbox-tickets')
                .on(
                    'postgres_changes',
                    { event: 'UPDATE', schema: 'public', table: 'support_tickets' },
                    scheduleRefresh,
                )
                .on(
                    'postgres_changes',
                    { event: 'INSERT', schema: 'public', table: 'support_tickets' },
                    scheduleRefresh,
                )
                .subscribe()
        } catch (e) {
            logger.warn({ event: 'realtime.inbox_tickets.subscribe_failed', error: e })
        }

        return () => {
            if (timer) clearTimeout(timer)
            if (channel) {
                try {
                    const supabase = createClient()
                    supabase.removeChannel(channel)
                } catch {
                    // Cleanup unmount — patrz useRealtimeTicketComments.
                }
            }
        }
    }, [enabled])
}
