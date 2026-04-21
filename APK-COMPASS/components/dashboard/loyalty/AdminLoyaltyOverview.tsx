'use client'

import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
    Loader2,
    Users,
    TrendingUp,
    Trophy,
    Crown,
    Search,
    ChevronDown,
    ChevronUp,
    ArrowUpDown,
    X,
} from 'lucide-react'
import { getAllConsultantsLoyalty } from '@/lib/actions/loyalty'
import type { ConsultantLoyaltyRow, LoyaltyStats } from '@/lib/actions/loyalty'
import { MyPointsTab } from './MyPointsTab'

const TIER_COLORS: Record<string, string> = {
    bronze: 'bg-[#CD7F32]/10 text-[#CD7F32] border-[#CD7F32]/30',
    silver: 'bg-[#C0C0C0]/10 text-[#C0C0C0] border-[#C0C0C0]/30',
    gold: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
    platinum: 'bg-[#E5B4F3]/10 text-[#E5B4F3] border-[#E5B4F3]/30',
}

const TIER_LABELS: Record<string, string> = {
    bronze: 'BRONZE',
    silver: 'SILVER',
    gold: 'GOLD',
    platinum: 'PLATINUM',
}

type SortKey = 'name' | 'points' | 'tier'
type SortDir = 'asc' | 'desc'

const TIER_ORDER: Record<string, number> = { bronze: 0, silver: 1, gold: 2, platinum: 3 }

export function AdminLoyaltyOverview() {
    const [consultants, setConsultants] = useState<ConsultantLoyaltyRow[]>([])
    const [stats, setStats] = useState<LoyaltyStats | null>(null)
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState('')
    const [sortKey, setSortKey] = useState<SortKey>('points')
    const [sortDir, setSortDir] = useState<SortDir>('desc')
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
    const [selectedUserName, setSelectedUserName] = useState<string>('')

    useEffect(() => {
        loadData()
    }, [])

    const loadData = async () => {
        setLoading(true)
        try {
            const result = await getAllConsultantsLoyalty()
            if (result.success) {
                setConsultants(result.consultants || [])
                setStats(result.stats || null)
            }
        } catch (e) {
            console.error('Error loading consultants loyalty:', e)
        } finally {
            setLoading(false)
        }
    }

    const toggleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'))
        } else {
            setSortKey(key)
            setSortDir(key === 'points' ? 'desc' : 'asc')
        }
    }

    const filteredAndSorted = useMemo(() => {
        let list = consultants

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase()
            list = list.filter(
                c =>
                    (c.full_name || '').toLowerCase().includes(q) ||
                    (c.email || '').toLowerCase().includes(q)
            )
        }

        list = [...list].sort((a, b) => {
            let cmp = 0
            switch (sortKey) {
                case 'name':
                    cmp = (a.full_name || '').localeCompare(b.full_name || '', 'pl')
                    break
                case 'points':
                    cmp = a.loyalty_points - b.loyalty_points
                    break
                case 'tier':
                    cmp = (TIER_ORDER[a.loyalty_tier] || 0) - (TIER_ORDER[b.loyalty_tier] || 0)
                    break
            }
            return sortDir === 'asc' ? cmp : -cmp
        })

        return list
    }, [consultants, searchQuery, sortKey, sortDir])

    const handleSelectUser = (user: ConsultantLoyaltyRow) => {
        if (selectedUserId === user.id) {
            setSelectedUserId(null)
            setSelectedUserName('')
        } else {
            setSelectedUserId(user.id)
            setSelectedUserName(user.full_name || user.email || 'Konsultant')
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Stats Cards */}
            {stats && (
                <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Konsultanci</CardTitle>
                            <Users className="h-4 w-4 text-primary" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{stats.totalConsultants}</div>
                            <p className="text-xs text-muted-foreground">W programie lojalnosciowym</p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Srednia punktow</CardTitle>
                            <TrendingUp className="h-4 w-4 text-primary" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{stats.avgPoints.toLocaleString('pl-PL')} pkt</div>
                            <p className="text-xs text-muted-foreground">Na konsultanta</p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Rozklad tierow</CardTitle>
                            <Trophy className="h-4 w-4 text-amber-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="flex flex-wrap gap-1.5">
                                {Object.entries(stats.tierDistribution).map(([tier, count]) =>
                                    count > 0 ? (
                                        <Badge
                                            key={tier}
                                            variant="outline"
                                            className={`text-xs ${TIER_COLORS[tier] || ''}`}
                                        >
                                            {TIER_LABELS[tier]} {count}
                                        </Badge>
                                    ) : null
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Top Performer</CardTitle>
                            <Crown className="h-4 w-4 text-amber-500" />
                        </CardHeader>
                        <CardContent>
                            {stats.topPerformer ? (
                                <>
                                    <div className="text-lg font-bold truncate">
                                        {stats.topPerformer.full_name || 'N/A'}
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        {stats.topPerformer.loyalty_points.toLocaleString('pl-PL')} pkt
                                    </p>
                                </>
                            ) : (
                                <div className="text-muted-foreground">-</div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Consultants Table */}
            <Card>
                <CardHeader>
                    <CardTitle>Punkty konsultantow</CardTitle>
                    <CardDescription>
                        Kliknij wiersz, aby zobaczyc szczegolowy breakdown punktow
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Search */}
                    <div className="relative max-w-sm">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            type="search"
                            placeholder="Szukaj po nazwisku lub email..."
                            className="pl-8"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                    </div>

                    {/* Table */}
                    <div className="border rounded-lg overflow-hidden">
                        {/* Header */}
                        <div className="grid grid-cols-12 bg-muted/50 p-3 text-sm font-medium border-b">
                            <div
                                className="col-span-5 flex items-center gap-1 cursor-pointer hover:text-primary"
                                onClick={() => toggleSort('name')}
                            >
                                Konsultant
                                <ArrowUpDown className="h-3 w-3" />
                            </div>
                            <div
                                className="col-span-3 flex items-center gap-1 cursor-pointer hover:text-primary"
                                onClick={() => toggleSort('tier')}
                            >
                                Tier
                                <ArrowUpDown className="h-3 w-3" />
                            </div>
                            <div
                                className="col-span-3 flex items-center gap-1 justify-end cursor-pointer hover:text-primary"
                                onClick={() => toggleSort('points')}
                            >
                                Punkty
                                <ArrowUpDown className="h-3 w-3" />
                            </div>
                            <div className="col-span-1" />
                        </div>

                        {/* Body */}
                        {filteredAndSorted.length === 0 ? (
                            <div className="p-6 text-center text-sm text-muted-foreground">
                                {searchQuery ? 'Brak wynikow dla podanego zapytania' : 'Brak konsultantow w programie'}
                            </div>
                        ) : (
                            filteredAndSorted.map(user => (
                                <div key={user.id}>
                                    <div
                                        className={`grid grid-cols-12 p-3 border-b items-center cursor-pointer transition-colors hover:bg-accent/50 ${
                                            selectedUserId === user.id ? 'bg-accent' : ''
                                        }`}
                                        onClick={() => handleSelectUser(user)}
                                    >
                                        <div className="col-span-5">
                                            <p className="font-medium text-sm truncate">
                                                {user.full_name || 'Bez nazwy'}
                                            </p>
                                            <p className="text-xs text-muted-foreground truncate">
                                                {user.email}
                                            </p>
                                        </div>
                                        <div className="col-span-3">
                                            <Badge
                                                variant="outline"
                                                className={`text-xs ${TIER_COLORS[user.loyalty_tier] || ''}`}
                                            >
                                                {TIER_LABELS[user.loyalty_tier] || user.loyalty_tier}
                                            </Badge>
                                        </div>
                                        <div className="col-span-3 text-right font-mono font-bold text-sm">
                                            {user.loyalty_points.toLocaleString('pl-PL')} pkt
                                        </div>
                                        <div className="col-span-1 flex justify-end">
                                            {selectedUserId === user.id ? (
                                                <ChevronUp className="h-4 w-4 text-muted-foreground" />
                                            ) : (
                                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                            )}
                                        </div>
                                    </div>

                                    {/* Drill-in: MyPointsTab for selected user */}
                                    {selectedUserId === user.id && (
                                        <div className="border-b bg-background p-4">
                                            <div className="flex items-center justify-between mb-4">
                                                <h3 className="text-lg font-semibold">
                                                    Szczegoly: {selectedUserName}
                                                </h3>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        setSelectedUserId(null)
                                                        setSelectedUserName('')
                                                    }}
                                                >
                                                    <X className="h-4 w-4 mr-1" />
                                                    Zamknij
                                                </Button>
                                            </div>
                                            <MyPointsTab
                                                targetUserId={user.id}
                                                showUnearned={false}
                                            />
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                    </div>

                    <p className="text-xs text-muted-foreground">
                        Wyswietlono {filteredAndSorted.length} z {consultants.length} konsultantow
                    </p>
                </CardContent>
            </Card>
        </div>
    )
}
