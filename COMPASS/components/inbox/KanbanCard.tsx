'use client'

import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { InboxPriorityBadge } from './InboxPriorityBadge'
import { CaseDeadline } from './CaseDeadline'
import { AREA_LABELS, getInboxArea, needsFollowUp } from '@/lib/inbox/workspace'
import type { InboxTicketWithMeta } from '@/lib/types/support'

interface KanbanCardProps {
    ticket: InboxTicketWithMeta
    isDragging?: boolean
    onOpenTicket?: (id: string) => void
    now?: Date
}

export function KanbanCard({ ticket, isDragging, onOpenTicket, now }: KanbanCardProps) {
    const router = useRouter()
    const checklist = ticket.meta.checklist ?? []
    const open = () => onOpenTicket ? onOpenTicket(ticket.id) : router.push(`/admin/inbox/${ticket.id}`)
    return (
        <Card className={`bg-card border-border hover:border-primary/40 transition-colors p-3 space-y-3 ${isDragging ? 'border-primary/60 shadow-lg' : ''}`}>
            <button type="button" onClick={open} title={ticket.subject} className="text-left w-full font-semibold text-sm leading-snug line-clamp-3 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring rounded">{ticket.subject}</button>
            <div className="flex gap-1.5 flex-wrap items-center"><InboxPriorityBadge priority={ticket.meta.priority_level} /><CaseDeadline ticket={ticket} now={now} /></div>
            <p className="text-xs font-medium">{ticket.assignee_name ?? 'Bez przypisania'}</p>
            <div className="text-xs text-muted-foreground space-y-1">
                <p>{AREA_LABELS[getInboxArea(ticket)]} · {ticket.category_name_pl}</p>
                {(ticket.consultant_name || ticket.client_name) && <p className="truncate" title={[ticket.consultant_name, ticket.client_name].filter(Boolean).join(' · ')}>{[ticket.consultant_name, ticket.client_name].filter(Boolean).join(' · ')}</p>}
                {ticket.status === 'waiting_user' && <p className="line-clamp-2">Czekamy na: {ticket.meta.waiting_for || 'uzupełnij w szczegółach'}</p>}
                {ticket.meta.follow_up_date && <p className={needsFollowUp(ticket, now) ? 'font-medium text-warning' : ''}>Ponowienie: {ticket.meta.follow_up_date.split('-').reverse().join('.')}</p>}
                {checklist.length > 0 && <p>Checklista: {checklist.filter((item) => item.done).length}/{checklist.length}</p>}
            </div>
            <p className="text-[11px] text-muted-foreground">Zmieniono {new Date(ticket.updated_at).toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw' })}</p>
        </Card>
    )
}
