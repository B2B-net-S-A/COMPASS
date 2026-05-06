'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * Phase 10 (2026-05-06): subscribe to changes on inbox tickets so the Kanban
 * board reflects live updates from other handlers. RLS gates which rows the
 * user can see; we listen on UPDATE/INSERT for `support_tickets` globally
 * and the consumer triggers a refresh.
 */
export function useRealtimeInboxTickets({
    onChange,
    enabled = true,
}: {
    onChange: () => void
    enabled?: boolean
}) {
    useEffect(() => {
        if (!enabled) return

        let channel: ReturnType<ReturnType<typeof createClient>['channel']> | null = null

        try {
            const supabase = createClient()
            channel = supabase
                .channel('inbox-tickets')
                .on(
                    'postgres_changes',
                    { event: 'UPDATE', schema: 'public', table: 'support_tickets' },
                    () => onChange(),
                )
                .on(
                    'postgres_changes',
                    { event: 'INSERT', schema: 'public', table: 'support_tickets' },
                    () => onChange(),
                )
                .subscribe()
        } catch (e) {
            console.warn('[Realtime inbox-tickets] subscription failed:', e)
        }

        return () => {
            if (channel) {
                try {
                    const supabase = createClient()
                    supabase.removeChannel(channel)
                } catch {}
            }
        }
    }, [enabled, onChange])
}
