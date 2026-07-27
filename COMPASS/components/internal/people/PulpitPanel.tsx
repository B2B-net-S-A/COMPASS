import type { ReactNode } from 'react'
import Link from 'next/link'
import {
    UserPlus,
    LogOut,
    Inbox,
    AlertTriangle,
    ChevronLeft,
    ChevronRight,
    ArrowRight,
    CalendarDays,
} from 'lucide-react'
import { getPeopleOpsMonthlySummary, type PeopleOpsMonthlySummary } from '@/lib/actions/people-ops'

interface Props {
    year: number
    month: number
}

const MONTHS_PL = [
    'styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec',
    'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień',
]

function monthLabel(year: number, month: number): string {
    return `${MONTHS_PL[month - 1]} ${year}`
}

function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
    const idx = (year * 12 + (month - 1)) + delta
    return { year: Math.floor(idx / 12), month: (idx % 12) + 1 }
}

function pulpitHref(year: number, month: number): string {
    return `/internal/people?tab=pulpit&year=${year}&month=${month}`
}

export async function PulpitPanel({ year, month }: Props) {
    let summary: PeopleOpsMonthlySummary
    try {
        summary = await getPeopleOpsMonthlySummary(year, month)
    } catch {
        return (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
                Nie udało się policzyć podsumowania People Ops. Odśwież stronę lub spróbuj później.
            </div>
        )
    }

    const prev = shiftMonth(year, month, -1)
    const next = shiftMonth(year, month, 1)
    const { onboarding, exit, cases, hasAnyData, latestActivityMonth, processes, attention } = summary

    const ctrExitDueNet = Math.max(0, exit.contractor.departures - exit.contractor.conversions)

    return (
        <section className="space-y-6">
            {/* Month navigation */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                    <CalendarDays className="h-4 w-4 text-muted-foreground" />
                    <span className="font-semibold capitalize">{monthLabel(year, month)}</span>
                </div>
                <div className="flex items-center gap-1">
                    {/* Kafel „Exit interviews" jest sam Linkiem, więc skrót do rozbicia zejść
                        (wg powodów / klienta / rekrutera) mieszka tutaj, nie w środku kafla. */}
                    <Link
                        href="/internal/people?tab=analityka&period=month"
                        className="mr-2 text-xs font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground"
                    >
                        Analityka zejść
                    </Link>
                    <Link
                        href={pulpitHref(prev.year, prev.month)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        aria-label="Poprzedni miesiąc"
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </Link>
                    <Link
                        href={pulpitHref(next.year, next.month)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        aria-label="Następny miesiąc"
                    >
                        <ChevronRight className="h-4 w-4" />
                    </Link>
                </div>
            </div>

            {/* Empty-state hint (≠ error): distinguishes "nothing happened" from "metric broken" */}
            {!hasAnyData && (
                <div className="rounded-lg border border-amber-300/50 bg-amber-50 dark:bg-amber-950/20 p-4 text-sm text-amber-800 dark:text-amber-300">
                    Brak aktywności onboarding/exit w tym miesiącu.
                    {latestActivityMonth && (latestActivityMonth.year !== year || latestActivityMonth.month !== month) && (
                        <>
                            {' '}Ostatni miesiąc z danymi:{' '}
                            <Link
                                href={pulpitHref(latestActivityMonth.year, latestActivityMonth.month)}
                                className="font-semibold underline underline-offset-2"
                            >
                                {monthLabel(latestActivityMonth.year, latestActivityMonth.month)}
                            </Link>
                            .
                        </>
                    )}
                </div>
            )}

            {/* 3 north-star tiles */}
            <div className="grid gap-4 md:grid-cols-3">
                {/* Tile 1 — Onboarding */}
                <KpiTile title="Onboarding" icon={<UserPlus className="h-4 w-4" />} href="/internal/people?tab=onboarding">
                    <MetricRow label="Pracownicy" due={onboarding.employee.due} done={onboarding.employee.done} />
                    <MetricRow label="Kontraktorzy" due={onboarding.contractor.due} done={onboarding.contractor.done} />
                    {onboarding.contractor.cancelled > 0 && (
                        <p className="text-[11px] text-muted-foreground line-through decoration-muted-foreground/50">
                            {onboarding.contractor.cancelled} anulowanych placementów (poza należnymi)
                        </p>
                    )}
                </KpiTile>

                {/* Tile 2 — Exit interviews (due = COALESCE(termination_date, scheduled_for) per rekord) */}
                <KpiTile title="Exit interviews" icon={<LogOut className="h-4 w-4" />} href="/internal/people?tab=exit">
                    <MetricRow
                        label="Pracownicy"
                        due={exit.employee.due}
                        done={exit.employee.done}
                        note={
                            exit.employee.dueFallbackScheduled > 0
                                ? `w tym ${exit.employee.dueFallbackScheduled} wg zaplanowania — brak termination_date`
                                : undefined
                        }
                    />
                    {/* Kontraktorzy: departures vs interviews = dwie niezależne liczby (brak FK), nie ratio */}
                    <div className="flex items-baseline justify-between gap-2 py-1">
                        <span className="text-sm text-muted-foreground">Kontraktorzy</span>
                        <span className="text-sm tabular-nums">
                            <span className="font-semibold text-foreground">{ctrExitDueNet}</span>
                            <span className="text-muted-foreground"> zejść · </span>
                            <span className="font-semibold text-foreground">{exit.contractor.done}</span>
                            <span className="text-muted-foreground"> wywiadów</span>
                        </span>
                    </div>
                    {exit.contractor.conversions > 0 && (
                        <p className="text-[11px] text-muted-foreground">
                            +{exit.contractor.conversions} konwersji (kontraktor→pracownik, poza odejściami)
                        </p>
                    )}
                </KpiTile>

                {/* Tile 3 — Bieżące sprawy */}
                <KpiTile title="Bieżące sprawy" icon={<Inbox className="h-4 w-4" />} href="/internal/people?tab=sprawy">
                    <div className="flex items-baseline justify-between gap-2 py-1">
                        <span className="text-sm text-muted-foreground">Otwarte</span>
                        <span className="text-2xl font-bold tabular-nums text-foreground">{cases.open}</span>
                    </div>
                    <div className="flex items-baseline justify-between gap-2 py-1">
                        <span className="text-sm text-muted-foreground">Nieprzypisane</span>
                        <span className="text-sm font-semibold tabular-nums text-foreground">{cases.unassigned}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">Skrzynka administracja@ (zakres = kanban Spraw)</p>
                </KpiTile>
            </div>

            {/* Aktywne procesy (informacja) osobno od braków danych (alert) — audyt P1.5 */}
            <ProcessesCard processes={processes} />
            <AttentionList attention={attention} />
        </section>
    )
}

function KpiTile({
    title,
    icon,
    href,
    children,
}: {
    title: string
    icon: ReactNode
    href: string
    children: ReactNode
}) {
    return (
        <Link
            href={href}
            className="group flex flex-col gap-1 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
        >
            <div className="mb-1 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <span className="text-muted-foreground">{icon}</span>
                    {title}
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
            {children}
        </Link>
    )
}

function MetricRow({ label, due, done, note }: { label: string; due: number; done: number; note?: string }) {
    return (
        <div className="flex items-baseline justify-between gap-2 py-1">
            <span className="text-sm text-muted-foreground">{label}</span>
            <span className="text-sm tabular-nums">
                <span className="text-muted-foreground">Należne </span>
                <span className="font-semibold text-foreground">{due}</span>
                <span className="text-muted-foreground"> · Zrobione </span>
                <span className="font-semibold text-foreground">{done}</span>
                {note && <span className="ml-1 text-[11px] text-amber-600 dark:text-amber-400">({note})</span>}
            </span>
        </div>
    )
}

/** Prawidłowo trwające procesy — neutralna informacja, nie alert (audyt P1.5). */
function ProcessesCard({ processes }: { processes: PeopleOpsProcesses }) {
    if (processes.activeOnboardings === 0 && processes.scheduledExits === 0) return null
    return (
        <div className="rounded-lg border border-border bg-card p-4">
            <div className="mb-2 text-sm font-semibold text-foreground">Aktywne procesy</div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
                <span>
                    <span className="font-semibold text-foreground tabular-nums">{processes.activeOnboardings}</span>{' '}
                    aktywnych onboardingów
                </span>
                <span>
                    <span className="font-semibold text-foreground tabular-nums">{processes.scheduledExits}</span>{' '}
                    zaplanowanych exit interviews
                </span>
            </div>
        </div>
    )
}

/** Wyłącznie braki/niespójności danych — normalny proces nie jest problemem. */
function AttentionList({ attention }: { attention: PeopleOpsAttention }) {
    const items: string[] = []
    if (attention.departuresWithoutDate > 0) {
        items.push(`${attention.departuresWithoutDate} zejść bez daty (poza licznikiem exitów)`)
    }
    if (attention.hrProfilesWithoutHiredAt > 0) {
        items.push(`${attention.hrProfilesWithoutHiredAt} pracowników bez daty zatrudnienia (poza licznikiem onboardingów)`)
    }
    if (attention.offboardingWithoutTerminationDate > 0) {
        items.push(`${attention.offboardingWithoutTerminationDate} offboardingów bez termination_date`)
    }

    if (items.length === 0) {
        return (
            <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
                Nic nie wymaga uzupełnienia. ✅
            </div>
        )
    }

    return (
        <div className="rounded-lg border border-border bg-card p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Wymaga uwagi / uzupełnienia
            </div>
            <ul className="space-y-1 text-sm text-muted-foreground">
                {items.map((it) => (
                    <li key={it} className="flex items-start gap-2">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-500" />
                        {it}
                    </li>
                ))}
            </ul>
        </div>
    )
}

interface PeopleOpsProcesses {
    activeOnboardings: number
    scheduledExits: number
}

interface PeopleOpsAttention {
    offboardingWithoutTerminationDate: number
    departuresWithoutDate: number
    hrProfilesWithoutHiredAt: number
}
