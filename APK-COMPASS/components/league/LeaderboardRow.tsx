'use client'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { TierBadge } from './TierBadge'
import { cn } from '@/lib/utils'

export interface LeaderboardEntry {
    rank: number
    user_id: string
    full_name: string | null
    avatar_url: string | null
    loyalty_points: number
    loyalty_tier: string
    is_self: boolean
    is_anonymous: boolean
}

interface LeaderboardRowProps {
    entry: LeaderboardEntry
    className?: string
}

function rankAccent(rank: number): string {
    if (rank === 1) return 'text-amber-400 font-bold'
    if (rank === 2) return 'text-slate-300 font-bold'
    if (rank === 3) return 'text-amber-700 font-bold'
    return 'text-muted-foreground'
}

export function LeaderboardRow({ entry, className }: LeaderboardRowProps) {
    const displayName = entry.is_anonymous ? 'Anonim' : (entry.full_name ?? '—')
    const initials = entry.is_anonymous
        ? '??'
        : (entry.full_name ?? '?')
            .split(' ')
            .map((p) => p[0])
            .filter(Boolean)
            .slice(0, 2)
            .join('')
            .toUpperCase()

    return (
        <div
            className={cn(
                'flex items-center gap-3 p-3 border-b border-white/5 last:border-0 transition-colors',
                entry.is_self && 'bg-primary/5 ring-1 ring-primary/20',
                className,
            )}
        >
            <span className={cn('w-8 text-right font-mono text-sm tabular-nums', rankAccent(entry.rank))}>
                #{entry.rank}
            </span>
            <Avatar className="h-9 w-9">
                {!entry.is_anonymous && entry.avatar_url && <AvatarImage src={entry.avatar_url} alt={displayName} />}
                <AvatarFallback className="text-[10px] bg-white/5">{initials}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                    {displayName}
                    {entry.is_self && <span className="ml-2 text-[10px] text-primary uppercase tracking-wider">(Ty)</span>}
                </p>
                <TierBadge tier={entry.loyalty_tier} size="sm" />
            </div>
            <span className="font-mono font-bold text-sm tabular-nums whitespace-nowrap">
                {entry.loyalty_points.toLocaleString('pl-PL')} pkt
            </span>
        </div>
    )
}
