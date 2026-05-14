'use client'

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CalendarClock, AlertTriangle } from "lucide-react"
import type { ExpiringContractItem } from '@/lib/actions/admin-dashboard'

interface ExpiringContractsWidgetProps {
    contracts: ExpiringContractItem[]
}

export function ExpiringContractsWidget({ contracts }: ExpiringContractsWidgetProps) {
    if (contracts.length === 0) return null

    return (
        <Card className="border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-background">
            <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                    <CalendarClock className="h-5 w-5 text-amber-400" />
                    Kończące się kontrakty
                    <span className="ml-auto text-sm font-normal text-muted-foreground">
                        {contracts.length} w ciągu 30 dni
                    </span>
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="space-y-3">
                    {contracts.map(contract => (
                        <div
                            key={contract.id}
                            className="flex items-center justify-between p-3 rounded-lg bg-card/50 border border-white/5"
                        >
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-white truncate">
                                    {contract.consultant_name}
                                </p>
                                <p className="text-xs text-muted-foreground truncate">
                                    {contract.client_name} — {contract.project_name}
                                </p>
                            </div>
                            <div className="flex items-center gap-2 ml-4 shrink-0">
                                {contract.days_remaining <= 7 && (
                                    <AlertTriangle className="h-4 w-4 text-red-400" />
                                )}
                                <div className={`text-right ${contract.days_remaining <= 7 ? 'text-red-400' : contract.days_remaining <= 14 ? 'text-amber-400' : 'text-yellow-300'}`}>
                                    <p className="text-sm font-bold">{contract.days_remaining} dni</p>
                                    <p className="text-xs text-muted-foreground">
                                        {new Date(contract.end_date).toLocaleDateString('pl-PL')}
                                    </p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    )
}
