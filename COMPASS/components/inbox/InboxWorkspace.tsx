'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { KanbanBoard } from './KanbanBoard'
import { NewInboxTicketDialog } from './NewInboxTicketDialog'
import { InboxCasePanel } from './InboxCasePanel'
import { fieldClass, type InboxOptions } from './InboxCaseEditor'
import { DEFAULT_FILTERS, AREA_LABELS, filterInboxTickets, getInboxArea, groupInboxTickets, matchesView, type InboxFilters } from '@/lib/inbox/workspace'
import type { InboxTicketWithMeta, TicketStatus } from '@/lib/types/support'

interface InboxWorkspaceProps extends InboxOptions {
    columns: Record<TicketStatus, InboxTicketWithMeta[]>
    currentUserId: string
}
const paramKeys: Record<keyof InboxFilters, string> = { area: 'board', view: 'view', query: 'q', assignee: 'owner', category: 'type', priority: 'priority', client: 'client', quick: 'quick', sort: 'sort' }

export function InboxWorkspace({ columns, categories, handlers, currentUserId }: InboxWorkspaceProps) {
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const [now, setNow] = useState(() => new Date())
    const [selectedId, setSelectedId] = useState<string | null>(null)
    useEffect(() => { const timer = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(timer) }, [])
    const filters = { ...DEFAULT_FILTERS }
    for (const key of Object.keys(paramKeys) as Array<keyof InboxFilters>) {
        const value = searchParams.get(paramKeys[key])
        if (value) Object.assign(filters, { [key]: value })
    }
    if (!['all', 'marketing', 'administration'].includes(filters.area)) filters.area = 'all'
    if (!['active', 'archive'].includes(filters.view)) filters.view = 'active'
    if (!['all', 'mine', 'unassigned', 'overdue', 'follow_up'].includes(filters.quick)) filters.quick = 'all'
    if (!['deadline', 'priority', 'inactive', 'updated'].includes(filters.sort)) filters.sort = 'deadline'
    const tickets = useMemo(() => Object.values(columns).flat(), [columns])
    const visible = filterInboxTickets(tickets, filters, currentUserId, now)
    const visibleColumns = groupInboxTickets(visible)
    const scoped = tickets.filter((ticket) => filters.area === 'all' || getInboxArea(ticket) === filters.area)
    const clients = Array.from(new Set(tickets.map((ticket) => ticket.client_name).filter((name): name is string => !!name))).sort((a, b) => a.localeCompare(b, 'pl'))
    const owners = new Map(handlers.map((handler) => [handler.id, handler.full_name ?? handler.email]))
    tickets.forEach((ticket) => { if (ticket.assignee_id && !owners.has(ticket.assignee_id)) owners.set(ticket.assignee_id, ticket.assignee_name ?? 'Poprzedni wykonawca') })
    const selected = tickets.find((ticket) => ticket.id === selectedId)

    function update(patch: Partial<InboxFilters>, replace = false) {
        const params = new URLSearchParams(searchParams.toString())
        for (const key of Object.keys(patch) as Array<keyof InboxFilters>) {
            const value = patch[key]!
            if (value === DEFAULT_FILTERS[key]) params.delete(paramKeys[key])
            else params.set(paramKeys[key], value)
        }
        const query = params.toString()
        window.history[replace ? 'replaceState' : 'pushState'](null, '', `${pathname}${query ? `?${query}` : ''}`)
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div role="group" aria-label="Obszar spraw" className="flex flex-wrap gap-2">
                    {(['all', 'administration', 'marketing'] as const).map((area) => <Button key={area} variant={filters.area === area ? 'default' : 'outline'} aria-pressed={filters.area === area} onClick={() => update({ area })}>{area === 'all' ? 'Wszystkie sprawy' : AREA_LABELS[area]}</Button>)}
                </div>
                {handlers.length > 0 && categories.length > 0 && currentUserId && <NewInboxTicketDialog key={filters.area} categories={categories} handlers={handlers} currentUserId={currentUserId} defaultArea={filters.area === 'marketing' ? 'marketing' : 'administration'} triggerLabel={filters.area === 'marketing' ? 'Dodaj sprawę Marketingu' : 'Dodaj sprawę'} />}
            </div>
            <div className="rounded-lg border bg-card p-3 space-y-3">
                <div role="group" aria-label="Zakres spraw" className="flex flex-wrap gap-2">
                    {(['active', 'archive'] as const).map((view) => <Button key={view} size="sm" variant={filters.view === view ? 'secondary' : 'ghost'} aria-pressed={filters.view === view} onClick={() => update({ view, quick: 'all' })}>{view === 'active' ? 'Aktywne' : 'Archiwum'} ({scoped.filter((ticket) => matchesView(ticket, view, now)).length})</Button>)}
                </div>
                <label className="block space-y-1 text-xs font-medium">Szukaj sprawy<Input value={filters.query} onChange={(event) => update({ query: event.target.value }, true)} placeholder="Tytuł, opis, konsultant, klient lub osoba…" /></label>
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                    <label className="text-xs font-medium space-y-1">Osoba odpowiedzialna<select className={fieldClass} value={filters.assignee} onChange={(event) => update({ assignee: event.target.value })}><option value="">Wszyscy</option>{Array.from(owners).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
                    <label className="text-xs font-medium space-y-1">Typ sprawy<select className={fieldClass} value={filters.category} onChange={(event) => update({ category: event.target.value })}><option value="">Wszystkie typy</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name_pl}</option>)}</select></label>
                    <label className="text-xs font-medium space-y-1">Priorytet<select className={fieldClass} value={filters.priority} onChange={(event) => update({ priority: event.target.value })}><option value="">Wszystkie priorytety</option>{['P1', 'P2', 'P3'].map((priority) => <option key={priority}>{priority}</option>)}</select></label>
                    <label className="text-xs font-medium space-y-1">Klient<select className={fieldClass} value={filters.client} onChange={(event) => update({ client: event.target.value })}><option value="">Wszyscy klienci</option>{clients.map((client) => <option key={client}>{client}</option>)}</select></label>
                    <label className="text-xs font-medium space-y-1">Sortowanie<select className={fieldClass} value={filters.sort} onChange={(event) => update({ sort: event.target.value as InboxFilters['sort'] })}><option value="deadline">Najbliższy termin</option><option value="priority">Najwyższy priorytet</option><option value="inactive">Najdłużej bez aktywności</option><option value="updated">Ostatnio zmienione</option></select></label>
                </div>
                <div role="group" aria-label="Szybkie filtry" className="flex flex-wrap gap-2">
                    {([['all', 'Wszystkie'], ['mine', 'Moje'], ['unassigned', 'Bez przypisania'], ['overdue', 'Po terminie'], ['follow_up', 'Do ponowienia']] as const).map(([quick, label]) => <Button key={quick} size="sm" variant={filters.quick === quick ? 'secondary' : 'outline'} aria-pressed={filters.quick === quick} onClick={() => update({ quick, ...(quick === 'mine' || quick === 'unassigned' ? { assignee: '' } : {}) })}>{label}</Button>)}
                    <Button size="sm" variant="ghost" onClick={() => update({ ...DEFAULT_FILTERS, area: filters.area, view: filters.view })}>Wyczyść filtry</Button>
                </div>
            </div>
            <div className="text-xs text-muted-foreground flex flex-wrap justify-between gap-2">
                <p role="status">Widoczne sprawy: {visible.length}</p>
                <p>{filters.view === 'active' ? 'Rozwiązane: ostatnie 14 dni. Pełna historia w archiwum.' : 'Wszystkie rozwiązane i zamknięte sprawy.'}</p>
            </div>
            <KanbanBoard initialColumns={visibleColumns} columnOrder={filters.view === 'active' ? ['open', 'in_progress', 'waiting_user', 'resolved'] : ['resolved', 'closed']} onOpenTicket={setSelectedId} now={now} />
            {selectedId && <InboxCasePanel key={selectedId} ticketId={selectedId} revision={selected?.updated_at} categories={categories} handlers={handlers} currentUserId={currentUserId} onClose={() => setSelectedId(null)} />}
        </div>
    )
}
