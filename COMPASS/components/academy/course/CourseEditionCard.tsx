import Link from 'next/link'
import { CalendarDays, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { REGISTRATION_LABEL } from '@/components/academy/sessions/session-format'
import { runRegistrationOffer } from '@/lib/academy/registration'
import type { AcademyRunDTO } from '@/lib/types/academy-sessions'
import { CourseEditionSignup } from './CourseEditionSignup'
import { editionDateParts } from './course-card-model'

function seatsLabel(run: AcademyRunDTO): string {
    const free = Math.max(0, run.capacity - run.confirmedCount)
    if (free === 0) return run.waitlistCount > 0 ? `Komplet miejsc, na liście rezerwowej: ${run.waitlistCount}` : 'Komplet miejsc, zapis trafi na listę rezerwową'
    return `${run.confirmedCount} zapisanych z ${run.capacity}, wolne miejsca: ${free}`
}

export function CourseEditionCard({ run, failed, courseId, prerequisitesMet, now }: { run: AcademyRunDTO | null; failed?: boolean; courseId: string; prerequisitesMet: boolean; now: string }) {
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
    const next = sessions.find(session => Date.parse(session.endsAt) >= Date.parse(now)) ?? sessions[0]
    const date = next ? editionDateParts(next) : null
    const registered = run.myRegistration && run.myRegistration.status !== 'cancelled' ? run.myRegistration.status : null
    const confirmed = registered === 'confirmed'
    const offer = runRegistrationOffer(run, now, prerequisitesMet)
    const full = run.confirmedCount >= run.capacity
    const percent = Math.min(100, Math.round((run.confirmedCount / run.capacity) * 100))
    const heading = registered ? 'Twoja edycja' : 'Najbliższa edycja'
    const nextOpen = next && Date.parse(next.endsAt) >= Date.parse(now)

    return <section aria-label={heading} className="space-y-4 rounded-xl border border-primary/30 bg-card p-5">
        <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">{heading}</h2>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs ${registered || !full ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>{registered ? REGISTRATION_LABEL[registered] : !offer.open ? 'Zapisy zamknięte' : offer.waitlist ? 'Lista rezerwowa' : 'Otwarte zapisy'}</span>
        </div>
        {date && <div className="flex items-center gap-3">
            <div className="w-[68px] shrink-0 rounded-lg border border-border py-2 text-center"><div className="text-xs font-semibold text-primary">{date.month}</div><div className="text-xl font-semibold leading-tight">{date.day}</div><div className="text-xs text-muted-foreground">{date.year}</div></div>
            <div className="min-w-0 space-y-1"><p className="font-medium">{date.weekday}, {date.time}</p><p className="text-sm text-muted-foreground">{run.title}{sessions.length > 1 ? `, spotkań: ${sessions.length}` : ''}</p></div>
        </div>}
        {!confirmed && <div className="space-y-1">
            <div className="h-1.5 overflow-hidden rounded-full bg-primary/10" role="progressbar" aria-label="Zajęte miejsca" aria-valuemin={0} aria-valuemax={run.capacity} aria-valuenow={Math.min(run.confirmedCount, run.capacity)}><div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} /></div>
            <p className="text-sm text-muted-foreground">{seatsLabel(run)}</p>
        </div>}
        {confirmed && nextOpen && <div className="space-y-2">
            {next.joinUrl ? <Button asChild className="w-full"><a href={next.joinUrl} target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden="true" />Dołącz do Teams</a></Button> : <p className="text-sm text-muted-foreground">Link do spotkania jest przygotowywany.</p>}
            {next.mode === 'external_link' && <Button asChild variant="outline" className="w-full"><a href={`/api/academy/sessions/${next.id}/calendar`}><CalendarDays aria-hidden="true" />Pobierz plik kalendarza</a></Button>}
        </div>}
        {registered === 'waitlisted' && <p className="text-sm text-muted-foreground">Jesteś na liście rezerwowej. Link do Teams i plik kalendarza dostaniesz po potwierdzeniu miejsca.</p>}
        {!registered && offer.open && <CourseEditionSignup runId={run.id} waitlist={offer.waitlist} />}
        {!registered && !offer.open && offer.reason && <p className="text-sm text-muted-foreground">{offer.reason}</p>}
        <p className="text-center text-sm">{registered
            ? <Link href={`/learning/edycje/${run.id}`} className="text-primary underline-offset-4 hover:underline">Szczegóły edycji i rezygnacja</Link>
            : <Link href={calendarHref} className="text-primary underline-offset-4 hover:underline">Zobacz inne terminy</Link>}</p>
    </section>
}
