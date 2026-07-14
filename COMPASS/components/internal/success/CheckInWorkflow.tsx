'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CheckCircle2, ClipboardPlus, Loader2, MinusCircle, Plus } from 'lucide-react'
import { completeSuccessCheckIn } from '@/lib/actions/consultant-success'
import { toast } from '@/lib/toast'
import { PageHeader } from '@/components/ds/PageHeader'
import { FormSection } from '@/components/ds/FormGroup'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ClientFeedbackDialog, CreateTaskDialog, RescheduleCheckInDialog, SendPulseButton } from './SuccessActions'
import { CheckInStatusBadge, HealthBadge, PriorityBadge, formatSuccessDate } from './SuccessBadges'
import { SuccessTaskList } from './SuccessTaskList'
import { cn } from '@/lib/utils'
import type { SuccessActionStepInput, SuccessCheckInDetail, SuccessContactChannel, SuccessPriority } from '@/lib/types/consultant-success'

const selectClass = 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring'

interface LocalStep extends SuccessActionStepInput { key: string }

function dateTimeInput(value: string | null): string {
    const date = value ? new Date(value) : new Date()
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
    return date.toISOString().slice(0, 16)
}

function defaultDueDate(): string {
    const date = new Date()
    date.setDate(date.getDate() + 7)
    return date.toISOString().slice(0, 10)
}

export function CheckInWorkflow({ detail }: { detail: SuccessCheckInDetail }) {
    const { checkIn, consultant, health } = detail
    const router = useRouter()
    const [pending, startTransition] = useTransition()
    const [actualAt, setActualAt] = useState(dateTimeInput(checkIn.actualAt))
    const [channel, setChannel] = useState<SuccessContactChannel>(checkIn.channel ?? 'video')
    const [duration, setDuration] = useState(String(checkIn.durationMinutes ?? 30))
    const [notes, setNotes] = useState(checkIn.notes ?? '')
    const [tags, setTags] = useState(checkIn.tags.join(', '))
    const [steps, setSteps] = useState<LocalStep[]>([])
    const canComplete = checkIn.status === 'scheduled' || checkIn.status === 'in_progress'

    function addStep() {
        setSteps((current) => [...current, {
            key: `${Date.now()}-${current.length}`,
            title: '',
            description: '',
            dueDate: defaultDueDate(),
            priority: 'medium',
            assignedTcmId: checkIn.ownerTcmId ?? undefined,
        }])
    }

    function patchStep(key: string, patch: Partial<LocalStep>) {
        setSteps((current) => current.map((step) => step.key === key ? { ...step, ...patch } : step))
    }

    function submit() {
        if (!actualAt) return toast.error('Podaj faktyczną datę rozmowy.')
        if (notes.trim().length < 3) return toast.error('Dodaj notatkę z ustaleniami.')
        if (steps.some((step) => step.title.trim().length < 2 || !step.dueDate)) return toast.error('Każdy action step musi mieć tytuł i termin.')
        const durationMinutes = Number.parseInt(duration, 10)
        startTransition(async () => {
            try {
                await completeSuccessCheckIn({
                    checkInId: checkIn.id,
                    actualAt: new Date(actualAt).toISOString(),
                    notes: notes.trim(),
                    channel,
                    durationMinutes: Number.isFinite(durationMinutes) ? durationMinutes : null,
                    tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean),
                    actionSteps: steps.map(({ key: _key, ...step }) => ({ ...step, title: step.title.trim(), description: step.description?.trim() || null })),
                })
                toast.success('Check-in zakończony, a action steps zapisane.')
                router.refresh()
            } catch (error) {
                toast.error(error instanceof Error ? error.message : 'Nie udało się zakończyć check-inu.')
            }
        })
    }

    return (
        <main className="space-y-6">
            <PageHeader
                eyebrow="Check-in"
                title={consultant.fullName}
                description={`${formatSuccessDate(checkIn.scheduledAt, true)} · ${consultant.currentClient ?? 'bez klienta'}`}
                breadcrumb={[{ label: 'Consultant Success', href: '/internal/people/success' }, { label: 'Check-iny', href: '/internal/people/success/check-ins' }, { label: consultant.fullName }]}
                actions={<div className="flex flex-wrap gap-2">{canComplete ? <RescheduleCheckInDialog checkInId={checkIn.id} scheduledAt={checkIn.scheduledAt} /> : null}<ClientFeedbackDialog consultant={consultant} placements={detail.placements} checkInId={checkIn.id} /><CreateTaskDialog contractorId={consultant.contractorId} checkInId={checkIn.id} tcmOptions={detail.tcmOptions} /><SendPulseButton contractorId={consultant.contractorId} checkInId={checkIn.id} /></div>}
            />

            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-4">
                <CheckInStatusBadge status={checkIn.status} />
                <PriorityBadge priority={checkIn.priority} />
                <HealthBadge status={health.status} />
                <Button asChild variant="ghost" size="sm" className="ml-auto"><Link href={`/internal/people/success/consultants/${consultant.contractorId}?tab=check-ins&focus=${checkIn.id}#focus-${checkIn.id}`}><ArrowLeft />Profil konsultanta</Link></Button>
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(20rem,1fr)]">
                <section className="space-y-5 rounded-xl border border-border bg-card p-5">
                    <div><h2 className="font-semibold">Przygotowanie</h2><p className="mt-1 text-sm text-muted-foreground">Kontekst relacji i cel rozmowy.</p></div>
                    <div className="rounded-lg bg-muted/35 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Agenda</p><p className="mt-2 whitespace-pre-wrap text-sm">{checkIn.agenda ?? 'Nie dodano agendy.'}</p></div>
                    <div className="rounded-lg border border-border p-4"><div className="flex items-center gap-2"><HealthBadge status={health.status} />{health.reviewOn ? <Badge variant="outline">przegląd {formatSuccessDate(health.reviewOn)}</Badge> : null}</div><p className="mt-3 text-sm text-muted-foreground">{health.reason ?? 'Status relacji nie ma jeszcze uzasadnienia.'}</p></div>
                    {detail.latestFeedback ? <div className="rounded-lg border border-border p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ostatni feedback klienta</p><div className="mt-2 flex items-center justify-between"><span className="font-medium">{detail.latestFeedback.clientName}</span><span className="text-lg font-semibold">{detail.latestFeedback.averageScore.toFixed(1)}/5</span></div>{detail.latestFeedback.recommendations ? <p className="mt-2 text-sm text-muted-foreground">{detail.latestFeedback.recommendations}</p> : null}</div> : null}
                </section>

                <section className="space-y-4 rounded-xl border border-border bg-card p-5">
                    <div><h2 className="font-semibold">Otwarte ustalenia</h2><p className="mt-1 text-sm text-muted-foreground">Sprawdź przed rozmową.</p></div>
                    {detail.openTasks.length === 0 ? <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Brak otwartych action steps.</p> : detail.openTasks.slice(0, 5).map((task) => <div key={task.id} className="rounded-lg border border-border p-3"><div className="flex items-start justify-between gap-2"><p className="text-sm font-medium">{task.title}</p><PriorityBadge priority={task.priority} /></div><p className="mt-1 text-xs text-muted-foreground">Termin {formatSuccessDate(task.dueDate)} · {task.assignedTcmName ?? 'bez właściciela'}</p></div>)}
                </section>
            </div>

            {canComplete ? (
                <section className="space-y-6 rounded-xl border border-border bg-card p-5">
                    <div><h2 className="font-semibold">Notatka i zakończenie check-inu</h2><p className="mt-1 text-sm text-muted-foreground">Zapis zakończenia tworzy action steps atomowo razem z rozmową.</p></div>
                    <FormSection columns={2}>
                        <div className="space-y-2"><Label htmlFor="actual-at">Faktyczna data i godzina</Label><Input id="actual-at" type="datetime-local" value={actualAt} onChange={(event) => setActualAt(event.target.value)} /></div>
                        <div className="space-y-2"><Label htmlFor="channel">Kanał</Label><select id="channel" className={selectClass} value={channel} onChange={(event) => setChannel(event.target.value as SuccessContactChannel)}><option value="video">Wideospotkanie</option><option value="phone">Telefon</option><option value="in_person">Osobiście</option><option value="email">E-mail</option><option value="other">Inny</option></select></div>
                        <div className="space-y-2"><Label htmlFor="duration">Czas (minuty)</Label><Input id="duration" type="number" min={1} max={480} value={duration} onChange={(event) => setDuration(event.target.value)} /></div>
                        <div className="space-y-2"><Label htmlFor="tags">Tagi</Label><Input id="tags" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="retencja, rozwój, projekt" /><p className="text-xs text-muted-foreground">Oddziel przecinkami.</p></div>
                    </FormSection>
                    <div className="space-y-2"><Label htmlFor="notes">Prywatna notatka TCM</Label><Textarea id="notes" rows={8} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Tematy rozmowy, ustalenia, ryzyka i dalszy kontekst…" /></div>

                    <div className="space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">Nowe action steps</h3><p className="text-sm text-muted-foreground">Zostaną utworzone razem z zakończeniem rozmowy.</p></div><Button type="button" variant="outline" size="sm" onClick={addStep}><Plus />Dodaj krok</Button></div>
                        {steps.map((step, index) => (
                            <div key={step.key} className="rounded-xl border border-border p-4">
                                <div className="mb-4 flex items-center justify-between"><span className="text-sm font-semibold">Krok {index + 1}</span><Button type="button" variant="ghost" size="sm" onClick={() => setSteps((current) => current.filter((item) => item.key !== step.key))}><MinusCircle />Usuń</Button></div>
                                <div className="space-y-4">
                                    <div className="space-y-2"><Label htmlFor={`step-title-${step.key}`}>Tytuł</Label><Input id={`step-title-${step.key}`} value={step.title} onChange={(event) => patchStep(step.key, { title: event.target.value })} /></div>
                                    <div className="space-y-2"><Label htmlFor={`step-description-${step.key}`}>Opis</Label><Textarea id={`step-description-${step.key}`} rows={2} value={step.description ?? ''} onChange={(event) => patchStep(step.key, { description: event.target.value })} /></div>
                                    <div className="grid gap-4 sm:grid-cols-3"><div className="space-y-2"><Label htmlFor={`step-due-${step.key}`}>Termin</Label><Input id={`step-due-${step.key}`} type="date" value={step.dueDate} onChange={(event) => patchStep(step.key, { dueDate: event.target.value })} /></div><div className="space-y-2"><Label htmlFor={`step-priority-${step.key}`}>Priorytet</Label><select id={`step-priority-${step.key}`} className={selectClass} value={step.priority} onChange={(event) => patchStep(step.key, { priority: event.target.value as SuccessPriority })}><option value="low">Niski</option><option value="medium">Średni</option><option value="high">Wysoki</option><option value="critical">Krytyczny</option></select></div><div className="space-y-2"><Label htmlFor={`step-owner-${step.key}`}>Właściciel</Label><select id={`step-owner-${step.key}`} className={selectClass} value={step.assignedTcmId ?? ''} onChange={(event) => patchStep(step.key, { assignedTcmId: event.target.value || null })}><option value="">Bez przypisania</option>{detail.tcmOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></div></div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="flex justify-end"><Button size="lg" disabled={pending} onClick={submit}>{pending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}Zakończ check-in</Button></div>
                </section>
            ) : (
                <section className="rounded-xl border border-border bg-card p-5">
                    <div className="flex items-center gap-2"><CheckCircle2 className={cn('h-5 w-5', checkIn.status === 'completed' ? 'text-success' : 'text-muted-foreground')} /><h2 className="font-semibold">{checkIn.status === 'completed' ? 'Check-in zakończony' : 'Check-in nie jest aktywny'}</h2></div>
                    {checkIn.notes ? <p className="mt-4 whitespace-pre-wrap text-sm text-muted-foreground">{checkIn.notes}</p> : null}
                    <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground"><span>Rozmowa: {formatSuccessDate(checkIn.actualAt, true)}</span><span>Czas: {checkIn.durationMinutes ? `${checkIn.durationMinutes} min` : '—'}</span><span>Kanał: {checkIn.channel ?? '—'}</span></div>
                </section>
            )}

            <section className="space-y-3"><div className="flex items-center gap-2"><ClipboardPlus className="h-4 w-4 text-muted-foreground" /><h2 className="font-semibold">Action steps konsultanta</h2></div><SuccessTaskList tasks={detail.openTasks} /></section>

            {detail.previousCheckIns.length > 0 ? <section className="space-y-3"><h2 className="font-semibold">Poprzednie check-iny</h2><div className="divide-y divide-border rounded-xl border border-border bg-card">{detail.previousCheckIns.slice(0, 5).map((previous) => <Link key={previous.id} href={`/internal/people/success/check-ins/${previous.id}`} className="flex items-center gap-3 p-4 hover:bg-muted/35"><span className="flex-1 text-sm"><strong>{formatSuccessDate(previous.scheduledAt)}</strong><span className="ml-2 text-muted-foreground">{previous.agenda ?? 'Bez agendy'}</span></span><CheckInStatusBadge status={previous.status} /></Link>)}</div></section> : null}
        </main>
    )
}
