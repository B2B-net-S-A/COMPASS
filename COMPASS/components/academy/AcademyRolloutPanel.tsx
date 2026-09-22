'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useConfirm } from '@/components/shared/ConfirmDialog'
import { useAcademyAction } from './useAcademyAction'
import { listAcademyTrainers, setAcademyRollout } from '@/lib/actions/academy-access'

type Person = { id: string; fullName: string | null; email: string | null }
export function AcademyRolloutPanel({ initial }: { initial: { mode: 'closed' | 'pilot' | 'open'; participants: Person[] } }) {
    const router = useRouter()
    const [mode, setMode] = useState(initial.mode)
    const [people, setPeople] = useState(initial.participants)
    const [search, setSearch] = useState('')
    const [candidates, setCandidates] = useState<Person[]>([])
    const [searched, setSearched] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [message, setMessage] = useState<string | null>(null)
    const [pending, run] = useAcademyAction()
    const [confirm, ConfirmUI] = useConfirm()
    async function save() {
        if (!await confirm({ title: 'Zmienić dostępność Akademii?', description: mode === 'open' ? 'Dostęp otrzymają wszyscy aktywni konsultanci objęci Akademią. Dostęp ról HR pozostanie bez zmian.' : mode === 'closed' ? 'Dostęp pozostanie tylko dla administratorów. Uczestnicy nie otworzą materiałów ani nowych zapisów do czasu ponownego udostępnienia. Historia pozostanie zachowana.' : `Dostęp otrzymają wskazane konta (${people.length}) oraz administratorzy. Osoby poza listą nie otworzą Akademii.`, confirmLabel: 'Zapisz dostępność' })) return
        run(async () => { setError(null); setMessage(null); try {
            const result = await setAcademyRollout({ mode, userIds: people.map(person => person.id) })
            if (!result.success) { setError(result.error); return }
            setMessage('Zapisano dostępność Akademii. Uprawnienia trenera są zarządzane osobno.')
            router.refresh()
        } catch { setError('Nie udało się zapisać dostępności. Spróbuj ponownie.') } })
    }
    function find() { run(async () => { setError(null); try {
        const result = await listAcademyTrainers(search)
        if (!result.success) { setError(result.error); return }
        setCandidates(result.data.filter(person => person.role !== 'admin').map(person => ({ id: person.id, fullName: person.full_name, email: person.email })))
        setSearched(true)
    } catch { setError('Nie udało się wyszukać kont. Spróbuj ponownie.') } }) }
    return <section aria-labelledby="academy-rollout-title" className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <div><h2 id="academy-rollout-title" className="text-lg font-semibold">Udostępnienie Akademii</h2><p className="mt-1 text-sm text-muted-foreground">Najpierw przygotowanie przez administratorów, następnie pilot na wskazanych kontach i otwarcie po odbiorze. Udział w pilocie nie nadaje uprawnienia trenera.</p></div>
        <div className="space-y-2"><label htmlFor="academy-rollout-mode" className="text-sm font-medium">Tryb dostępu</label><select id="academy-rollout-mode" className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm" value={mode} disabled={pending} onChange={event => setMode(event.target.value as typeof mode)}><option value="closed">Zamknięta — tylko administratorzy</option><option value="pilot">Pilot — wskazane konta</option><option value="open">Otwarta — uprawnieni konsultanci</option></select></div>
        {mode === 'pilot' && <div className="space-y-3"><p className="text-sm font-medium">Konta pilota ({people.length}/1000)</p>{people.length === 0 ? <p className="text-sm text-muted-foreground">Wybierz co najmniej jedno konto przed zapisaniem pilota.</p> : <ul className="space-y-2">{people.map(person => <li key={person.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/40 p-3"><span className="min-w-0 break-words text-sm">{person.fullName || person.email || person.id}{person.fullName && person.email && <span className="block break-all text-xs text-muted-foreground">{person.email}</span>}</span><Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => setPeople(people.filter(item => item.id !== person.id))} aria-label={`Usuń z pilota: ${person.fullName || person.email || person.id}`}>Usuń</Button></li>)}</ul>}
        <form onSubmit={event => { event.preventDefault(); find() }} className="flex flex-col gap-2 sm:flex-row sm:items-end"><div className="flex-1 space-y-2"><label htmlFor="academy-pilot-search" className="text-sm font-medium">Znajdź konto do pilota</label><Input id="academy-pilot-search" type="search" value={search} onChange={event => setSearch(event.target.value)} maxLength={100} disabled={pending} placeholder="Imię, nazwisko lub e-mail" /></div><Button type="submit" variant="outline" disabled={pending}>Szukaj do pilota</Button></form>
        {searched && <div className="space-y-2"><p className="text-xs text-muted-foreground">Wyniki: {candidates.length}. Wyszukaj konkretną osobę, jeśli jej nie widzisz.</p>{candidates.map(person => <div key={person.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2"><span className="break-words text-sm">{person.fullName || person.email}<span className="block break-all text-xs text-muted-foreground">{person.email}</span></span><Button type="button" size="sm" variant="outline" disabled={pending || people.length >= 1000 || people.some(item => item.id === person.id)} onClick={() => setPeople([...people, person])}>{people.some(item => item.id === person.id) ? 'Dodano' : 'Dodaj do pilota'}</Button></div>)}</div>}</div>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}{message && <p role="status" className="text-sm text-success">{message}</p>}
        <Button type="button" disabled={pending || (mode === 'pilot' && people.length === 0)} onClick={save}>{pending ? 'Proszę czekać…' : 'Zapisz dostępność'}</Button><ConfirmUI />
    </section>
}
