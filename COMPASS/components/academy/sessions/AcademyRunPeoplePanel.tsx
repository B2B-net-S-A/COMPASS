'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { summarizeRunPeople, type RunPerson } from '@/lib/academy/run-people'
import type { AcademyRunPeople } from '@/lib/actions/academy-run-people'

const PAGE = 12
type Filter = 'all' | 'unmatched' | 'matched' | 'waitlisted' | 'noAccount'

const SOURCE_LABEL: Record<RunPerson['source'], string> = { compass: 'COMPASS', teams: 'Raport Teams', both: 'COMPASS i Teams' }

function nexusLabel(person: RunPerson): string {
    return person.inNexus === null ? 'Nie sprawdzono' : person.inNexus ? 'Tak' : 'Brak w migawce'
}

function matches(person: RunPerson, filter: Filter): boolean {
    if (filter === 'unmatched') return person.inNexus === false
    if (filter === 'matched') return person.inNexus === true
    if (filter === 'waitlisted') return person.status === 'waitlisted'
    if (filter === 'noAccount') return !person.hasAccount
    return true
}

export function AcademyRunPeoplePanel({ data, error }: { data?: AcademyRunPeople; error?: string }) {
    const [filter, setFilter] = useState<Filter>('all')
    const [query, setQuery] = useState('')
    const [limit, setLimit] = useState(PAGE)
    const people = useMemo(() => data?.people ?? [], [data])
    const summary = useMemo(() => summarizeRunPeople(people), [people])
    const visible = useMemo(() => {
        const needle = query.trim().toLocaleLowerCase('pl-PL')
        return people.filter(person => matches(person, filter) && (!needle || person.fullName.toLocaleLowerCase('pl-PL').includes(needle) || person.email.includes(needle)))
    }, [people, filter, query])

    if (error) return <section aria-label="Uczestnicy" className="rounded-2xl border border-border bg-card p-5"><p role="alert" className="text-sm text-destructive">{error}</p></section>
    if (!data) return null

    const filters: Array<{ id: Filter; label: string; count: number }> = [
        { id: 'all', label: 'Wszyscy', count: summary.total },
        { id: 'unmatched', label: 'Brak w migawce', count: summary.unmatched },
        { id: 'matched', label: 'Dopasowane', count: summary.matched },
        { id: 'waitlisted', label: 'Lista rezerwowa', count: summary.waitlisted },
        { id: 'noAccount', label: 'Bez konta', count: summary.withoutAccount },
    ]
    const snapshotDate = data.snapshotAt ? new Intl.DateTimeFormat('pl-PL', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Warsaw' }).format(new Date(data.snapshotAt)) : null

    return <section aria-label="Uczestnicy" className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <div className="space-y-1"><h2 className="text-lg font-semibold">Uczestnicy</h2><p className="text-sm text-muted-foreground">Lista łączy zapisy w COMPASS i osoby z raportu rejestracji z Teams. Jedna osoba to jeden wiersz.</p></div>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[['Na liście', summary.total], ['Lista rezerwowa', summary.waitlisted], ['Bez konta', summary.withoutAccount], ['Dopasowane w NEXUS', summary.matched]].map(([label, value]) => <div key={label} className="rounded-xl border border-border p-3"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="text-xl font-semibold">{value}</dd></div>)}</dl>
        <p className="text-xs text-muted-foreground">{data.snapshotAvailable ? `Dopasowanie po adresie e-mail do migawki NEXUS${snapshotDate ? ` z ${snapshotDate}` : ''}.` : 'Migawka NEXUS jest teraz niedostępna, więc zgodność nie została sprawdzona.'}</p>
        <p className="rounded-xl bg-muted p-3 text-sm">Wysyłka wyłączona. Nikt z tej listy nie dostanie wiadomości.</p>
        <div className="flex flex-wrap items-center gap-2">
            <div role="tablist" aria-label="Filtr uczestników" className="flex flex-wrap gap-1">{filters.map(item => <Button key={item.id} role="tab" aria-selected={filter === item.id} size="sm" variant={filter === item.id ? 'default' : 'outline'} onClick={() => { setFilter(item.id); setLimit(PAGE) }}>{item.label} {item.count}</Button>)}</div>
            <Input aria-label="Szukaj uczestnika" value={query} onChange={event => { setQuery(event.target.value); setLimit(PAGE) }} placeholder="Szukaj po nazwisku lub adresie" className="sm:ml-auto sm:max-w-xs" />
        </div>
        {visible.length === 0 ? <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{summary.total === 0 ? 'Na tej edycji nikt się jeszcze nie zapisał.' : 'Nikt nie pasuje do tego filtra.'}</p> : <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm">
            <thead><tr className="border-b border-border text-xs text-muted-foreground"><th className="p-2 font-medium">Imię i nazwisko</th><th className="p-2 font-medium">Adres</th><th className="p-2 font-medium">Źródło</th><th className="p-2 font-medium">Status</th><th className="p-2 font-medium">Konto</th><th className="p-2 font-medium">W migawce NEXUS</th></tr></thead>
            <tbody>{visible.slice(0, limit).map(person => <tr key={person.key} className="border-b border-border last:border-0"><td className="p-2 font-medium">{person.fullName}</td><td className="p-2 text-muted-foreground">{person.email}</td><td className="p-2">{SOURCE_LABEL[person.source]}</td><td className="p-2">{person.status === 'waitlisted' ? 'Lista rezerwowa' : 'Potwierdzony'}</td><td className="p-2">{person.hasAccount ? 'Tak' : 'Bez konta'}</td><td className="p-2">{nexusLabel(person)}</td></tr>)}</tbody>
        </table></div>}
        {visible.length > limit && <div className="flex items-center justify-between gap-3"><p className="text-sm text-muted-foreground">Pokazano {limit} z {visible.length}</p><Button variant="outline" size="sm" onClick={() => setLimit(value => value + PAGE * 4)}>Pokaż kolejne</Button></div>}
    </section>
}
