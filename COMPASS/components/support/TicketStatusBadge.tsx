import { Badge } from '@/components/ui/badge'
import type { TicketStatus, TicketPriority } from '@/lib/types/support'
import { TICKET_STATUS_LABEL, TICKET_PRIORITY_LABEL } from '@/lib/types/support'
import { cn } from '@/lib/utils'

const STATUS_CLASSES: Record<TicketStatus, string> = {
    open: 'border-success/30 text-success bg-success/10',
    in_progress: 'border-info/30 text-info bg-info/10',
    waiting_user: 'border-warning/30 text-warning bg-warning/10',
    resolved: 'border-info/30 text-info bg-info/10',
    closed: 'border-border text-muted-foreground bg-muted',
}

const PRIORITY_CLASSES: Record<TicketPriority, string> = {
    low: 'border-border text-muted-foreground bg-muted',
    normal: 'border-border text-muted-foreground bg-muted',
    high: 'border-warning/30 text-warning bg-warning/10',
    urgent: 'border-destructive/30 text-destructive bg-destructive/10',
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
