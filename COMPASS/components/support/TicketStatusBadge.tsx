import { Badge } from '@/components/ui/badge'
import type { TicketStatus, TicketPriority } from '@/lib/types/support'
import { TICKET_STATUS_LABEL, TICKET_PRIORITY_LABEL } from '@/lib/types/support'
import { cn } from '@/lib/utils'

const STATUS_CLASSES: Record<TicketStatus, string> = {
    open: 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10',
    in_progress: 'border-blue-500/30 text-blue-400 bg-blue-500/10',
    waiting_user: 'border-amber-500/30 text-amber-400 bg-amber-500/10',
    resolved: 'border-cyan-500/30 text-cyan-400 bg-cyan-500/10',
    closed: 'border-white/10 text-muted-foreground bg-white/5',
}

const PRIORITY_CLASSES: Record<TicketPriority, string> = {
    low: 'border-white/10 text-muted-foreground bg-white/5',
    normal: 'border-white/10 text-muted-foreground bg-white/5',
    high: 'border-amber-500/30 text-amber-400 bg-amber-500/10',
    urgent: 'border-red-500/30 text-red-400 bg-red-500/10',
}

export function TicketStatusBadge({ status, className }: { status: TicketStatus; className?: string }) {
    return (
        <Badge variant="outline" className={cn('text-[10px]', STATUS_CLASSES[status], className)}>
            {TICKET_STATUS_LABEL[status]}
        </Badge>
    )
}

export function TicketPriorityBadge({ priority, className }: { priority: TicketPriority; className?: string }) {
    if (priority === 'normal') return null
    return (
        <Badge variant="outline" className={cn('text-[10px]', PRIORITY_CLASSES[priority], className)}>
            {TICKET_PRIORITY_LABEL[priority]}
        </Badge>
    )
}
