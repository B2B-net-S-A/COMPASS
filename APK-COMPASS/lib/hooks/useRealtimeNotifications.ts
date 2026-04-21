'use client'

import { useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from '@/lib/toast'

interface UseRealtimeNotificationsOptions {
    userId: string
    onNewNotification?: (notification: any) => void
    enabled?: boolean
}

export function useRealtimeNotifications({
    userId,
    onNewNotification,
    enabled = true,
}: UseRealtimeNotificationsOptions) {
    const handleNewNotification = useCallback(
        (payload: any) => {
            const notification = payload.new
            if (notification) {
                toast.info(notification.title_pl || notification.title || 'Nowe powiadomienie', {
                    description: notification.body_pl || notification.body || '',
                    action: notification.action_url
                        ? {
                              label: 'Zobacz',
                              onClick: () => {
                                  window.location.href = notification.action_url
                              },
                          }
                        : undefined,
                })
                onNewNotification?.(notification)
            }
        },
        [onNewNotification]
    )

    useEffect(() => {
        if (!enabled || !userId) return

        let channel: ReturnType<ReturnType<typeof createClient>['channel']> | null = null

        try {
            const supabase = createClient()

            channel = supabase
                .channel(`notifications:${userId}`)
                .on(
                    'postgres_changes',
                    {
                        event: 'INSERT',
                        schema: 'public',
                        table: 'notifications',
                        filter: `user_id=eq.${userId}`,
                    },
                    handleNewNotification
                )
                .subscribe()
        } catch (e) {
            console.warn('[Realtime] Subscription failed, falling back to polling:', e)
        }

        return () => {
            if (channel) {
                try {
                    const supabase = createClient()
                    supabase.removeChannel(channel)
                } catch {}
            }
        }
    }, [userId, enabled, handleNewNotification])
}
