'use client'

import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Shield, Star, Settings, Users, Briefcase, TrendingUp, Award } from "lucide-react"
import Link from 'next/link'
import { ThemeQuickPicker } from '@/components/theme/ThemeQuickPicker'
import { useRouter } from 'next/navigation' // wymagany dla router.refresh() po zapisie profilu
import type { AdminDashboardData } from '@/lib/actions/admin-dashboard'
import { updateProfileFull } from '@/lib/actions/matching'
import { toast } from 'sonner'
import { toastSuccess } from '@/lib/toast-success'

interface AdminProfileSectionProps {
    userProfile: {
        full_name?: string | null
        email?: string | null
        avatar_url?: string | null
        phone?: string | null
        created_at?: string
        last_sign_in_at?: string | null
        role?: string
    }
    isSuperAdmin?: boolean
    dashboardData?: AdminDashboardData | null
}

function getInitials(name?: string | null): string {
    if (!name || typeof name !== 'string') return '?'
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

export function AdminProfileSection({ userProfile, isSuperAdmin = false, dashboardData }: AdminProfileSectionProps) {
    const router = useRouter()
    const user = userProfile ?? {}
    const data = dashboardData

    const [fullName, setFullName] = useState(user?.full_name || '')
    const [phone, setPhone] = useState(user?.phone || '')
    const [isSaving, setIsSaving] = useState(false)
    const [isDirty, setIsDirty] = useState(false)

    const handleSave = async () => {
        setIsSaving(true)
        try {
            const result = await updateProfileFull({
                full_name: fullName,
                phone: phone
            })
            // Odpowiedź w nieoczekiwanym formacie (np. błąd Next) — traktuj jak błąd
            if (!result || typeof result !== 'object' || !('success' in result)) {
                console.error('Profile update unexpected response:', result)
                toast.error('Nie udało się zapisać zmian. Spróbuj ponownie lub sprawdź logi serwera.')
                return
            }
            if (result.success === false) {
                toast.error(result.error || 'Nie udało się zapisać zmian.')
                return
            }
            setIsDirty(false)
            if (result.warning) {
                toast.warning(result.warning)
            } else {
                toastSuccess('Dane profilowe zostały zaktualizowane!')
            }
            router.refresh()
        } catch (error: unknown) {
            console.error('Failed to update admin profile:', error)
            // W produkcji Next często zwraca ogólny komunikat — nigdy nie pokazuj go użytkownikowi
            toast.error('Nie udało się zapisać zmian. Sprawdź połączenie i spróbuj ponownie. W razie powtórzenia sprawdź logi serwera (Render).')
        } finally {
            setIsSaving(false)
        }
    }

    const onNameChange = (val: string) => {
        setFullName(val)
        setIsDirty(val !== (user?.full_name || '') || phone !== (user?.phone || ''))
    }

    const onPhoneChange = (val: string) => {
        setPhone(val)
        setIsDirty(fullName !== (user?.full_name || '') || val !== (user?.phone || ''))
    }

    return (
        <div className="grid gap-6 md:grid-cols-2">
            {/* Left Column */}
            <div className="space-y-6">
                {/* Personal Data */}
                <Card className="bg-background/50 border-burgundy/15">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base text-white flex items-center gap-2">
                            <span>📇</span> Dane osobowe
                        </CardTitle>
                        <p className="text-xs text-muted-foreground">Twoje podstawowe informacje kontaktowe.</p>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid gap-4 md:grid-cols-2">
                            <div>
                                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Imię i Nazwisko</Label>
                                <Input
                                    value={fullName}
                                    onChange={(e) => onNameChange(e.target.value)}
                                    className="mt-1 bg-card border-white/10 text-white"
                                />
                            </div>
                            <div>
                                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Email</Label>
                                <Input
                                    value={user.email || ''}
                                    readOnly
                                    disabled
                                    className="mt-1 bg-card/50 border-white/5 text-muted-foreground/70"
                                />
                            </div>
                        </div>
                        <div>
                            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Telefon</Label>
                            <Input
                                value={phone}
                                onChange={(e) => onPhoneChange(e.target.value)}
                                placeholder="Nie podano"
                                className="mt-1 bg-card border-white/10 text-white placeholder:text-slate-600"
                            />
                        </div>

                        <div className="flex justify-end pt-2">
                            <Button
                                onClick={handleSave}
                                disabled={!isDirty || isSaving}
                                size="sm"
                                className="bg-gradient-to-r from-foreground to-burgundy hover:to-burgundy/80 shadow-lg text-xs"
                            >
                                {isSaving ? 'Zapisywanie...' : 'Zapisz dane kontaktowe'}
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {/* Organizational Role */}
                <Card className="bg-background/50 border-burgundy/15">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base text-white flex items-center gap-2">
                            <span>🏛️</span> Rola organizacyjna
                        </CardTitle>
                        <p className="text-xs text-muted-foreground">Zarządzane przez system. Kontakt: Zarząd.</p>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-wrap gap-3">
                            <div>
                                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Rola główna</p>
                                <Badge className="bg-burgundy/20 text-primary border-burgundy/30 px-3 py-1">
                                    <Shield className="w-3 h-3 mr-1.5" />
                                    Administrator
                                </Badge>
                            </div>
                            {isSuperAdmin && (
                                <div>
                                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Uprawnienia</p>
                                    <Badge className="bg-burgundy/30 text-foreground border-burgundy/40 px-3 py-1">
                                        <Star className="w-3 h-3 mr-1.5" />
                                        Super Admin
                                    </Badge>
                                </div>
                            )}
                            <div>
                                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Status</p>
                                <Badge className="bg-foreground/10 text-foreground border-foreground/20 px-3 py-1">
                                    <span className="w-2 h-2 rounded-full bg-foreground mr-1.5 animate-pulse" />
                                    Aktywny
                                </Badge>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Centrala Team */}
                {data && data.centralaTeam.length > 0 && (
                    <Card className="bg-background/50 border-burgundy/15">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base text-white flex items-center gap-2">
                                <span>👥</span> Zespół Centrali
                            </CardTitle>
                            <p className="text-xs text-muted-foreground">Podgląd struktury zespołu Centrali.</p>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-white/10">
                                            <th className="text-left text-xs font-semibold text-muted-foreground uppercase px-4 py-2">Członek</th>
                                            <th className="text-left text-xs font-semibold text-muted-foreground uppercase px-4 py-2">Podgrupa</th>
                                            <th className="text-center text-xs font-semibold text-muted-foreground uppercase px-4 py-2">Portfolio</th>
                                            <th className="text-center text-xs font-semibold text-muted-foreground uppercase px-4 py-2">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.centralaTeam.map((member, idx) => (
                                            <tr key={member.id || idx} className="border-b border-white/5 hover:bg-white/5">
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2">
                                                        <Avatar className="h-7 w-7 border border-white/10">
                                                            <AvatarImage src={member.avatar_url || ''} />
                                                            <AvatarFallback className="bg-muted text-xs text-foreground">
                                                                {getInitials(member.full_name)}
                                                            </AvatarFallback>
                                                        </Avatar>
                                                        <span className="text-sm text-white">{member.full_name}</span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <Badge variant="outline" className={`text-xs ${member.centrala_role === 'recruiter'
                                                            ? 'border-primary/30 text-foreground'
                                                            : member.centrala_role === 'delivery_lead'
                                                                ? 'border-primary/30 text-primary'
                                                                : 'border-muted-foreground/30 text-muted-foreground'
                                                        }`}>
                                                        {member.centrala_role === 'recruiter' ? 'Rekruter' :
                                                            member.centrala_role === 'delivery_lead' ? 'Delivery Lead' : 'Finance'}
                                                    </Badge>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className="text-sm font-medium text-white">{member.portfolio_count}</span>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <Badge variant="outline" className="text-xs border-primary/30 text-primary">
                                                        Aktywna
                                                    </Badge>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>

            {/* Right Column */}
            <div className="space-y-6">
                {/* System Stats */}
                <Card className="bg-background/50 border-burgundy/15">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base text-white flex items-center gap-2">
                            <span>📊</span> Statystyki systemowe
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="flex items-center justify-between py-2 border-b border-white/5">
                            <div className="flex items-center gap-2">
                                <Users className="w-4 h-4 text-foreground" />
                                <span className="text-sm text-muted-foreground">Użytkownicy ogółem</span>
                            </div>
                            <span className="text-sm font-bold text-white">{data?.totalConsultants ?? '—'}</span>
                        </div>
                        <div className="flex items-center justify-between py-2 border-b border-white/5">
                            <div className="flex items-center gap-2">
                                <Briefcase className="w-4 h-4 text-primary" />
                                <span className="text-sm text-muted-foreground">Aktywne projekty</span>
                            </div>
                            <span className="text-sm font-bold text-white">{data?.activeProjects ?? '—'}</span>
                        </div>
                        <div className="flex items-center justify-between py-2 border-b border-white/5">
                            <div className="flex items-center gap-2">
                                <TrendingUp className="w-4 h-4 text-primary" />
                                <span className="text-sm text-muted-foreground">Utilization Rate</span>
                            </div>
                            <span className="text-sm font-bold text-primary">{data?.utilizationRate ?? '—'}%</span>
                        </div>
                        <div className="flex items-center justify-between py-2">
                            <div className="flex items-center gap-2">
                                <Award className="w-4 h-4 text-primary" />
                                <span className="text-sm text-muted-foreground">Punkty (łącznie)</span>
                            </div>
                            <span className="text-sm font-bold text-white">
                                {data?.totalPointsIssued ? data.totalPointsIssued.toLocaleString('pl-PL') : '—'} pkt
                            </span>
                        </div>
                    </CardContent>
                </Card>

                {/* Account Settings */}
                <Card className="bg-background/50 border-burgundy/15">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base text-white flex items-center gap-2">
                            <Settings className="w-4 h-4" />
                            Ustawienia konta
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="flex items-center justify-between py-1 px-1">
                            <ThemeQuickPicker />
                        </div>
                        <Link href="/admin/settings/appearance">
                            <Button variant="outline" className="w-full justify-start border-burgundy/30 text-primary hover:bg-burgundy/15 hover:text-foreground">
                                🎨 Personalizacja i wygląd
                            </Button>
                        </Link>
                        <Link href="/admin/settings/permissions">
                            <Button variant="outline" className="w-full justify-start border-burgundy/30 text-primary hover:bg-burgundy/15 hover:text-foreground">
                                🔐 Zarządzanie uprawnieniami
                            </Button>
                        </Link>
                        <Link href="/admin/settings">
                            <Button variant="outline" className="w-full justify-start border-burgundy/30 text-primary hover:bg-burgundy/15 hover:text-foreground">
                                🖥️ Konfiguracja systemu
                            </Button>
                        </Link>
                        <div className="pt-3 text-center text-xs text-muted-foreground/70 space-y-0.5" suppressHydrationWarning>
                            {user.last_sign_in_at && (
                                <p suppressHydrationWarning>Ostatnie logowanie: {new Date(user.last_sign_in_at).toLocaleString('pl-PL')}</p>
                            )}
                            {user.created_at && (
                                <p suppressHydrationWarning>Konto utworzone: {new Date(user.created_at).toLocaleDateString('pl-PL')}</p>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
