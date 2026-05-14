import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { INBOX_PRIORITY_LABEL, type InboxPriorityLevel } from '@/lib/types/support'

const PRIORITY_CLASSES: Record<InboxPriorityLevel, string> = {
    P1: 'border-red-500/30 text-red-400 bg-red-500/10',
    P2: 'border-amber-500/30 text-amber-400 bg-amber-500/10',
    P3: 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10',
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
