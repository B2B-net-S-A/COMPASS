import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { REGISTRATION_LABEL } from '@/components/academy/sessions/session-format'
import type { AcademyRunDTO } from '@/lib/types/academy-sessions'
import { editionDateParts } from './course-card-model'

function seatsLabel(run: AcademyRunDTO): string {
    const free = Math.max(0, run.capacity - run.confirmedCount)
    if (free === 0) return run.waitlistCount > 0 ? `Komplet miejsc, na liście rezerwowej: ${run.waitlistCount}` : 'Komplet miejsc, zapis trafi na listę rezerwową'
    return `${run.confirmedCount} zapisanych z ${run.capacity}, wolne miejsca: ${free}`
}

export function CourseEditionCard({ run, failed, courseId }: { run: AcademyRunDTO | null; failed?: boolean; courseId: string }) {
    const calendarHref = `/learning/kalendarz?course=${encodeURIComponent(courseId)}`
    if (failed) return <section aria-label="Najbliższa edycja" className="space-y-2 rounded-xl border border-warning/30 bg-warning/5 p-5 text-sm">
        <h2 className="font-semibold">Najbliższa edycja</h2>
        <p role="alert">Nie udało się wczytać terminów. Odśwież stronę albo sprawdź kalendarz.</p>
        <Button asChild variant="outline" className="w-full"><Link href={calendarHref}>Otwórz kalendarz</Link></Button>
    </section>
    if (!run) return <section aria-label="Najbliższa edycja" className="space-y-3 rounded-xl border border-border bg-card p-5 text-sm">
        <h2 className="font-semibold">Najbliższa edycja</h2>
        <p className="text-muted-foreground">Nie ma teraz otwartego terminu tego szkolenia. Nowe edycje pojawią się w kalendarzu.</p>
        <Button asChild variant="outline" className="w-full"><Link href={calendarHref}>Otwórz kalendarz</Link></Button>
    </section>

    const sessions = run.sessions.filter(session => session.status !== 'cancelled').sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
    const first = sessions[0]
    const date = first ? editionDateParts(first) : null
    const registered = run.myRegistration && run.myRegistration.status !== 'cancelled' ? run.myRegistration.status : null
    const full = run.confirmedCount >= run.capacity
    const percent = Math.min(100, Math.round((run.confirmedCount / run.capacity) * 100))

    return <section aria-label="Najbliższa edycja" className="space-y-4 rounded-xl border border-primary/30 bg-card p-5">
        <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">Najbliższa edycja</h2>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs ${registered || !full ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>{registered ? REGISTRATION_LABEL[registered] : full ? 'Lista rezerwowa' : 'Otwarte zapisy'}</span>
        </div>
        {date && <div className="flex items-center gap-3">
            <div className="w-[68px] shrink-0 rounded-lg border border-border py-2 text-center"><div className="text-xs font-semibold text-primary">{date.month}</div><div className="text-xl font-semibold leading-tight">{date.day}</div><div className="text-xs text-muted-foreground">{date.year}</div></div>
            <div className="min-w-0 space-y-1"><p className="font-medium">{date.weekday}, {date.time}</p><p className="text-sm text-muted-foreground">{run.title}{sessions.length > 1 ? `, spotkań: ${sessions.length}` : ''}</p></div>
        </div>}
        <div className="space-y-1">
            <div className="h-1.5 overflow-hidden rounded-full bg-primary/10" role="progressbar" aria-label="Zajęte miejsca" aria-valuemin={0} aria-valuemax={run.capacity} aria-valuenow={Math.min(run.confirmedCount, run.capacity)}><div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} /></div>
            <p className="text-sm text-muted-foreground">{seatsLabel(run)}</p>
        </div>
        <Button asChild className="w-full"><Link href={`/learning/edycje/${run.id}`}>{registered ? 'Otwórz edycję' : full ? 'Dołącz do listy rezerwowej' : 'Zapisz się'}</Link></Button>
        {!registered && <p className="text-center text-xs text-muted-foreground">Po zapisie dostaniesz link do Teams i plik kalendarza</p>}
        <p className="text-center text-sm"><Link href={`/learning/kalendarz?course=${encodeURIComponent(courseId)}`} className="text-primary underline-offset-4 hover:underline">Zobacz inne terminy</Link></p>
    </section>
}
