'use client'

import { useState } from 'react'
import { useAcademyAction } from '@/components/academy/useAcademyAction'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { saveAcademySession, replaceAcademySession, confirmAcademySessionWindow } from '@/lib/actions/academy-sessions'
import type { AcademyMeetingMode, AcademyOrganizerDTO, AcademySessionDTO } from '@/lib/types/academy-sessions'
import { localDateTime, SESSION_SELECT_CLASS, zonedDateTimeToIso } from './session-format'

interface SessionFormProps {
    runId: string
    runCapacity?: number
    runPublished?: boolean
    replacementFor?: AcademySessionDTO
    initial?: AcademySessionDTO
    organizers: AcademyOrganizerDTO[]
    managedTeamsAvailable: boolean
    managedTeamsReason?: string
    onSaved: () => void
    onCancel: () => void
    onPendingChange?: (pending: boolean) => void
}

export function AcademySessionForm({ runId, runCapacity, runPublished = false, initial, replacementFor, organizers, managedTeamsAvailable, managedTeamsReason, onSaved, onCancel, onPendingChange }: SessionFormProps) {
    const defaults = initial ?? replacementFor
    const requirementLocked = runPublished || Boolean(replacementFor)
    const organizerLocked = runPublished && Boolean(initial)
    const [mode, setMode] = useState<AcademyMeetingMode>(defaults?.mode ?? 'external_link')
    const [timeZone, setTimeZone] = useState(defaults?.timeZone ?? 'Europe/Warsaw')
    const [startsAt, setStartsAt] = useState(initial ? localDateTime(initial.startsAt, timeZone) : '')
    const [endsAt, setEndsAt] = useState(initial ? localDateTime(initial.endsAt, timeZone) : '')
    const [error, setError] = useState<string | null>(null)
    const [isPending, startTransition] = useAcademyAction(onPendingChange)
    const enabledOrganizers = organizers.filter((organizer) => organizer.enabled)
    const capacityBlocked = (runCapacity ?? 0) > 499
    const managedBlocked = !managedTeamsAvailable || enabledOrganizers.length === 0 || capacityBlocked
    const zones = Array.from(new Set(['Europe/Warsaw', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'UTC', defaults?.timeZone].filter((zone): zone is string => Boolean(zone))))

    function save(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault()
        const data = new FormData(event.currentTarget)
        setError(null)
        let start: string
        let end: string
        try {
            start = zonedDateTimeToIso(startsAt, timeZone)
            end = zonedDateTimeToIso(endsAt, timeZone)
            if (end <= start) throw new Error('Koniec spotkania musi wypadać po jego rozpoczęciu.')
        } catch (cause) { setError(cause instanceof Error ? cause.message : 'Sprawdź daty spotkania.'); return }
        startTransition(async () => {
            try {
                const input = { id: initial?.id, runId, title: String(data.get('title') ?? '').trim(), startsAt: start, endsAt: end, timeZone, mode, organizerId: mode === 'managed_teams' ? (organizerLocked ? initial?.organizerId : String(data.get('organizerId') ?? '')) : null, externalJoinUrl: mode === 'external_link' ? String(data.get('externalJoinUrl') ?? '').trim() : null, required: requirementLocked ? (defaults?.required ?? false) : data.get('required') === 'on' }
                const result = replacementFor
                    ? await replaceAcademySession({ sessionId: replacementFor.id, session: input, reason: String(data.get('replacementReason') ?? '').trim(), externalCancellationConfirmed: data.get('externalCancellationConfirmed') === 'on' })
                    : await saveAcademySession(input)
                if (!result.success) { setError(result.error); return }
                onSaved()
            } catch { setError('Nie udało się zapisać spotkania. Spróbuj ponownie.') }
        })
    }

    return <form onSubmit={save} className="space-y-5"><fieldset disabled={isPending} className="min-w-0 space-y-4">
        <div className="space-y-2"><label htmlFor="session-title" className="text-sm font-medium">Nazwa spotkania</label><Input id="session-title" name="title" required minLength={3} maxLength={200} defaultValue={defaults?.title} placeholder="np. Warsztat praktyczny — część 1" /></div>
        <div className="space-y-2"><label htmlFor="session-zone" className="text-sm font-medium">Strefa czasowa podanych godzin</label><select id="session-zone" value={timeZone} onChange={(event) => setTimeZone(event.target.value)} className={SESSION_SELECT_CLASS}>{zones.map((zone) => <option key={zone} value={zone}>{zone}</option>)}</select></div>
        <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><label htmlFor="session-start" className="text-sm font-medium">Początek</label><Input id="session-start" type="datetime-local" required value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></div><div className="space-y-2"><label htmlFor="session-end" className="text-sm font-medium">Koniec</label><Input id="session-end" type="datetime-local" required value={endsAt} onChange={(event) => setEndsAt(event.target.value)} /></div></div>
        <div className="space-y-2"><label htmlFor="session-mode" className="text-sm font-medium">Sposób organizacji</label><select id="session-mode" disabled={organizerLocked} value={mode} onChange={(event) => setMode(event.target.value as AcademyMeetingMode)} className={SESSION_SELECT_CLASS}><option value="external_link">Mam własny link Teams</option><option value="managed_teams" disabled={managedBlocked}>Utwórz spotkanie w firmowym Teams{managedBlocked ? ' — niedostępne' : ''}</option></select>{managedBlocked && <p className="text-xs leading-relaxed text-muted-foreground">{(capacityBlocked ? 'Firmowe Teams obsługuje do 499 uczestników i prowadzącego. Zmniejsz liczbę miejsc w edycji, aby wybrać tę opcję.' : managedTeamsReason) || (enabledOrganizers.length === 0 ? 'Administrator musi najpierw skonfigurować gospodarza firmowych spotkań. Możesz użyć własnego linku Teams.' : 'Automatyczne tworzenie spotkań nie jest jeszcze dostępne. Możesz użyć własnego linku Teams.')}</p>}</div>
        {mode === 'external_link' ? <div className="space-y-2"><label htmlFor="session-link" className="text-sm font-medium">Link do spotkania Teams</label><Input id="session-link" name="externalJoinUrl" type="url" required maxLength={4000} defaultValue={initial?.externalJoinUrl ?? initial?.joinUrl ?? ''} placeholder="https://teams.microsoft.com/…" /><p className="text-xs leading-relaxed text-muted-foreground">Zapisz ten sam termin u organizatora spotkania. Compass nie zmienia zewnętrznego kalendarza ani automatycznie nie pobiera obecności.</p></div> : <div className="space-y-2"><label htmlFor="session-organizer" className="text-sm font-medium">Gospodarz spotkania</label><select id="session-organizer" name="organizerId" required disabled={organizerLocked} defaultValue={defaults?.organizerId ?? ''} className={SESSION_SELECT_CLASS}><option value="" disabled>Wybierz gospodarza</option>{enabledOrganizers.map((organizer) => <option key={organizer.id} value={organizer.id}>{organizer.fullName || organizer.email} · {organizer.email}</option>)}</select><p className="text-xs leading-relaxed text-muted-foreground">Dla zewnętrznego trenera wybierz wewnętrznego gospodarza. Gospodarz nadaje trenerowi rolę prezentera w Teams.</p></div>}
        <label className="flex items-start gap-3 text-sm"><input name="required" type="checkbox" disabled={requirementLocked} defaultChecked={defaults?.required ?? !runPublished} className="mt-0.5 size-4 accent-primary" /><span>Obecność na tym spotkaniu jest wymagana do ukończenia edycji</span></label>
        {runPublished && <p className="text-xs leading-relaxed text-muted-foreground">Wymagania tej edycji są zatwierdzone. Zmiana terminu zachowuje obowiązek obecności. Dodatkowe spotkanie może być opcjonalne; odwołaną sesję zastąp przez „Zaplanuj zastępstwo”.</p>}
        {organizerLocked && <p className="text-xs text-muted-foreground">Zmiana gospodarza lub sposobu organizacji wymaga odwołania tego spotkania i jawnego zastępstwa. Błąd synchronizacji można ponowić w panelu integracji.</p>}
        {replacementFor && <><div className="space-y-2"><label htmlFor="replacement-reason" className="text-sm font-medium">Uzasadnienie zastępstwa</label><Input id="replacement-reason" name="replacementReason" required minLength={5} maxLength={2000} /></div><p className="text-sm text-muted-foreground">Nowy termin zastąpi „{replacementFor.title}” i zachowa jego wymaganie obecności. Dotychczasowa obecność nie zostanie przeniesiona.</p>{replacementFor.mode === 'external_link' && <label className="flex items-start gap-3 text-sm"><input name="externalCancellationConfirmed" type="checkbox" required className="mt-0.5 size-4 accent-primary" /><span>Potwierdzam odwołanie poprzedniego spotkania u zewnętrznego organizatora Teams.</span></label>}</>}
    </fieldset>{error && <p role="alert" className="rounded-lg bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>Anuluj</Button><Button type="submit" disabled={isPending || (mode === 'managed_teams' && managedBlocked)}>{isPending && <Loader2 aria-hidden="true" className="animate-spin" />}{initial ? 'Zapisz zmiany' : replacementFor ? 'Zaplanuj zastępstwo' : 'Dodaj spotkanie'}</Button></div></form>
}

export function AcademyActualWindowForm({ session, onSaved, onCancel, onPendingChange }: { session: AcademySessionDTO; onSaved: () => void; onCancel: () => void; onPendingChange?: (pending: boolean) => void }) {
    const [zone, setZone] = useState(session.timeZone)
    const [startsAt, setStartsAt] = useState(localDateTime(session.actualStartsAt ?? session.startsAt, session.timeZone))
    const [endsAt, setEndsAt] = useState(localDateTime(session.actualEndsAt ?? session.endsAt, session.timeZone))
    const [error, setError] = useState<string | null>(null)
    const [isPending, startTransition] = useAcademyAction(onPendingChange)
    function submit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault()
        setError(null)
        let start: string
        let end: string
        try { start = zonedDateTimeToIso(startsAt, zone); end = zonedDateTimeToIso(endsAt, zone); if (end <= start || Date.parse(end) > Date.now()) throw new Error('Potwierdź zakończone spotkanie: koniec musi być późniejszy od początku i nie może przypadać w przyszłości.') }
        catch (cause) { setError(cause instanceof Error ? cause.message : 'Sprawdź czas spotkania.'); return }
        startTransition(async () => { try { const result = await confirmAcademySessionWindow({ sessionId: session.id, startsAt: start, endsAt: end }); if (!result.success) { setError(result.error); return } onSaved() } catch { setError('Nie udało się potwierdzić czasu spotkania.') } })
    }
    return <form onSubmit={submit} className="space-y-4"><p className="text-sm leading-relaxed text-muted-foreground">Podaj rzeczywisty czas prowadzenia zajęć. Na jego podstawie zostanie obliczony wymagany procent obecności.</p><fieldset disabled={isPending} className="space-y-4"><div className="space-y-2"><label htmlFor="actual-zone" className="text-sm font-medium">Strefa czasowa</label><select id="actual-zone" value={zone} onChange={(event) => setZone(event.target.value)} className={SESSION_SELECT_CLASS}>{Array.from(new Set([session.timeZone, 'UTC'])).map((item) => <option key={item}>{item}</option>)}</select></div><div className="space-y-2"><label htmlFor="actual-start" className="text-sm font-medium">Faktyczny początek</label><Input id="actual-start" type="datetime-local" required value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></div><div className="space-y-2"><label htmlFor="actual-end" className="text-sm font-medium">Faktyczny koniec</label><Input id="actual-end" type="datetime-local" required value={endsAt} onChange={(event) => setEndsAt(event.target.value)} /></div></fieldset>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={isPending} onClick={onCancel}>Anuluj</Button><Button type="submit" disabled={isPending}>{isPending && <Loader2 className="animate-spin" aria-hidden="true" />}Potwierdź czas</Button></div></form>
}
