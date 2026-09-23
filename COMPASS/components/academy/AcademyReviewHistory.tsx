'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { History, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getAcademyReviewHistory } from '@/lib/actions/academy-review-history'
import type { AcademyReviewHistoryItem, AcademyReviewHistoryPage } from '@/lib/types/academy-review-history'
import { useAcademyAction } from './useAcademyAction'

function label(item: AcademyReviewHistoryItem) {
    switch (item.action) {
        case 'COURSE_REVIEW_SUBMITTED': case 'COURSE_SUBMITTED': return 'Przesłano do akceptacji'
        case 'COURSE_PUBLISHED': return 'Zatwierdzono i opublikowano'
        case 'COURSE_REJECTED': return 'Odrzucono — wymagane poprawki'
        case 'COURSE_ARCHIVED': return 'Zarchiwizowano szkolenie'
        case 'LEGACY_COURSE_REVIEWED': return item.approved === true ? 'Zatwierdzono historyczną publikację' : item.approved === false ? 'Odrzucono historyczną publikację' : 'Sprawdzono historyczną publikację'
    }
}
const date = (value: string) => new Intl.DateTimeFormat('pl-PL', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Warsaw' }).format(new Date(value))

export function AcademyReviewHistory({ courseId, refreshKey }: { courseId: string; refreshKey?: string }) {
    const heading = useId()
    const generation = useRef(0)
    const [page, setPage] = useState<AcademyReviewHistoryPage>({ items: [], nextCursor: null })
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [refresh, setRefresh] = useState(0)
    const [pending, run] = useAcademyAction()
    useEffect(() => {
        const request = ++generation.current
        setPage({ items: [], nextCursor: null })
        setLoading(true)
        setError(null)
        void (async () => {
            try {
                const result = await getAcademyReviewHistory({ courseId })
                if (request !== generation.current) return
                if (result.success) setPage(result.data)
                else setError(result.error)
            } catch {
                if (request === generation.current) setError('Nie udało się wczytać historii decyzji. Spróbuj ponownie.')
            } finally { if (request === generation.current) setLoading(false) }
        })()
        return () => { generation.current++ }
    }, [courseId, refreshKey, refresh])

    function loadMore() {
        if (!page.nextCursor || loading) return
        const cursor = page.nextCursor
        const request = generation.current
        setError(null)
        void run(async () => {
            try {
                const result = await getAcademyReviewHistory({ courseId, cursor })
                if (request !== generation.current) return
                if (result.success) setPage(previous => ({ items: [...previous.items, ...result.data.items], nextCursor: result.data.nextCursor }))
                else setError(result.error)
            } catch {
                if (request === generation.current) setError('Nie udało się wczytać starszych decyzji. Spróbuj ponownie.')
            }
        })
    }

    return <section aria-labelledby={heading} className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 id={heading} className="flex items-center gap-2 text-lg font-semibold"><History className="size-5" aria-hidden="true" />Historia zgłoszeń i decyzji</h2><Button variant="outline" size="sm" disabled={loading || pending} onClick={() => setRefresh(value => value + 1)}><RefreshCw className="size-4" aria-hidden="true" />Odśwież historię</Button></div>
        <p className="text-sm text-muted-foreground">Zgłoszenia, decyzje administratora i archiwizacja tego szkolenia. Uzasadnienia odzwierciedlają zapis w chwili decyzji.</p>
        {loading && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden="true" />Wczytywanie historii…</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {!loading && !error && page.items.length === 0 && <p className="text-sm text-muted-foreground">Brak zapisanych zgłoszeń i decyzji.</p>}
        {page.items.length > 0 && <ol className="divide-y divide-border">{page.items.map(item => <li key={item.id} className="space-y-2 py-4 first:pt-0 last:pb-0">
            <p className="font-medium">{label(item)}</p>
            <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground"><time dateTime={item.createdAt}>{date(item.createdAt)} (Europe/Warsaw)</time><span>{item.actorName || 'Osoba nieustalona w historii'}</span>{item.versionNumber !== null && <span>Wersja {item.versionNumber}</span>}</p>
            {item.reason && <p className="whitespace-pre-wrap break-words rounded-lg bg-muted/40 p-3 text-sm">{item.reason}</p>}
            {item.submissionId ? <p className="break-all text-xs text-muted-foreground">Zgłoszenie: {item.submissionId}</p> : !['COURSE_ARCHIVED', 'LEGACY_COURSE_REVIEWED'].includes(item.action) && <p className="text-xs text-muted-foreground">Brak identyfikatora zgłoszenia w historycznym wpisie.</p>}
        </li>)}</ol>}
        {page.nextCursor && <Button variant="outline" disabled={pending || loading} onClick={loadMore}>{pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}Wczytaj starsze decyzje</Button>}
    </section>
}
