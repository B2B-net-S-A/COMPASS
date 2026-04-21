'use client'

import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Sparkles, Trophy } from "lucide-react"
import { TIER_CONFIG } from "@/lib/loyalty-config"

interface LoyaltyWidgetProps {
    points: number
    tier: string
}

export function LoyaltyWidget({ points, tier }: LoyaltyWidgetProps) {
    // Use TIER_CONFIG as single source of truth
    const tierInfo = TIER_CONFIG.find(t => t.name === tier.toLowerCase()) || TIER_CONFIG[0]
    const nextTier = tierInfo.next || 'max'
    const prevThreshold = tierInfo.threshold
    const nextThreshold = tierInfo.nextThreshold

    const currentProgress = tierInfo.next
        ? Math.min(100, Math.max(0, ((points - prevThreshold) / (nextThreshold - prevThreshold)) * 100))
        : 100
    const pointsToNext = tierInfo.next ? Math.max(0, nextThreshold - points) : 0

    const getTierColor = (t: string) => {
        switch (t.toLowerCase()) {
            case 'gold': return 'text-amber-400'
            case 'silver': return 'text-slate-300'
            case 'platinum': return 'text-slate-200'
            default: return 'text-amber-700'
        }
    }

    const getTierBg = (t: string) => {
        switch (t.toLowerCase()) {
            case 'gold': return 'bg-amber-400/10 border-amber-400/20'
            case 'silver': return 'bg-slate-300/10 border-slate-300/20'
            case 'platinum': return 'bg-slate-200/10 border-slate-200/20'
            default: return 'bg-amber-700/10 border-amber-700/20'
        }
    }

    return (
        <Card className={`relative overflow-hidden border card-hover ${getTierBg(tier)}`}>
            {/* Glossy alert effect */}
            <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-${getTierColor(tier).split('-')[1]}-500/50 to-transparent opacity-50`} />

            <CardContent className="p-4 flex flex-col items-center text-center">
                <div className={`mb-2 p-3 rounded-full ${getTierBg(tier)}`}>
                    <Trophy className={`w-6 h-6 ${getTierColor(tier)}`} />
                </div>

                <h3 className="text-lg font-bold uppercase tracking-widest leading-none mb-1">
                    {tier} Member
                </h3>

                <div className="flex items-center gap-1.5 text-xs text-slate-600 mb-4">
                    <Sparkles className="w-3 h-3 text-yellow-500" />
                    <span>{points} punktów lojalnościowych</span>
                </div>

                <div className="w-full space-y-1.5">
                    <div className="flex justify-between text-[10px] text-slate-600 uppercase font-semibold">
                        <span>{tier}</span>
                        <span>{nextTier}</span>
                    </div>
                    <Progress value={currentProgress} className="h-1.5 bg-black/20" indicatorClassName={`bg-${getTierColor(tier).split('-')[1]}-500`} />
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
