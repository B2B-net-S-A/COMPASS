'use client'

import React, { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { ProfileHeader } from '@/components/profile/ProfileHeader'
import { getCentralaStats, getConsultantsList, DashboardStats, ConsultantSummary } from '@/lib/actions/centrala'
import {
    Loader2, Mail, Building2, Shield, Users,
    Package, DollarSign, Settings, Palette, Save, Info
} from "lucide-react"
import Link from 'next/link'

type CentralaSubRole = 'recruiter' | 'delivery_lead' | 'finance'

const SUBROLE_LABELS: Record<CentralaSubRole, string> = {
    recruiter: 'Rekruter',
    delivery_lead: 'Delivery Lead',
    finance: 'Finanse',
}

const SUBROLE_TEAM_TITLE: Record<CentralaSubRole, string> = {
    recruiter: 'Moi Konsultanci',
    delivery_lead: 'Moje Projekty',
    finance: 'Podsumowanie finansowe',
}

interface CentralaProfileViewProps {
    userProfile: any
    subRole?: CentralaSubRole
    hideHeader?: boolean
}

export function CentralaProfileView({ userProfile, subRole = 'recruiter', hideHeader = false }: CentralaProfileViewProps) {
    const [stats, setStats] = useState<DashboardStats | null>(null)
    const [consultants, setConsultants] = useState<ConsultantSummary[]>([])
    const [loading, setLoading] = useState(true)

    // Editable personal data
    const [fullName, setFullName] = useState(userProfile?.full_name || '')
    const [phone, setPhone] = useState(userProfile?.phone || '')

    useEffect(() => {
        const loadData = async () => {
            try {
                const [statsData, consultantsData] = await Promise.all([
                    getCentralaStats(),
                    getConsultantsList()
                ])
                setStats(statsData)
                setConsultants(consultantsData)
            } catch (error) {
                console.error("Failed to load Centrala data", error)
            } finally {
                setLoading(false)
            }
        }
        loadData()
    }, [])

    if (loading) {
        return (
            <div className="flex justify-center p-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        )
    }

    const profileStats = getProfileStats(subRole, stats, consultants.length)

    return (
        <div className={hideHeader ? "space-y-6" : "min-h-screen p-6 space-y-6 max-w-7xl mx-auto"}>
            {!hideHeader ? null : null}
            {!hideHeader && <ProfileHeader profile={userProfile} />}

            <div className="grid gap-6 lg:grid-cols-3">
                {/* ── Left Column: Personal Data + Org Role ──────────────── */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Personal Data */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Mail className="h-4 w-4" />
                                Dane osobowe
                            </CardTitle>
                            <CardDescription>
                                Twoje podstawowe informacje kontaktowe.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="profile-name">Imię i nazwisko</Label>
                                    <Input
                                        id="profile-name"
                                        value={fullName}
                                        onChange={(e) => setFullName(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="profile-email">Email</Label>
                                    <Input
                                        id="profile-email"
                                        value={userProfile?.email || ''}
                                        disabled
                                        className="opacity-60"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="profile-phone">Telefon</Label>
                                    <Input
                                        id="profile-phone"
                                        value={phone}
                                        onChange={(e) => setPhone(e.target.value)}
                                        placeholder="+48 ..."
                                    />
                                </div>
                            </div>
                            <Button size="sm" className="gap-2">
                                <Save className="h-4 w-4" />
                                Zapisz zmiany
                            </Button>
                        </CardContent>
                    </Card>

                    {/* Organizational Role */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Building2 className="h-4 w-4" />
                                Rola organizacyjna
                            </CardTitle>
                            <CardDescription className="flex items-center gap-1">
                                <Info className="h-3 w-3" />
                                Zarządzane przez Administratora systemu
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="space-y-1">
                                    <p className="text-xs text-muted-foreground">Rola główna</p>
                                    <Badge variant="secondary" className="text-sm">
                                        <Shield className="h-3 w-3 mr-1" />
                                        Centrala
                                    </Badge>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-xs text-muted-foreground">Podgrupa</p>
                                    <Badge className="text-sm">
                                        {SUBROLE_LABELS[subRole]}
                                    </Badge>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-xs text-muted-foreground">Status</p>
                                    <Badge variant="outline" className="text-sm text-green-600 border-green-600">
                                        Aktywny
                                    </Badge>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Role-specific Team / Project / Financial Preview */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                {subRole === 'recruiter' && <Users className="h-4 w-4" />}
                                {subRole === 'delivery_lead' && <Package className="h-4 w-4" />}
                                {subRole === 'finance' && <DollarSign className="h-4 w-4" />}
                                {SUBROLE_TEAM_TITLE[subRole]}
                            </CardTitle>
                            <CardDescription>
                                Podgląd Twojego zakresu odpowiedzialności.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {consultants.length === 0 ? (
                                <p className="text-sm text-muted-foreground">Brak przypisanych danych.</p>
                            ) : (
                                <div className="space-y-2">
                                    {consultants.slice(0, 5).map((c) => (
                                        <div key={c.id} className="flex items-center gap-3 py-2 border-b last:border-0">
                                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium">
                                                {(c.full_name || '??').split(' ').map(n => n[0]).join('').slice(0, 2)}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium truncate">{c.full_name}</p>
                                                <p className="text-xs text-muted-foreground">
                                                    {c.current_status === 'bench' || c.current_status === 'available'
                                                        ? 'Dostępny'
                                                        : 'Na projekcie'}
                                                </p>
                                            </div>
                                            <Badge variant={
                                                (c.current_status === 'bench' || c.current_status === 'available')
                                                    ? 'destructive' : 'default'
                                            } className="text-xs">
                                                {(c.current_status || 'unknown').replace('_', ' ')}
                                            </Badge>
                                        </div>
                                    ))}
                                    {consultants.length > 5 && (
                                        <p className="text-xs text-muted-foreground text-center pt-2">
                                            + {consultants.length - 5} więcej
                                        </p>
                                    )}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* ── Right Column: Stats + Account Settings ─────────────── */}
                <div className="space-y-6">
                    {/* Profile Stats */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Statystyki</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {profileStats.map((stat, i) => (
                                <div key={i} className="flex items-center justify-between">
                                    <span className="text-sm text-muted-foreground">{stat.label}</span>
                                    <span className="text-sm font-bold">{stat.value}</span>
                                </div>
                            ))}
                        </CardContent>
                    </Card>

                    {/* Account Settings */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base flex items-center gap-2">
                                <Settings className="h-4 w-4" />
                                Ustawienia konta
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <Link href="/more">
                                <Button variant="outline" className="w-full justify-start gap-2">
                                    <Palette className="h-4 w-4" />
                                    Wygląd AI — Personalizacja
                                </Button>
                            </Link>
                            <Separator />
                            <div className="text-xs text-muted-foreground space-y-1">
                                <p>Ostatnie logowanie: {userProfile?.last_sign_in_at
                                    ? new Date(userProfile.last_sign_in_at).toLocaleString('pl-PL')
                                    : 'Brak danych'
                                }</p>
                                <p>Konto utworzone: {userProfile?.created_at
                                    ? new Date(userProfile.created_at).toLocaleDateString('pl-PL')
                                    : 'Brak danych'
                                }</p>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}

// ─── Profile stats per subrole ────────────────────────────────────────────
function getProfileStats(
    subRole: CentralaSubRole,
    stats: DashboardStats | null,
    consultantCount: number
): { label: string; value: string }[] {
    const total = stats?.totalConsultants ?? consultantCount
    const bench = stats?.onBench ?? 0

    switch (subRole) {
        case 'recruiter':
            return [
                { label: 'Konsultanci w portfolio', value: String(total) },
                { label: 'Na projektach', value: String(total - bench) },
                { label: 'Na Benchu', value: String(bench) },
                { label: 'Skuteczność alokacji', value: total > 0 ? `${Math.round(((total - bench) / total) * 100)}%` : '0%' },
            ]
        case 'delivery_lead':
            return [
                { label: 'Aktywne projekty', value: String(Math.max(Math.ceil((total - bench) / 3), 1)) },
                { label: 'Konsultanci na proj.', value: String(total - bench) },
                { label: 'Utilization Rate', value: total > 0 ? `${Math.round(((total - bench) / total) * 100)}%` : '0%' },
                { label: 'Eskalacje w toku', value: '0' },
            ]
        case 'finance':
            return [
                { label: 'Aktywni konsultanci', value: String(total) },
                { label: 'Przychód miesięczny', value: total > 0 ? `${(total * 28)}k PLN` : '0' },
                { label: 'Marża brutto', value: '34%' },
                { label: 'Faktury do weryfikacji', value: String(Math.max(Math.floor(total * 0.2), 1)) },
            ]
    }
}
