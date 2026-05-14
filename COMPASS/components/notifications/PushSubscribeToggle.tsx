'use client'

import { Bell, BellOff, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from '@/lib/toast'
import { toastSuccess } from '@/lib/toast-success'
import { usePushSubscription } from '@/lib/hooks/usePushSubscription'

/**
 * H3.3: UI toggle dla push notifications.
 * Pokazuje stan permission, pozwala subskrybować/odsubskrybować.
 *
 * Renderuj na stronie ustawień powiadomień lub w sidebarze.
 */
export function PushSubscribeToggle() {
    const { permission, isSubscribed, isLoading, subscribe, unsubscribe } = usePushSubscription()

    if (permission === 'unsupported') {
        return (
            <div className="text-xs text-muted-foreground">
                Push notifications nie są wspierane w tej przeglądarce.
            </div>
        )
    }

    if (permission === 'denied') {
        return (
            <div className="space-y-1">
                <p className="text-sm font-medium">Powiadomienia push: zablokowane</p>
                <p className="text-xs text-muted-foreground">
                    Aby je włączyć, zezwól na powiadomienia w ustawieniach przeglądarki dla tej strony.
                </p>
            </div>
        )
    }

    const handleClick = async () => {
        if (isSubscribed) {
            const res = await unsubscribe()
            if (res.success) toastSuccess('Powiadomienia wyłączone')
            else toast.error(res.error ?? 'Błąd')
        } else {
            const res = await subscribe()
            if (res.success) toastSuccess('Powiadomienia włączone')
            else toast.error(res.error ?? 'Błąd')
        }
    }

    return (
        <Button
            onClick={handleClick}
            disabled={isLoading}
            variant={isSubscribed ? 'outline' : 'default'}
            size="sm"
            className="gap-2"
        >
            {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
            ) : isSubscribed ? (
                <BellOff className="w-4 h-4" />
            ) : (
                <Bell className="w-4 h-4" />
            )}
            {isSubscribed ? 'Wyłącz powiadomienia push' : 'Włącz powiadomienia push'}
        </Button>
    )
}
