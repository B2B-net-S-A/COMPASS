'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowRight, CalendarDays, Plus, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { AcademyOrganizerDTO, AcademyRunDTO } from '@/lib/types/academy-sessions'
import type { AcademyStaffPerson } from '@/lib/types/academy-staff'
import { AcademyNewRunForm } from './AcademyNewRunForm'
import { AcademyEmptyState } from '../AcademyEmptyState'
import { RUN_STATUS_LABEL, sessionDate } from './session-format'

export function AcademyRunList({ runs, courseId, versionId, canCreate = true, page, hasMore, trainers = [], organizers = [], managedTeamsAvailable = false, managedTeamsReason }: { canCreate?: boolean; runs: AcademyRunDTO[]; courseId: string; versionId: string | null; page: number; hasMore: boolean; trainers?: AcademyStaffPerson[]; organizers?: AcademyOrganizerDTO[]; managedTeamsAvailable?: boolean; managedTeamsReason?: string }) {
    const [open, setOpen] = useState(false)
    const [isPending, setPending] = useState(false)
    return <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><p className="max-w-xl text-sm text-muted-foreground">Każda edycja ma własną grupę, limit miejsc i terminy. Nowa edycja korzysta z aktualnej zatwierdzonej wersji materiałów.</p>{canCreate && <Button disabled={!versionId} onClick={() => setOpen(true)}><Plus aria-hidden="true" />Nowa edycja</Button>}</div>
        {!versionId && <p className="rounded-xl border border-warning/30 bg-warning/5 p-4 text-sm text-warning">Najpierw prześlij program szkolenia do akceptacji. Edycje można tworzyć dla opublikowanej wersji.</p>}
        {runs.length === 0 ? <AcademyEmptyState title="To szkolenie nie ma jeszcze edycji" description="Utwórz edycję, dodaj spotkania i przygotuj linki Teams. Administrator zatwierdzi terminy przed otwarciem zapisów." /> : <div className="space-y-3">{runs.map((run) => <Link key={run.id} href={`/learning/edycje/${run.id}`} className="group flex flex-col justify-between gap-4 rounded-2xl border border-border bg-card p-5 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-center"><div className="space-y-2"><div className="flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">{RUN_STATUS_LABEL[run.status]}</span><span className="py-1 text-muted-foreground">Wersja {run.versionNumber}</span></div><h2 className="text-lg font-semibold group-hover:text-primary">{run.title}</h2><p className="flex flex-wrap gap-4 text-sm text-muted-foreground"><span className="inline-flex items-center gap-1.5"><Users aria-hidden="true" className="size-4" />{run.confirmedCount}/{run.capacity} miejsc</span><span className="inline-flex items-center gap-1.5"><CalendarDays aria-hidden="true" className="size-4" />{run.sessions.length ? `${run.sessions.length} spotkań · od ${sessionDate(run.sessions[0].startsAt, run.sessions[0].timeZone)}` : 'Dodaj pierwsze spotkanie'}</span></p></div><span className="inline-flex items-center gap-2 text-sm font-medium text-primary">Zarządzaj<ArrowRight aria-hidden="true" className="size-4" /></span></Link>)}</div>}
        {(page > 1 || hasMore) && <nav aria-label="Strony edycji" className="flex items-center justify-between gap-3">{page > 1 ? <Button asChild variant="outline"><Link href={page === 2 ? `/learning/tworze/${courseId}/edycje` : `/learning/tworze/${courseId}/edycje?page=${page - 1}`}>Poprzednie</Link></Button> : <span />}<span className="text-sm text-muted-foreground">Strona {page}</span>{hasMore ? <Button asChild variant="outline"><Link href={`/learning/tworze/${courseId}/edycje?page=${page + 1}`}>Następne</Link></Button> : <span />}</nav>}
        <Dialog open={open} onOpenChange={(value) => { if (!isPending) setOpen(value) }}><DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>Nowa edycja szkolenia</DialogTitle><DialogDescription>Edycja korzysta z opublikowanej wersji programu i pozostanie szkicem do zatwierdzenia przez administratora.</DialogDescription></DialogHeader>{versionId && <AcademyNewRunForm courseId={courseId} versionId={versionId} defaultCapacity={runs[0]?.capacity ?? 20} trainers={trainers} organizers={organizers} managedTeamsAvailable={managedTeamsAvailable} managedTeamsReason={managedTeamsReason} onCancel={() => setOpen(false)} onPendingChange={setPending} />}</DialogContent></Dialog>
    </div>
}
