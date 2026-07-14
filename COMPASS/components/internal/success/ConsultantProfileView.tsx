import Link from 'next/link'
import {
    Activity,
    CalendarCheck,
    ClipboardCheck,
    HeartPulse,
    Mail,
    MapPin,
    MessageSquareText,
    Phone,
    UserRound,
} from 'lucide-react'
import { PageHeader } from '@/components/ds/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ClientFeedbackDialog, CreateTaskDialog, HealthStatusDialog, MonitoringControls, ScheduleCheckInDialog, SendPulseButton } from './SuccessActions'
import { CheckInStatusBadge, HealthBadge, MonitoringBadge, PriorityBadge, checkInTypeLabel, formatSuccessDate, isPastDue } from './SuccessBadges'
import { SuccessTaskList } from './SuccessTaskList'
import { SuccessEmptyState } from './SuccessStates'
import type { SuccessConsultantDetail, SuccessTimelineEventType } from '@/lib/types/consultant-success'

export type ConsultantProfileTab = 'overview' | 'timeline' | 'check-ins' | 'feedback' | 'actions'

const TAB_LABELS: Record<ConsultantProfileTab, string> = {
    overview: 'Podsumowanie',
    timeline: 'Timeline',
    'check-ins': 'Check-iny',
    feedback: 'Feedback klienta',
    actions: 'Action steps',
}

const EVENT_ICON: Record<SuccessTimelineEventType, typeof Activity> = {
    conversation: MessageSquareText,
    check_in: CalendarCheck,
    client_feedback: MessageSquareText,
    pulse: HeartPulse,
    task: ClipboardCheck,
    onboarding: UserRound,
    exit: UserRound,
    placement: MapPin,
    health: Activity,
}

export function ConsultantProfileView({ detail, tab, focusId }: { detail: SuccessConsultantDetail; tab: ConsultantProfileTab; focusId?: string }) {
    const { consultant, monitoring, health, tcmOptions } = detail
    const basePath = `/internal/people/success/consultants/${consultant.contractorId}`

    const counts: Partial<Record<ConsultantProfileTab, number>> = {
        timeline: detail.timeline.length,
        'check-ins': detail.checkIns.length,
        feedback: detail.feedback.length,
        actions: detail.tasks.filter((task) => task.status !== 'done' && task.status !== 'cancelled').length,
    }

    return (
        <main className="space-y-6">
            <PageHeader
                eyebrow="Prywatny profil TCM"
                title={consultant.fullName}
                description={[consultant.currentPosition, consultant.currentClient].filter(Boolean).join(' · ') || 'Brak aktywnego placementu'}
                breadcrumb={[
                    { label: 'Consultant Success', href: '/internal/people/success' },
                    { label: 'Konsultanci', href: '/internal/people/success/consultants' },
                    { label: consultant.fullName },
                ]}
                actions={(
                    <div className="flex flex-wrap justify-end gap-2">
                        <ScheduleCheckInDialog consultant={consultant} />
                        <MonitoringControls consultant={consultant} monitoring={monitoring} tcmOptions={tcmOptions} />
                    </div>
                )}
            />

            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-4">
                <MonitoringBadge state={consultant.monitoringState} />
                <HealthBadge status={health.status} />
                {consultant.cadenceDays ? <Badge variant="outline">Kontakt co {consultant.cadenceDays} dni</Badge> : null}
                <span className="ml-auto text-xs text-muted-foreground">Opiekun: {consultant.ownerTcmName ?? 'nieprzypisany'}</span>
            </div>

            <nav aria-label="Sekcje profilu konsultanta" className="-mx-1 overflow-x-auto border-b border-border px-1">
                <div className="flex min-w-max gap-1">
                    {(Object.keys(TAB_LABELS) as ConsultantProfileTab[]).map((item) => (
                        <Link
                            key={item}
                            href={`${basePath}?tab=${item}`}
                            aria-current={tab === item ? 'page' : undefined}
                            className={cn('relative -mb-px inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium', tab === item ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground')}
                        >
                            {TAB_LABELS[item]}
                            {counts[item] !== undefined ? <Badge size="sm" variant={tab === item ? 'soft' : 'neutral'}>{counts[item]}</Badge> : null}
                        </Link>
                    ))}
                </div>
            </nav>

            {tab === 'overview' ? <Overview detail={detail} focusId={focusId} /> : null}
            {tab === 'timeline' ? <Timeline detail={detail} focusId={focusId} /> : null}
            {tab === 'check-ins' ? <CheckIns detail={detail} focusId={focusId} /> : null}
            {tab === 'feedback' ? <Feedback detail={detail} focusId={focusId} /> : null}
            {tab === 'actions' ? <Actions detail={detail} focusId={focusId} /> : null}
        </main>
    )
}

function Overview({ detail, focusId }: { detail: SuccessConsultantDetail; focusId?: string }) {
    const { consultant, monitoring, health } = detail
    const openTasks = detail.tasks.filter((task) => task.status !== 'done' && task.status !== 'cancelled')
    const latestPulse = detail.pulseResponses[0]
    const latestFeedback = detail.feedback[0]

    return (
        <div className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-3">
                <section id="focus-health" className={cn('scroll-mt-24 rounded-xl border border-border bg-card p-5 lg:col-span-2', focusId === 'health' && 'ring-2 ring-primary/40')}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status relacji</p><div className="mt-2"><HealthBadge status={health.status} /></div></div>
                        <HealthStatusDialog contractorId={consultant.contractorId} currentStatus={health.status} />
                    </div>
                    <p className="mt-4 whitespace-pre-wrap text-sm text-foreground">{health.reason ?? 'Status nie został jeszcze opisany przez TCM.'}</p>
                    <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                        <span>Ustawił(a): {health.setByName ?? '—'}</span>
                        <span>Data: {formatSuccessDate(health.setAt, true)}</span>
                        {health.reviewOn ? <span className={isPastDue(health.reviewOn) ? 'font-semibold text-destructive' : ''}>Przegląd: {formatSuccessDate(health.reviewOn)}</span> : null}
                    </div>
                    <p className="mt-4 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">To ręczna ocena relacji przez TCM — nie jest automatycznym wynikiem i nie jest widoczna dla konsultanta.</p>
                </section>

                <section className="rounded-xl border border-border bg-card p-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Kontakt</p>
                    <dl className="mt-4 space-y-3 text-sm">
                        <div className="flex gap-2"><Mail className="mt-0.5 h-4 w-4 text-muted-foreground" /><dd>{consultant.email ? <a href={`mailto:${consultant.email}`} className="hover:underline">{consultant.email}</a> : 'Brak e-maila'}</dd></div>
                        <div className="flex gap-2"><Phone className="mt-0.5 h-4 w-4 text-muted-foreground" /><dd>{consultant.phone ? <a href={`tel:${consultant.phone}`} className="hover:underline">{consultant.phone}</a> : 'Brak telefonu'}</dd></div>
                        <div className="flex gap-2"><UserRound className="mt-0.5 h-4 w-4 text-muted-foreground" /><dd>{consultant.ownerTcmName ?? 'Bez opiekuna TCM'}</dd></div>
                    </dl>
                </section>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
                <SummaryCard title="Rytm kontaktu" icon={CalendarCheck}>
                    <p className="text-2xl font-semibold">{monitoring?.state === 'active' ? `co ${monitoring.cadenceDays} dni` : 'Nieaktywny'}</p>
                    <p className="mt-2 text-sm text-muted-foreground">Ostatni kontakt: {formatSuccessDate(consultant.lastContactAt)}</p>
                    <p className={cn('text-sm text-muted-foreground', isPastDue(consultant.nextCheckInAt) && 'font-semibold text-destructive')}>Następny: {formatSuccessDate(consultant.nextCheckInAt)}</p>
                </SummaryCard>
                <SummaryCard title="Feedback klienta" icon={MessageSquareText}>
                    {latestFeedback ? <><p className="text-2xl font-semibold">{latestFeedback.averageScore.toFixed(1)} / 5</p><p className="mt-2 text-sm text-muted-foreground">{latestFeedback.clientName} · {formatSuccessDate(latestFeedback.feedbackDate)}</p></> : <p className="text-sm text-muted-foreground">Brak ustrukturyzowanego feedbacku.</p>}
                </SummaryCard>
                <SummaryCard title="Ostatni pulse" icon={HeartPulse}>
                    {latestPulse ? <><p className="text-2xl font-semibold">{latestPulse.overallScore.toFixed(0)}%</p><p className="mt-2 text-sm text-muted-foreground">Satysfakcja {latestPulse.satisfactionScore}/10 · zaangażowanie {latestPulse.engagementScore}/5</p></> : <p className="text-sm text-muted-foreground">Brak odpowiedzi pulse survey.</p>}
                </SummaryCard>
            </div>

            <section className="space-y-3">
                <div className="flex items-center justify-between"><div><h2 className="font-semibold">Otwarte action steps</h2><p className="text-sm text-muted-foreground">Najbliższe zobowiązania po rozmowach.</p></div><Button asChild variant="ghost" size="sm"><Link href={`?tab=actions`}>Wszystkie</Link></Button></div>
                <SuccessTaskList tasks={openTasks.slice(0, 4)} />
            </section>
        </div>
    )
}

function SummaryCard({ title, icon: Icon, children }: { title: string; icon: typeof Activity; children: React.ReactNode }) {
    return <section className="rounded-xl border border-border bg-card p-5"><div className="mb-4 flex items-center gap-2 text-sm font-semibold"><Icon className="h-4 w-4 text-muted-foreground" />{title}</div>{children}</section>
}

function Timeline({ detail, focusId }: { detail: SuccessConsultantDetail; focusId?: string }) {
    if (detail.timeline.length === 0) return <SuccessEmptyState title="Timeline jest pusty" description="Pierwsza rozmowa, check-in albo action step pojawi się tutaj automatycznie." />
    return (
        <ol className="relative ml-4 border-l border-border">
            {detail.timeline.map((event) => {
                const Icon = EVENT_ICON[event.type]
                const rawId = event.id.includes(':') ? event.id.slice(event.id.indexOf(':') + 1) : event.id
                const focused = focusId === event.id || focusId === rawId
                return (
                    <li key={`${event.type}-${event.id}`} id={`focus-${rawId}`} className={cn('relative ml-6 scroll-mt-24 pb-7', focused && 'rounded-lg bg-primary/5 p-4 ring-2 ring-primary/30')}>
                        <span className="absolute -left-[2.45rem] top-0 flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background"><Icon className="h-4 w-4 text-muted-foreground" /></span>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><h3 className="font-semibold">{event.title}</h3><p className="text-xs text-muted-foreground">{formatSuccessDate(event.occurredAt, true)} · {event.actorName ?? 'system'}{event.clientName ? ` · ${event.clientName}` : ''}</p></div>{event.priority ? <PriorityBadge priority={event.priority} /> : null}</div>
                        {event.description ? <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{event.description}</p> : null}
                        {event.statusLabel ? <Badge variant="outline" className="mt-3">{event.statusLabel}</Badge> : null}
                    </li>
                )
            })}
        </ol>
    )
}

function CheckIns({ detail, focusId }: { detail: SuccessConsultantDetail; focusId?: string }) {
    return (
        <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Check-iny</h2><p className="text-sm text-muted-foreground">Plan i historia rozmów TCM.</p></div><ScheduleCheckInDialog consultant={detail.consultant} /></div>
            {detail.checkIns.length === 0 ? <SuccessEmptyState title="Brak check-inów" description="Zaplanuj pierwszą rozmowę, aby uruchomić regularny rytm kontaktu." /> : (
                <div className="divide-y divide-border rounded-xl border border-border bg-card">
                    {detail.checkIns.map((checkIn) => <Link key={checkIn.id} id={`focus-${checkIn.id}`} href={`/internal/people/success/check-ins/${checkIn.id}`} className={cn('flex scroll-mt-24 flex-col gap-3 p-4 hover:bg-muted/35 sm:flex-row sm:items-center', focusId === checkIn.id && 'bg-primary/5 ring-2 ring-inset ring-primary/30')}><div className="w-44 shrink-0"><time className={cn('text-sm font-semibold', checkIn.status === 'scheduled' && isPastDue(checkIn.scheduledAt) && 'text-destructive')} dateTime={checkIn.scheduledAt}>{formatSuccessDate(checkIn.scheduledAt, true)}</time><p className="text-xs text-muted-foreground">{checkIn.ownerTcmName ?? 'bez opiekuna'}</p></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{checkIn.agenda ?? 'Check-in bez agendy'}</p><p className="text-xs text-muted-foreground">{checkInTypeLabel(checkIn.type)} · {checkIn.channel ?? 'kanał do ustalenia'}</p></div><CheckInStatusBadge status={checkIn.status} /></Link>)}
                </div>
            )}
        </section>
    )
}

function Feedback({ detail, focusId }: { detail: SuccessConsultantDetail; focusId?: string }) {
    return (
        <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Feedback klienta</h2><p className="text-sm text-muted-foreground">Oceny i ustalenia pozyskane przez TCM.</p></div><ClientFeedbackDialog consultant={detail.consultant} placements={detail.placements} /></div>
            {detail.feedback.length === 0 ? <SuccessEmptyState title="Brak feedbacku" description="Dodaj pierwszy ustrukturyzowany feedback po rozmowie z klientem lub Delivery Leadem." /> : (
                <div className="grid gap-4 lg:grid-cols-2">
                    {detail.feedback.map((feedback) => (
                        <article key={feedback.id} id={`focus-${feedback.id}`} className={cn('scroll-mt-24 rounded-xl border border-border bg-card p-5', focusId === feedback.id && 'ring-2 ring-primary/40')}>
                            <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{feedback.clientName}</h3><p className="text-xs text-muted-foreground">{formatSuccessDate(feedback.feedbackDate)} · {feedback.sourceName ?? 'źródło niepodane'}</p></div><div className="text-right"><p className="text-2xl font-semibold">{feedback.averageScore.toFixed(1)}</p><p className="text-xs text-muted-foreground">średnia / 5</p></div></div>
                            <div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4"><Score label="Technicznie" value={feedback.technicalScore} /><Score label="Komunikacja" value={feedback.communicationScore} /><Score label="Niezawodność" value={feedback.reliabilityScore} /><Score label="Zaangażowanie" value={feedback.engagementScore} /></div>
                            {feedback.strengths ? <p className="mt-4 text-sm"><strong>Mocne strony:</strong> {feedback.strengths}</p> : null}
                            {feedback.improvementAreas ? <p className="mt-2 text-sm"><strong>Do poprawy:</strong> {feedback.improvementAreas}</p> : null}
                            {feedback.recommendations ? <p className="mt-2 text-sm"><strong>Rekomendacja:</strong> {feedback.recommendations}</p> : null}
                        </article>
                    ))}
                </div>
            )}
            <div className="pt-2">
                <h2 className="font-semibold">Pulse survey</h2>
                <p className="mt-1 text-sm text-muted-foreground">Odpowiedzi z krótkiej ankiety konsultanta, bez dostępu do prywatnego profilu.</p>
            </div>
            {detail.pulseResponses.length === 0 ? <p className="rounded-lg border border-dashed border-border p-5 text-center text-sm text-muted-foreground">Brak odpowiedzi pulse survey.</p> : (
                <div className="grid gap-4 lg:grid-cols-2">
                    {detail.pulseResponses.map((pulse) => (
                        <article key={pulse.id} id={`focus-${pulse.id}`} className={cn('scroll-mt-24 rounded-xl border border-border bg-card p-5', focusId === pulse.id && 'ring-2 ring-primary/40')}>
                            <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">Pulse survey</h3><p className="text-xs text-muted-foreground">{formatSuccessDate(pulse.recordedAt, true)}</p></div><Badge variant="outline">{pulse.source === 'token' ? 'ankieta' : 'zapis TCM'}</Badge></div>
                            <div className="mt-4 grid grid-cols-3 gap-2"><Score label="Satysfakcja" value={pulse.satisfactionScore} max={10} /><Score label="Zaangażowanie" value={pulse.engagementScore} /><Score label="Rekomendacja" value={pulse.recommendationScore} max={10} /></div>
                            {pulse.note ? <p className="mt-4 whitespace-pre-wrap text-sm text-muted-foreground">{pulse.note}</p> : null}
                        </article>
                    ))}
                </div>
            )}
        </section>
    )
}

function Score({ label, value, max = 5 }: { label: string; value: number; max?: number }) {
    return <div className="rounded-lg bg-muted/40 p-2 text-center"><p className="font-semibold">{value}/{max}</p><p className="mt-1 text-muted-foreground">{label}</p></div>
}

function Actions({ detail, focusId }: { detail: SuccessConsultantDetail; focusId?: string }) {
    return (
        <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Action steps</h2><p className="text-sm text-muted-foreground">Ustalenia, właściciele i terminy kolejnych działań.</p></div><div className="flex gap-2"><SendPulseButton contractorId={detail.consultant.contractorId} /><CreateTaskDialog contractorId={detail.consultant.contractorId} tcmOptions={detail.tcmOptions} /></div></div>
            <SuccessTaskList tasks={detail.tasks} focusId={focusId} />
        </section>
    )
}
