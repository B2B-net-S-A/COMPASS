import Link from 'next/link'
import { ArrowRight, Award, CalendarDays } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AcademyEmptyState } from './AcademyEmptyState'
import { COURSE_FORMAT_LABELS } from './catalog/catalog-filters'
import { sessionDate, sessionTime } from './sessions/session-format'
import { academyCertificateHref, academyCourseHref, academyResumeHref } from '@/lib/academy/navigation'
import type { MyEnrollmentsPage } from '@/lib/actions/course-learning'
import type { CourseEnrollmentWithProgress } from '@/lib/types/learning'
import type { AcademyMyRunOverview } from '@/lib/types/academy-sessions'

type Section = 'active' | 'completed' | 'revoked'

export function AcademyMyLearning({ enrollments, pagination, overview }: { enrollments: CourseEnrollmentWithProgress[]; pagination?: MyEnrollmentsPage; overview: AcademyMyRunOverview | undefined }) {
    const completed = enrollments.filter(enrollment => enrollment.completed_at && !enrollment.completion_revoked_at)
    const active = enrollments.filter(enrollment => !enrollment.completed_at && !enrollment.completion_revoked_at)
    const revoked = enrollments.filter(enrollment => !!enrollment.completion_revoked_at)
    const totals = pagination?.totals ?? { active: active.length, completed: completed.length, revoked: revoked.length }
    const pageSize = pagination?.pageSize ?? Math.max(enrollments.length, 1)
    const sectionPage = (section: Section) => section === 'active' ? pagination?.activePage ?? 1 : section === 'completed' ? pagination?.completedPage ?? 1 : pagination?.revokedPage ?? 1
    const pageHref = (section: Section, page: number) => {
        const params = new URLSearchParams({
            activePage: String(section === 'active' ? page : sectionPage('active')),
            completedPage: String(section === 'completed' ? page : sectionPage('completed')),
            revokedPage: String(section === 'revoked' ? page : sectionPage('revoked')),
            waitlistPage: String(overview?.waiting.page ?? 1),
        })
        return `/learning/moje?${params}`
    }
    const sectionNavigation = (section: Section) => {
        const total = totals[section]
        const page = sectionPage(section)
        const pageCount = Math.max(1, Math.ceil(total / pageSize))
        if (!pagination || (pageCount === 1 && page === 1)) return null
        return <nav aria-label={`Strony ${section === 'active' ? 'aktywnych szkoleń' : section === 'completed' ? 'ukończonych szkoleń' : 'unieważnionych ukończeń'}`} className="flex flex-wrap items-center gap-3 text-sm">
            {page > 1 ? <Button asChild size="sm" variant="outline"><Link href={pageHref(section, Math.min(page - 1, pageCount))}>Poprzednia strona</Link></Button> : <Button size="sm" variant="outline" disabled>Poprzednia strona</Button>}
            <span className="text-muted-foreground">Strona {page} z {pageCount} · łącznie {total}</span>
            {page < pageCount ? <Button asChild size="sm" variant="outline"><Link href={pageHref(section, page + 1)}>Następna strona</Link></Button> : <Button size="sm" variant="outline" disabled>Następna strona</Button>}
        </nav>
    }
    const waiting = overview?.waiting.items ?? []
    const waitlistTotal = overview?.waiting.total ?? 0
    const waitlistPage = overview?.waiting.page ?? 1
    const waitlistPageCount = Math.max(1, Math.ceil(waitlistTotal / (overview?.waiting.pageSize ?? 25)))
    const waitingHref = (page: number) => `/learning/moje?${new URLSearchParams({
        activePage: String(sectionPage('active')), completedPage: String(sectionPage('completed')),
        revokedPage: String(sectionPage('revoked')), waitlistPage: String(page),
    })}`
    const upcoming = overview?.upcoming
    if (!enrollments.length && overview === undefined) return <AcademyEmptyState variant="error" title="Nie udało się wczytać wszystkich zapisów" description="Odśwież stronę, aby sprawdzić terminy i listę rezerwową." />
    if (totals.active + totals.completed + totals.revoked === 0 && waitlistTotal === 0) return <AcademyEmptyState title="Wybierz pierwsze szkolenie" description="Po zapisie znajdziesz tutaj swój program, najbliższe spotkania i potwierdzone ukończenia." action={<Button asChild><Link href="/learning">Przeglądaj katalog<ArrowRight aria-hidden="true" /></Link></Button>} />
    return <div className="space-y-7">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">{[{ label: 'Aktywne zapisy', value: totals.active }, { label: 'Potwierdzone ukończenia', value: totals.completed }, { label: 'Na liście rezerwowej', value: overview === undefined ? '—' : waitlistTotal }].map(item => <div key={item.label} className="rounded-2xl border border-border bg-card p-5"><dt className="text-sm text-muted-foreground">{item.label}</dt><dd className="mt-1 text-3xl font-semibold tabular-nums">{item.value}</dd></div>)}</dl>
        {upcoming && <section aria-label="Najbliższe spotkanie" className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-primary/30 bg-primary/5 p-5"><div><p className="mb-1 flex items-center gap-2 text-sm text-primary"><CalendarDays aria-hidden="true" className="size-4" />Najbliższe spotkanie</p><h2 className="text-lg font-semibold">{upcoming.sessionTitle}</h2><p className="mt-1 text-sm text-muted-foreground">{sessionDate(upcoming.startsAt, upcoming.timeZone)}, {sessionTime(upcoming.startsAt, upcoming.timeZone)} · {upcoming.timeZone}</p></div><Button asChild><Link href={`/learning/edycje/${upcoming.runId}`}>Otwórz spotkanie<ArrowRight aria-hidden="true" /></Link></Button></section>}
        {totals.revoked > 0 && <section className="space-y-3"><h2 className="text-lg font-semibold">Historia unieważnionych ukończeń</h2>{revoked.length ? revoked.map(enrollment => <article key={enrollment.enrollment_id} className="rounded-2xl border border-warning/30 bg-warning/5 p-5"><h3 className="font-semibold">{enrollment.course.title}</h3><p className="mt-2 text-sm">Ukończenie unieważniono {sessionDate(enrollment.completion_revoked_at!)}. Certyfikat jest niedostępny; to zaliczenie nie spełnia wymagań wstępnych kolejnych szkoleń.</p>{enrollment.completion_revoked_reason && <p className="mt-2 text-sm text-muted-foreground">Powód: {enrollment.completion_revoked_reason}</p>}</article>) : <p className="text-sm text-muted-foreground">Brak ukończeń na tej stronie.</p>}{sectionNavigation('revoked')}</section>}
        {waitlistTotal > 0 && <section className="space-y-3"><h2 className="text-lg font-semibold">Lista rezerwowa ({waitlistTotal})</h2>{waiting.length ? waiting.map(run => <article key={run.runId} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-card p-5"><div><h3 className="font-semibold">{run.courseTitle}</h3><p className="mt-1 text-sm text-muted-foreground">{run.runTitle} · Oczekujesz na wolne miejsce. Zapis nie jest jeszcze potwierdzony.</p></div><Button asChild variant="outline"><Link href={`/learning/edycje/${run.runId}`}>Szczegóły i rezygnacja</Link></Button></article>) : <p className="text-sm text-muted-foreground">Brak rezerwacji na tej stronie.</p>}{waitlistPageCount > 1 && <nav aria-label="Strony listy rezerwowej" className="flex flex-wrap items-center gap-3 text-sm">{waitlistPage > 1 ? <Button asChild size="sm" variant="outline"><Link href={waitingHref(Math.min(waitlistPage - 1, waitlistPageCount))}>Poprzednia strona</Link></Button> : <Button size="sm" variant="outline" disabled>Poprzednia strona</Button>}<span className="text-muted-foreground">Strona {waitlistPage} z {waitlistPageCount} · łącznie {waitlistTotal}</span>{waitlistPage < waitlistPageCount ? <Button asChild size="sm" variant="outline"><Link href={waitingHref(waitlistPage + 1)}>Następna strona</Link></Button> : <Button size="sm" variant="outline" disabled>Następna strona</Button>}</nav>}</section>}
        {([{ key: 'active', title: 'Do rozpoczęcia i w trakcie', rows: active }, { key: 'completed', title: 'Ukończone i certyfikaty', rows: completed }] as const).map(section => totals[section.key] > 0 && <section key={section.key} className="space-y-3"><h2 className="text-lg font-semibold">{section.title} ({totals[section.key]})</h2>{section.rows.length ? section.rows.map(enrollment => <article key={enrollment.enrollment_id} className="rounded-2xl border border-border bg-card p-5"><div className="flex flex-col items-start justify-between gap-4 sm:flex-row"><div className="min-w-0 flex-1"><p className="text-xs text-muted-foreground">{COURSE_FORMAT_LABELS[enrollment.course.delivery_mode ?? 'self_paced']}{enrollment.course.version_number ? ` · wersja ${enrollment.course.version_number}` : ''}</p><h3 className="mt-1 break-words text-lg font-semibold">{enrollment.course.title}</h3>{enrollment.completed_at ? <p className="mt-2 text-sm text-success">Ukończono {sessionDate(enrollment.completed_at)}</p> : enrollment.total_lessons > 0 ? <div className="mt-3 space-y-2"><p className="text-sm text-muted-foreground">Materiały: {enrollment.completed_lessons.length}/{enrollment.total_lessons} lekcji. {enrollment.run_id ? 'Obecność i pozostałe warunki sprawdzisz w edycji.' : 'Pełne ukończenie wymaga spełnienia zasad programu.'}</p><div role="progressbar" aria-label={`Postęp: ${enrollment.course.title}`} aria-valuenow={enrollment.progress_percent} aria-valuemin={0} aria-valuemax={100} className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${enrollment.progress_percent}%` }} /></div></div> : <p className="mt-3 text-sm text-muted-foreground">Oczekuje na potwierdzenie obecności i spełnienie pozostałych zasad programu.</p>}</div><div className="flex flex-wrap gap-2">{enrollment.completed_at && <Button asChild variant="outline"><a href={academyCertificateHref(enrollment.course.id, enrollment.enrollment_id)}><Award aria-hidden="true" />Certyfikat</a></Button>}<Button asChild variant={enrollment.completed_at ? 'outline' : 'default'}><Link href={enrollment.completed_at ? (enrollment.run_id ? `/learning/edycje/${enrollment.run_id}` : academyCourseHref(enrollment.course.slug, enrollment.enrollment_id)) : academyResumeHref(enrollment)}>{enrollment.completed_at ? 'Wróć do szkolenia' : enrollment.run_id ? 'Otwórz edycję' : enrollment.last_accessed_at ? 'Kontynuuj' : 'Rozpocznij'}<ArrowRight aria-hidden="true" /></Link></Button></div></div></article>) : <p className="text-sm text-muted-foreground">Brak szkoleń na tej stronie.</p>}{sectionNavigation(section.key)}</section>)}
    </div>
}
