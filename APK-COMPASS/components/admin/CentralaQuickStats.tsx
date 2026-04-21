'use client'

import React, { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Users, AlertTriangle, CheckCircle, TrendingUp } from "lucide-react"
import Link from 'next/link'
import { Button } from "@/components/ui/button"
import { getAssignmentStats, getCentralaMembers } from "@/lib/actions/centrala-management"

interface StatsData {
    totalConsultants: number
    assignedCount: number
    unassignedCount: number
    avgAssignments: number
    maxAssignments: number
    minAssignments: number
    memberCount: number
}

interface Alert {
    type: 'warning' | 'info' | 'success'
    message: string
}

export function CentralaQuickStats() {
    const [stats, setStats] = useState<StatsData | null>(null)
    const [memberCount, setMemberCount] = useState<number>(0)
    const [alerts, setAlerts] = useState<Alert[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(false)

    useEffect(() => {
        async function load() {
            try {
                const [statsData, members] = await Promise.all([
                    getAssignmentStats(),
                    getCentralaMembers()
                ])
                setStats(statsData)
                setMemberCount(members.length)

                // Generate alerts based on real data
                const newAlerts: Alert[] = []

                if (statsData.unassignedCount > 0) {
                    newAlerts.push({
                        type: 'warning',
                        message: `${statsData.unassignedCount} konsultant${statsData.unassignedCount === 1 ? '' : statsData.unassignedCount < 5 ? 'ów' : 'ów'} bez przypisania`
                    })
                }

                if (statsData.maxAssignments > 0 && statsData.maxAssignments > statsData.avgAssignments * 2) {
                    newAlerts.push({
                        type: 'warning',
                        message: `Nierówne obciążenie: max ${statsData.maxAssignments} vs śr. ${statsData.avgAssignments}`
                    })
                }

                if (statsData.unassignedCount === 0 && statsData.totalConsultants > 0) {
                    newAlerts.push({
                        type: 'success',
                        message: 'Wszyscy konsultanci przypisani'
                    })
                }

                if (members.length === 0) {
                    newAlerts.push({
                        type: 'info',
                        message: 'Brak członków Centrali — dodaj w ustawieniach'
                    })
                }

                setAlerts(newAlerts)
            } catch {
                setError(true)
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [])

    if (loading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Centrala — Podgląd</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-3 animate-pulse">
                        <div className="h-4 bg-muted rounded w-3/4" />
                        <div className="h-4 bg-muted rounded w-1/2" />
                        <div className="h-4 bg-muted rounded w-2/3" />
                    </div>
                </CardContent>
            </Card>
        )
    }

    if (error || !stats) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Centrala — Podgląd</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground">Nie udało się załadować danych.</p>
                    <Link href="/admin/settings/team">
                        <Button variant="outline" size="sm" className="mt-3 w-full">
                            Zarządzaj Centralą
                        </Button>
                    </Link>
                </CardContent>
            </Card>
        )
    }

    const assignedPct = stats.totalConsultants > 0
        ? Math.round((stats.assignedCount / stats.totalConsultants) * 100)
        : 0

    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Centrala — Podgląd
                </CardTitle>
                <CardDescription>Statystyki i alerty</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* KPI mini-grid */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="text-center p-2 bg-muted/50 rounded">
                        <div className="text-lg font-bold">{memberCount}</div>
                        <div className="text-[11px] text-muted-foreground">Członków</div>
                    </div>
                    <div className="text-center p-2 bg-muted/50 rounded">
                        <div className="text-lg font-bold">{stats.totalConsultants}</div>
                        <div className="text-[11px] text-muted-foreground">Konsultantów</div>
                    </div>
                </div>

                {/* Assignment progress bar */}
                <div className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Przypisani</span>
                        <span className="font-medium">{stats.assignedCount}/{stats.totalConsultants} ({assignedPct}%)</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all ${
                                assignedPct === 100 ? 'bg-green-500' :
                                assignedPct >= 80 ? 'bg-primary' :
                                assignedPct >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                            }`}
                            style={{ width: `${assignedPct}%` }}
                        />
                    </div>
                </div>

                {/* Avg load */}
                {stats.avgAssignments > 0 && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <TrendingUp className="h-3 w-3" />
                        <span>Śr. obciążenie: <strong className="text-foreground">{stats.avgAssignments}</strong> konsultantów/osobę</span>
                    </div>
                )}

                {/* Alerts */}
                {alerts.length > 0 && (
                    <div className="space-y-2 pt-1 border-t">
                        {alerts.map((alert, i) => (
                            <div key={i} className={`flex items-start gap-2 text-xs ${
                                alert.type === 'warning' ? 'text-amber-600' :
                                alert.type === 'success' ? 'text-green-600' : 'text-burgundy'
                            }`}>
                                {alert.type === 'warning' ? (
                                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                ) : (
                                    <CheckCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                )}
                                <span>{alert.message}</span>
                            </div>
                        ))}
                    </div>
                )}

                <Link href="/admin/settings/team">
                    <Button variant="outline" size="sm" className="w-full mt-2">
                        Zarządzaj Centralą
                    </Button>
                </Link>
            </CardContent>
        </Card>
    )
}
