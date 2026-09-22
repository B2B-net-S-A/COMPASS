'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Download, FileCheck2, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { MaterialUploader } from './MaterialUploader'
import { AcademyVideo } from './AcademyVideo'
import { useAcademyAction } from './useAcademyAction'
import { listAcademyRunMaterials, reviewAcademyRunMaterial } from '@/lib/actions/academy-materials'
import type { AcademyRunMaterial } from '@/lib/types/academy-materials'
import type { CourseAttachment } from '@/lib/types/learning'

const reviewLabels = { pending_review: 'Do akceptacji', published: 'Opublikowany', rejected: 'Odrzucony', withdrawn: 'Wycofany' }
const asAttachment = (file: AcademyRunMaterial): CourseAttachment => ({
    asset_id: file.id, name: file.filename, mime_type: file.mime_type,
    size_bytes: Number(file.size_bytes), storage_path: file.storage_path,
})

export function RunMaterials({ runId, courseId, canManage, isAdmin, userId, readOnly = false }: {
    runId: string; courseId: string; canManage: boolean; isAdmin: boolean; userId: string; readOnly?: boolean
}) {
    const [items, setItems] = useState<AcademyRunMaterial[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [pending, perform] = useAcademyAction()
    const [decision, setDecision] = useState<{ item: AcademyRunMaterial; value: 'approve' | 'reject' | 'withdraw' } | null>(null)
    const epoch = useRef(0)
    const refresh = useCallback(async () => {
        const requestEpoch = epoch.current
        try {
            const result = await listAcademyRunMaterials(runId)
            if (requestEpoch !== epoch.current) return
            if (!result.success) { setError(result.error); return }
            setItems(result.data)
            setError(null)
        } catch { if (requestEpoch === epoch.current) setError('Nie udało się pobrać materiałów. Spróbuj ponownie.') }
        finally { if (requestEpoch === epoch.current) setLoading(false) }
    }, [runId])
    useEffect(() => { const currentEpoch = ++epoch.current; void refresh(); return () => { epoch.current = currentEpoch + 1 } }, [refresh])

    function submit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault()
        if (!decision) return
        const note = String(new FormData(event.currentTarget).get('note') ?? '').trim()
        perform(async () => {
            try {
                const result = await reviewAcademyRunMaterial({ assetId: decision.item.id, decision: decision.value, note })
                if (!result.success) { setError(result.error); return }
                setDecision(null)
                await refresh()
            } catch { setError('Nie udało się zapisać decyzji. Spróbuj ponownie.') }
        })
    }

    return <section aria-labelledby={'run-materials-' + runId} className="space-y-4 rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h2 id={'run-materials-' + runId} className="text-lg font-semibold">Materiały po szkoleniu</h2><p className="mt-1 text-sm text-muted-foreground">Nagrania i pliki dla tej edycji. Nie zmieniają programu ani warunków zaliczenia.</p></div>
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => void refresh()}><RefreshCw className="size-4" aria-hidden="true" />Odśwież</Button>
        </div>
        {canManage && !readOnly && <MaterialUploader courseId={courseId} runId={runId} onReady={() => void refresh()} />}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {loading ? <p role="status" className="text-sm text-muted-foreground">Wczytywanie materiałów…</p> : items.filter(item => item.status === 'ready').length === 0 && <p className="py-3 text-sm text-muted-foreground">{canManage ? 'Gotowe pliki pojawią się tutaj po skanowaniu. Przed udostępnieniem uczestnikom wymagana jest akceptacja administratora.' : 'Zatwierdzone materiały dla Twojej grupy pojawią się tutaj.'}</p>}
        {items.filter(item => item.status === 'ready').map(item => <article key={item.id} className="space-y-3 rounded-xl border border-border p-4">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div className="min-w-0"><h3 className="break-words font-medium">{item.filename}</h3><p className="mt-1 text-xs text-muted-foreground">{(Number(item.size_bytes) / 1024 / 1024).toLocaleString('pl-PL', { maximumFractionDigits: 1 })} MB{canManage ? ' · ' + reviewLabels[item.review_status] : ''}</p>{canManage && item.review_note && <p className="mt-2 text-sm text-muted-foreground">{item.review_note}</p>}</div>
                <Button asChild size="sm" variant="outline"><a href={'/api/akademia/attachment?' + new URLSearchParams({ runId, assetId: item.id })}><Download aria-hidden="true" className="size-4" />{canManage && item.review_status !== 'published' ? 'Podgląd pliku' : 'Otwórz plik'}</a></Button>
            </div>
            {item.mime_type === 'video/mp4' && <AcademyVideo runId={runId} video={asAttachment(item)} captions={items.find(file => file.status === 'ready' && file.review_status === item.review_status && file.mime_type === 'text/vtt') ? asAttachment(items.find(file => file.status === 'ready' && file.review_status === item.review_status && file.mime_type === 'text/vtt')!) : undefined} />}
            {isAdmin && !readOnly && <div className="flex flex-wrap gap-2">
                {item.review_status === 'pending_review' && <><Button size="sm" disabled={pending || item.uploaded_by === userId} onClick={() => { setError(null); setDecision({ item, value: 'approve' }) }}><FileCheck2 className="size-4" aria-hidden="true" />Zatwierdź dla uczestników</Button><Button size="sm" variant="outline" disabled={pending} onClick={() => { setError(null); setDecision({ item, value: 'reject' }) }}>Odrzuć z komentarzem</Button>{item.uploaded_by === userId && <span className="w-full text-xs text-muted-foreground">Własny materiał musi zatwierdzić inny administrator.</span>}</>}
                {item.review_status === 'published' && <Button size="sm" variant="outline" disabled={pending} onClick={() => { setError(null); setDecision({ item, value: 'withdraw' }) }}>Wycofaj materiał</Button>}
            </div>}
        </article>)}
        <Dialog open={decision !== null} onOpenChange={open => { if (!open && !pending) setDecision(null) }}><DialogContent><DialogHeader><DialogTitle>{decision?.value === 'approve' ? 'Udostępnij materiał uczestnikom' : decision?.value === 'reject' ? 'Odrzuć materiał' : 'Wycofaj materiał'}</DialogTitle><DialogDescription>{decision?.item.filename}</DialogDescription></DialogHeader><form onSubmit={submit} className="space-y-4"><p className="text-sm text-muted-foreground">{decision?.value === 'approve' ? 'Zapisane osoby uzyskają dostęp do tego pliku i otrzymają powiadomienie w Compass.' : 'Podaj uzasadnienie. Decyzja i materiał pozostaną w historii. Wcześniej wydane linki mogą działać jeszcze do 5 minut.'}</p><label htmlFor="material-review-note" className="block text-sm font-medium">Komentarz{decision?.value === 'approve' ? ' (opcjonalny)' : ' (wymagany)'}</label><Textarea id="material-review-note" name="note" required={decision?.value !== 'approve'} minLength={decision?.value === 'approve' ? undefined : 5} maxLength={2000} disabled={pending} />{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={pending} onClick={() => setDecision(null)}>Wróć</Button><Button type="submit" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}Potwierdź decyzję</Button></div></form></DialogContent></Dialog>
    </section>
}
