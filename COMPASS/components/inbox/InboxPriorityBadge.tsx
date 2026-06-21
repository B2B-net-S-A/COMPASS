import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { INBOX_PRIORITY_LABEL, type InboxPriorityLevel } from '@/lib/types/support'

const PRIORITY_CLASSES: Record<InboxPriorityLevel, string> = {
    P1: 'border-destructive/30 text-destructive bg-destructive/10',
    P2: 'border-warning/30 text-warning bg-warning/10',
    P3: 'border-success/30 text-success bg-success/10',
}

export function InboxPriorityBadge({
    priority,
    className,
}: {
    priority: InboxPriorityLevel
    className?: string
}) {
    return (
        <Badge variant="outline" className={cn('text-[10px] font-semibold', PRIORITY_CLASSES[priority], className)}>
            {INBOX_PRIORITY_LABEL[priority]}
        </Badge>
    )
}
