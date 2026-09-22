'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { getAcademyMaterialQueue, retryAcademyMaterialScan } from '@/lib/actions/academy-materials'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAcademyAction } from './useAcademyAction'

type Queue = Extract<Awaited<ReturnType<typeof getAcademyMaterialQueue>>, { success: true }>['data']
const labels: Record<string, string> = { uploading: 'Upload nieukończony', quarantined: 'Oczekuje na skan', scanning: 'Skanowanie', rejected: 'Odrzucony' }

export function MaterialScanQueue() {
    const [page, setPage] = useState(1)
    const [filter, setFilter] = useState<'pending' | 'failed' | 'rejected' | 'all'>('pending')
    const [loading, setLoading] = useState(false)
    const requestId = useRef(0)
    const [queue, setQueue] = useState<Queue | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [pending, run] = useAcademyAction()
    const refresh = useCallback(async () => {
        const request = ++requestId.current
        setLoading(true)
        setQueue(null)
        setError(null)
        try {
            const result = await getAcademyMaterialQueue({ page, filter })
            if (request !== requestId.current) return
            if (!result.success) { setError(result.error); return }
            const lastPage = Math.max(1, Math.ceil(result.data.total / result.data.pageSize))
            if (page > lastPage) { setPage(lastPage); return }
            setQueue(result.data)
            setError(null)
        } catch { if (request === requestId.current) setError('Nie udało się odczytać kolejki materiałów.') }
        finally { if (request === requestId.current) setLoading(false) }
    }, [page, filter])
    useEffect(() => { void refresh(); return () => { requestId.current++ } }, [refresh])
    function retry(id: string) {
        void run(async () => {
            try {
                const result = await retryAcademyMaterialScan(id)
                if (!result.success) { setError(result.error); return }
                await refresh()
            } catch { setError('Nie udało się ponowić skanowania. Spróbuj ponownie.') }
        })
    }
    return <Card><CardHeader><CardTitle>Weryfikacja materiałów</CardTitle></CardHeader><CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">Plik jest dostępny dla uczestników dopiero po pozytywnym wyniku kontroli. Odrzucony materiał należy zastąpić poprawnym plikiem.</p>
        <div className="space-y-2"><label htmlFor="material-scan-filter" className="text-sm font-medium">Status weryfikacji</label><select id="material-scan-filter" value={filter} disabled={pending || loading} onChange={event => { setFilter(event.target.value as typeof filter); setPage(1) }} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"><option value="pending">Oczekujące i w trakcie</option><option value="failed">Wyczerpane próby — wymagają uwagi</option><option value="rejected">Odrzucone</option><option value="all">Wszystkie nieukończone</option></select></div>
        {queue && !queue.scannerConfigured && <p role="status" className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm">Skaner nie jest skonfigurowany. Nowe pliki pozostają niedostępne, a kurs z oczekującymi materiałami nie może zostać opublikowany.</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {!queue && !error && <p role="status" className="text-sm text-muted-foreground">Ładowanie kolejki…</p>}
        {queue?.items.length === 0 && <p className="text-sm text-muted-foreground">Brak materiałów pasujących do filtra.</p>}
        {queue?.items.map(item => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3">
            <div className="min-w-0 space-y-1"><p className="break-all text-sm font-medium">{item.filename}</p>
                <p className="text-xs text-muted-foreground">{labels[item.status] ?? item.status} · liczba prób: {item.attempts}</p>
                <Link href={item.runId ? `/learning/edycje/${item.runId}` : `/learning/tworze/${item.courseId}/edit`} className="text-xs text-primary underline">Otwórz szkolenie</Link>
            </div>
            {item.canRetry && <Button size="sm" variant="outline" disabled={pending} onClick={() => retry(item.id)}>Ponów skanowanie</Button>}
        </div>)}
        {queue && <nav aria-label="Strony kolejki weryfikacji" className="flex flex-wrap items-center gap-3"><Button size="sm" variant="outline" disabled={pending || loading || page <= 1} onClick={() => setPage(page - 1)}>Poprzednia strona</Button><span className="text-xs text-muted-foreground">Strona {page} z {Math.max(1, Math.ceil(queue.total / queue.pageSize))} · wyników: {queue.total}</span><Button size="sm" variant="outline" disabled={pending || loading || page * queue.pageSize >= queue.total} onClick={() => setPage(page + 1)}>Następna strona</Button></nav>}
        <Button size="sm" variant="outline" disabled={pending || loading} onClick={() => void run(refresh)}>Odśwież kolejkę</Button>
    </CardContent></Card>
}
