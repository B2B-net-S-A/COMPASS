'use client'

import { useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { AlertCircle, CalendarClock } from 'lucide-react'
import { DataTable, type DataTableColumn } from '@/components/ds/DataTable'
import { FilterBar } from '@/components/ds/FilterBar'
import { Badge } from '@/components/ui/badge'
import { HealthBadge, MonitoringBadge, formatSuccessDate, isPastDue } from './SuccessBadges'
import type { SuccessConsultantListItem } from '@/lib/types/consultant-success'

const selectClass = 'h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring'

interface InitialFilters {
    q?: string
    owner?: string
    health?: string
    monitoring?: string
    client?: string
    verified?: string
    contact?: string
    next?: string
    actions?: string
    quality?: string
}

export function ConsultantsTable({ consultants, initial }: { consultants: SuccessConsultantListItem[]; initial: InitialFilters }) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const [query, setQuery] = useState(initial.q ?? '')
    const [owner, setOwner] = useState(initial.owner ?? '')
    const [health, setHealth] = useState(initial.health ?? '')
    const [monitoring, setMonitoring] = useState(initial.monitoring ?? '')
    const [client, setClient] = useState(initial.client ?? '')
    const [verified, setVerified] = useState(initial.verified ?? '')
    const [contact, setContact] = useState(initial.contact ?? '')
    const [next, setNext] = useState(initial.next ?? '')
    const [actions, setActions] = useState(initial.actions ?? '')
    const [quality, setQuality] = useState(initial.quality ?? '')

    const owners = useMemo(() => Array.from(new Map(consultants.filter((item) => item.ownerTcmId).map((item) => [item.ownerTcmId!, item.ownerTcmName ?? 'Nieznany opiekun'])).entries()).sort((a, b) => a[1].localeCompare(b[1], 'pl')), [consultants])
    const clients = useMemo(() => Array.from(new Set(consultants.map((item) => item.currentClient).filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b, 'pl')), [consultants])

    function setUrl(key: string, value: string) {
        const params = new URLSearchParams(searchParams.toString())
        if (value) params.set(key, value)
        else params.delete(key)
        router.replace(`${pathname}${params.size ? `?${params.toString()}` : ''}`, { scroll: false })
    }

    const rows = useMemo(() => consultants.filter((item) => {
        const now = Date.now()
        const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000
        const lastContactTime = item.lastContactAt ? new Date(item.lastContactAt).getTime() : null
        const nextCheckInTime = item.nextCheckInAt ? new Date(item.nextCheckInAt).getTime() : null
        const haystack = `${item.fullName} ${item.email ?? ''} ${item.currentClient ?? ''} ${item.currentPosition ?? ''}`.toLocaleLowerCase('pl')
        if (query && !haystack.includes(query.toLocaleLowerCase('pl'))) return false
        if (owner && item.ownerTcmId !== owner) return false
        if (health && item.health.status !== health) return false
        if (monitoring && item.monitoringState !== monitoring) return false
        if (client && item.currentClient !== client) return false
        if (verified === 'verified' && !item.statusVerifiedAt) return false
        if (verified === 'unverified' && item.statusVerifiedAt) return false
        if (contact === 'recent30' && (!lastContactTime || lastContactTime < thirtyDaysAgo)) return false
        if (contact === 'stale30' && (!lastContactTime || lastContactTime >= thirtyDaysAgo)) return false
        if (contact === 'never' && lastContactTime) return false
        if (next === 'overdue' && (!nextCheckInTime || nextCheckInTime >= now)) return false
        if (next === 'upcoming' && (!nextCheckInTime || nextCheckInTime < now)) return false
        if (next === 'none' && nextCheckInTime) return false
        if (actions === 'overdue' && item.overdueTaskCount === 0) return false
        if (actions === 'open' && item.openTaskCount === 0) return false
        if (actions === 'none' && item.openTaskCount > 0) return false
        if (quality === 'missing_email' && item.email) return false
        if (quality === 'missing_client' && item.currentClient) return false
        if (quality === 'missing_owner' && item.ownerTcmId) return false
        return true
    }), [actions, client, consultants, contact, health, monitoring, next, owner, quality, query, verified])

    const columns: Array<DataTableColumn<SuccessConsultantListItem>> = [
        {
            key: 'consultant', header: 'Konsultant', render: (item) => (
                <div className="min-w-44"><div className="font-semibold">{item.fullName}</div><div className="mt-0.5 text-xs text-muted-foreground">{item.currentPosition ?? item.email ?? 'Brak roli i e-maila'}</div><Badge className="mt-1" size="sm" variant={item.statusVerifiedAt ? 'success' : 'warning'}>{item.statusVerifiedAt ? 'Status potwierdzony' : 'Status do weryfikacji'}</Badge></div>
            ),
        },
        {
            key: 'client', header: 'Klient / opiekun', render: (item) => (
                <div><div>{item.currentClient ?? '—'}</div><div className="mt-0.5 text-xs text-muted-foreground">{item.ownerTcmName ?? 'Bez opiekuna TCM'}</div></div>
            ),
        },
        { key: 'monitoring', header: 'Monitoring', render: (item) => <div className="space-y-1"><MonitoringBadge state={item.monitoringState} />{item.cadenceDays ? <div className="text-xs text-muted-foreground">co {item.cadenceDays} dni</div> : null}</div> },
        { key: 'health', header: 'Status relacji', render: (item) => <HealthBadge status={item.health.status} /> },
        {
            key: 'contact', header: 'Kontakt', render: (item) => (
                <div className="space-y-1 text-xs"><div><span className="text-muted-foreground">Ostatni: </span>{formatSuccessDate(item.lastContactAt)}</div><div className={isPastDue(item.nextCheckInAt) ? 'font-semibold text-destructive' : ''}><span className="text-muted-foreground">Następny: </span>{formatSuccessDate(item.nextCheckInAt)}</div></div>
            ),
        },
        {
            key: 'actions', header: 'Action steps', align: 'right', render: (item) => (
                <div className="flex justify-end gap-1"><Badge variant={item.overdueTaskCount > 0 ? 'danger' : 'neutral'}>{item.openTaskCount} otw.</Badge>{item.overdueTaskCount > 0 ? <Badge variant="danger"><AlertCircle className="mr-1 h-3 w-3" />{item.overdueTaskCount}</Badge> : null}</div>
            ),
        },
    ]

    const activeFilterCount = [owner, health, monitoring, client, verified, contact, next, actions, quality].filter(Boolean).length

    function clearFilters() {
        setOwner('')
        setHealth('')
        setMonitoring('')
        setClient('')
        setVerified('')
        setContact('')
        setNext('')
        setActions('')
        setQuality('')
        router.replace(pathname)
    }

    return (
        <div className="space-y-4">
            <FilterBar
                search={{
                    value: query,
                    onChange: (value) => { setQuery(value); setUrl('q', value) },
                    placeholder: 'Szukaj konsultanta, klienta lub roli…',
                }}
                filters={(
                    <>
                        <select aria-label="Opiekun TCM" className={selectClass} value={owner} onChange={(event) => { setOwner(event.target.value); setUrl('owner', event.target.value) }}><option value="">Wszyscy opiekunowie</option>{owners.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
                        <select aria-label="Status relacji" className={selectClass} value={health} onChange={(event) => { setHealth(event.target.value); setUrl('health', event.target.value) }}><option value="">Każdy status relacji</option><option value="green">Zielony</option><option value="amber">Żółty</option><option value="red">Czerwony</option><option value="unknown">Bez statusu</option></select>
                        <select aria-label="Monitoring" className={selectClass} value={monitoring} onChange={(event) => { setMonitoring(event.target.value); setUrl('monitoring', event.target.value) }}><option value="">Każdy monitoring</option><option value="active">Aktywny</option><option value="paused">Wstrzymany</option><option value="inactive">Nieaktywny</option></select>
                        <select aria-label="Klient" className={selectClass} value={client} onChange={(event) => { setClient(event.target.value); setUrl('client', event.target.value) }}><option value="">Wszyscy klienci</option>{clients.map((name) => <option key={name} value={name}>{name}</option>)}</select>
                        <select aria-label="Weryfikacja statusu" className={selectClass} value={verified} onChange={(event) => { setVerified(event.target.value); setUrl('verified', event.target.value) }}><option value="">Każda weryfikacja</option><option value="verified">Status potwierdzony</option><option value="unverified">Status do weryfikacji</option></select>
                        <select aria-label="Ostatni kontakt" className={selectClass} value={contact} onChange={(event) => { setContact(event.target.value); setUrl('contact', event.target.value) }}><option value="">Każdy ostatni kontakt</option><option value="recent30">W ostatnich 30 dniach</option><option value="stale30">Ponad 30 dni temu</option><option value="never">Brak kontaktu</option></select>
                        <select aria-label="Następny check-in" className={selectClass} value={next} onChange={(event) => { setNext(event.target.value); setUrl('next', event.target.value) }}><option value="">Każdy kolejny check-in</option><option value="overdue">Zaległy</option><option value="upcoming">Zaplanowany</option><option value="none">Brak terminu</option></select>
                        <select aria-label="Działania" className={selectClass} value={actions} onChange={(event) => { setActions(event.target.value); setUrl('actions', event.target.value) }}><option value="">Każde działania</option><option value="overdue">Zaległe</option><option value="open">Otwarte</option><option value="none">Brak otwartych</option></select>
                        <select aria-label="Jakość danych" className={selectClass} value={quality} onChange={(event) => { setQuality(event.target.value); setUrl('quality', event.target.value) }}><option value="">Każda jakość danych</option><option value="missing_email">Brak e-maila</option><option value="missing_client">Brak klienta</option><option value="missing_owner">Brak opiekuna TCM</option></select>
                    </>
                )}
                resultCount={rows.length}
                chips={activeFilterCount > 0 ? [{ id: 'active', label: `${activeFilterCount} aktywne filtry`, onRemove: clearFilters }] : []}
            />
            <div className="rounded-xl border border-border bg-card px-4 sm:px-6 lg:px-8">
                <DataTable
                    columns={columns}
                    rows={rows}
                    getRowKey={(item) => item.contractorId}
                    rowHighlighted={(item) => item.health.status === 'red' || item.overdueTaskCount > 0}
                    onRowClick={(item) => router.push(`/internal/people/success/consultants/${item.contractorId}`)}
                    empty={<div className="flex flex-col items-center gap-2"><CalendarClock className="h-6 w-6" /><span>Brak konsultantów spełniających filtry.</span></div>}
                />
            </div>
        </div>
    )
}
