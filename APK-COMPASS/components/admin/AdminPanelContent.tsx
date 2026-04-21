'use client'

import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Users, TrendingUp, Clock, Briefcase, AlertTriangle, UserPlus, FileWarning, UserSearch } from "lucide-react"
import { RecruiterEfficiencyTab } from './RecruiterEfficiencyTab'
import { DeliveryLeadEfficiencyTab } from './DeliveryLeadEfficiencyTab'
import { ConsultantAnalysisTab } from './ConsultantAnalysisTab'
import { ActivityFeedTab } from './ActivityFeedTab'
import { ExpiringContractsWidget } from './ExpiringContractsWidget'
import type { AdminDashboardData } from '@/lib/actions/admin-dashboard'

interface AdminPanelContentProps {
    dashboardData?: AdminDashboardData | null
}

const tabs = [
    { id: 'recruiters', label: 'Efektywność Rekruterów', icon: '👥' },
    { id: 'delivery', label: 'Efektywność Delivery Lead', icon: '🎯' },
    { id: 'consultants', label: 'Analiza Konsultantów', icon: '👤' },
    { id: 'activity', label: 'Ostatnia Aktywność', icon: '📊' },
] as const

type TabId = typeof tabs[number]['id']

export function AdminPanelContent({ dashboardData }: AdminPanelContentProps) {
    const [activeTab, setActiveTab] = useState<TabId>('recruiters')
    const data = dashboardData

    return (
        <div className="space-y-6">
            {/* ─── KPI Cards ─────────────────────────────────────────────── */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                <Card className="bg-gradient-to-br from-background to-card border-burgundy/15">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-foreground">Konsultanci</CardTitle>
                        <Users className="h-4 w-4 text-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-white">{data?.totalConsultants ?? '—'}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                            {data?.newRecruits ? `+${data.newRecruits} nowych w tym miesiącu` : 'Zarejestrowani'}
                        </p>
                    </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-background to-card border-burgundy/15">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-foreground">Kandydaci</CardTitle>
                        <UserSearch className="h-4 w-4 text-cyan-400" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-cyan-400">{data?.totalCandidates ?? '—'}</div>
                        <p className="text-xs text-muted-foreground mt-1">CV w bazie (pre-rejestracja)</p>
                    </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-background to-card border-burgundy/15">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-foreground">Utilization Rate</CardTitle>
                        <TrendingUp className="h-4 w-4 text-primary" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-primary">{data?.utilizationRate ?? '—'}%</div>
                        <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                                className="h-full bg-burgundy rounded-full transition-all duration-500"
                                style={{ width: `${data?.utilizationRate ?? 0}%` }}
                            />
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-background to-card border-burgundy/15">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-foreground">Na Benchu</CardTitle>
                        <Clock className="h-4 w-4 text-amber-400" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-amber-400">{data?.onBench ?? '—'}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                            {data?.benchOver30 ? (
                                <span className="text-red-400">{data.benchOver30} powyżej 30 dni</span>
                            ) : 'Bez długiego benchu'}
                        </p>
                    </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-background to-card border-burgundy/15">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-foreground">Aktywne projekty</CardTitle>
                        <Briefcase className="h-4 w-4 text-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-foreground">{data?.activeProjects ?? '—'}</div>
                        <p className="text-xs text-muted-foreground mt-1">Bieżące projekty w systemie</p>
                    </CardContent>
                </Card>
            </div>

            {/* ─── Alert Cards ────────────────────────────────────────────── */}
            {data && (data.benchOver30 > 0 || data.newRecruits > 0) && (
                <div className="grid gap-3 md:grid-cols-3">
                    {data.benchOver30 > 0 && (
                        <Card className="border-amber-500/30 bg-amber-500/5">
                            <CardContent className="p-4 flex items-center gap-3">
                                <AlertTriangle className="h-5 w-5 text-amber-400 flex-shrink-0" />
                                <div>
                                    <p className="text-sm font-medium text-amber-300">Bench &gt; 30 dni</p>
                                    <p className="text-xs text-muted-foreground">{data.benchOver30} konsultantów wymaga uwagi</p>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                    {data.expiringContracts > 0 && (
                        <Card className="border-red-500/30 bg-red-500/5">
                            <CardContent className="p-4 flex items-center gap-3">
                                <FileWarning className="h-5 w-5 text-red-400 flex-shrink-0" />
                                <div>
                                    <p className="text-sm font-medium text-red-300">Wygasające kontrakty</p>
                                    <p className="text-xs text-muted-foreground">{data.expiringContracts} w ciągu 30 dni</p>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                    {data.newRecruits > 0 && (
                        <Card className="border-primary/30 bg-burgundy/5">
                            <CardContent className="p-4 flex items-center gap-3">
                                <UserPlus className="h-5 w-5 text-primary flex-shrink-0" />
                                <div>
                                    <p className="text-sm font-medium text-primary">Nowi konsultanci</p>
                                    <p className="text-xs text-muted-foreground">{data.newRecruits} dołączyło w tym miesiącu</p>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>
            )}

            {/* ─── Expiring Contracts Widget ───────────────────────────── */}
            {data?.expiringContractsList && data.expiringContractsList.length > 0 && (
                <ExpiringContractsWidget contracts={data.expiringContractsList} />
            )}

            {/* ─── Tabs ──────────────────────────────────────────────────── */}
            <div className="flex gap-2 overflow-x-auto pb-1">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                            activeTab === tab.id
                                ? 'bg-burgundy/20 text-primary border border-primary/30'
                                : 'bg-card/50 text-muted-foreground border border-white/5 hover:bg-muted/50 hover:text-white'
                        }`}
                    >
                        <span>{tab.icon}</span>
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* ─── Tab Content ────────────────────────────────────────────── */}
            <div>
                {activeTab === 'recruiters' && (
                    <RecruiterEfficiencyTab recruiters={data?.recruiters || []} />
                )}
                {activeTab === 'delivery' && (
                    <DeliveryLeadEfficiencyTab deliveryLeads={data?.deliveryLeads || []} />
                )}
                {activeTab === 'consultants' && (
                    <ConsultantAnalysisTab consultants={data?.consultants || []} />
                )}
                {activeTab === 'activity' && (
                    <ActivityFeedTab
                        activities={data?.activities || []}
                        tierDistribution={data?.tierDistribution || { bronze: 0, silver: 0, gold: 0, platinum: 0 }}
                        avgPoints={data?.avgPoints || 0}
                        totalPointsIssued={data?.totalPointsIssued || 0}
                        topConsultant={data?.topConsultant || null}
                    />
                )}
            </div>
        </div>
    )
}
