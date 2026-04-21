'use client'

import { useState, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Search, UserPlus, Loader2 } from 'lucide-react'
import type { ConsultantForAssignment } from '@/lib/actions/centrala-management'

interface ConsultantSearchSelectProps {
    consultants: ConsultantForAssignment[]
    excludeIds?: Set<string>
    onAssign: (selectedIds: string[]) => Promise<void>
    assignLabel?: string
    loading?: boolean
}

export function ConsultantSearchSelect({
    consultants,
    excludeIds = new Set(),
    onAssign,
    assignLabel = 'Przypisz zaznaczonych',
    loading = false,
}: ConsultantSearchSelectProps) {
    const [query, setQuery] = useState('')
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [submitting, setSubmitting] = useState(false)

    const available = useMemo(() => {
        return consultants.filter(c => !excludeIds.has(c.id))
    }, [consultants, excludeIds])

    const filtered = useMemo(() => {
        if (!query.trim()) return available
        const q = query.toLowerCase()
        return available.filter(c =>
            (c.full_name && c.full_name.toLowerCase().includes(q)) ||
            (c.email && c.email.toLowerCase().includes(q))
        )
    }, [available, query])

    const toggleSelect = (id: string) => {
        const next = new Set(selectedIds)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        setSelectedIds(next)
    }

    const toggleAll = () => {
        if (selectedIds.size === filtered.length) {
            setSelectedIds(new Set())
        } else {
            setSelectedIds(new Set(filtered.map(c => c.id)))
        }
    }

    const handleAssign = async () => {
        if (selectedIds.size === 0) return
        setSubmitting(true)
        try {
            await onAssign(Array.from(selectedIds))
            setSelectedIds(new Set())
            setQuery('')
        } finally {
            setSubmitting(false)
        }
    }

    const getInitials = (name: string | null) => {
        if (!name) return '?'
        return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    }

    const statusColor = (status: string | null) => {
        switch (status) {
            case 'active': return 'bg-green-500/20 text-green-400 border-green-500/30'
            case 'bench': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
            case 'available': return 'bg-slate-200/20 text-slate-200 border-slate-200/30'
            default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30'
        }
    }

    const statusLabel = (status: string | null) => {
        switch (status) {
            case 'active': return 'Aktywny'
            case 'bench': return 'Bench'
            case 'available': return 'Dostępny'
            default: return status || 'Brak'
        }
    }

    if (loading) {
        return (
            <div className="flex justify-center p-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
        )
    }

    return (
        <div className="space-y-3">
            {/* Search + bulk actions */}
            <div className="flex items-center gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        type="search"
                        placeholder="Szukaj konsultanta po nazwisku lub email..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        className="pl-8 bg-secondary/20 border-white/10"
                    />
                </div>
                {selectedIds.size > 0 && (
                    <Button onClick={handleAssign} disabled={submitting} size="sm">
                        {submitting ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                            <UserPlus className="h-4 w-4 mr-2" />
                        )}
                        {assignLabel} ({selectedIds.size})
                    </Button>
                )}
            </div>

            {/* List */}
            <div className="border rounded-md border-white/10 max-h-[350px] overflow-auto">
                {filtered.length === 0 ? (
                    <div className="p-6 text-center text-muted-foreground text-sm">
                        {available.length === 0
                            ? 'Wszyscy konsultanci są już przypisani.'
                            : 'Brak wyników dla podanego zapytania.'}
                    </div>
                ) : (
                    <>
                        {/* Select all header */}
                        <div className="flex items-center gap-3 p-2 px-3 border-b border-white/10 bg-muted/30 sticky top-0 z-10">
                            <Checkbox
                                checked={filtered.length > 0 && selectedIds.size === filtered.length}
                                onCheckedChange={toggleAll}
                            />
                            <span className="text-xs text-muted-foreground">
                                {selectedIds.size > 0
                                    ? `Zaznaczono ${selectedIds.size} z ${filtered.length}`
                                    : `${filtered.length} konsultantów`}
                            </span>
                        </div>

                        {filtered.map(c => (
                            <div
                                key={c.id}
                                onClick={() => toggleSelect(c.id)}
                                className="flex items-center gap-3 p-2 px-3 hover:bg-accent/50 cursor-pointer border-b border-white/5 last:border-0 transition-colors"
                            >
                                <Checkbox
                                    checked={selectedIds.has(c.id)}
                                    onCheckedChange={() => toggleSelect(c.id)}
                                />
                                <Avatar className="h-8 w-8">
                                    <AvatarImage src={c.avatar_url || undefined} />
                                    <AvatarFallback className="text-xs">{getInitials(c.full_name)}</AvatarFallback>
                                </Avatar>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">{c.full_name || 'Bez nazwy'}</p>
                                    <p className="text-xs text-muted-foreground truncate">{c.email}</p>
                                </div>
                                <Badge variant="outline" className={statusColor(c.current_status)}>
                                    {statusLabel(c.current_status)}
                                </Badge>
                            </div>
                        ))}
                    </>
                )}
            </div>
        </div>
    )
}
