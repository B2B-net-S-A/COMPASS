'use client'

import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Sparkles, Trophy } from "lucide-react"
import { getTier, computeTierProgress, TIER_COLORS, type TierName } from "@/lib/league-config"

interface LoyaltyWidgetProps {
    points: number
    tier: string
}

export function LoyaltyWidget({ points, tier }: LoyaltyWidgetProps) {
    const tierInfo = getTier(tier)
    const tierName = tierInfo.name as TierName
    const nextTier = tierInfo.next ?? 'max'
    const currentProgress = computeTierProgress(points, tierName)
    const pointsToNext = tierInfo.next ? Math.max(0, tierInfo.nextThreshold - points) : 0
    const colors = TIER_COLORS[tierName]

    return (
        <Card className={`relative overflow-hidden border card-hover ${colors.bg}`}>
            <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-current to-transparent opacity-30 ${colors.text}`} />

            <CardContent className="p-4 flex flex-col items-center text-center">
                <div className={`mb-2 p-3 rounded-full ${colors.bg}`}>
                    <Trophy className={`w-6 h-6 ${colors.text}`} />
                </div>

                <h3 className="text-lg font-bold uppercase tracking-widest leading-none mb-1">
                    {tierInfo.label} Member
                </h3>

                <div className="flex items-center gap-1.5 text-xs text-slate-600 mb-4">
                    <Sparkles className="w-3 h-3 text-yellow-500" />
                    <span>{points} punktów lojalnościowych</span>
                </div>

                <div className="w-full space-y-1.5">
                    <div className="flex justify-between text-[10px] text-slate-600 uppercase font-semibold">
                        <span>{tierName}</span>
                        <span>{nextTier}</span>
                    </div>
                    <Progress value={currentProgress} className="h-1.5 bg-black/20" />
                    {tierInfo.next ? (
                        <p className="text-xs text-slate-600 text-right">
                            Brakuje <span className="text-white font-mono">{pointsToNext}</span> pkt
                        </p>
                    ) : (
                        <p className="text-xs text-slate-600 text-right">
                            Najwyższy poziom!
                        </p>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}
