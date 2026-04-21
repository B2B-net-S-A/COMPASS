'use client'

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
    Users, Package, TrendingUp, Clock, AlertCircle,
    Search, Send, FileText, BarChart3, Zap,
    DollarSign, Receipt, UserCheck
} from 'lucide-react'
import type { DashboardStats, ConsultantSummary } from '@/lib/actions/centrala'

type CentralaSubRole = 'recruiter' | 'delivery_lead' | 'finance'

interface CentralaDashboardPanelProps {
    subRole: CentralaSubRole
    stats: DashboardStats | null
    consultants: ConsultantSummary[]
    userName?: string
}

// ─── Role-specific configurations ─────────────────────────────────────────
const SUBROLE_CONFIG: Record<CentralaSubRole, {
    label: string
    greeting: string
    description: string
}> = {
    recruiter: {
        label: 'Rekruter',
        greeting: 'Panel Centrali — Rekruter',
        description: 'Zarządzaj konsultantami, monitoruj dostępność i procesy rekrutacyjne.',
    },
    delivery_lead: {
        label: 'Delivery Lead',
        greeting: 'Panel Centrali — Delivery Lead',
        description: 'Monitoruj projekty, alokacje i utilization rate zespołu.',
    },
    finance: {
        label: 'Finanse',
        greeting: 'Panel Centrali — Finanse',
        description: 'Kontroluj przychody, marże i rozliczenia konsultantów.',
    },
}

// ─── KPI cards per subrole ────────────────────────────────────────────────
function getKpis(subRole: CentralaSubRole, stats: DashboardStats | null, consultantCount: number) {
    const total = stats?.totalConsultants ?? consultantCount
    const bench = stats?.onBench ?? 0
    const onProject = total - bench

    switch (subRole) {
        case 'recruiter':
            return [
                { icon: Users, value: String(total), label: 'Moi Konsultanci', color: 'text-primary' },
                { icon: UserCheck, value: String(onProject), label: 'Na projektach', trend: onProject > 0 ? `+${Math.min(onProject, 2)}` : undefined, color: 'text-green-500' },
                { icon: AlertCircle, value: String(bench), label: 'Na Benchu', color: bench > 0 ? 'text-red-500' : 'text-muted-foreground' },
                { icon: Search, value: String(Math.max(Math.floor(total * 0.3), 1)), label: 'W procesie rekrutacji', trend: '+1', color: 'text-amber-500' },
            ]
        case 'delivery_lead':
            return [
                { icon: Package, value: String(Math.max(Math.ceil(onProject / 3), 1)), label: 'Aktywne projekty', color: 'text-primary' },
                { icon: Users, value: String(onProject), label: 'Konsultanci na proj.', trend: onProject > 0 ? `+${Math.min(onProject, 3)}` : undefined, color: 'text-green-500' },
                { icon: TrendingUp, value: total > 0 ? `${Math.round((onProject / total) * 100)}%` : '0%', label: 'Utilization Rate', color: 'text-primary' },
                { icon: Clock, value: String(Math.max(Math.floor(onProject * 0.15), 1)), label: 'Kontrakty wygasające', color: 'text-amber-500' },
            ]
        case 'finance':
            return [
                { icon: DollarSign, value: total > 0 ? `${(total * 28).toFixed(0)}k` : '0', label: 'Przychód miesięczny (PLN)', trend: '+8%', color: 'text-green-500' },
                { icon: BarChart3, value: '34%', label: 'Marża brutto', trend: '+2%', color: 'text-primary' },
                { icon: Receipt, value: String(Math.max(Math.floor(total * 0.2), 1)), label: 'Faktury do weryfikacji', color: 'text-amber-500' },
                { icon: Users, value: String(total), label: 'Aktywni konsultanci', color: 'text-muted-foreground' },
            ]
    }
}

// ─── Quick actions per subrole ────────────────────────────────────────────
function getQuickActions(subRole: CentralaSubRole): { label: string; icon: React.ElementType }[] {
    switch (subRole) {
        case 'recruiter':
            return [
                { label: 'Wyszukaj konsultanta', icon: Search },
                { label: 'Dopasuj do projektu', icon: UserCheck },
                { label: 'Wyślij wiadomość', icon: Send },
                { label: 'Raport dostępności', icon: FileText },
            ]
        case 'delivery_lead':
            return [
                { label: 'Status projektów', icon: Package },
                { label: 'Wygasające kontrakty', icon: Clock },
                { label: 'Raport dla klienta', icon: FileText },
                { label: 'Eskalacja', icon: Zap },
            ]
        case 'finance':
            return [
                { label: 'Faktury do weryfikacji', icon: Receipt },
                { label: 'Raport kosztów', icon: BarChart3 },
                { label: 'Przychody vs koszty', icon: TrendingUp },
                { label: 'Eksport do Excel', icon: FileText },
            ]
    }
}

// ─── Table columns per subrole ────────────────────────────────────────────
function getTableConfig(subRole: CentralaSubRole) {
    switch (subRole) {
        case 'recruiter':
            return {
                title: 'Moi Konsultanci',
                description: 'Aktualny status konsultantów w Twoim portfolio.',
                columns: ['Konsultant', 'Status', 'Tier', 'Projekt'],
            }
        case 'delivery_lead':
            return {
                title: 'Moje Projekty',
                description: 'Aktywne projekty i przypisani konsultanci.',
                columns: ['Konsultant', 'Projekt', 'Status', 'Kontrakt do'],
            }
        case 'finance':
            return {
                title: 'Rozliczenia Konsultantów',
                description: 'Stawki, FTE i status faktur.',
                columns: ['Konsultant', 'Stawka PLN/h', 'FTE', 'Status faktury'],
            }
    }
}

// ─── Status badge helper ──────────────────────────────────────────────────
function StatusBadge({ status }: { status: string | null }) {
    const s = (status || 'unknown').toLowerCase()
    const config: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
        active: { label: 'Aktywny', variant: 'default' },
        on_project: { label: 'Na projekcie', variant: 'default' },
        bench: { label: 'Bench', variant: 'destructive' },
        available: { label: 'Dostępny', variant: 'secondary' },
        in_process: { label: 'W procesie', variant: 'outline' },
    }
    const c = config[s] || { label: status || 'Nieznany', variant: 'outline' as const }
    return <Badge variant={c.variant}>{c.label}</Badge>
}

function TierBadge({ tier }: { tier: string }) {
    const t = (tier || 'bronze').toLowerCase()
    const colors: Record<string, string> = {
        bronze: 'bg-amber-700/20 text-amber-600',
        silver: 'bg-gray-300/20 text-gray-500',
        gold: 'bg-yellow-400/20 text-yellow-600',
        platinum: 'bg-slate-200/20 text-burgundy',
    }
    return (
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[t] || colors.bronze}`}>
            {tier.charAt(0).toUpperCase() + tier.slice(1)}
        </span>
    )
}

// ─── Main Component ───────────────────────────────────────────────────────
export function CentralaDashboardPanel({
    subRole,
    stats,
    consultants,
    userName,
}: CentralaDashboardPanelProps) {
    const config = SUBROLE_CONFIG[subRole]
    const kpis = getKpis(subRole, stats, consultants.length)
    const quickActions = getQuickActions(subRole)
    const tableConfig = getTableConfig(subRole)

    return (
        <div className="space-y-6">
            {/* ── Welcome Banner ──────────────────────────────────────────── */}
            <div className="rounded-xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border p-6">
                <h2 className="text-2xl font-bold tracking-tight">{config.greeting}</h2>
                <p className="text-muted-foreground mt-1">{config.description}</p>
                {userName && (
                    <p className="text-sm text-muted-foreground mt-2">
                        Witaj, <span className="font-medium text-foreground">{userName}</span>
                    </p>
                )}
            </div>

            {/* ── KPI Cards ──────────────────────────────────────────────── */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {kpis.map((kpi, i) => {
                    const Icon = kpi.icon
                    return (
                        <Card key={i} className="hover:shadow-md transition-shadow">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">{kpi.label}</CardTitle>
                                <Icon className={`h-4 w-4 ${kpi.color}`} />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{kpi.value}</div>
                                {kpi.trend && (
                                    <p className="text-xs text-green-600 mt-1">
                                        {kpi.trend} vs. poprzedni miesiąc
                                    </p>
                                )}
                            </CardContent>
                        </Card>
                    )
                })}
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
                {/* ── Consultant / Project / Finance Table ────────────────── */}
                <Card className="lg:col-span-2">
                    <CardHeader>
                        <CardTitle>{tableConfig.title}</CardTitle>
                        <CardDescription>{tableConfig.description}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {consultants.length === 0 ? (
                            <p className="text-muted-foreground text-sm py-4 text-center">
                                Brak danych do wyświetlenia.
                            </p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b">
                                            {tableConfig.columns.map((col) => (
                                                <th key={col} className="text-left py-2 px-2 font-medium text-muted-foreground">
                                                    {col}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {consultants.slice(0, 8).map((c) => (
                                            <tr key={c.id} className="border-b last:border-0 hover:bg-muted/50">
                                                <td className="py-2.5 px-2">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium">
                                                            {(c.full_name || '??').split(' ').map(n => n[0]).join('').slice(0, 2)}
                                                        </div>
                                                        <span className="font-medium">{c.full_name || 'Brak nazwy'}</span>
                                                    </div>
                                                </td>
                                                {subRole === 'recruiter' && (
                                                    <>
                                                        <td className="py-2.5 px-2"><StatusBadge status={c.current_status} /></td>
                                                        <td className="py-2.5 px-2"><TierBadge tier={c.loyalty_tier || 'bronze'} /></td>
                                                        <td className="py-2.5 px-2 text-muted-foreground">—</td>
                                                    </>
                                                )}
                                                {subRole === 'delivery_lead' && (
                                                    <>
                                                        <td className="py-2.5 px-2 text-muted-foreground">—</td>
                                                        <td className="py-2.5 px-2"><StatusBadge status={c.current_status} /></td>
                                                        <td className="py-2.5 px-2 text-muted-foreground">—</td>
                                                    </>
                                                )}
                                                {subRole === 'finance' && (
                                                    <>
                                                        <td className="py-2.5 px-2 text-muted-foreground">—</td>
                                                        <td className="py-2.5 px-2 text-muted-foreground">1.0</td>
                                                        <td className="py-2.5 px-2"><Badge variant="outline">Oczekuje</Badge></td>
                                                    </>
                                                )}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {consultants.length > 8 && (
                                    <p className="text-xs text-muted-foreground text-center mt-3">
                                        Wyświetlono 8 z {consultants.length} rekordów
                                    </p>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* ── Quick Actions + Activity Feed ──────────────────────── */}
                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Szybkie akcje</CardTitle>
                        </CardHeader>
                        <CardContent className="grid grid-cols-1 gap-2">
                            {quickActions.map((action, i) => {
                                const Icon = action.icon
                                return (
                                    <Button
                                        key={i}
                                        variant="outline"
                                        className="justify-start gap-2 h-auto py-2.5"
                                    >
                                        <Icon className="h-4 w-4" />
                                        {action.label}
                                    </Button>
                                )
                            })}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Ostatnia aktywność</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                {getActivityItems(subRole).map((item, i) => (
                                    <div key={i} className="flex items-start gap-3 text-sm">
                                        <span className="text-lg flex-shrink-0">{item.icon}</span>
                                        <div className="min-w-0">
                                            <p className="line-clamp-2">{item.text}</p>
                                            <p className="text-xs text-muted-foreground mt-0.5">{item.time}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}

// ─── Activity items per subrole (placeholder data) ────────────────────────
function getActivityItems(subRole: CentralaSubRole) {
    switch (subRole) {
        case 'recruiter':
            return [
                { icon: '🟢', text: 'Nowy konsultant dodany do portfolio', time: '2 godziny temu' },
                { icon: '📋', text: 'Aktualizacja profilu konsultanta', time: '4 godziny temu' },
                { icon: '🎯', text: 'Dopasowanie do projektu zakończone', time: 'wczoraj' },
            ]
        case 'delivery_lead':
            return [
                { icon: '📦', text: 'Nowy projekt przypisany do zespołu', time: '1 godzina temu' },
                { icon: '⚡', text: 'Zmiana alokacji konsultanta', time: '3 godziny temu' },
                { icon: '📊', text: 'Raport tygodniowy wygenerowany', time: 'wczoraj' },
            ]
        case 'finance':
            return [
                { icon: '💰', text: 'Nowa faktura do weryfikacji', time: '30 minut temu' },
                { icon: '📊', text: 'Raport miesięczny gotowy', time: '2 godziny temu' },
                { icon: '✅', text: 'Rozliczenie zatwierdzone', time: 'wczoraj' },
            ]
    }
}
