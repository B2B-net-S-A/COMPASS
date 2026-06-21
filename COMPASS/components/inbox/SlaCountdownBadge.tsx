'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { getSlaStatus, type SlaStatus } from '@/lib/utils/sla'

const SLA_CLASSES: Record<SlaStatus, string> = {
    green: 'border-success/30 text-success bg-success/10',
    yellow: 'border-warning/30 text-warning bg-warning/10',
    red: 'border-destructive/30 text-destructive bg-destructive/10',
}

function formatRelative(due: Date, now: Date): string {
    const diffMs = due.getTime() - now.getTime()
    const diffH = diffMs / (1000 * 60 * 60)
    if (diffH < 0) {
        const overdueDays = Math.floor(-diffH / 24)
        if (overdueDays >= 1) return `Przeterminowane ${overdueDays}d`
        return 'Przeterminowane'
    }
    if (diffH < 1) return 'za <1h'
    if (diffH < 24) return `za ${Math.round(diffH)}h`
    const days = Math.round(diffH / 24)
    return `za ${days}d`
}

export function SlaCountdownBadge({
    dueDate,
    className,
}: {
    dueDate: string
    className?: string
}) {
    const [now, setNow] = useState(() => new Date())

    useEffect(() => {
        // Refresh every 5 min so the badge stays current without bombarding render.
        const id = setInterval(() => setNow(new Date()), 5 * 60 * 1000)
        return () => clearInterval(id)
    }, [])

    const due = new Date(dueDate)
    const status = getSlaStatus(due, now)
    return (
        <Badge variant="outline" className={cn('text-[10px]', SLA_CLASSES[status], className)}>
            {formatRelative(due, now)}
        </Badge>
    )
}
