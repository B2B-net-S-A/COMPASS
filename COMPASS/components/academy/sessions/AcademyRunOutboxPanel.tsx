'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/shared/ConfirmDialog'
import { useAcademyAction } from '@/components/academy/useAcademyAction'
import { approveAcademyRunOutboxBatch, previewAcademyOutboxMessage, sendAcademyOutboxTest, type RunOutboxState } from '@/lib/actions/academy-run-outbox'

const STATUS_LABEL: Record<string, string> = { held: 'Wstrzymane', approved: 'Zatwierdzone', sent_test: 'Test wysłany', sent: 'Wysłane', expired: 'Wygasłe', failed: 'Nieudane' }
const KIND_LABEL: Record<string, string> = { 'academy.run_invitation': 'Zaproszenie', 'academy.run_reminder': 'Przypomnienie' }

export function AcademyRunOutboxPanel({ runId, state, error }: { runId: string; state?: RunOutboxState; error?: string }) {
    const router = useRouter()
    const [pending, start] = useAcademyAction()
    const [confirm, ConfirmUI] = useConfirm()
    const [failure, setFailure] = useState<string | null>(null)
    const [message, setMessage] = useState<string | null>(null)
    const [preview, setPreview] = useState<{ subject: string; html: string; recipient: string } | null>(null)

    if (error) return <section aria-label="Kolejka wiadomości" className="rounded-2xl border border-border bg-card p-5"><p role="alert" className="text-sm text-destructive">{error}</p></section>
    if (!state) return null
    if (!state.available) return <section aria-label="Kolejka wiadomości" className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">Kolejka wiadomości zacznie działać po zastosowaniu migracji bazy danych.</section>

    function run(action: () => Promise<void>) {
        setFailure(null); setMessage(null)
        start(async () => { try { await action() } catch { setFailure('Operacja nie powiodła się. Spróbuj ponownie.') } })
    }
    function show(id: string) {
        run(async () => { const result = await previewAcademyOutboxMessage(id); if (!result.success) { setFailure(result.error); return } setPreview(result.data) })
    }
    function test(id: string) {
        run(async () => { const result = await sendAcademyOutboxTest({ id, runId }); if (!result.success) { setFailure(result.error); return } setMessage('Test wysłany na skrzynkę właściciela.'); router.refresh() })
    }
    async function approve(batchId: string, count: number) {
        if (!await confirm({ title: 'Zatwierdzić paczkę?', description: `Paczka obejmuje ${count} wiadomości. Zatwierdzenie to decyzja o wysyłce do ludzi.`, confirmLabel: 'Zatwierdź' })) return
        run(async () => { const result = await approveAcademyRunOutboxBatch({ batchId, runId }); if (!result.success) { setFailure(result.error); return } setMessage(`Zatwierdzono: ${result.data.count}.`); router.refresh() })
    }

    return <section aria-label="Kolejka wiadomości" className="space-y-3 rounded-2xl border border-border bg-card p-5">
        <div className="space-y-1"><h2 className="text-lg font-semibold">Kolejka wiadomości</h2><p className="text-sm text-muted-foreground">{state.mailEnabled ? 'Wysyłka jest włączona, ale każdą paczkę zatwierdza człowiek.' : 'Wysyłka wyłączona. Nikt nie dostanie wiadomości, a zatwierdzanie paczek jest nieaktywne.'}</p></div>
        {failure && <p role="alert" className="text-sm text-destructive">{failure}</p>}{message && <p role="status" className="text-sm">{message}</p>}
        {state.batches.length === 0 ? <p className="text-sm text-muted-foreground">W kolejce nie ma wiadomości tej edycji.</p> : <ul className="divide-y divide-border">{state.batches.map(batch => <li key={`${batch.batchId ?? batch.kind}:${batch.status}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
            <div className="min-w-0"><p className="text-sm font-medium">{KIND_LABEL[batch.kind] ?? batch.kind}: {batch.count}</p><p className="truncate text-xs text-muted-foreground">{batch.subject}</p><p className="text-xs text-muted-foreground">{STATUS_LABEL[batch.status] ?? batch.status} · wygasa {new Intl.DateTimeFormat('pl-PL', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Warsaw' }).format(new Date(batch.expiresAt))}</p></div>
            <div className="flex flex-wrap gap-1"><Button size="sm" variant="outline" disabled={pending} onClick={() => show(batch.sampleId)}>Podejrzyj</Button>{batch.status === 'held' && <><Button size="sm" variant="ghost" disabled={pending} onClick={() => test(batch.sampleId)}>Wyślij test</Button><Button size="sm" disabled={pending || !state.mailEnabled || !batch.batchId} onClick={() => batch.batchId && approve(batch.batchId, batch.count)}>Zatwierdź paczkę</Button></>}</div>
        </li>)}</ul>}
        {preview && <div className="space-y-2 rounded-xl border border-border p-4 text-sm"><div className="flex items-start justify-between gap-2"><div><p className="font-medium">{preview.subject}</p><p className="text-xs text-muted-foreground">Do: {preview.recipient}</p></div><Button size="sm" variant="ghost" onClick={() => setPreview(null)}>Zamknij</Button></div><iframe title="Podgląd wiadomości" sandbox="" srcDoc={preview.html} className="h-48 w-full rounded-lg border border-border bg-background" /></div>}
        <ConfirmUI />
    </section>
}
