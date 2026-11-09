'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useAcademyAction } from '@/components/academy/useAcademyAction'
import { listAcademyWebinarExceptions, listAcademyWebinarExcluded, resolveAcademyWebinarException, setAcademyWebinarExcluded } from '@/lib/actions/academy-webinar-import'
import type { WebinarExceptionKind, WebinarExcludedEmail, WebinarRosterRow, WebinarStoredException } from '@/lib/academy/webinar-import'
import type { AcademyRunParticipantDTO } from '@/lib/types/academy-sessions'
import { SESSION_SELECT_CLASS } from './session-format'

export const WEBINAR_EXCEPTION_LABEL: Record<WebinarExceptionKind, string> = {
    missing_email: 'brak adresu e-mail',
    invalid_row: 'nieczytelny wiersz',
    waitlisted_in_teams: 'zapis oczekujący w Teams',
    conflicting_names: 'ten sam adres, różne nazwy',
    ambiguous_summary: 'sprzeczne podsumowania',
    not_on_list: 'osoba spoza listy',
    outside_window: 'poza czasem zajęć',
    cancelled_on_list: 'anulowana na liście',
    resigned: 'zrezygnowała z edycji',
    on_waitlist: 'na liście rezerwowej',
}

interface Props {
    runId: string
    readOnly: boolean
    /** Bumped by the import panel after a commit, so new exceptions appear without a reload. */
    version: number
    roster: WebinarRosterRow[] | null
    participants: AcademyRunParticipantDTO[]
}

/** A person decides every exception here; nothing is matched by name automatically. */
export function WebinarExceptionsPanel({ runId, readOnly, version, roster, participants }: Props) {
    const router = useRouter()
    const [pending, start] = useAcademyAction()
    const [available, setAvailable] = useState(true)
    const [items, setItems] = useState<WebinarStoredException[]>([])
    const [excluded, setExcluded] = useState<WebinarExcludedEmail[]>([])
    const [error, setError] = useState<string | null>(null)
    const [active, setActive] = useState<{ item: WebinarStoredException; decision: 'ignore' | 'assign' } | null>(null)

    const load = useCallback(async () => {
        const [exceptions, addresses] = await Promise.all([listAcademyWebinarExceptions(runId), listAcademyWebinarExcluded(runId)])
        if (!exceptions.success) { setError(exceptions.error); return }
        if (!addresses.success) { setError(addresses.error); return }
        setAvailable(exceptions.data.available && addresses.data.available)
        setItems(exceptions.data.items)
        setExcluded(addresses.data.items)
    }, [runId])

    useEffect(() => {
        load().catch(() => setError('Nie udało się wczytać wyjątków importu. Odśwież stronę.'))
    }, [load, version])

    function run(action: () => Promise<void>) {
        setError(null)
        start(async () => { try { await action() } catch { setError('Operacja nie powiodła się. Spróbuj ponownie.') } })
    }
    function addExcluded(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault()
        const form = event.currentTarget
        const email = String(new FormData(form).get('email') ?? '').trim()
        run(async () => {
            const result = await setAcademyWebinarExcluded({ runId, email, excluded: true })
            if (!result.success) { setError(result.error); return }
            form.reset()
            await load()
        })
    }
    function removeExcluded(email: string) {
        run(async () => {
            const result = await setAcademyWebinarExcluded({ runId, email, excluded: false })
            if (!result.success) { setError(result.error); return }
            await load()
        })
    }
    function resolve(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault()
        if (!active) return
        const data = new FormData(event.currentTarget)
        const target = String(data.get('target') ?? '')
        const note = String(data.get('note') ?? '').trim()
        run(async () => {
            const result = await resolveAcademyWebinarException({
                exceptionId: active.item.id, decision: active.decision, note,
                rosterId: target.startsWith('roster:') ? target.slice(7) : undefined,
                registrationId: target.startsWith('registration:') ? target.slice(13) : undefined,
            })
            if (!result.success) { setError(result.error); return }
            setActive(null)
            await load()
            router.refresh()
        })
    }

    if (!available) return <p className="text-sm text-muted-foreground">Wyjątki importu i lista wykluczonych adresów zaczną działać po zastosowaniu migracji bazy danych.</p>

    const open = items.filter(item => item.status === 'open')
    const rosterUserIds = new Set((roster ?? []).filter(row => row.userId).map(row => row.userId))
    const targets = [
        ...(roster ?? []).filter(row => row.status === 'confirmed').map(row => ({ value: `roster:${row.id}`, label: `${row.fullName} · ${row.email}` })),
        ...participants.filter(person => person.status === 'confirmed' && !rosterUserIds.has(person.userId)).map(person => ({ value: `registration:${person.registrationId}`, label: person.fullName || person.email })),
    ]

    return <div className="space-y-4">
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <section aria-label="Wykluczone adresy" className="space-y-2">
            <h3 className="font-medium">Prowadzący i organizatorzy</h3>
            <p className="text-sm text-muted-foreground">Te adresy są pomijane w raportach frekwencji tej edycji i nie liczą się jako wyjątki.</p>
            {excluded.length > 0 && <ul className="space-y-1 text-sm">{excluded.map(item => <li key={item.email} className="flex items-center justify-between gap-2"><span>{item.email}</span>{!readOnly && <Button type="button" size="sm" variant="ghost" disabled={pending} aria-label={`Usuń ${item.email}`} onClick={() => removeExcluded(item.email)}>Usuń</Button>}</li>)}</ul>}
            {!readOnly && <form onSubmit={addExcluded} className="flex flex-wrap gap-2"><Input aria-label="Adres do wykluczenia" name="email" type="email" required maxLength={254} placeholder="prowadzacy@firma.pl" disabled={pending} className="max-w-xs" /><Button type="submit" variant="outline" disabled={pending}>Dodaj adres</Button></form>}
        </section>
        {items.length > 0 && <section aria-label="Wyjątki importu" className="space-y-2">
            <h3 className="font-medium">Wyjątki do rozstrzygnięcia: {open.length}</h3>
            <ul className="max-h-96 divide-y divide-border overflow-auto text-sm">{items.map(item => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="min-w-0"><p className="font-medium">{item.fullName || item.email || 'Bez nazwy'}{item.email && item.fullName && <span className="font-normal text-muted-foreground"> · {item.email}</span>}</p><p className="text-xs text-muted-foreground">{WEBINAR_EXCEPTION_LABEL[item.kind]}{item.connections > 1 ? ` · połączeń: ${item.connections}` : ''}{item.status !== 'open' ? ` · ${item.status === 'assigned' ? 'przypisano' : 'pominięto'}: ${item.note}` : ''}</p></div>
                {item.status === 'open' && !readOnly && <div className="flex gap-1">{item.connections > 0 && item.sessionId && <Button size="sm" variant="outline" disabled={pending} onClick={() => setActive({ item, decision: 'assign' })}>Przypisz</Button>}<Button size="sm" variant="ghost" disabled={pending} onClick={() => setActive({ item, decision: 'ignore' })}>Pomiń</Button></div>}
            </li>)}</ul>
        </section>}
        {active && <form onSubmit={resolve} className="space-y-2 rounded-xl border border-border p-4">
            <p className="font-medium">{active.decision === 'assign' ? 'Przypisz obecność' : 'Pomiń wiersz'}: {active.item.fullName || active.item.email || 'Bez nazwy'}</p>
            {active.decision === 'assign' && <label className="block text-sm">Osoba z listy tej edycji<select name="target" required disabled={pending} defaultValue="" className={SESSION_SELECT_CLASS}><option value="" disabled>{roster ? 'Wybierz osobę' : 'Najpierw kliknij „Pokaż listę webinaru”'}</option>{targets.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>}
            <label className="block text-sm">Uzasadnienie<Textarea name="note" required minLength={10} maxLength={2000} disabled={pending} /></label>
            <Button type="submit" disabled={pending}>Zapisz decyzję</Button>
            <Button type="button" variant="ghost" disabled={pending} onClick={() => setActive(null)}>Anuluj</Button>
        </form>}
    </div>
}
