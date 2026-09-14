'use client'

import { Badge } from '@/components/ui/badge'
import { deadlineDay, isFinished, isOverdue, warsawDay } from '@/lib/inbox/workspace'
import type { InboxTicketWithMeta } from '@/lib/types/support'

export function CaseDeadline({ ticket, now = new Date() }: { ticket: InboxTicketWithMeta; now?: Date }) {
    if (isFinished(ticket.status)) {
        return <span className="text-xs text-muted-foreground">{ticket.status === 'closed' ? 'Zakończono' : 'Rozwiązano'}{ticket.resolved_at ? ` ${new Date(ticket.resolved_at).toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw' })}` : ''}</span>
    }
    const date = deadlineDay(ticket)
    if (!date) return <Badge variant="outline" className="text-xs">Ustal termin</Badge>
    const overdue = isOverdue(ticket, now)
    const today = date === warsawDay(now)
    const label = date.split('-').reverse().join('.')
    return <Badge variant="outline" className={`text-xs ${overdue ? 'border-destructive/40 text-destructive bg-destructive/5' : today ? 'border-warning/40 text-warning bg-warning/5' : 'text-foreground'}`}>
        {ticket.meta.planned_due_date ? 'Termin' : 'SLA'}: {label}{overdue ? ' · po terminie' : today ? ' · dziś' : ''}
    </Badge>
}
