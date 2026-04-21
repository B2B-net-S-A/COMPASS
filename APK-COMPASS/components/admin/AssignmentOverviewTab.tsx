'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Loader2, Users, AlertTriangle, BarChart3, UserX } from 'lucide-react'
import {
    getAssignmentStats,
    getUnassignedConsultants,
    type CentralaMember,
    type ConsultantForAssignment,
} from '@/lib/actions/centrala-management'

interface AssignmentOverviewTabProps {
    members: CentralaMember[]
}

export function AssignmentOverviewTab({ members }: AssignmentOverviewTabProps) {
    const [stats, setStats] = useState<{
        totalConsultants: number
        assignedCount: number
        unassignedCount: number
        avgAssignments: number
        maxAssignments: number
        minAssignments: number
        memberCount: number
    } | null>(null)
    const [unassigned, setUnassigned] = useState<ConsultantForAssignment[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        loadData()
    }, [])

    async function loadData() {
        setLoading(true)
        try {
            const [statsData, unassignedData] = await Promise.all([
                getAssignmentStats(),
                getUnassignedConsultants(),
            ])
            setStats(statsData)
            setUnassigned(unassignedData)
        } catch (err) {
            console.error('Error loading overview:', err)
        } finally {
            setLoading(false)
        }
    }

    const getInitials = (name: string | null) => {
        if (!name) return '?'
        return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    }

    if (loading) {
        return (
            <div className="flex justify-center p-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        )
    }

    if (!stats) return null

    const assignedPercent = stats.totalConsultants > 0
        ? Math.round((stats.assignedCount / stats.totalConsultants) * 100)
        : 0

    // Members sorted by assignment count
    const sortedMembers = [...members]
        .filter(m => m.centrala_role !== 'finance')
        .sort((a, b) => b.assignment_count - a.assignment_count)

    return (
        <div className="space-y-6">
            {/* KPI cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 rounded-lg bg-card border border-white/10">
                    <div className="flex items-center gap-2 mb-2">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Konsultanci</span>
                    </div>
                    <div className="text-2xl font-bold">{stats.totalConsultants}</div>
                </div>
                <div className="p-4 rounded-lg bg-card border border-white/10">
                    <div className="flex items-center gap-2 mb-2">
                        <BarChart3 className="h-4 w-4 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Przypisani</span>
                    </div>
                    <div className="text-2xl font-bold text-green-400">
                        {stats.assignedCount}
                        <span className="text-sm text-muted-foreground ml-1">({assignedPercent}%)</span>
                    </div>
                </div>
                <div className="p-4 rounded-lg bg-card border border-white/10">
                    <div className="flex items-center gap-2 mb-2">
                        <UserX className="h-4 w-4 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Bez rekrutera</span>
                    </div>
                    <div className={`text-2xl font-bold ${stats.unassignedCount > 0 ? 'text-yellow-400' : 'text-green-400'}`}>
                        {stats.unassignedCount}
                    </div>
                </div>
                <div className="p-4 rounded-lg bg-card border border-white/10">
                    <div className="flex items-center gap-2 mb-2">
                        <BarChart3 className="h-4 w-4 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Śr. na rekrutera</span>
                    </div>
                    <div className="text-2xl font-bold">{stats.avgAssignments}</div>
                    <div className="text-xs text-muted-foreground">
                        min: {stats.minAssignments} / max: {stats.maxAssignments}
                    </div>
                </div>
            </div>

            {/* Distribution per member */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Obciążenie rekruterów / DL</CardTitle>
                    <CardDescription>Liczba przypisanych konsultantów per osoba</CardDescription>
                </CardHeader>
                <CardContent>
                    {sortedMembers.length === 0 ? (
                        <div className="text-center text-muted-foreground py-6 text-sm">
                            Brak rekruterów ani Delivery Lead.
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {sortedMembers.map(m => {
                                const maxCount = sortedMembers[0]?.assignment_count || 1
                                const barWidth = maxCount > 0 ? (m.assignment_count / maxCount) * 100 : 0
                                return (
                                    <div key={m.id} className="flex items-center gap-3">
                                        <Avatar className="h-7 w-7 shrink-0">
                                            <AvatarImage src={m.avatar_url || undefined} />
                                            <AvatarFallback className="text-xs">
                                                {getInitials(m.full_name)}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="w-32 truncate text-sm">
                                            {m.full_name || m.email.split('@')[0]}
                                        </div>
                                        <Badge variant="outline" className="text-[10px] shrink-0">
                                            {m.centrala_role === 'delivery_lead' ? 'DL' : 'Rek'}
                                        </Badge>
                                        <div className="flex-1 h-5 bg-muted/30 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-primary/60 rounded-full transition-all"
                                                style={{ width: `${barWidth}%` }}
                                            />
                                        </div>
                                        <span className="text-sm font-medium w-8 text-right">{m.assignment_count}</span>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Unassigned consultants */}
            {unassigned.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-yellow-400" />
                            Konsultanci bez rekrutera ({unassigned.length})
                        </CardTitle>
                        <CardDescription>
                            Przypisz ich w zakładce "Przypisania Konsultantów"
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                            {unassigned.slice(0, 30).map(c => (
                                <div key={c.id} className="flex items-center gap-2 p-2 rounded-md bg-muted/20">
                                    <Avatar className="h-6 w-6">
                                        <AvatarImage src={c.avatar_url || undefined} />
                                        <AvatarFallback className="text-[10px]">
                                            {getInitials(c.full_name)}
                                        </AvatarFallback>
                                    </Avatar>
                                    <span className="text-xs truncate">{c.full_name || c.email}</span>
                                </div>
                            ))}
                            {unassigned.length > 30 && (
                                <div className="flex items-center justify-center p-2 text-xs text-muted-foreground">
                                    ...i {unassigned.length - 30} więcej
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
