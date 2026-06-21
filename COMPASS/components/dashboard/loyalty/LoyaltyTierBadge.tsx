
'use client'

import { cn } from '@/lib/utils'
import { Crown, Star, Shield, Trophy } from 'lucide-react'

export type LoyaltyTier = 'bronze' | 'silver' | 'gold' | 'platinum'

interface LoyaltyTierBadgeProps {
    tier: LoyaltyTier
    className?: string
    showLabel?: boolean
}

const tierConfig: Record<LoyaltyTier, { label: string, color: string, icon: React.ComponentType<{ className?: string }>, bg: string }> = {
    bronze: {
        label: 'Bronze',
        color: 'text-tier-bronze',
        bg: 'bg-tier-bronze/10 border-tier-bronze/20',
        icon: Shield
    },
    silver: {
        label: 'Silver',
        color: 'text-muted-foreground',
        bg: 'bg-card border-muted-foreground/30',
        icon: Star
    },
    gold: {
        label: 'Gold',
        color: 'text-warning',
        bg: 'bg-warning/10 border-warning/20',
        icon: Crown
    },
    platinum: {
        label: 'Platinum',
        color: 'text-foreground',
        bg: 'bg-card border-burgundy/30',
        icon: Trophy
    }
}

export function LoyaltyTierBadge({ tier, className, showLabel = true }: LoyaltyTierBadgeProps) {
    // Fallback if tier is invalid
    const config = tierConfig[tier?.toLowerCase() as LoyaltyTier] || tierConfig.bronze
    const Icon = config.icon

    return (
        <div className={cn(
            "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-xs font-semibold uppercase tracking-wider",
            config.bg,
            config.color,
            className
        )}>
            <Icon className="w-3.5 h-3.5" />
            {showLabel && <span>{config.label}</span>}
        </div>
    )
}
