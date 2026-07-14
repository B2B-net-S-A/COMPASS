'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { CalendarDays, List } from 'lucide-react'
import { DataTable, type DataTableColumn } from '@/components/ds/DataTable'
import { FilterBar } from '@/components/ds/FilterBar'
import { Button } from '@/components/ui/button'
import { CheckInStatusBadge, PriorityBadge, formatSuccessDate, isPastDue } from './SuccessBadges'
import { cn } from '@/lib/utils'
import type { SuccessCheckInListItem } from '@/lib/types/consultant-success'

const selectClass = 'h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring'

interface InitialFilters { q?: string; owner?: string; state?: string; view?: string }

function dateKey(value: string): string {
    return value.slice(0, 10)
}

function todayKey(): string {
    return new Date().toISOString().slice(0, 10)
}

export function CheckInsTable({ checkIns, initial }: { checkIns: SuccessCheckInListItem[]; initial: InitialFilters }) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const [query, setQuery] = useState(initial.q ?? '')
    const [owner, setOwner] = useState(initial.owner ?? '')
    const [state, setState] = useState(initial.state ?? '')
    const view = initial.view === 'calendar' ? 'calendar' : 'list'
    const today = todayKey()

    const owners = useMemo(() => Array.from(new Map(checkIns.filter((item) => item.ownerTcmId).map((item) => [item.ownerTcmId!, item.ownerTcmName ?? 'Nieznany opiekun'])).entries()).sort((a, b) => a[1].localeCompare(b[1], 'pl')), [checkIns])

    function setUrl(key: string, value: string) {
        const params = new URLSearchParams(searchParams.toString())
        if (value) params.set(key, value)
        else params.delete(key)
        router.replace(`${pathname}${params.size ? `?${params.toString()}` : ''}`, { scroll: false })
    }

    const rows = useMemo(() => checkIns.filter((item) => {
        if (query && !`${item.contractorName} ${item.clientName ?? ''} ${item.agenda ?? ''}`.toLocaleLowerCase('pl').includes(query.toLocaleLowerCase('pl'))) return false
        if (owner && item.ownerTcmId !== owner) return false
        const day = dateKey(item.scheduledAt)
        const open = item.status === 'scheduled' || item.status === 'in_progress'
        if (state === 'overdue' && !(open && isPastDue(item.scheduledAt))) return false
        if (state === 'today' && !(open && day === today)) return false
        if (state === 'upcoming' && !(open && day > today)) return false
        if (state === 'completed' && item.status !== 'completed') return false
        return true
    }).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)), [checkIns, owner, query, state, today])

    const columns: Array<DataTableColumn<SuccessCheckInListItem>> = [
        { key: 'date', header: 'Termin', render: (item) => <div className={cn('min-w-36 font-medium', item.status === 'scheduled' && isPastDue(item.scheduledAt) && 'text-destructive')}>{formatSuccessDate(item.scheduledAt, true)}</div> },
        { key: 'consultant', header: 'Konsultant', render: (item) => <div><div className="font-semibold">{item.contractorName}</div><div className="text-xs text-muted-foreground">{item.clientName ?? 'Bez klienta'}</div></div> },
        { key: 'owner', header: 'Opiekun', render: (item) => item.ownerTcmName ?? '—' },
        { key: 'agenda', header: 'Cel rozmowy', render: (item) => <div className="max-w-sm truncate text-sm text-muted-foreground">{item.agenda ?? 'Bez agendy'}</div> },
        { key: 'priority', header: 'Priorytet', render: (item) => <PriorityBadge priority={item.priority} /> },
        { key: 'status', header: 'Status', align: 'right', render: (item) => <div className="flex justify-end"><CheckInStatusBadge status={item.status} /></div> },
    ]

    const grouped = useMemo(() => {
        const map = new Map<string, SuccessCheckInListItem[]>()
        for (const item of rows) map.set(dateKey(item.scheduledAt), [...(map.get(dateKey(item.scheduledAt)) ?? []), item])
        return Array.from(map.entries())
    }, [rows])

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <div className="min-w-0 flex-1">
                    <FilterBar
                        search={{ value: query, onChange: (value) => { setQuery(value); setUrl('q', value) }, placeholder: 'Szukaj konsultanta, klienta lub agendy…' }}
                        filters={<><select className={selectClass} aria-label="Opiekun TCM" value={owner} onChange={(event) => { setOwner(event.target.value); setUrl('owner', event.target.value) }}><option value="">Wszyscy opiekunowie</option>{owners.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select><select className={selectClass} aria-label="Stan check-inu" value={state} onChange={(event) => { setState(event.target.value); setUrl('state', event.target.value) }}><option value="">Wszystkie terminy</option><option value="overdue">Po terminie</option><option value="today">Dzisiaj</option><option value="upcoming">Nadchodzące</option><option value="completed">Zakończone</option></select></>}
                        resultCount={rows.length}
                    />
                </div>
                <div className="flex rounded-md border border-input p-1">
                    <Button size="sm" variant={view === 'list' ? 'secondary' : 'ghost'} onClick={() => setUrl('view', 'list')}><List />Lista</Button>
                    <Button size="sm" variant={view === 'calendar' ? 'secondary' : 'ghost'} onClick={() => setUrl('view', 'calendar')}><CalendarDays />Kalendarz</Button>
                </div>
            </div>

            {view === 'list' ? (
                <div className="rounded-xl border border-border bg-card px-4 sm:px-6 lg:px-8">
                    <DataTable columns={columns} rows={rows} getRowKey={(item) => item.id} rowHighlighted={(item) => item.status === 'scheduled' && isPastDue(item.scheduledAt)} onRowClick={(item) => router.push(`/internal/people/success/check-ins/${item.id}`)} empty="Brak check-inów spełniających filtry." />
                </div>
            ) : (
                <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                    {grouped.map(([day, items]) => (
                        <section key={day} className="rounded-xl border border-border bg-card">
                            <header className={cn('border-b border-border px-4 py-3', day < today && 'text-destructive')}><h2 className="font-semibold">{formatSuccessDate(day)}</h2><p className="text-xs text-muted-foreground">{items.length} {items.length === 1 ? 'rozmowa' : 'rozmowy'}</p></header>
                            <div className="divide-y divide-border">{items.map((item) => <Link key={item.id} href={`/internal/people/success/check-ins/${item.id}`} className="block p-4 hover:bg-muted/35"><div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold">{item.contractorName}</span><time className="text-xs text-muted-foreground" dateTime={item.scheduledAt}>{new Date(item.scheduledAt).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}</time></div><p className="mt-1 truncate text-xs text-muted-foreground">{item.clientName ?? 'Bez klienta'} · {item.ownerTcmName ?? 'bez opiekuna'}</p><div className="mt-3 flex items-center justify-between"><CheckInStatusBadge status={item.status} /><PriorityBadge priority={item.priority} /></div></Link>)}</div>
                        </section>
                    ))}
                    {grouped.length === 0 ? <p className="text-sm text-muted-foreground">Brak check-inów do pokazania.</p> : null}
                </div>
            )}
        </div>
    )
}
