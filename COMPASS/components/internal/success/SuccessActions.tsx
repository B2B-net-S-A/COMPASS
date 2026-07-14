'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarPlus, CirclePause, ClipboardPlus, HeartPulse, Loader2, MessageSquarePlus, Play, RefreshCw, Send } from 'lucide-react'
import {
    activateSuccessMonitoring,
    addSuccessClientFeedback,
    createSuccessTask,
    pauseSuccessMonitoring,
    rescheduleSuccessCheckIn,
    scheduleSuccessCheckIn,
    sendSuccessPulseSurvey,
    setSuccessHealthStatus,
} from '@/lib/actions/consultant-success'
import { toast } from '@/lib/toast'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { FormSection } from '@/components/ds/FormGroup'
import type {
    SuccessConsultantListItem,
    SuccessContactChannel,
    SuccessHealthStatus,
    SuccessMonitoringSettings,
    SuccessPlacement,
    SuccessPriority,
    SuccessTcmOption,
    SuccessCheckInType,
    SuccessClientFeedback,
} from '@/lib/types/consultant-success'

const selectClass = 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring'

const CONTRACTOR_STATUS_LABEL: Record<SuccessConsultantListItem['contractorStatus'], string> = {
    prospect: 'Prospekt',
    onboarding: 'Onboarding',
    active: 'Aktywny',
    offboarding: 'Offboarding',
    exited: 'Zakończony',
}

function tomorrowDate(): string {
    const date = new Date()
    date.setDate(date.getDate() + 1)
    return date.toISOString().slice(0, 10)
}

function nextMonthDate(): string {
    const date = new Date()
    date.setDate(date.getDate() + 30)
    return date.toISOString().slice(0, 10)
}

function dateTimeInput(value?: string | null): string {
    const date = value ? new Date(value) : new Date(Date.now() + 24 * 60 * 60 * 1000)
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
    return date.toISOString().slice(0, 16)
}

function assertActionResult(result: unknown): void {
    if (!result || typeof result !== 'object') return
    const record = result as Record<string, unknown>
    if (record.success === false) {
        throw new Error(typeof record.error === 'string' ? record.error : 'Operacja nie powiodła się.')
    }
}

function useActionFeedback() {
    const router = useRouter()
    const [pending, startTransition] = useTransition()

    function run(action: () => Promise<unknown>, successMessage: string, onSuccess?: () => void) {
        startTransition(async () => {
            try {
                const result = await action()
                assertActionResult(result)
                toast.success(successMessage)
                onSuccess?.()
                router.refresh()
            } catch (error) {
                toast.error(error instanceof Error ? error.message : 'Nie udało się zapisać zmian.')
            }
        })
    }

    return { pending, run }
}

export function MonitoringControls({
    consultant,
    monitoring,
    tcmOptions,
}: {
    consultant: SuccessConsultantListItem
    monitoring: SuccessMonitoringSettings | null
    tcmOptions: SuccessTcmOption[]
}) {
    const [open, setOpen] = useState(false)
    const [cadence, setCadence] = useState(String(monitoring?.cadenceDays ?? consultant.cadenceDays ?? 30))
    const [ownerId, setOwnerId] = useState(monitoring?.ownerTcmId ?? consultant.ownerTcmId ?? '')
    const [nextCheckInOn, setNextCheckInOn] = useState(monitoring?.nextCheckInAt?.slice(0, 10) ?? nextMonthDate())
    const [surveysEnabled, setSurveysEnabled] = useState(monitoring?.surveysEnabled ?? false)
    const [statusConfirmed, setStatusConfirmed] = useState(false)
    const { pending, run } = useActionFeedback()
    const active = consultant.monitoringState === 'active'

    function activate() {
        const cadenceDays = Number.parseInt(cadence, 10)
        if (!ownerId) return toast.error('Wybierz opiekuna TCM.')
        if (!Number.isInteger(cadenceDays) || cadenceDays < 7 || cadenceDays > 180) {
            return toast.error('Cykl musi mieć od 7 do 180 dni.')
        }
        if (!nextCheckInOn) return toast.error('Ustaw datę kolejnego check-inu.')
        if (!active && !statusConfirmed) return toast.error('Potwierdź status i aktualny placement konsultanta.')
        run(
            () => activateSuccessMonitoring({
                contractorId: consultant.contractorId,
                cadenceDays,
                ownerTcmId: ownerId,
                nextCheckInOn,
                contractorStatus: consultant.contractorStatus,
                surveysEnabled,
            }),
            active ? 'Zaktualizowano monitoring.' : 'Monitoring został uruchomiony.',
            () => setOpen(false),
        )
    }

    if (active) {
        return (
            <div className="flex flex-wrap gap-2">
                <Dialog open={open} onOpenChange={setOpen}>
                    <DialogTrigger asChild><Button variant="outline" size="sm">Ustawienia monitoringu</Button></DialogTrigger>
                    <MonitoringDialogContent
                        consultant={consultant}
                        cadence={cadence}
                        setCadence={setCadence}
                        ownerId={ownerId}
                        setOwnerId={setOwnerId}
                        nextCheckInOn={nextCheckInOn}
                        setNextCheckInOn={setNextCheckInOn}
                        surveysEnabled={surveysEnabled}
                        setSurveysEnabled={setSurveysEnabled}
                        statusConfirmed={statusConfirmed}
                        setStatusConfirmed={setStatusConfirmed}
                        tcmOptions={tcmOptions}
                        pending={pending}
                        onSave={activate}
                        edit
                    />
                </Dialog>
                <Button
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => run(
                        () => pauseSuccessMonitoring({ contractorId: consultant.contractorId }),
                        'Monitoring został wstrzymany.',
                    )}
                >
                    {pending ? <Loader2 className="animate-spin" /> : <CirclePause />}
                    Wstrzymaj
                </Button>
            </div>
        )
    }

    return (
        <Dialog open={open} onOpenChange={(value) => { setOpen(value); if (!value) setStatusConfirmed(false) }}>
            <DialogTrigger asChild>
                <Button size="sm"><Play />Uruchom monitoring</Button>
            </DialogTrigger>
            <MonitoringDialogContent
                consultant={consultant}
                cadence={cadence}
                setCadence={setCadence}
                ownerId={ownerId}
                setOwnerId={setOwnerId}
                nextCheckInOn={nextCheckInOn}
                setNextCheckInOn={setNextCheckInOn}
                surveysEnabled={surveysEnabled}
                setSurveysEnabled={setSurveysEnabled}
                statusConfirmed={statusConfirmed}
                setStatusConfirmed={setStatusConfirmed}
                tcmOptions={tcmOptions}
                pending={pending}
                onSave={activate}
            />
        </Dialog>
    )
}

function MonitoringDialogContent({
    consultant,
    cadence,
    setCadence,
    ownerId,
    setOwnerId,
    nextCheckInOn,
    setNextCheckInOn,
    surveysEnabled,
    setSurveysEnabled,
    statusConfirmed,
    setStatusConfirmed,
    tcmOptions,
    pending,
    onSave,
    edit = false,
}: {
    consultant: SuccessConsultantListItem
    cadence: string
    setCadence: (value: string) => void
    ownerId: string
    setOwnerId: (value: string) => void
    nextCheckInOn: string
    setNextCheckInOn: (value: string) => void
    surveysEnabled: boolean
    setSurveysEnabled: (value: boolean) => void
    statusConfirmed: boolean
    setStatusConfirmed: (value: boolean) => void
    tcmOptions: SuccessTcmOption[]
    pending: boolean
    onSave: () => void
    edit?: boolean
}) {
    return (
        <DialogContent className="sm:max-w-xl">
            <DialogHeader>
                <DialogTitle>{edit ? 'Ustawienia monitoringu' : 'Uruchom monitoring sukcesu'}</DialogTitle>
                <DialogDescription>
                    Potwierdź opiekuna, cykl kontaktu i datę pierwszego check-inu dla {consultant.fullName}.
                </DialogDescription>
            </DialogHeader>
            <FormSection columns={2}>
                <div className="space-y-2">
                    <Label htmlFor="success-owner">Opiekun TCM</Label>
                    <select id="success-owner" className={selectClass} value={ownerId} onChange={(event) => setOwnerId(event.target.value)}>
                        <option value="">Wybierz opiekuna</option>
                        {tcmOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                    </select>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="success-cadence">Cykl kontaktu (dni)</Label>
                    <Input id="success-cadence" type="number" min={7} max={180} value={cadence} onChange={(event) => setCadence(event.target.value)} />
                    <div className="flex gap-1">
                        {[14, 30, 60].map((value) => (
                            <Button key={value} type="button" size="sm" variant="ghost" onClick={() => setCadence(String(value))}>{value}</Button>
                        ))}
                    </div>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="success-next">Kolejny check-in</Label>
                    <Input id="success-next" type="date" value={nextCheckInOn} onChange={(event) => setNextCheckInOn(event.target.value)} />
                </div>
                <div className="space-y-2">
                    <Label>Status kontraktora</Label>
                    <div className="rounded-md border border-input bg-muted/30 px-3 py-2 text-sm">
                        <div className="font-medium">{CONTRACTOR_STATUS_LABEL[consultant.contractorStatus]}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{consultant.currentClient ?? 'Bez klienta'} · {consultant.currentPosition ?? 'bez stanowiska'}</div>
                    </div>
                    <p className="text-xs text-muted-foreground">Dane placementu edytujesz w People Ops.</p>
                </div>
            </FormSection>
            {!edit ? (
                <label className="flex items-start gap-3 rounded-lg border border-border p-3 text-sm">
                    <input type="checkbox" checked={statusConfirmed} onChange={(event) => setStatusConfirmed(event.target.checked)} className="mt-0.5 h-4 w-4" />
                    <span><strong>Potwierdzam status i aktualny placement</strong><br /><span className="text-muted-foreground">Klient i stanowisko powyżej są aktualne na moment uruchomienia monitoringu.</span></span>
                </label>
            ) : null}
            <label className="flex items-start gap-3 rounded-lg border border-border p-3 text-sm">
                <input type="checkbox" checked={surveysEnabled} onChange={(event) => setSurveysEnabled(event.target.checked)} className="mt-0.5 h-4 w-4" />
                <span><strong>Włącz wysyłkę pulse survey</strong><br /><span className="text-muted-foreground">Ankieta nie daje konsultantowi dostępu do profilu ani historii TCM.</span></span>
            </label>
            <DialogFooter>
                <Button onClick={onSave} disabled={pending}>
                    {pending ? <Loader2 className="animate-spin" /> : <Play />}
                    {edit ? 'Zapisz ustawienia' : 'Uruchom monitoring'}
                </Button>
            </DialogFooter>
        </DialogContent>
    )
}

export function ScheduleCheckInDialog({ consultant, triggerLabel = 'Zaplanuj check-in' }: { consultant: SuccessConsultantListItem; triggerLabel?: string }) {
    const [open, setOpen] = useState(false)
    const [scheduledAt, setScheduledAt] = useState(dateTimeInput(consultant.nextCheckInAt))
    const [type, setType] = useState<SuccessCheckInType>('regular')
    const [channel, setChannel] = useState<SuccessContactChannel>('video')
    const [priority, setPriority] = useState<SuccessPriority>('medium')
    const [agenda, setAgenda] = useState('')
    const { pending, run } = useActionFeedback()

    function save() {
        if (!scheduledAt) return toast.error('Wybierz termin check-inu.')
        run(
            () => scheduleSuccessCheckIn({
                contractorId: consultant.contractorId,
                scheduledAt: new Date(scheduledAt).toISOString(),
                type,
                channel,
                priority,
                agenda: agenda.trim() || null,
            }),
            'Check-in został zaplanowany.',
            () => setOpen(false),
        )
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm"><CalendarPlus />{triggerLabel}</Button></DialogTrigger>
            <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>Nowy check-in</DialogTitle>
                    <DialogDescription>{consultant.fullName} · {consultant.currentClient ?? 'bez przypisanego klienta'}</DialogDescription>
                </DialogHeader>
                <FormSection columns={2}>
                    <div className="space-y-2">
                        <Label htmlFor="check-in-at">Termin</Label>
                        <Input id="check-in-at" type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="check-in-type">Typ</Label>
                        <select id="check-in-type" className={selectClass} value={type} onChange={(event) => setType(event.target.value as SuccessCheckInType)}>
                            <option value="regular">Regularny</option><option value="ad_hoc">Ad hoc</option><option value="emergency">Pilny</option><option value="feedback">Feedback</option>
                        </select>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="check-in-channel">Kanał</Label>
                        <select id="check-in-channel" className={selectClass} value={channel} onChange={(event) => setChannel(event.target.value as SuccessContactChannel)}>
                            <option value="video">Wideospotkanie</option><option value="phone">Telefon</option><option value="in_person">Osobiście</option><option value="email">E-mail</option><option value="other">Inny</option>
                        </select>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="check-in-priority">Priorytet</Label>
                        <select id="check-in-priority" className={selectClass} value={priority} onChange={(event) => setPriority(event.target.value as SuccessPriority)}>
                            <option value="low">Niski</option><option value="medium">Średni</option><option value="high">Wysoki</option><option value="critical">Krytyczny</option>
                        </select>
                    </div>
                </FormSection>
                <div className="space-y-2"><Label htmlFor="check-in-agenda">Agenda / cel rozmowy</Label><Textarea id="check-in-agenda" rows={4} value={agenda} onChange={(event) => setAgenda(event.target.value)} /></div>
                <DialogFooter><Button onClick={save} disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <CalendarPlus />}Zaplanuj</Button></DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

export function RescheduleCheckInDialog({ checkInId, scheduledAt }: { checkInId: string; scheduledAt: string }) {
    const [open, setOpen] = useState(false)
    const [nextAt, setNextAt] = useState(dateTimeInput(scheduledAt))
    const { pending, run } = useActionFeedback()

    function save() {
        if (!nextAt) return toast.error('Wybierz nowy termin check-inu.')
        run(
            () => rescheduleSuccessCheckIn({ checkInId, scheduledAt: new Date(nextAt).toISOString() }),
            'Check-in został przełożony.',
            () => setOpen(false),
        )
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button variant="outline" size="sm"><RefreshCw />Przełóż</Button></DialogTrigger>
            <DialogContent>
                <DialogHeader><DialogTitle>Przełóż check-in</DialogTitle><DialogDescription>Zmień wyłącznie termin. Agenda i prywatne notatki pozostaną bez zmian.</DialogDescription></DialogHeader>
                <div className="space-y-2"><Label htmlFor="reschedule-at">Nowy termin</Label><Input id="reschedule-at" type="datetime-local" value={nextAt} onChange={(event) => setNextAt(event.target.value)} /></div>
                <DialogFooter><Button onClick={save} disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <RefreshCw />}Zapisz nowy termin</Button></DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

export function HealthStatusDialog({ contractorId, currentStatus }: { contractorId: string; currentStatus: SuccessHealthStatus }) {
    const [open, setOpen] = useState(false)
    const [status, setStatus] = useState<SuccessHealthStatus>(currentStatus)
    const [reason, setReason] = useState('')
    const [reviewOn, setReviewOn] = useState(nextMonthDate())
    const { pending, run } = useActionFeedback()

    function save() {
        if ((status === 'amber' || status === 'red') && !reason.trim()) return toast.error('Opisz powód zmiany statusu.')
        if ((status === 'amber' || status === 'red') && !reviewOn) return toast.error('Ustaw datę przeglądu statusu.')
        const action = status === 'amber' || status === 'red'
            ? () => setSuccessHealthStatus({ contractorId, status, reason: reason.trim(), reviewOn })
            : () => setSuccessHealthStatus({ contractorId, status, reason: reason.trim() || null, reviewOn: null })
        run(action, 'Zaktualizowano status relacji.', () => setOpen(false))
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button variant="outline" size="sm"><HeartPulse />Ustaw status</Button></DialogTrigger>
            <DialogContent>
                <DialogHeader><DialogTitle>Status relacji</DialogTitle><DialogDescription>Ręczna ocena TCM. Status i uzasadnienie są widoczne wyłącznie dla TCM i administratora.</DialogDescription></DialogHeader>
                <div className="space-y-4">
                    <div className="space-y-2"><Label htmlFor="health-status">Kolor</Label><select id="health-status" className={selectClass} value={status} onChange={(event) => setStatus(event.target.value as SuccessHealthStatus)}><option value="unknown">Nieustalona</option><option value="green">Zielony — stabilnie</option><option value="amber">Żółty — wymaga obserwacji</option><option value="red">Czerwony — wymaga pilnego działania</option></select></div>
                    <div className="space-y-2"><Label htmlFor="health-reason">Powód {status === 'amber' || status === 'red' ? '(wymagany)' : '(opcjonalny)'}</Label><Textarea id="health-reason" rows={4} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Co uzasadnia ten status i co powinno się wydarzyć dalej?" /></div>
                    {status === 'amber' || status === 'red' ? <div className="space-y-2"><Label htmlFor="health-review">Przegląd statusu</Label><Input id="health-review" type="date" min={tomorrowDate()} value={reviewOn} onChange={(event) => setReviewOn(event.target.value)} /></div> : null}
                </div>
                <DialogFooter><Button onClick={save} disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <HeartPulse />}Zapisz status</Button></DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

export function ClientFeedbackDialog({
    consultant,
    placements,
    checkInId,
}: {
    consultant: SuccessConsultantListItem
    placements: SuccessPlacement[]
    checkInId?: string
}) {
    const [open, setOpen] = useState(false)
    const [placementId, setPlacementId] = useState(placements[0]?.id ?? '')
    const selectedPlacement = useMemo(() => placements.find((placement) => placement.id === placementId), [placementId, placements])
    const [clientName, setClientName] = useState(selectedPlacement?.clientName ?? consultant.currentClient ?? '')
    const [sourceName, setSourceName] = useState('')
    const [feedbackDate, setFeedbackDate] = useState(new Date().toISOString().slice(0, 10))
    const [scores, setScores] = useState({ technical: 3, communication: 3, reliability: 3, engagement: 3 })
    const [strengths, setStrengths] = useState('')
    const [improvements, setImprovements] = useState('')
    const [recommendations, setRecommendations] = useState('')
    const [willingToContinue, setWillingToContinue] = useState<NonNullable<SuccessClientFeedback['willingToContinue']>>('not_asked')
    const [priority, setPriority] = useState<SuccessPriority>('medium')
    const { pending, run } = useActionFeedback()

    function save() {
        if (!clientName.trim()) return toast.error('Podaj klienta, od którego pochodzi feedback.')
        run(
            () => addSuccessClientFeedback({
                contractorId: consultant.contractorId,
                checkInId: checkInId ?? null,
                placementId: placementId || null,
                feedbackDate,
                clientName: clientName.trim(),
                sourceName: sourceName.trim() || null,
                technicalScore: scores.technical,
                communicationScore: scores.communication,
                reliabilityScore: scores.reliability,
                engagementScore: scores.engagement,
                strengths: strengths.trim() || null,
                improvementAreas: improvements.trim() || null,
                recommendations: recommendations.trim() || null,
                willingToContinue,
                priority,
            }),
            'Zapisano feedback klienta.',
            () => setOpen(false),
        )
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button variant="outline" size="sm"><MessageSquarePlus />Dodaj feedback klienta</Button></DialogTrigger>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader><DialogTitle>Feedback klienta</DialogTitle><DialogDescription>Strukturyzowana, wewnętrzna notatka dotycząca {consultant.fullName}.</DialogDescription></DialogHeader>
                <FormSection columns={2}>
                    <div className="space-y-2"><Label htmlFor="feedback-placement">Placement</Label><select id="feedback-placement" className={selectClass} value={placementId} onChange={(event) => { setPlacementId(event.target.value); const placement = placements.find((item) => item.id === event.target.value); if (placement) setClientName(placement.clientName) }}><option value="">Bez placementu</option>{placements.map((placement) => <option key={placement.id} value={placement.id}>{placement.clientName} · {placement.position ?? 'rola'}</option>)}</select></div>
                    <div className="space-y-2"><Label htmlFor="feedback-date">Data rozmowy</Label><Input id="feedback-date" type="date" value={feedbackDate} onChange={(event) => setFeedbackDate(event.target.value)} /></div>
                    <div className="space-y-2"><Label htmlFor="feedback-client">Klient</Label><Input id="feedback-client" value={clientName} onChange={(event) => setClientName(event.target.value)} /></div>
                    <div className="space-y-2"><Label htmlFor="feedback-source">Źródło / rozmówca</Label><Input id="feedback-source" value={sourceName} onChange={(event) => setSourceName(event.target.value)} placeholder="np. Delivery Lead po stronie klienta" /></div>
                </FormSection>
                <div className="grid gap-3 sm:grid-cols-4">
                    {([['technical', 'Technicznie'], ['communication', 'Komunikacja'], ['reliability', 'Niezawodność'], ['engagement', 'Zaangażowanie']] as const).map(([key, label]) => (
                        <div key={key} className="space-y-2"><Label htmlFor={`score-${key}`}>{label}</Label><Input id={`score-${key}`} type="number" min={1} max={5} value={scores[key]} onChange={(event) => setScores((current) => ({ ...current, [key]: Math.max(1, Math.min(5, Number(event.target.value))) }))} /></div>
                    ))}
                </div>
                <FormSection columns={2}>
                    <div className="space-y-2"><Label htmlFor="feedback-strengths">Mocne strony</Label><Textarea id="feedback-strengths" rows={3} value={strengths} onChange={(event) => setStrengths(event.target.value)} /></div>
                    <div className="space-y-2"><Label htmlFor="feedback-improvements">Obszary do poprawy</Label><Textarea id="feedback-improvements" rows={3} value={improvements} onChange={(event) => setImprovements(event.target.value)} /></div>
                </FormSection>
                <div className="space-y-2"><Label htmlFor="feedback-recommendations">Rekomendacje / następny krok</Label><Textarea id="feedback-recommendations" rows={3} value={recommendations} onChange={(event) => setRecommendations(event.target.value)} /></div>
                <FormSection columns={2}>
                    <div className="space-y-2"><Label htmlFor="feedback-continue">Chęć dalszej współpracy</Label><select id="feedback-continue" className={selectClass} value={willingToContinue} onChange={(event) => setWillingToContinue(event.target.value as NonNullable<SuccessClientFeedback['willingToContinue']>)}><option value="not_asked">Nie pytano</option><option value="definitely_yes">Zdecydowanie tak</option><option value="yes">Tak</option><option value="neutral">Neutralnie</option><option value="no">Nie</option><option value="definitely_no">Zdecydowanie nie</option></select></div>
                    <div className="space-y-2"><Label htmlFor="feedback-priority">Priorytet follow-upu</Label><select id="feedback-priority" className={selectClass} value={priority} onChange={(event) => setPriority(event.target.value as SuccessPriority)}><option value="low">Niski</option><option value="medium">Średni</option><option value="high">Wysoki</option><option value="critical">Krytyczny</option></select></div>
                </FormSection>
                <DialogFooter><Button onClick={save} disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <MessageSquarePlus />}Zapisz feedback</Button></DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

export function CreateTaskDialog({
    contractorId,
    checkInId,
    tcmOptions,
}: {
    contractorId: string
    checkInId?: string
    tcmOptions: SuccessTcmOption[]
}) {
    const [open, setOpen] = useState(false)
    const [title, setTitle] = useState('')
    const [description, setDescription] = useState('')
    const [dueDate, setDueDate] = useState(tomorrowDate())
    const [priority, setPriority] = useState<SuccessPriority>('medium')
    const [assignedTcmId, setAssignedTcmId] = useState('')
    const { pending, run } = useActionFeedback()

    function save() {
        if (title.trim().length < 2) return toast.error('Podaj tytuł action stepu.')
        run(
            () => createSuccessTask({ contractorId, checkInId: checkInId ?? null, title: title.trim(), description: description.trim() || null, dueDate: dueDate || null, priority, assignedTcmId: assignedTcmId || null }),
            'Dodano action step.',
            () => { setOpen(false); setTitle(''); setDescription('') },
        )
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button variant="outline" size="sm"><ClipboardPlus />Dodaj action step</Button></DialogTrigger>
            <DialogContent>
                <DialogHeader><DialogTitle>Nowy action step</DialogTitle><DialogDescription>Konkretne działanie, właściciel i termin.</DialogDescription></DialogHeader>
                <div className="space-y-4">
                    <div className="space-y-2"><Label htmlFor="task-title">Tytuł</Label><Input id="task-title" value={title} onChange={(event) => setTitle(event.target.value)} /></div>
                    <div className="space-y-2"><Label htmlFor="task-description">Opis</Label><Textarea id="task-description" rows={3} value={description} onChange={(event) => setDescription(event.target.value)} /></div>
                    <FormSection columns={2}>
                        <div className="space-y-2"><Label htmlFor="task-due">Termin</Label><Input id="task-due" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></div>
                        <div className="space-y-2"><Label htmlFor="task-priority">Priorytet</Label><select id="task-priority" className={selectClass} value={priority} onChange={(event) => setPriority(event.target.value as SuccessPriority)}><option value="low">Niski</option><option value="medium">Średni</option><option value="high">Wysoki</option><option value="critical">Krytyczny</option></select></div>
                    </FormSection>
                    <div className="space-y-2"><Label htmlFor="task-owner">Właściciel</Label><select id="task-owner" className={selectClass} value={assignedTcmId} onChange={(event) => setAssignedTcmId(event.target.value)}><option value="">Bez przypisania</option>{tcmOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></div>
                </div>
                <DialogFooter><Button onClick={save} disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <ClipboardPlus />}Dodaj</Button></DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

export function SendPulseButton({ contractorId, checkInId }: { contractorId: string; checkInId?: string }) {
    const { pending, run } = useActionFeedback()
    return (
        <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => run(
                () => sendSuccessPulseSurvey({ contractorId, checkInId: checkInId ?? null }),
                'Pulse survey został wysłany.',
            )}
        >
            {pending ? <Loader2 className="animate-spin" /> : <Send />}
            Wyślij pulse survey
        </Button>
    )
}
