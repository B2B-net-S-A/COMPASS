'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Bell, CheckCircle2, Circle, Clock3, PauseCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/shared/ConfirmDialog'
import { useAcademyAction } from '@/components/academy/useAcademyAction'
import { notifyEditionClosed, type EditionOperationCounter } from '@/lib/actions/academy-edition-closing'
import { completedSteps, type ClosingStep, type ClosingStepState } from '@/lib/academy/edition-closing'

const STATE_ICON: Record<ClosingStepState, typeof Circle> = { done: CheckCircle2, todo: Circle, waiting: Clock3, off: PauseCircle }
const STATE_CLASS: Record<ClosingStepState, string> = { done: 'bg-success/10 text-success', todo: 'bg-muted text-muted-foreground', waiting: 'bg-warning/10 text-warning', off: 'bg-muted text-muted-foreground' }

export function EditionClosingScreen({ runId, steps, counter, sessionsEnded }: { runId: string; steps: ClosingStep[]; counter: EditionOperationCounter | null; sessionsEnded: boolean }) {
    const router = useRouter()
    const [pending, start] = useAcademyAction()
    const [confirm, ConfirmUI] = useConfirm()
    const [error, setError] = useState<string | null>(null)
    const [message, setMessage] = useState<string | null>(null)
    const done = completedSteps(steps)

    async function notify() {
        if (!await confirm({ title: 'Powiadomić uczestników w aplikacji?', description: 'Osoby z potwierdzonym miejscem zobaczą dzwonek z informacją o ankiecie i dokumencie. Nie powstaje żaden e-mail. Ponowne użycie nie powtórzy powiadomienia.', confirmLabel: 'Powiadom' })) return
        setError(null)
        setMessage(null)
        start(async () => {
            try {
                const result = await notifyEditionClosed(runId)
                if (!result.success) { setError(result.error); return }
                setMessage(`Powiadomiono w aplikacji: ${result.data.notified}.`)
                router.refresh()
            } catch { setError('Nie udało się wysłać powiadomienia w aplikacji.') }
        })
    }

    return <div className="space-y-6">
        <div className="space-y-2"><div className="flex items-center justify-between text-sm"><span className="font-medium">{done} z {steps.length} kroków</span>{counter && <span className="text-muted-foreground">Licznik operacji: {counter.count}, {counter.minutes} min</span>}</div><div role="progressbar" aria-label="Postęp zamknięcia edycji" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={done} className="h-1.5 overflow-hidden rounded-full bg-primary/10"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(done / steps.length * 100)}%` }} /></div></div>
        <ol className="space-y-3">{steps.map((step, index) => {
            const Icon = STATE_ICON[step.state]
            return <li key={step.key} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 items-start gap-3"><Icon aria-hidden="true" className={`mt-0.5 size-5 shrink-0 ${step.state === 'done' ? 'text-success' : 'text-muted-foreground'}`} /><div className="min-w-0 space-y-1"><p className="text-xs text-muted-foreground">Krok {index + 1}</p><h2 className="font-semibold">{step.title}</h2><p className="text-sm">{step.detail}</p>{step.note && <p className="text-sm text-muted-foreground">{step.note}</p>}</div></div>
                <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end"><span className={`rounded-full px-2.5 py-1 text-xs ${STATE_CLASS[step.state]}`}>{step.stateLabel}</span>
                    {step.actionHref && step.actionLabel && <Button asChild variant="outline" size="sm"><Link href={step.actionHref}>{step.actionLabel}</Link></Button>}
                    {step.key === 'messages' && <div className="flex gap-2"><Button size="sm" variant="outline" disabled>Podejrzyj</Button><Button size="sm" disabled>Zatwierdź do wysyłki</Button></div>}
                </div>
            </li>
        })}</ol>
        <section aria-label="Po zamknięciu" className="space-y-3 rounded-2xl border border-border bg-card p-5">
            <h2 className="font-semibold">Po zamknięciu</h2>
            <p className="text-sm text-muted-foreground">Dzwonek w aplikacji przypomni uczestnikom o ankiecie i dokumencie. Wiadomości poza aplikację pozostają wyłączone.</p>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}{message && <p role="status" className="text-sm">{message}</p>}
            <Button variant="outline" disabled={pending || !sessionsEnded} onClick={notify}><Bell aria-hidden="true" />Powiadom w aplikacji</Button>
            {!sessionsEnded && <p className="text-xs text-muted-foreground">Powiadomienie będzie dostępne po zakończeniu wszystkich spotkań.</p>}
        </section>
        <ConfirmUI />
    </div>
}
