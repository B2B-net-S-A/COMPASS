'use client'

import { Compass, Map, MountainSnow, Anchor, Crown, Sparkles, Trophy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getTier, TIER_COLORS, type TierName } from '@/lib/league-config'

const TIER_ICONS: Record<TierName, typeof Compass> = {
    scout: Compass,
    explorer: Map,
    pathfinder: MountainSnow,
    navigator: Anchor,
    captain: Crown,
    admiral: Sparkles,
    legend: Trophy,
}

interface TierBadgeProps {
    tier: string | null | undefined
    size?: 'sm' | 'md' | 'lg'
    showLabel?: boolean
    className?: string
}

const SIZE_CLASSES = {
    sm: { wrap: 'h-6 px-2 text-[10px] gap-1', icon: 'h-3 w-3' },
    md: { wrap: 'h-8 px-3 text-xs gap-1.5', icon: 'h-4 w-4' },
    lg: { wrap: 'h-12 px-4 text-sm gap-2', icon: 'h-5 w-5' },
}

export function TierBadge({ tier, size = 'md', showLabel = true, className }: TierBadgeProps) {
    const info = getTier(tier)
    const tierName = info.name as TierName
    const Icon = TIER_ICONS[tierName]
    const colors = TIER_COLORS[tierName]
    const sizeClasses = SIZE_CLASSES[size]

    return (
        <span
            className={cn(
                'inline-flex items-center rounded-full border font-semibold uppercase tracking-wider',
                colors.text,
                colors.bg,
                sizeClasses.wrap,
                className,
            )}
        >
            <Icon className={sizeClasses.icon} />
            {showLabel && info.label}
        </span>
    )
}
