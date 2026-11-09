import Link from 'next/link'
import { AlertTriangle, CheckCircle2, Circle, Clock3 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { CockpitIssue, CockpitStep, CockpitStepState } from '@/lib/academy/edition-cockpit'
import { cn } from '@/lib/utils'

const STATE_ICON: Record<CockpitStepState, typeof Circle> = { done: CheckCircle2, current: Clock3, upcoming: Circle, attention: AlertTriangle }
const STATE_CLASS: Record<CockpitStepState, string> = { done: 'text-success', current: 'text-primary', upcoming: 'text-muted-foreground', attention: 'text-destructive' }
const dayLabel = (iso: string) => new Intl.DateTimeFormat('pl-PL', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Warsaw' }).format(new Date(iso))

export interface CockpitRegistrations { confirmed: number; capacity: number; waitlisted: number; withoutAccount: number; cancelled: number }

export function EditionCockpit({ steps, issues, registrations, participantsHref }: { steps: CockpitStep[]; issues: CockpitIssue[]; registrations: CockpitRegistrations; participantsHref: string }) {
    const done = steps.filter(step => step.state === 'done').length
    const free = Math.max(0, registrations.capacity - registrations.confirmed)
    const kpis: Array<[string, number, string]> = [
        ['Zapisani', registrations.confirmed, registrations.capacity ? `z limitu ${registrations.capacity}, wolnych miejsc: ${free}` : 'bez limitu miejsc'],
        ['Lista rezerwowa', registrations.waitlisted, 'osoby czekające na miejsce'],
        ['Bez konta', registrations.withoutAccount, `z ${registrations.confirmed} zapisanych`],
        ['Rezygnacje', registrations.cancelled, 'wycofane zapisy tej edycji'],
    ]
    return <div className="space-y-5">
        <section aria-labelledby="cockpit-registrations" className="space-y-3">
            <div className="flex items-center justify-between gap-3"><h2 id="cockpit-registrations" className="text-lg font-semibold">Zapisy</h2><Link href={participantsHref} className="text-sm font-medium text-primary">Otwórz listę uczestników</Link></div>
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{kpis.map(([label, value, hint]) => <div key={label} className="rounded-xl border border-border bg-card p-4"><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{value}<span className="mt-1 block text-xs font-normal text-muted-foreground">{hint}</span></dd></div>)}</dl>
        </section>
        <div className="grid gap-5 lg:grid-cols-3">
            <section aria-labelledby="cockpit-cycle" className="rounded-2xl border border-border bg-card p-5 lg:col-span-2">
                <h2 id="cockpit-cycle" className="font-semibold">Cykl edycji</h2>
                <p className="text-sm text-muted-foreground">Kroki zakończone: {done} z {steps.length}.</p>
                {steps.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">Ta edycja nie ma jeszcze zaplanowanego spotkania.</p> : <ol className="mt-3 divide-y divide-border">
                    {steps.map(step => {
                        const Icon = STATE_ICON[step.state]
                        return <li key={step.key} className="flex gap-3 py-3">
                            <span className={cn('mt-0.5 shrink-0', STATE_CLASS[step.state])}><Icon aria-hidden="true" className="size-4" /></span>
                            <div className="min-w-0 flex-1">
                                <p className="flex flex-wrap items-baseline gap-x-2"><span className="text-xs font-semibold text-muted-foreground">{step.label}</span><span className="font-medium">{step.title}</span><span className={cn('text-sm', STATE_CLASS[step.state])}>{step.status}</span></p>
                                <p className="text-sm text-muted-foreground">{dayLabel(step.dateIso)}. {step.detail}</p>
                            </div>
                        </li>
                    })}
                </ol>}
            </section>
            <section aria-labelledby="cockpit-issues" className="rounded-2xl border border-border bg-card p-5">
                <h2 id="cockpit-issues" className="font-semibold">Wymaga Twojej reakcji <span className="text-muted-foreground">{issues.length}</span></h2>
                {issues.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">Nic nie czeka na reakcję.</p> : <ul className="mt-3 space-y-3">
                    {issues.map(issue => <li key={issue.key} className="space-y-1 rounded-xl border border-border p-3 text-sm"><p className="font-medium">{issue.title}</p><p className="text-muted-foreground">{issue.detail}</p>{issue.href && <Button asChild variant="outline" size="sm"><Link href={issue.href}>Przejdź</Link></Button>}</li>)}
                </ul>}
            </section>
        </div>
    </div>
}
