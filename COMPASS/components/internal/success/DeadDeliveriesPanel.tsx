'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertOctagon, Loader2, RotateCcw } from 'lucide-react'
import { retrySuccessDelivery } from '@/lib/actions/consultant-success'
import { toast } from '@/lib/toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatSuccessDate } from './SuccessBadges'
import type { SuccessDeadDelivery } from '@/lib/types/consultant-success'

const KIND_LABEL: Record<string, string> = {
    check_in_due: 'Check-in',
    task_due: 'Action step',
    conversation_follow_up: 'Follow-up',
    client_feedback_risk: 'Ryzykowny feedback',
    pulse_invitation: 'Zaproszenie do ankiety',
    pulse_reminder: 'Przypomnienie o ankiecie',
    pulse_low_alert: 'Niski pulse',
    health_review: 'Przegląd kondycji',
}
function RetryButton({ deliveryId }: { deliveryId: string }) {
    const [pending, startTransition] = useTransition()
    const router = useRouter()

    return (
        <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => startTransition(async () => {
                try {
                    await retrySuccessDelivery({ deliveryId })
                    toast.success('Dostawa wróciła do kolejki retry.')
                    router.refresh()
                } catch (error) {
                    toast.error(error instanceof Error ? error.message : 'Nie udało się ponowić dostawy.')
                }
            })}
        >
            {pending ? <Loader2 className="animate-spin" /> : <RotateCcw />}
            Ponów
        </Button>
    )
}

export function DeadDeliveriesPanel({ deliveries }: { deliveries: SuccessDeadDelivery[] }) {
    if (deliveries.length === 0) return null

    return (
        <section className="rounded-xl border border-destructive/30 bg-card">
            <div className="flex items-start gap-3 border-b border-border p-5">
                <AlertOctagon className="mt-0.5 h-5 w-5 text-destructive" aria-hidden />
                <div>
                    <h2 className="font-semibold text-foreground">Dead-letter queue</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Dostawy po pięciu nieudanych próbach. Ponowienie resetuje budżet retry; aktualny stan monitoringu i odbiorca są sprawdzane jeszcze raz przed wysyłką.
                    </p>
                </div>
            </div>
            <div className="divide-y divide-border">
                {deliveries.map((delivery) => (
                    <div key={delivery.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-semibold">{delivery.contractorName ?? 'Nieprzypisana osoba'}</span>
                                <Badge variant="outline">{KIND_LABEL[delivery.deliveryKind] ?? delivery.deliveryKind}</Badge>
                                <Badge variant="outline">{delivery.channel}</Badge>
                            </div>
                            <p className="mt-1 truncate text-xs text-muted-foreground">
                                {delivery.attemptCount} prób · {formatSuccessDate(delivery.createdAt, true)}
                                {delivery.lastError ? ` · ${delivery.lastError}` : ''}
                            </p>
                        </div>
                        <RetryButton deliveryId={delivery.id} />
                    </div>
                ))}
            </div>
        </section>
    )
}
