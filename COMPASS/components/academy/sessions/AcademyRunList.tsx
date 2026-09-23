'use client'

import { useState } from 'react'
import { useAcademyAction } from '@/components/academy/useAcademyAction'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, CalendarDays, Loader2, Plus, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { createAcademyRun } from '@/lib/actions/academy-sessions'
import type { AcademyRunDTO } from '@/lib/types/academy-sessions'
import { AcademyEmptyState } from '../AcademyEmptyState'
import { RUN_STATUS_LABEL, sessionDate } from './session-format'

export function AcademyRunList({ runs, courseId, versionId, canCreate = true, page, hasMore }: { canCreate?: boolean; runs: AcademyRunDTO[]; courseId: string; versionId: string | null; page: number; hasMore: boolean }) {
    const router = useRouter()
    const [open, setOpen] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [isPending, startTransition] = useAcademyAction()
    function create(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault()
        if (!versionId) return
        const data = new FormData(event.currentTarget)
        setError(null)
        startTransition(async () => {
            try {
                const result = await createAcademyRun({ courseId, versionId, title: String(data.get('title') ?? '').trim(), capacity: Number(data.get('capacity')) })
                if (!result.success) { setError(result.error); return }
                setOpen(false)
                router.push(`/learning/edycje/${result.data}`)
            } catch { setError('Nie udało się utworzyć edycji. Spróbuj ponownie.') }
        })
    }
    return <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><p className="max-w-xl text-sm text-muted-foreground">Każda edycja ma własną grupę, limit miejsc i terminy. Nowa edycja korzysta z aktualnej zatwierdzonej wersji materiałów.</p>{canCreate && <Button disabled={!versionId} onClick={() => { setError(null); setOpen(true) }}><Plus aria-hidden="true" />Nowa edycja</Button>}</div>
        {!versionId && <p className="rounded-xl border border-warning/30 bg-warning/5 p-4 text-sm text-warning">Najpierw prześlij program szkolenia do akceptacji. Edycje można tworzyć dla opublikowanej wersji.</p>}
        {runs.length === 0 ? <AcademyEmptyState title="To szkolenie nie ma jeszcze edycji" description="Utwórz edycję, dodaj spotkania i przygotuj linki Teams. Administrator zatwierdzi terminy przed otwarciem zapisów." /> : <div className="space-y-3">{runs.map((run) => <Link key={run.id} href={`/learning/edycje/${run.id}`} className="group flex flex-col justify-between gap-4 rounded-2xl border border-border bg-card p-5 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-center"><div className="space-y-2"><div className="flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">{RUN_STATUS_LABEL[run.status]}</span><span className="py-1 text-muted-foreground">Wersja {run.versionNumber}</span></div><h2 className="text-lg font-semibold group-hover:text-primary">{run.title}</h2><p className="flex flex-wrap gap-4 text-sm text-muted-foreground"><span className="inline-flex items-center gap-1.5"><Users aria-hidden="true" className="size-4" />{run.confirmedCount}/{run.capacity} miejsc</span><span className="inline-flex items-center gap-1.5"><CalendarDays aria-hidden="true" className="size-4" />{run.sessions.length ? `${run.sessions.length} spotkań · od ${sessionDate(run.sessions[0].startsAt, run.sessions[0].timeZone)}` : 'Dodaj pierwsze spotkanie'}</span></p></div><span className="inline-flex items-center gap-2 text-sm font-medium text-primary">Zarządzaj<ArrowRight aria-hidden="true" className="size-4" /></span></Link>)}</div>}
        {(page > 1 || hasMore) && <nav aria-label="Strony edycji" className="flex items-center justify-between gap-3">{page > 1 ? <Button asChild variant="outline"><Link href={page === 2 ? `/learning/tworze/${courseId}/edycje` : `/learning/tworze/${courseId}/edycje?page=${page - 1}`}>Poprzednie</Link></Button> : <span />}<span className="text-sm text-muted-foreground">Strona {page}</span>{hasMore ? <Button asChild variant="outline"><Link href={`/learning/tworze/${courseId}/edycje?page=${page + 1}`}>Następne</Link></Button> : <span />}</nav>}
        <Dialog open={open} onOpenChange={(value) => { if (!isPending) setOpen(value) }}><DialogContent><DialogHeader><DialogTitle>Nowa edycja szkolenia</DialogTitle><DialogDescription>Terminy dodasz w kolejnym kroku. Edycja pozostanie szkicem do zatwierdzenia przez administratora.</DialogDescription></DialogHeader><form onSubmit={create} className="space-y-4"><div className="space-y-2"><label htmlFor="academy-run-title" className="text-sm font-medium">Nazwa edycji</label><Input id="academy-run-title" name="title" required minLength={3} maxLength={200} placeholder="np. Grupa październikowa" disabled={isPending} /></div><div className="space-y-2"><label htmlFor="academy-run-capacity" className="text-sm font-medium">Liczba miejsc</label><Input id="academy-run-capacity" name="capacity" type="number" required min={1} max={500} step={1} defaultValue={20} disabled={isPending} /></div>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>Anuluj</Button><Button type="submit" disabled={isPending}>{isPending && <Loader2 className="animate-spin" aria-hidden="true" />}Utwórz edycję</Button></div></form></DialogContent></Dialog>
    </div>
}
