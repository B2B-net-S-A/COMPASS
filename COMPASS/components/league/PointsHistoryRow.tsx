'use client'

import { Badge } from '@/components/ui/badge'
import { Clock, RotateCcw, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export type LoyaltyTxStatus = 'pending' | 'confirmed' | 'reversed'

export interface PointsHistoryEntry {
    id: string
    points: number
    description: string
    sourceType: string
    status: LoyaltyTxStatus
    createdAt: string
}

interface PointsHistoryRowProps {
    tx: PointsHistoryEntry
    className?: string
}

const STATUS_BADGE: Record<LoyaltyTxStatus, { label: string; bg: string; icon: typeof Clock }> = {
    pending: { label: 'Oczekuje', bg: 'bg-warning/10 text-warning border-warning/30', icon: Clock },
    confirmed: { label: 'Zatwierdzone', bg: 'bg-success/10 text-success border-success/30', icon: CheckCircle2 },
    reversed: { label: 'Cofnięte', bg: 'bg-destructive/10 text-destructive border-destructive/30', icon: RotateCcw },
}

export function PointsHistoryRow({ tx, className }: PointsHistoryRowProps) {
    const status = STATUS_BADGE[tx.status]
    const StatusIcon = status.icon
    const isPositive = tx.points > 0
    const isPending = tx.status === 'pending'
    const isReversed = tx.status === 'reversed'

    return (
        <div role="listitem" className={cn('flex items-center justify-between gap-3 p-3 border-b border-border last:border-0', className)}>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium truncate">{tx.description}</span>
                    <Badge variant="outline" className={cn('text-[10px] gap-1 inline-flex items-center', status.bg)}>
                        <StatusIcon className="w-2.5 h-2.5" />
                        {status.label}
                    </Badge>
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                    {new Date(tx.createdAt).toLocaleString('pl-PL')}
                    {' · '}
                    {tx.sourceType.replace(/_/g, ' ')}
                </p>
            </div>
            <div
                className={cn(
                    'font-mono text-sm font-bold whitespace-nowrap',
                    isReversed && 'text-muted-foreground line-through',
                    !isReversed && isPositive && (isPending ? 'text-warning' : 'text-success'),
                    !isReversed && !isPositive && 'text-destructive',
                )}
            >
                {isPositive ? '+' : ''}
                {tx.points}
            </div>
        </div>
    )
}
