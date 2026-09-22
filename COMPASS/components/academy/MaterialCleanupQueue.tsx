'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getAcademyMaterialCleanupQueue, retryAcademyMaterialCleanup } from '@/lib/actions/academy-materials'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAcademyAction } from './useAcademyAction'

type Queue = Extract<Awaited<ReturnType<typeof getAcademyMaterialCleanupQueue>>, { success: true }>['data']
export function MaterialCleanupQueue() {
    const [page, setPage] = useState(1)
    const [filter, setFilter] = useState<'all' | 'failed'>('all')
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
            const result = await getAcademyMaterialCleanupQueue({ page, filter })
            if (request !== requestId.current) return
            if (!result.success) { setError(result.error); return }
            const lastPage = Math.max(1, Math.ceil(result.data.total / result.data.pageSize))
            if (page > lastPage) { setPage(lastPage); return }
            setQueue(result.data); setError(null)
        } catch { if (request === requestId.current) setError('Nie udało się odczytać stanu porządkowania materiałów.') }
        finally { if (request === requestId.current) setLoading(false) }
    }, [page, filter])
    useEffect(() => { void refresh(); return () => { requestId.current++ } }, [refresh])
    const retry = (id: string) => void run(async () => {
        try {
            const result = await retryAcademyMaterialCleanup(id)
            if (!result.success) { setError(result.error); return }
            await refresh()
        } catch { setError('Nie udało się ponowić porządkowania. Spróbuj ponownie.') }
    })
    return <Card><CardHeader><CardTitle>Porządkowanie przesłanych plików</CardTitle></CardHeader><CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">Materiały używane w programie i opublikowane materiały edycji pozostają zachowane. Limit autora zwalnia się po potwierdzonym usunięciu nieużywanego pliku.</p>
        <div className="space-y-2"><label htmlFor="material-cleanup-filter" className="text-sm font-medium">Stan porządkowania</label><select id="material-cleanup-filter" value={filter} disabled={pending || loading} onChange={event => { setFilter(event.target.value as typeof filter); setPage(1) }} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"><option value="all">Wszystkie rozpoczęte</option><option value="failed">Wyczerpane próby — wymagają uwagi</option></select></div>
        {queue && <p role="status" className="text-sm">{queue.mode === 'report' ? 'Usuwanie wyłączone. Zadanie wykonuje tylko raport; uruchomienie wymaga zatwierdzonej polityki retencji.' : 'Porządkowanie jest włączone zgodnie z konfiguracją.'} Niedokończone przesyłanie: po {queue.uploadHours} h. Odrzucone materiały: po {queue.rejectedDays} dniach. Gotowe pliki odłączone od programu: po {queue.rejectedDays} dniach od pierwszego stwierdzenia braku użycia przez zadanie. Ponowne użycie rozpoczyna ten okres od nowa.</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {!queue && !error && <p role="status" className="text-sm text-muted-foreground">Ładowanie stanu…</p>}
        {queue?.items.length === 0 && <p className="text-sm text-muted-foreground">Brak zadań pasujących do filtra.</p>}
        {queue?.items.map(item => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3">
            <div className="min-w-0"><p className="break-all text-sm font-medium">{item.filename}</p><p className="text-xs text-muted-foreground">{item.failed ? 'Nie potwierdzono usunięcia; limit pozostaje zajęty.' : 'Oczekuje na potwierdzenie usunięcia.'} Próby: {item.attempts}</p></div>
            {item.canRetry && <Button size="sm" variant="outline" disabled={pending || queue.mode === 'report'} onClick={() => retry(item.id)}>Ponów porządkowanie</Button>}
        </div>)}
        {queue && <nav aria-label="Strony kolejki porządkowania" className="flex flex-wrap items-center gap-3"><Button size="sm" variant="outline" disabled={pending || loading || page <= 1} onClick={() => setPage(page - 1)}>Poprzednia strona</Button><span className="text-xs text-muted-foreground">Strona {page} z {Math.max(1, Math.ceil(queue.total / queue.pageSize))} · wyników: {queue.total}</span><Button size="sm" variant="outline" disabled={pending || loading || page * queue.pageSize >= queue.total} onClick={() => setPage(page + 1)}>Następna strona</Button></nav>}
        <Button size="sm" variant="outline" disabled={pending || loading} onClick={() => void run(refresh)}>Odśwież stan</Button>
    </CardContent></Card>
}
