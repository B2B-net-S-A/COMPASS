'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Loader2, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAcademyAction } from '@/components/academy/useAcademyAction'
import { requestRunPublication } from '@/lib/actions/academy-publication'

interface PublishPanelProps {
    courseId: string
    runId: string
    canSend: boolean
    requestedAt: string | null
    available: boolean
}

function formatWhen(value: string): string {
    return new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Warsaw' }).format(new Date(value))
}

/** Jedno pole zgody trenera zamiast pakietu przekazania; akceptację robi druga osoba. */
export function PublishPanel({ courseId, runId, canSend, requestedAt, available }: PublishPanelProps) {
    const router = useRouter()
    const [consent, setConsent] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [sentAt, setSentAt] = useState(requestedAt)
    const [pending, startTransition] = useAcademyAction()

    function send() {
        setError(null)
        startTransition(async () => {
            try {
                const result = await requestRunPublication({ runId, courseId, trainerConsent: true })
                if (!result?.success) return setError(result?.error ?? 'Nie udało się wysłać. Odśwież stronę.')
                setSentAt(result.data.requestedAt)
                router.refresh()
            } catch {
                setError('Nie udało się wysłać. Sprawdź połączenie i spróbuj ponownie.')
            }
        })
    }

    return <div className="space-y-3 rounded-xl border border-border bg-card p-4 sm:p-5">
        {sentAt && <p role="status" className="flex items-start gap-2 text-sm"><CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" /><span>Wysłane do publikacji {formatWhen(sentAt)}. Organizator obejrzy nagranie i zatwierdzi je do biblioteki.</span></p>}
        {!available && <p className="text-sm text-muted-foreground">Wysyłka do publikacji ruszy po zastosowaniu migracji. Wgrane pliki i tak czekają na akceptację organizatora.</p>}
        <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-primary" checked={consent} onChange={event => setConsent(event.target.checked)} disabled={!available || pending} />
            <span>Zgadzam się na udostępnienie nagrania i materiałów w bibliotece Akademii wszystkim osobom z dostępem. Na nagraniu nie słychać uczestników.</span>
        </label>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button onClick={send} disabled={!available || !consent || !canSend || pending} className="w-full sm:w-auto">
            {pending ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Send aria-hidden="true" />}{sentAt ? 'Wyślij ponownie' : 'Wyślij do publikacji'}
        </Button>
        {!canSend && <p className="text-xs text-muted-foreground">Przycisk ożyje, gdy któryś plik przejdzie skan i będzie czekał na akceptację.</p>}
    </div>
}
