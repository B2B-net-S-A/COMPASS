'use client'

import React, { useState, useMemo, useCallback } from 'react'
import { Card, CardContent } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Star, X, User as UserIcon, SlidersHorizontal } from "lucide-react"
import type { ConsultantAnalysis } from '@/lib/actions/admin-dashboard'
import { ConsultantLoyaltyPanel } from './ConsultantLoyaltyPanel'
import { ConsultantProfile360Panel } from './ConsultantProfile360Panel'
import { MultiSelectFilter, FilterPresetsManager } from './filters'

interface ConsultantAnalysisTabProps {
    consultants: ConsultantAnalysis[]
}

function getInitials(name: string): string {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
    'active': { label: 'Na projekcie', color: 'text-primary', bg: 'bg-burgundy/20 border-burgundy/30' },
    'on_project': { label: 'Na projekcie', color: 'text-primary', bg: 'bg-burgundy/20 border-burgundy/30' },
    'bench': { label: 'Bench', color: 'text-amber-400', bg: 'bg-amber-500/20 border-amber-500/30' },
    'available': { label: 'Bench', color: 'text-amber-400', bg: 'bg-amber-500/20 border-amber-500/30' },
    'recruitment': { label: 'Rekrutacja', color: 'text-foreground', bg: 'bg-foreground/20 border-foreground/30' },
    'inactive': { label: 'Nieaktywny', color: 'text-muted-foreground', bg: 'bg-muted-foreground/20 border-muted-foreground/30' },
}

const tierConfig: Record<string, { label: string; color: string; bg: string }> = {
    'bronze': { label: 'Bronze', color: 'text-amber-600', bg: 'bg-amber-900/20 border-amber-600/30' },
    'silver': { label: 'Silver', color: 'text-foreground', bg: 'bg-muted-foreground/20 border-foreground/30' },
    'gold': { label: 'Gold', color: 'text-yellow-400', bg: 'bg-yellow-500/20 border-yellow-400/30' },
    'platinum': { label: 'Platinum', color: 'text-foreground', bg: 'bg-foreground/20 border-foreground/30' },
}

type StatusFilter = 'all' | 'on_project' | 'bench' | 'new'
type TierFilter = 'all' | 'bronze' | 'silver' | 'gold' | 'platinum'
type BenchFilter = 'all' | 'lt14' | '14to30' | 'gt30'
type SortField = 'name' | 'bench_days' | 'loyalty_points' | 'created_at'

function FilterBadge({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            onClick={onClick}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                active
                    ? 'bg-primary/20 text-primary border-primary/30'
                    : 'bg-card/80 text-muted-foreground border-white/10 hover:bg-white/5'
            }`}
        >
            {children}
        </button>
    )
}

export function ConsultantAnalysisTab({ consultants }: ConsultantAnalysisTabProps) {
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
    const [tierFilter, setTierFilter] = useState<TierFilter>('all')
    const [benchFilter, setBenchFilter] = useState<BenchFilter>('all')
    const [sortField, setSortField] = useState<SortField>('name')
    const [searchQuery, setSearchQuery] = useState('')
    const [selectedConsultant, setSelectedConsultant] = useState<ConsultantAnalysis | null>(null)
    const [profileConsultant, setProfileConsultant] = useState<ConsultantAnalysis | null>(null)
    const [selectedSkills, setSelectedSkills] = useState<string[]>([])
    const [showAdvanced, setShowAdvanced] = useState(false)
    const [pageSize, setPageSize] = useState(20)

    const allSkills = useMemo(() => {
        const skillMap = new Map<string, number>()
        consultants.forEach(c => {
            if (c.skills) {
                c.skills.forEach(s => skillMap.set(s, (skillMap.get(s) || 0) + 1))
            }
        })
        return Array.from(skillMap)
            .sort((a, b) => b[1] - a[1])
            .map(([value, count]) => ({ value, label: value, count }))
    }, [consultants])

    const isNewConsultant = (c: ConsultantAnalysis) => {
        if (!c.created_at) return false
        const created = new Date(c.created_at)
        const thirtyDaysAgo = new Date()
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
        return created >= thirtyDaysAgo
    }

    const counts = useMemo(() => ({
        all: consultants.length,
        on_project: consultants.filter(c => c.current_status === 'active' || c.current_status === 'on_project').length,
        bench: consultants.filter(c => c.current_status === 'bench' || c.current_status === 'available' || !c.current_status).length,
        new: consultants.filter(isNewConsultant).length,
    }), [consultants])

    const filtered = useMemo(() => {
        let list = [...consultants]

        if (statusFilter === 'on_project') {
            list = list.filter(c => c.current_status === 'active' || c.current_status === 'on_project')
        } else if (statusFilter === 'bench') {
            list = list.filter(c => c.current_status === 'bench' || c.current_status === 'available' || !c.current_status)
        } else if (statusFilter === 'new') {
            list = list.filter(isNewConsultant)
        }

        if (tierFilter !== 'all') {
            list = list.filter(c => c.loyalty_tier.toLowerCase() === tierFilter)
        }

        if (benchFilter === 'lt14') {
            list = list.filter(c => c.bench_days > 0 && c.bench_days < 14)
        } else if (benchFilter === '14to30') {
            list = list.filter(c => c.bench_days >= 14 && c.bench_days <= 30)
        } else if (benchFilter === 'gt30') {
            list = list.filter(c => c.bench_days > 30)
        }

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase()
            list = list.filter(c =>
                c.full_name.toLowerCase().includes(q) ||
                c.email.toLowerCase().includes(q) ||
                (c.tech_stack && c.tech_stack.toLowerCase().includes(q)) ||
                (c.recruiter_name && c.recruiter_name.toLowerCase().includes(q)) ||
                (c.dl_name && c.dl_name.toLowerCase().includes(q))
            )
        }

        if (selectedSkills.length > 0) {
            list = list.filter(c =>
                c.skills && selectedSkills.every(skill =>
                    c.skills.some(s => s.toLowerCase() === skill.toLowerCase())
                )
            )
        }

        list.sort((a, b) => {
            switch (sortField) {
                case 'name':
                    return a.full_name.localeCompare(b.full_name, 'pl')
                case 'bench_days':
                    return b.bench_days - a.bench_days
                case 'loyalty_points':
                    return (b.loyalty_points ?? 0) - (a.loyalty_points ?? 0)
                case 'created_at':
                    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                default:
                    return 0
            }
        })

        return list
    }, [consultants, statusFilter, tierFilter, benchFilter, sortField, searchQuery, selectedSkills])

    const hasActiveFilters = statusFilter !== 'all' || tierFilter !== 'all' || benchFilter !== 'all' || searchQuery.trim() !== '' || selectedSkills.length > 0

    const clearAllFilters = () => {
        setStatusFilter('all')
        setTierFilter('all')
        setBenchFilter('all')
        setSearchQuery('')
        setSortField('name')
        setSelectedSkills([])
    }

    const currentFilters = useMemo(() => ({
        statusFilter,
        tierFilter,
        benchFilter,
        sortField,
        searchQuery,
        selectedSkills,
    }), [statusFilter, tierFilter, benchFilter, sortField, searchQuery, selectedSkills])

    const applyPreset = useCallback((filters: Record<string, any>) => {
        if (filters.statusFilter) setStatusFilter(filters.statusFilter)
        if (filters.tierFilter) setTierFilter(filters.tierFilter)
        if (filters.benchFilter) setBenchFilter(filters.benchFilter)
        if (filters.sortField) setSortField(filters.sortField)
        if (filters.searchQuery !== undefined) setSearchQuery(filters.searchQuery)
        if (filters.selectedSkills) setSelectedSkills(filters.selectedSkills)
    }, [])

    const statusFilters: { id: StatusFilter; label: string; count: number }[] = [
        { id: 'all', label: 'Wszystkie', count: counts.all },
        { id: 'on_project', label: 'Na projekcie', count: counts.on_project },
        { id: 'bench', label: 'Na benchu', count: counts.bench },
        { id: 'new', label: 'Nowi', count: counts.new },
    ]

    const tierFilters: { id: TierFilter; label: string }[] = [
        { id: 'all', label: 'Wszystkie' },
        { id: 'bronze', label: 'Bronze' },
        { id: 'silver', label: 'Silver' },
        { id: 'gold', label: 'Gold' },
        { id: 'platinum', label: 'Platinum' },
    ]

    const benchOptions: { id: BenchFilter; label: string }[] = [
        { id: 'all', label: 'Wszystkie' },
        { id: 'lt14', label: '< 14 dni' },
        { id: '14to30', label: '14-30 dni' },
        { id: 'gt30', label: '> 30 dni' },
    ]

    const sortOptions: { id: SortField; label: string }[] = [
        { id: 'name', label: 'Nazwa' },
        { id: 'bench_days', label: 'Bench dni' },
        { id: 'loyalty_points', label: 'Punkty lojalnościowe' },
        { id: 'created_at', label: 'Data dołączenia' },
    ]

    return (
        <div className="space-y-4">
            {/* Advanced Filter Bar */}
            <div className="bg-card/50 rounded-xl p-4 border border-white/5 space-y-4">
                {/* Row 1: Search + Multi-selects + Sort */}
                <div className="flex flex-wrap items-center gap-3">
                    <div className="relative flex-1 min-w-[200px] max-w-sm">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">&#128269;</span>
                        <input
                            type="text"
                            placeholder="Szukaj po nazwie, email, technologii..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-transparent border border-white/10 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition-colors"
                        />
                    </div>

                    {allSkills.length > 0 && (
                        <MultiSelectFilter
                            label="Technologie"
                            options={allSkills}
                            selected={selectedSkills}
                            onChange={setSelectedSkills}
                        />
                    )}

                    <button
                        onClick={() => setShowAdvanced(!showAdvanced)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-all ${
                            showAdvanced || hasActiveFilters
                                ? 'bg-primary/10 border-primary/30 text-primary'
                                : 'bg-card/80 border-white/10 text-muted-foreground hover:bg-white/5'
                        }`}
                    >
                        <SlidersHorizontal className="h-3.5 w-3.5" />
                        Filtry
                        {hasActiveFilters && (
                            <Badge variant="secondary" className="h-4 px-1.5 text-[10px] bg-primary/20">!</Badge>
                        )}
                    </button>

                    <div className="flex items-center gap-2 ml-auto">
                        <span className="text-xs text-muted-foreground">Sortuj:</span>
                        <select
                            value={sortField}
                            onChange={(e) => setSortField(e.target.value as SortField)}
                            className="appearance-none bg-transparent border border-white/10 rounded-lg px-3 py-1.5 pr-7 text-xs text-white cursor-pointer focus:outline-none focus:border-primary/50 transition-colors"
                        >
                            {sortOptions.map(o => (
                                <option key={o.id} value={o.id} className="bg-card text-white">{o.label}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Advanced filters (collapsible) */}
                {showAdvanced && (
                    <div className="space-y-3 pt-2 border-t border-white/5">
                        {/* Status */}
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs text-muted-foreground font-medium w-14 shrink-0">Status:</span>
                            {statusFilters.map(f => (
                                <FilterBadge key={f.id} active={statusFilter === f.id} onClick={() => setStatusFilter(f.id)}>
                                    {f.label} <span className="ml-1 opacity-60">({f.count})</span>
                                </FilterBadge>
                            ))}
                        </div>

                        {/* Tier */}
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs text-muted-foreground font-medium w-14 shrink-0">Tier:</span>
                            {tierFilters.map(f => (
                                <FilterBadge key={f.id} active={tierFilter === f.id} onClick={() => setTierFilter(f.id)}>
                                    {f.label}
                                </FilterBadge>
                            ))}
                        </div>

                        {/* Bench days */}
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs text-muted-foreground font-medium w-14 shrink-0">Bench:</span>
                            {benchOptions.map(f => (
                                <FilterBadge key={f.id} active={benchFilter === f.id} onClick={() => setBenchFilter(f.id)}>
                                    {f.label}
                                </FilterBadge>
                            ))}
                        </div>
                    </div>
                )}

                {/* Presets + summary */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-1 border-t border-white/5">
                    <div className="flex items-center gap-3 flex-wrap">
                        <p className="text-xs text-muted-foreground">
                            Znaleziono <span className="text-white font-medium">{filtered.length}</span> konsultantów
                        </p>
                        {hasActiveFilters && (
                            <button
                                onClick={clearAllFilters}
                                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-white transition-colors"
                            >
                                <X className="h-3 w-3" />
                                Wyczyść filtry
                            </button>
                        )}
                    </div>
                    <FilterPresetsManager
                        currentFilters={currentFilters}
                        onApplyPreset={applyPreset}
                        storageKey="consultants"
                    />
                </div>
            </div>

            <Card className="bg-background/50 border-white/10 overflow-hidden">
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-white/10">
                                    <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Konsultant</th>
                                    <th className="text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 py-3">Status</th>
                                    <th className="text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 py-3">Tier</th>
                                    <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 py-3">Projekt</th>
                                    <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 py-3">Rekruter</th>
                                    <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 py-3">Delivery Lead</th>
                                    <th className="text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 py-3">Bench (dni)</th>
                                    <th className="text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 py-3">Match</th>
                                    <th className="text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 py-3">Punkty</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.slice(0, pageSize).map((c) => {
                                    const status = statusConfig[c.current_status] || statusConfig['bench']
                                    const tier = tierConfig[c.loyalty_tier.toLowerCase()] || tierConfig['bronze']

                                    return (
                                        <tr key={c.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-3">
                                                    <Avatar className="h-8 w-8 border border-white/10">
                                                        <AvatarImage src={c.avatar_url || ''} />
                                                        <AvatarFallback className="bg-card text-foreground text-xs">
                                                            {getInitials(c.full_name)}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                    <div>
                                                        <p className="text-sm font-medium text-white">{c.full_name}</p>
                                                        {c.tech_stack && (
                                                            <p className="text-xs text-muted-foreground">{c.tech_stack}</p>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-3 py-3 text-center">
                                                <Badge variant="outline" className={`text-xs ${status.bg} ${status.color}`}>
                                                    {status.label}
                                                </Badge>
                                            </td>
                                            <td className="px-3 py-3 text-center">
                                                <Badge variant="outline" className={`text-xs ${tier.bg} ${tier.color}`}>
                                                    {tier.label}
                                                </Badge>
                                            </td>
                                            <td className="px-3 py-3">
                                                <span className={`text-sm ${c.project_name ? 'text-white' : 'text-muted-foreground italic'}`}>
                                                    {c.project_name || '—'}
                                                </span>
                                            </td>
                                            <td className="px-3 py-3">
                                                <span className={`text-sm ${c.recruiter_name ? 'text-white' : 'text-muted-foreground'}`}>
                                                    {c.recruiter_name || '—'}
                                                </span>
                                            </td>
                                            <td className="px-3 py-3">
                                                <span className={`text-sm ${c.dl_name ? 'text-white' : 'text-muted-foreground'}`}>
                                                    {c.dl_name || '—'}
                                                </span>
                                            </td>
                                            <td className="px-3 py-3 text-center">
                                                {c.bench_days > 0 ? (
                                                    <span className={`text-sm font-medium ${
                                                        c.bench_days > 30 ? 'text-red-400' :
                                                        c.bench_days > 14 ? 'text-amber-400' : 'text-foreground'
                                                    }`}>
                                                        {c.bench_days}
                                                    </span>
                                                ) : (
                                                    <span className="text-sm text-muted-foreground">—</span>
                                                )}
                                            </td>
                                            <td className="px-3 py-3 text-center">
                                                {c.match_score ? (
                                                    <MatchScoreBadge score={c.match_score} />
                                                ) : (
                                                    <span className="text-sm text-muted-foreground">—</span>
                                                )}
                                            </td>
                                            <td className="px-3 py-3 text-center">
                                                <div className="flex items-center justify-center gap-1">
                                                    <Button
                                                        variant={selectedConsultant?.id === c.id ? "default" : "ghost"}
                                                        size="sm"
                                                        className="gap-1 text-xs h-7"
                                                        onClick={() => setSelectedConsultant(selectedConsultant?.id === c.id ? null : c)}
                                                    >
                                                        <Star className="h-3 w-3" />
                                                        {c.loyalty_points ?? 0}
                                                    </Button>
                                                    <Button
                                                        variant={profileConsultant?.id === c.id ? "default" : "ghost"}
                                                        size="sm"
                                                        className="gap-1 text-xs h-7"
                                                        onClick={() => {
                                                            setProfileConsultant(profileConsultant?.id === c.id ? null : c)
                                                            setSelectedConsultant(null)
                                                        }}
                                                    >
                                                        <UserIcon className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                    {filtered.length > pageSize && (
                        <div className="px-4 py-3 text-center border-t border-white/5 flex items-center justify-center gap-3">
                            <p className="text-xs text-muted-foreground">
                                Wyświetlono {Math.min(pageSize, filtered.length)} z {filtered.length} konsultantów
                            </p>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-xs h-7"
                                onClick={() => setPageSize(prev => prev + 20)}
                            >
                                Pokaż więcej
                            </Button>
                        </div>
                    )}
                    {filtered.length === 0 && (
                        <div className="px-4 py-8 text-center">
                            <p className="text-sm text-muted-foreground">Brak konsultantów spełniających kryteria filtrowania</p>
                        </div>
                    )}
                </CardContent>
            </Card>

            {selectedConsultant && (
                <Card className="bg-background/50 border-white/10">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-white">
                                Punkty lojalnościowe: {selectedConsultant.full_name}
                            </h3>
                            <Button variant="ghost" size="sm" onClick={() => setSelectedConsultant(null)}>
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                        <ConsultantLoyaltyPanel
                            consultantId={selectedConsultant.id}
                            consultantName={selectedConsultant.full_name}
                        />
                    </CardContent>
                </Card>
            )}

            {profileConsultant && (
                <ConsultantProfile360Panel
                    consultantId={profileConsultant.id}
                    consultantName={profileConsultant.full_name}
                    onClose={() => setProfileConsultant(null)}
                />
            )}
        </div>
    )
}

function MatchScoreBadge({ score }: { score: number }) {
    const size = 36
    const radius = (size - 5) / 2
    const circumference = 2 * Math.PI * radius
    const offset = circumference - (score / 100) * circumference
    const color = score >= 85 ? 'hsl(var(--primary))' : score >= 70 ? '#f59e0b' : '#ef4444'

    return (
        <div className="relative inline-flex" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="transform -rotate-90">
                <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="#1e293b" strokeWidth={2.5} />
                <circle
                    cx={size/2} cy={size/2} r={radius} fill="none"
                    stroke={color} strokeWidth={2.5}
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    strokeLinecap="round"
                />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white">
                {score}
            </span>
        </div>
    )
}
