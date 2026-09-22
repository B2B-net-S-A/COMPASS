'use client'

import { useId, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight, Clock3, List, Video } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { AcademyEmptyState } from '../AcademyEmptyState'
import type { AcademyRunDTO } from '@/lib/types/academy-sessions'
import { REGISTRATION_LABEL, RUN_STATUS_LABEL, sessionDate, sessionTime } from './session-format'
import { ACADEMY_CALENDAR_ZONE, calendarDay, calendarMonthDays, calendarSessions, shiftCalendarMonth } from './calendar-model'

const WEEKDAYS = ['Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota', 'Niedziela']

export function AcademyCalendar({ runs, now }: { runs: AcademyRunDTO[]; now: string }) {
    const headingId = useId()
    const today = calendarDay(now)
    const [month, setMonth] = useState(today.slice(0, 7))
    const [mine, setMine] = useState(false)
    const [list, setList] = useState(false)
    const sessions = calendarSessions(runs, month, mine)
    const days = calendarMonthDays(month)
    const label = new Intl.DateTimeFormat('pl-PL', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T12:00:00Z`))
    const weeks = Array.from({ length: days.length / 7 }, (_, index) => days.slice(index * 7, index * 7 + 7))

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2" role="group" aria-label="Zakres kalendarza">
                    <Button variant={!mine ? 'default' : 'outline'} aria-pressed={!mine} onClick={() => setMine(false)} className="rounded-full">Wszystkie spotkania</Button>
                    <Button variant={mine ? 'default' : 'outline'} aria-pressed={mine} onClick={() => setMine(true)} className="rounded-full">Moje zapisy</Button>
                </div>
                <div className="hidden gap-1 md:flex" role="group" aria-label="Widok kalendarza">
                    <Button variant={!list ? 'secondary' : 'ghost'} aria-pressed={!list} onClick={() => setList(false)}><CalendarDays aria-hidden="true" />Miesiąc</Button>
                    <Button variant={list ? 'secondary' : 'ghost'} aria-pressed={list} onClick={() => setList(true)}><List aria-hidden="true" />Lista</Button>
                </div>
            </div>
            <section aria-labelledby={headingId} className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
                    <div><h2 id={headingId} className="text-lg font-semibold capitalize" aria-live="polite">{label}</h2><p className="text-xs text-muted-foreground">Strefa czasu: {ACADEMY_CALENDAR_ZONE} · spotkań: {sessions.length}</p></div>
                    <div className="flex items-center gap-1">
                        <Button variant="outline" size="icon" aria-label="Poprzedni miesiąc" onClick={() => setMonth(shiftCalendarMonth(month, -1))}><ChevronLeft aria-hidden="true" /></Button>
                        <Button variant="outline" onClick={() => setMonth(today.slice(0, 7))}>Dzisiaj</Button>
                        <Button variant="outline" size="icon" aria-label="Następny miesiąc" onClick={() => setMonth(shiftCalendarMonth(month, 1))}><ChevronRight aria-hidden="true" /></Button>
                    </div>
                </div>
                <div className={cn('overflow-hidden rounded-2xl border border-border bg-card', list ? 'hidden' : 'hidden md:block')}>
                    <table className="w-full table-fixed border-collapse">
                        <caption className="sr-only">Spotkania Akademii: {label}. Godziny w strefie {ACADEMY_CALENDAR_ZONE}.</caption>
                        <thead><tr>{WEEKDAYS.map((day) => <th key={day} scope="col" className="border-b border-border bg-muted/40 px-2 py-3 text-xs font-medium text-muted-foreground"><abbr title={day} className="no-underline">{day.slice(0, 3)}</abbr></th>)}</tr></thead>
                        <tbody>{weeks.map((week) => <tr key={week[0]}>{week.map((day) => {
                            const inMonth = day.startsWith(month)
                            const events = inMonth ? sessions.filter((item) => item.day === day) : []
                            return <td key={day} className={cn('h-32 border-b border-r border-border p-2 align-top last:border-r-0', !inMonth && 'bg-muted/20')}>
                                <time dateTime={day} aria-current={day === today ? 'date' : undefined} className={cn('mb-2 inline-flex size-7 items-center justify-center rounded-full text-xs', day === today ? 'bg-primary font-semibold text-primary-foreground' : !inMonth ? 'text-muted-foreground/50' : 'text-muted-foreground')}>{Number(day.slice(8))}</time>
                                <div className="space-y-1.5">{events.map(({ run, session }) => <Link key={session.id} href={`/learning/edycje/${run.id}`} className="block rounded-lg border border-primary/15 bg-primary/5 p-2 text-xs transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className="block font-semibold text-primary">{sessionTime(session.startsAt, ACADEMY_CALENDAR_ZONE)}</span><span className="mt-1 line-clamp-2 font-medium text-foreground">{session.title}</span><span className="mt-1 block truncate text-muted-foreground">{run.courseTitle}</span>{run.status === 'draft' && <span className="mt-1 block text-warning">Szkic</span>}{run.myRegistration && run.myRegistration.status !== 'cancelled' && <span className="mt-1 block text-primary">{REGISTRATION_LABEL[run.myRegistration.status]}</span>}</Link>)}</div>
                            </td>
                        })}</tr>)}</tbody>
                    </table>
                </div>
                {sessions.length === 0 ? <AcademyEmptyState title={mine ? 'Brak Twoich spotkań w tym miesiącu' : 'Brak spotkań w tym miesiącu'} description="Zmień miesiąc lub sprawdź szkolenia w katalogu. Nowe terminy pojawią się po zatwierdzeniu edycji." action={<Button asChild variant="outline"><Link href="/learning">Przejdź do katalogu</Link></Button>} /> : <div className={cn('space-y-3', !list && 'md:hidden')}>
                    {sessions.map(({ run, session }) => <Link key={session.id} href={`/learning/edycje/${run.id}`} className="group flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-center sm:gap-5">
                        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><CalendarDays aria-hidden="true" className="size-6" /></span>
                        <div className="min-w-0 flex-1 space-y-2">
                            <div className="flex flex-wrap items-center gap-2 text-xs"><span className="text-muted-foreground">{run.courseTitle}</span>{run.status === 'draft' && <span className="rounded-full bg-warning/10 px-2 py-1 text-warning">{RUN_STATUS_LABEL.draft}</span>}{run.myRegistration && run.myRegistration.status !== 'cancelled' && <span className="rounded-full bg-primary/10 px-2 py-1 text-primary">{REGISTRATION_LABEL[run.myRegistration.status]}</span>}</div>
                            <h3 className="font-semibold group-hover:text-primary">{session.title}</h3>
                            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground"><span>{sessionDate(session.startsAt, ACADEMY_CALENDAR_ZONE)}</span><span className="inline-flex items-center gap-1.5"><Clock3 aria-hidden="true" className="size-3.5" />{sessionTime(session.startsAt, ACADEMY_CALENDAR_ZONE)}–{sessionTime(session.endsAt, ACADEMY_CALENDAR_ZONE)}</span></p>
                            {session.timeZone !== ACADEMY_CALENDAR_ZONE && <p className="text-xs text-muted-foreground">U prowadzącego: {sessionDate(session.startsAt, session.timeZone)}, {sessionTime(session.startsAt, session.timeZone)} ({session.timeZone})</p>}
                        </div>
                        <div className="flex items-center justify-between gap-4 text-sm sm:flex-col sm:items-end"><span className="inline-flex items-center gap-1.5 text-muted-foreground"><Video aria-hidden="true" className="size-4" />Teams</span><span className="inline-flex items-center gap-1 font-medium text-primary">Zobacz edycję<ArrowRight aria-hidden="true" className="size-4" /></span></div>
                    </Link>)}
                </div>}
            </section>
        </div>
    )
}
