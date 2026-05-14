'use client'

import { logCompat } from '@/lib/logger'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * Phase 8 (2026-05-04): subscribe to new comments on a single support ticket.
 * RLS already gates which comments the user can see — Realtime delivers
 * INSERT events for the same set.
 */
export function useRealtimeTicketComments({
    ticketId,
    onNewComment,
    enabled = true,
}: {
    ticketId: string
    onNewComment: () => void
    enabled?: boolean
}) {
    useEffect(() => {
        if (!enabled || !ticketId) return

        let channel: ReturnType<ReturnType<typeof createClient>['channel']> | null = null

        try {
            const supabase = createClient()
            channel = supabase
                .channel(`ticket-comments:${ticketId}`)
                .on(
                    'postgres_changes',
                    {
                        event: 'INSERT',
                        schema: 'public',
                        table: 'support_ticket_comments',
                        filter: `ticket_id=eq.${ticketId}`,
                    },
                    () => onNewComment(),
                )
                .subscribe()
        } catch (e) {
            logCompat.warn('[Realtime ticket-comments] subscription failed:', e)
        }

        return () => {
            if (channel) {
                try {
                    const supabase = createClient()
                    supabase.removeChannel(channel)
                } catch {
                    // Cleanup w useEffect unmount — błąd removeChannel nic nie
                    // poprawi (component już znika), logujemy tylko silentnie
                    // żeby nie zaśmiecać Sentry przy unmount race-conditions.
                }
            }
        }
    }, [ticketId, enabled, onNewComment])
}
