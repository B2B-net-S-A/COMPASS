'use client'

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Users, AlertCircle, TrendingUp, Award, Briefcase } from "lucide-react"
import { DashboardStats } from "@/lib/actions/centrala"

interface OperationalDashboardProps {
    stats: DashboardStats
}

export function OperationalDashboard({ stats }: OperationalDashboardProps) {
    return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Moi Konsultanci</CardTitle>
                    <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{stats.totalConsultants}</div>
                    <p className="text-xs text-muted-foreground">
                        Aktywni w bazie
                    </p>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Na Benchu</CardTitle>
                    <AlertCircle className={`h-4 w-4 ${stats.onBench > 0 ? 'text-red-500' : 'text-muted-foreground'}`} />
                </CardHeader>
                <CardContent>
                    <div className={`text-2xl font-bold ${stats.onBench > 0 ? 'text-red-500' : ''}`}>
                        {stats.onBench}
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Wymagają alokacji
                    </p>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Średnia Punktów</CardTitle>
                    <TrendingUp className="h-4 w-4 text-green-500" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{stats.avgPoints}</div>
                    <p className="text-xs text-muted-foreground">
                        Loyalty Program Engagement
                    </p>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Gold & Platinum</CardTitle>
                    <Award className="h-4 w-4 text-amber-500" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">
                        {stats.tierDistribution.gold + stats.tierDistribution.platinum}
                    </div>
                    <div className="flex text-xs text-muted-foreground gap-2">
                        <span>Gold: {stats.tierDistribution.gold}</span>
                        <span>Plat: {stats.tierDistribution.platinum}</span>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
