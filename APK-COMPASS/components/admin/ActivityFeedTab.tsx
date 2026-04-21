'use client'

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { ActivityItem } from '@/lib/actions/admin-dashboard'

interface ActivityFeedTabProps {
    activities: ActivityItem[]
    tierDistribution: {
        bronze: number
        silver: number
        gold: number
        platinum: number
    }
    avgPoints: number
    totalPointsIssued: number
    topConsultant: { name: string; points: number } | null
}

function formatTimeAgo(timestamp: string): string {
    const now = new Date()
    const date = new Date(timestamp)
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'przed chwilą'
    if (diffMins < 60) return `${diffMins} min temu`
    if (diffHours < 24) return `${diffHours} godz. temu`
    if (diffDays === 1) return 'wczoraj'
    if (diffDays < 7) return `${diffDays} dni temu`
    return date.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })
}

function formatNumber(n: number): string {
    return n.toLocaleString('pl-PL')
}

export function ActivityFeedTab({
    activities,
    tierDistribution,
    avgPoints,
    totalPointsIssued,
    topConsultant
}: ActivityFeedTabProps) {
    const totalTier = tierDistribution.bronze + tierDistribution.silver + tierDistribution.gold + tierDistribution.platinum
    const tierPercent = (tier: number) => totalTier > 0 ? Math.round((tier / totalTier) * 100) : 0

    return (
        <div className="grid gap-4 md:grid-cols-2">
            {/* Left: Activity Feed */}
            <Card className="bg-background/50 border-white/10">
                <CardHeader className="pb-3">
                    <CardTitle className="text-lg text-white flex items-center gap-2">
                        <span>📋</span> Feed aktywności
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                    {activities.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">Brak ostatniej aktywności</p>
                    ) : (
                        activities.slice(0, 8).map((activity) => (
                            <div key={activity.id} className="flex items-start gap-3 py-3 border-b border-white/5 last:border-0">
                                <div className="mt-1.5 flex-shrink-0">
                                    <div className={`w-2.5 h-2.5 rounded-full ${
                                        activity.color === 'emerald' ? 'bg-primary' :
                                        activity.color === 'blue' ? 'bg-foreground' :
                                        activity.color === 'amber' ? 'bg-amber-400' :
                                        activity.color === 'red' ? 'bg-red-400' : 'bg-foreground'
                                    }`} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm text-white">
                                        <span className="font-medium">{activity.actor_name}</span>
                                        {' '}
                                        <span className="text-muted-foreground">{activity.description}</span>
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-0.5">{formatTimeAgo(activity.timestamp)}</p>
                                </div>
                            </div>
                        ))
                    )}
                </CardContent>
            </Card>

            {/* Right: Tier Distribution + Loyalty Points */}
            <div className="space-y-4">
                {/* Tier Distribution */}
                <Card className="bg-background/50 border-white/10">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-lg text-white flex items-center gap-2">
                            <span>📊</span> Tier Distribution
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-4 gap-4 mb-4">
                            <div className="text-center">
                                <p className="text-2xl font-bold text-amber-600">{tierDistribution.bronze}</p>
                                <p className="text-xs text-muted-foreground">Bronze</p>
                            </div>
                            <div className="text-center">
                                <p className="text-2xl font-bold text-foreground">{tierDistribution.silver}</p>
                                <p className="text-xs text-muted-foreground">Silver</p>
                            </div>
                            <div className="text-center">
                                <p className="text-2xl font-bold text-yellow-400">{tierDistribution.gold}</p>
                                <p className="text-xs text-muted-foreground">Gold</p>
                            </div>
                            <div className="text-center">
                                <p className="text-2xl font-bold text-foreground">{tierDistribution.platinum}</p>
                                <p className="text-xs text-muted-foreground">Platinum</p>
                            </div>
                        </div>

                        {/* Bar chart */}
                        <div className="h-4 bg-card rounded-full overflow-hidden flex">
                            {tierDistribution.bronze > 0 && (
                                <div
                                    className="h-full bg-amber-700 transition-all duration-500"
                                    style={{ width: `${tierPercent(tierDistribution.bronze)}%` }}
                                    title={`Bronze: ${tierDistribution.bronze}`}
                                />
                            )}
                            {tierDistribution.silver > 0 && (
                                <div
                                    className="h-full bg-muted-foreground transition-all duration-500"
                                    style={{ width: `${tierPercent(tierDistribution.silver)}%` }}
                                    title={`Silver: ${tierDistribution.silver}`}
                                />
                            )}
                            {tierDistribution.gold > 0 && (
                                <div
                                    className="h-full bg-yellow-500 transition-all duration-500"
                                    style={{ width: `${tierPercent(tierDistribution.gold)}%` }}
                                    title={`Gold: ${tierDistribution.gold}`}
                                />
                            )}
                            {tierDistribution.platinum > 0 && (
                                <div
                                    className="h-full bg-foreground transition-all duration-500"
                                    style={{ width: `${tierPercent(tierDistribution.platinum)}%` }}
                                    title={`Platinum: ${tierDistribution.platinum}`}
                                />
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Loyalty Points */}
                <Card className="bg-background/50 border-white/10">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-lg text-white flex items-center gap-2">
                            <span>💎</span> Punkty lojalnościowe
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="flex items-center justify-between py-2 border-b border-white/5">
                            <span className="text-sm text-muted-foreground">Avg punktów</span>
                            <span className="text-sm font-semibold text-white">{formatNumber(avgPoints)} pkt</span>
                        </div>
                        <div className="flex items-center justify-between py-2 border-b border-white/5">
                            <span className="text-sm text-muted-foreground">Wydane łącznie</span>
                            <span className="text-sm font-semibold text-primary">+{formatNumber(totalPointsIssued)} pkt</span>
                        </div>
                        {topConsultant && (
                            <div className="flex items-center justify-between py-2">
                                <span className="text-sm text-muted-foreground">Top konsultant</span>
                                <span className="text-sm font-semibold text-yellow-400">
                                    {topConsultant.name} ({formatNumber(topConsultant.points)})
                                </span>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
