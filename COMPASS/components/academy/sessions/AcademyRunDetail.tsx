'use client'

import { useState } from 'react'
import { useAcademyAction } from '@/components/academy/useAcademyAction'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Award, BookOpen, CalendarDays, CheckCircle2, Clock3, ExternalLink, Loader2, Pencil, Plus, Send, Users, Video } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useConfirm } from '@/components/shared/ConfirmDialog'
import { cancelAcademyRegistration, cancelAcademyRun, cancelAcademySession, publishAcademyRun, reconcileAcademyAttendance, registerAcademyRun, updateAcademyRun } from '@/lib/actions/academy-sessions'
import { completeAcademyCourse } from '@/lib/actions/course-learning'
import type { ActionResult } from '@/lib/types/learning'
import type { AcademyOrganizerDTO, AcademyRunDTO, AcademyRunParticipantDTO, AcademySessionDTO } from '@/lib/types/academy-sessions'
import { AcademySessionForm, AcademyActualWindowForm } from './AcademySessionForm'
import { AcademyAttendancePanel } from './AcademyAttendancePanel'
import { AcademyLearnerProgress } from './AcademyLearnerProgress'
import { REGISTRATION_LABEL, RUN_STATUS_LABEL, SESSION_SYNC_LABEL, sessionDate, sessionTime } from './session-format'

interface Props {
    run: AcademyRunDTO
    isAdmin?: boolean
    canRegister?: boolean
    participants: AcademyRunParticipantDTO[]
    participantsError?: string
    organizers: AcademyOrganizerDTO[]
    managedTeamsAvailable: boolean
    managedTeamsReason?: string
    userId: string
    now: string
}
type Modal = { type: 'editRun' } | { type: 'session'; session?: AcademySessionDTO } | { type: 'replacement'; session: AcademySessionDTO } | { type: 'actual'; session: AcademySessionDTO } | { type: 'cancel'; session?: AcademySessionDTO } | null

export function AcademyRunDetail({ run, isAdmin = false, canRegister = true, participants, participantsError, organizers, managedTeamsAvailable, managedTeamsReason, userId, now }: Props) {
    const router = useRouter()
    const [childPending, setChildPending] = useState(false)
    const [modal, setModal] = useState<Modal>(null)
    const [error, setError] = useState<string | null>(null)
    const [message, setMessage] = useState<string | null>(null)
    const [completed, setCompleted] = useState(Boolean(run.myRegistration?.completedAt))
    const [isPending, startTransition] = useAcademyAction()
    const [confirm, ConfirmUI] = useConfirm()
    const registration = run.myRegistration
    const completionRevoked = Boolean(registration?.completionRevokedAt)
    const enrolled = registration?.status === 'confirmed'
    const waitlisted = registration?.status === 'waitlisted'
    const activeSessions = run.sessions.filter((session) => session.status !== 'cancelled')
    const upcoming = activeSessions.some((session) => Date.parse(session.endsAt) >= Date.parse(now))
    const cancellingExternal = modal?.type === 'cancel' && (modal.session
        ? modal.session.mode === 'external_link' : activeSessions.some((session) => session.mode === 'external_link'))

    function mutate(action: () => Promise<ActionResult<unknown>>, success: string) {
        setError(null)
        setMessage(null)
        startTransition(async () => { try { const result = await action(); if (!result.success) { setError(result.error); return } setMessage(success); setModal(null); router.refresh() } catch { setError('Operacja nie powiodła się. Spróbuj ponownie.') } })
    }
    async function publish() {
        if (await confirm({ title: 'Opublikować terminy?', description: 'Uczestnicy będą mogli zapisać się na tę edycję. Spotkania firmowe zostaną utworzone w Teams, a zapisane osoby otrzymają właściwe powiadomienia.', confirmLabel: 'Opublikuj edycję' })) mutate(() => publishAcademyRun(run.id), 'Edycja opublikowana. Stan przygotowania każdego spotkania znajdziesz poniżej.')
    }
    async function withdraw() {
        if (await confirm({ title: 'Zrezygnować z edycji?', description: 'Twój zapis zostanie anulowany. Jeśli masz potwierdzone miejsce, może je otrzymać osoba z listy rezerwowej.', confirmLabel: 'Zrezygnuj' })) mutate(() => cancelAcademyRegistration(run.id), 'Zapis na edycję został anulowany.')
    }
    function finish() {
        if (!registration?.enrollmentId) return
        const enrollmentId = registration.enrollmentId
        setError(null)
        setMessage(null)
        startTransition(async () => { try { const result = await completeAcademyCourse(run.courseId, enrollmentId); if (!result.success) { setError(result.error); return } setCompleted(result.data.completed); setMessage(result.data.completed ? 'Szkolenie ukończone. Możesz pobrać certyfikat.' : 'Nie wszystkie wymagania są jeszcze spełnione. Sprawdź materiały, quiz i potwierdzenie obecności.'); router.refresh() } catch { setError('Nie udało się sprawdzić ukończenia szkolenia.') } })
    }
    function saveRun(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault()
        const data = new FormData(event.currentTarget)
        mutate(() => updateAcademyRun({ runId: run.id, title: String(data.get('title') ?? '').trim(), capacity: Number(data.get('capacity')) }), 'Dane edycji zapisane.')
    }
    function cancel(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault()
        if (modal?.type !== 'cancel') return
        const reason = String(new FormData(event.currentTarget).get('reason') ?? '').trim()
        const session = modal.session
        const success = cancellingExternal
            ? session ? 'Odwołano w Compass; odwołaj też spotkanie u gospodarza Teams.' : 'Odwołano edycję w Compass; odwołaj też zewnętrzne spotkania u ich gospodarzy Teams.'
            : session ? 'Spotkanie odwołane. Aktualizujemy powiadomienia uczestników.' : 'Edycja odwołana. Historia zapisów pozostaje zachowana.'
        mutate(() => session ? cancelAcademySession({ sessionId: session.id, reason }) : cancelAcademyRun({ runId: run.id, reason }), success)
    }
    function saved() { setModal(null); setError(null); router.refresh() }

    return <div className="space-y-6">
        <section className="flex flex-col justify-between gap-5 rounded-2xl border border-border bg-card p-5 sm:p-6 lg:flex-row lg:items-start">
            <div className="space-y-3"><div className="flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-muted px-3 py-1.5 text-muted-foreground">{RUN_STATUS_LABEL[run.status]}</span><span className="rounded-full border border-border px-3 py-1.5 text-muted-foreground">Wersja programu {run.versionNumber}</span>{registration && registration.status !== 'cancelled' && <span className="rounded-full bg-primary/10 px-3 py-1.5 text-primary">{REGISTRATION_LABEL[registration.status]}</span>}</div><p className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground"><span className="inline-flex items-center gap-2"><Users aria-hidden="true" className="size-4" />{run.confirmedCount} / {run.capacity} miejsc zajętych</span><span className="inline-flex items-center gap-2"><CalendarDays aria-hidden="true" className="size-4" />Spotkania: {activeSessions.length}</span>{run.waitlistCount > 0 && <span>Na rezerwie: {run.waitlistCount}</span>}</p><p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{enrolled ? 'Masz potwierdzone miejsce. Materiały i spotkania tej edycji dotyczą zapisanej wersji programu.' : waitlisted ? 'Jesteś na liście rezerwowej. O potwierdzeniu miejsca otrzymasz powiadomienie.' : run.status === 'draft' ? 'Terminy są przygotowywane. Administrator zatwierdza edycję przed otwarciem zapisów.' : run.status === 'cancelled' ? 'Ta edycja została odwołana. Nowe zapisy i dołączanie do spotkań są wyłączone.' : 'Zapis obejmuje wszystkie spotkania tej edycji. Wymagania ukończenia znajdziesz w programie szkolenia.'}</p></div>
            <div className="flex shrink-0 flex-wrap gap-2 lg:max-w-xs lg:justify-end">
                {run.status === 'published' && !enrolled && !waitlisted && upcoming && <Button disabled={isPending || !canRegister} onClick={() => mutate(() => registerAcademyRun(run.id), 'Zapis został przyjęty. Aktualny status znajdziesz przy nazwie edycji.')}>{isPending && <Loader2 className="animate-spin" aria-hidden="true" />}{run.confirmedCount >= run.capacity ? 'Dołącz do listy rezerwowej' : 'Zapisz się na edycję'}</Button>}
                {(enrolled || waitlisted) && run.status !== 'cancelled' && <Button variant="outline" disabled={isPending} onClick={withdraw}>Zrezygnuj</Button>}
        {run.canManage && <Button asChild variant="outline"><Link href={`/learning/edycje/${run.id}/program`}><BookOpen aria-hidden="true" />Program i pytania uczestników</Link></Button>}
        {enrolled && registration?.enrollmentId && <><Button asChild variant="outline"><Link href={`/learning/${run.courseSlug}?enrollment=${registration.enrollmentId}`}><BookOpen aria-hidden="true" />Materiały szkolenia</Link></Button><Button variant="outline" disabled={isPending || completionRevoked} onClick={finish}><CheckCircle2 aria-hidden="true" />Sprawdź ukończenie</Button>{!completionRevoked && (completed || registration.completedAt) && <Button asChild><a href={`/api/akademia/certificate?courseId=${run.courseId}&enrollmentId=${registration.enrollmentId}`}><Award aria-hidden="true" />Pobierz certyfikat</a></Button>}</>}
            </div>
        </section>
        {completionRevoked && <p role="status" className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">Zaliczenie zostało unieważnione. Certyfikat jest niedostępny.{registration?.completionRevokedReason && ` Powód: ${registration.completionRevokedReason}`}</p>}
        {error && <p role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">{error}</p>}
        {message && <p role="status" className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-foreground">{message}</p>}
        {registration?.enrollmentId && registration.learnerProgress && <AcademyLearnerProgress progress={registration.learnerProgress} sessions={run.sessions} courseSlug={run.courseSlug} enrollmentId={registration.enrollmentId} />}
        {run.canManage && run.status !== 'cancelled' && <div className="flex flex-wrap items-center gap-2"><Button onClick={() => { setError(null); setModal({ type: 'session' }) }}><Plus aria-hidden="true" />Dodaj spotkanie</Button><Button variant="outline" onClick={() => { setError(null); setModal({ type: 'editRun' }) }}><Pencil aria-hidden="true" />Edytuj edycję</Button>{run.status === 'draft' && run.canPublish && <Button variant="outline" disabled={isPending || activeSessions.length === 0} onClick={publish}><Send aria-hidden="true" />Zatwierdź i opublikuj terminy</Button>}<Button variant="ghost" onClick={() => { setError(null); setModal({ type: 'cancel' }) }} className="text-destructive hover:text-destructive">Odwołaj edycję</Button></div>}
        <section className="space-y-4"><h2 className="text-lg font-semibold">Spotkania</h2>{run.sessions.length === 0 && <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">{run.canManage ? 'Dodaj pierwsze spotkanie, aby przygotować edycję do publikacji.' : 'Terminy spotkań nie zostały jeszcze opublikowane.'}</div>}{run.sessions.map((session) => {
            const cancelled = run.status === 'cancelled' || session.status === 'cancelled'
            const ended = Date.parse(session.endsAt) < Date.parse(now)
            return <article id={`session-${session.id}`} key={session.id} className="space-y-4 rounded-2xl border border-border bg-card p-5"><div className="flex flex-col justify-between gap-4 sm:flex-row"><div className="space-y-2"><div className="flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">{cancelled ? 'Odwołane' : ended ? 'Zakończone' : session.required ? 'Obowiązkowe' : 'Opcjonalne'}</span>{run.canManage && <span className="py-1 text-muted-foreground">{SESSION_SYNC_LABEL[session.syncStatus]}</span>}</div><h3 className="font-semibold">{session.title}</h3><p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground"><span>{sessionDate(session.startsAt, session.timeZone)}</span><span className="inline-flex items-center gap-1.5"><Clock3 aria-hidden="true" className="size-3.5" />{sessionTime(session.startsAt, session.timeZone)}–{sessionTime(session.endsAt, session.timeZone)} · {session.timeZone}</span></p><p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Video aria-hidden="true" className="size-3.5" />{session.mode === 'external_link' ? 'Teams organizatora zewnętrznego' : 'Firmowe Teams'}</p></div><div className="flex items-start gap-2">{!cancelled && !ended && session.joinUrl && <Button asChild><a href={session.joinUrl} target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden="true" />Dołącz do Teams</a></Button>}{!cancelled && !ended && enrolled && !session.joinUrl && <span className="text-sm text-muted-foreground">Link do spotkania jest przygotowywany.</span>}</div></div>
                {session.replacesSessionId && <p className="text-sm text-muted-foreground">Zastępuje <a className="underline" href={`#session-${session.replacesSessionId}`}>odwołane spotkanie</a>; zachowuje jego wymaganie obecności.</p>}
                {session.replacementSessionId ? <p className="text-sm text-muted-foreground">Dalszą realizację znajdziesz w <a className="underline" href={`#session-${session.replacementSessionId}`}>spotkaniu zastępczym</a>.</p> : cancelled && session.required && run.status === 'published' && <p className="text-sm text-muted-foreground">Obowiązek uczestnictwa pozostaje niespełniony. Oczekujemy na termin zastępczy.</p>}
                {run.canManage && session.canReplace && <Button variant="outline" size="sm" onClick={() => { setError(null); setModal({ type: 'replacement', session }) }}>Zaplanuj zastępstwo</Button>}
                {run.canManage && cancelled && !session.replacementSessionId && run.status === 'published' && session.mode === 'managed_teams' && session.syncStatus !== 'cancelled' && <p className="text-sm text-muted-foreground">Zastępstwo będzie dostępne po potwierdzeniu odwołania poprzedniego spotkania przez Teams. W razie błędu ponów synchronizację w panelu integracji.</p>}
                {session.mode === 'external_link' && (enrolled || run.canManage) && <div className="space-y-1"><Button asChild variant="outline" size="sm"><a href={`/api/academy/sessions/${session.id}/calendar`}><CalendarDays aria-hidden="true" />Pobierz wydarzenie .ics</a></Button><p className="text-xs text-muted-foreground">Po zmianie terminu pobierz ponownie; plik nie aktualizuje się automatycznie.</p></div>}
                {run.canManage && !cancelled && <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4"><Button variant="outline" size="sm" onClick={() => { setError(null); setModal({ type: 'session', session }) }}><Pencil aria-hidden="true" />Edytuj termin</Button>{Date.parse(session.startsAt) <= Date.parse(now) && <Button variant="outline" size="sm" onClick={() => { setError(null); setModal({ type: 'actual', session }) }}><Clock3 aria-hidden="true" />{session.attendanceWindowConfirmed ? 'Skoryguj czas zajęć' : 'Potwierdź czas zajęć'}</Button>}<Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => { setError(null); setModal({ type: 'cancel', session }) }}>Odwołaj spotkanie</Button>{session.attendanceWindowConfirmed && <span className="text-xs text-success">Czas zajęć potwierdzony</span>}</div>}
                {isAdmin && run.canManage && run.status === 'published' && !cancelled && session.mode === 'managed_teams'
                    && session.attendanceWindowConfirmed && session.actualEndsAt && Date.parse(session.actualEndsAt) <= Date.parse(now) && <div className="space-y-2">
                    <Button variant="outline" size="sm" disabled={isPending || !managedTeamsAvailable} onClick={() => mutate(() => reconcileAcademyAttendance(session.id), 'Zlecono ponowny import obecności. Wynik pojawi się po synchronizacji Teams.')}>Ponów import obecności</Button>
                    <p className="text-xs text-muted-foreground">Po poprawieniu mapowania kont administrator może ponownie pobrać raport. Ręczne decyzje i istniejące ukończenia oraz certyfikaty pozostają bez zmian.</p>
                    {!managedTeamsAvailable && <p className="text-xs text-muted-foreground">{managedTeamsReason || 'Ponowienie wymaga włączonej integracji firmowych spotkań Teams.'}</p>}
                </div>}
            </article>
        })}</section>
        {run.canManage && (participantsError ? <p role="alert" className="rounded-xl border border-destructive/20 p-4 text-sm text-destructive">Nie udało się wczytać listy uczestników. Odśwież stronę przed potwierdzaniem obecności.</p> : <AcademyAttendancePanel participants={participants} sessions={run.sessions} userId={userId} readOnly={run.status === 'cancelled'} />)}
        <Dialog open={modal !== null} onOpenChange={(open) => { if (!open && !isPending && !childPending) setModal(null) }}><DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>{modal?.type === 'replacement' ? 'Zaplanuj zastępstwo' : modal?.type === 'session' ? modal.session ? 'Edytuj spotkanie' : 'Nowe spotkanie' : modal?.type === 'actual' ? 'Rzeczywisty czas zajęć' : modal?.type === 'cancel' ? modal.session ? 'Odwołaj spotkanie' : 'Odwołaj edycję' : 'Edytuj edycję'}</DialogTitle><DialogDescription>{modal?.type === 'cancel' ? 'Podaj powód odwołania. Historia zapisów i dotychczasowych decyzji pozostanie zachowana. Odwołanie wymaganej sesji nie zalicza obecności — potrzebny jest termin zastępczy.' : run.title}</DialogDescription></DialogHeader>
            {(modal?.type === 'session' || modal?.type === 'replacement') && <AcademySessionForm runId={run.id} runCapacity={run.capacity} runPublished={run.status === 'published'} initial={modal.type === 'session' ? modal.session : undefined} replacementFor={modal.type === 'replacement' ? modal.session : undefined} organizers={organizers} managedTeamsAvailable={managedTeamsAvailable} managedTeamsReason={managedTeamsReason} onSaved={saved} onCancel={() => setModal(null)} onPendingChange={setChildPending} />}
            {modal?.type === 'actual' && <AcademyActualWindowForm session={modal.session} onSaved={saved} onCancel={() => setModal(null)} onPendingChange={setChildPending} />}
            {cancellingExternal && <p className="text-sm text-muted-foreground">Compass nie odwołuje spotkań w zewnętrznym Teams. Po zapisaniu decyzji odwołaj je także u gospodarza i przekaż zmianę uczestnikom.</p>}
            {modal?.type === 'editRun' && <form onSubmit={saveRun} className="space-y-4"><div className="space-y-2"><label htmlFor="edit-run-title" className="text-sm font-medium">Nazwa edycji</label><Input id="edit-run-title" name="title" defaultValue={run.title} required minLength={3} maxLength={200} disabled={isPending} /></div><div className="space-y-2"><label htmlFor="edit-run-capacity" className="text-sm font-medium">Liczba miejsc</label><Input id="edit-run-capacity" name="capacity" type="number" defaultValue={run.capacity} required min={Math.max(1, run.confirmedCount)} max={activeSessions.some(session => session.mode === 'managed_teams') ? 499 : 500} disabled={isPending} /></div>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<Button type="submit" disabled={isPending}>{isPending && <Loader2 className="animate-spin" aria-hidden="true" />}Zapisz edycję</Button></form>}
            {modal?.type === 'cancel' && <form onSubmit={cancel} className="space-y-4"><div className="space-y-2"><label htmlFor="cancel-reason" className="text-sm font-medium">Powód odwołania</label><Textarea id="cancel-reason" name="reason" required minLength={5} maxLength={2000} disabled={isPending} /></div>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={isPending} onClick={() => setModal(null)}>Wróć</Button><Button type="submit" variant="destructive" disabled={isPending}>{isPending && <Loader2 className="animate-spin" aria-hidden="true" />}Potwierdź odwołanie</Button></div></form>}
        </DialogContent></Dialog><ConfirmUI />
    </div>
}
