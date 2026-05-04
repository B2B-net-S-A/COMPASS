'use client'

import { cn } from '@/lib/utils'
import { TIER_COLORS, type TierName } from '@/lib/league-config'

interface ProgressRingProps {
    /** 0..100 */
    value: number
    /** Tier nazwa do koloru (default scout) */
    tier?: TierName
    /** Średnica w px (default 140) */
    size?: number
    /** Grubość pierścienia w px (default 12) */
    strokeWidth?: number
    /** Tekst w środku — np. "1240 pkt" */
    centerLabel?: React.ReactNode
    /** Pod-tekst w środku */
    centerSubLabel?: React.ReactNode
    className?: string
}

export function ProgressRing({
    value,
    tier = 'scout',
    size = 140,
    strokeWidth = 12,
    centerLabel,
    centerSubLabel,
    className,
}: ProgressRingProps) {
    const radius = (size - strokeWidth) / 2
    const circumference = 2 * Math.PI * radius
    const clamped = Math.max(0, Math.min(100, value))
    const offset = circumference - (clamped / 100) * circumference
    const colorClass = TIER_COLORS[tier].text

    return (
        <div className={cn('relative inline-flex items-center justify-center', className)} style={{ width: size, height: size }}>
            <svg width={size} height={size} className="-rotate-90 transform">
                {/* Track */}
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke="currentColor"
                    strokeWidth={strokeWidth}
                    fill="none"
                    className="text-white/5"
                />
                {/* Progress arc */}
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke="currentColor"
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    fill="none"
                    className={cn('transition-all duration-500', colorClass)}
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                {centerLabel && <div className="text-2xl font-bold">{centerLabel}</div>}
                {centerSubLabel && <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">{centerSubLabel}</div>}
            </div>
        </div>
    )
}
