'use client'

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import type { DeliveryLeadEfficiency } from '@/lib/actions/admin-dashboard'

interface DeliveryLeadEfficiencyTabProps {
    deliveryLeads: DeliveryLeadEfficiency[]
}

function getInitials(name: string): string {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function ScoreRing({ score, size = 40 }: { score: number; size?: number }) {
    const radius = (size - 6) / 2
    const circumference = 2 * Math.PI * radius
    const offset = circumference - (score / 100) * circumference
    const color = score >= 80 ? 'hsl(var(--primary))' : score >= 60 ? '#f59e0b' : '#ef4444'

    return (
        <div className="relative" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="transform -rotate-90">
                <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="#1e293b" strokeWidth={3} />
                <circle
                    cx={size/2} cy={size/2} r={radius} fill="none"
                    stroke={color} strokeWidth={3}
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    strokeLinecap="round"
                    className="transition-all duration-700"
                />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white">
                {score}
            </span>
        </div>
    )
}

export function DeliveryLeadEfficiencyTab({ deliveryLeads }: DeliveryLeadEfficiencyTabProps) {
    if (deliveryLeads.length === 0) {
        return (
            <Card className="bg-background/50 border-white/10">
                <CardContent className="p-8 text-center text-muted-foreground">
                    <p>Brak danych o Delivery Leadach. Dodaj członków Centrali z rolą Delivery Lead.</p>
                </CardContent>
            </Card>
        )
    }

    return (
        <div className="space-y-4">
            <Card className="bg-background/50 border-white/10 overflow-hidden">
                <CardHeader className="pb-3">
                    <CardTitle className="text-lg text-white flex items-center gap-2">
                        <span>🎯</span> Ranking Delivery Lead
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-white/10">
                                    <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-6 py-3">#</th>
                                    <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Delivery Lead</th>
                                    <th className="text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Projekty</th>
                                    <th className="text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Konsultanci</th>
                                    <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Retencja</th>
                                    <th className="text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Avg bench (dni)</th>
                                    <th className="text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Eskalacje</th>
                                    <th className="text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Score</th>
                                </tr>
                            </thead>
                            <tbody>
                                {deliveryLeads.map((dl, idx) => (
                                    <tr key={dl.id || idx} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                                        <td className="px-6 py-4">
                                            <span className={`text-sm font-bold ${idx === 0 ? 'text-amber-400' : idx === 1 ? 'text-foreground' : 'text-muted-foreground'}`}>
                                                {idx + 1}
                                            </span>
                                        </td>
                                        <td className="px-4 py-4">
                                            <div className="flex items-center gap-3">
                                                <Avatar className="h-9 w-9 border border-white/10">
                                                    <AvatarImage src={dl.avatar_url || ''} />
                                                    <AvatarFallback className="bg-card text-foreground text-xs">
                                                        {getInitials(dl.full_name)}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <div>
                                                    <p className="text-sm font-medium text-white">{dl.full_name}</p>
                                                    <p className="text-xs text-muted-foreground">{dl.email}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-4 text-center">
                                            <span className="text-sm font-semibold text-white">{dl.project_count}</span>
                                        </td>
                                        <td className="px-4 py-4 text-center">
                                            <span className="text-sm font-semibold text-white">{dl.consultant_count}</span>
                                        </td>
                                        <td className="px-4 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="flex-1 h-2 bg-card rounded-full overflow-hidden min-w-[80px]">
                                                    <div
                                                        className={`h-full rounded-full transition-all duration-500 ${
                                                            dl.retention_rate >= 80 ? 'bg-burgundy' :
                                                            dl.retention_rate >= 60 ? 'bg-amber-500' : 'bg-red-500'
                                                        }`}
                                                        style={{ width: `${dl.retention_rate}%` }}
                                                    />
                                                </div>
                                                <span className="text-xs font-medium text-white w-10 text-right">{dl.retention_rate}%</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-4 text-center">
                                            <span className={`text-sm font-medium ${dl.avg_bench_days > 20 ? 'text-red-400' : dl.avg_bench_days > 10 ? 'text-amber-400' : 'text-primary'}`}>
                                                {dl.avg_bench_days}
                                            </span>
                                        </td>
                                        <td className="px-4 py-4 text-center">
                                            <Badge variant="outline" className={`text-xs ${dl.escalations > 0 ? 'border-red-500/30 text-red-400' : 'border-burgundy/30 text-primary'}`}>
                                                {dl.escalations}
                                            </Badge>
                                        </td>
                                        <td className="px-4 py-4 flex justify-center">
                                            <ScoreRing score={dl.score} />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            {/* Operational alerts */}
            <div className="grid gap-3 md:grid-cols-3">
                <Card className="bg-background/50 border-white/10">
                    <CardContent className="p-4 text-center">
                        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Łącznie konsultantów</p>
                        <p className="text-2xl font-bold text-white">
                            {deliveryLeads.reduce((sum, dl) => sum + dl.consultant_count, 0)}
                        </p>
                    </CardContent>
                </Card>
                <Card className="bg-background/50 border-white/10">
                    <CardContent className="p-4 text-center">
                        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Śr. Retencja</p>
                        <p className="text-2xl font-bold text-primary">
                            {deliveryLeads.length > 0 ? Math.round(deliveryLeads.reduce((sum, dl) => sum + dl.retention_rate, 0) / deliveryLeads.length) : 0}%
                        </p>
                    </CardContent>
                </Card>
                <Card className="bg-background/50 border-white/10">
                    <CardContent className="p-4 text-center">
                        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Aktywne eskalacje</p>
                        <p className="text-2xl font-bold text-red-400">
                            {deliveryLeads.reduce((sum, dl) => sum + dl.escalations, 0)}
                        </p>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
