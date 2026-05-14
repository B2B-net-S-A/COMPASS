
'use client'

import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { Zap } from 'lucide-react'

interface LoyaltyProgressBarProps {
    currentPoints: number
    nextTierPoints: number
    className?: string
}

export function LoyaltyProgressBar({ currentPoints, nextTierPoints, className }: LoyaltyProgressBarProps) {
    const progress = Math.min(100, (currentPoints / nextTierPoints) * 100)
    const remaining = nextTierPoints - currentPoints

    return (
        <div className={cn("w-full space-y-2", className)}>
            <div className="flex justify-between text-xs text-muted-foreground font-medium">
                <span>{currentPoints} pkt</span>
                <span>Cel: {nextTierPoints} pkt</span>
            </div>

            <div className="relative">
                <Progress value={progress} className="h-2 bg-muted transition-all" indicatorClassName="bg-gradient-to-r from-primary to-foreground" />

                {/* Milestone Marker (Optional visual flare) */}
                <div className="absolute top-1/2 right-0 -translate-y-1/2 translate-x-1/2 hidden">
                    <div className="bg-background border border-border rounded-full p-0.5 shadow-sm">
                        <Zap className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                    </div>
                </div>
            </div>

            <p className="text-[10px] text-center text-muted-foreground">
                Brakuje <span className="font-bold text-foreground">{remaining} pkt</span> do awansu
            </p>
        </div>
    )
}
