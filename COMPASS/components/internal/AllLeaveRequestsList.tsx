'use client'

// Phase 47 — pełna historia wniosków urlopowych (wszystkie statusy, w tym
// anulowane). Kolejka pokazuje tylko pending, więc po akceptacji/anulowaniu
// wniosek znikał i nie było jak sprawdzić, co się z nim stało. Read-only lookup
// z filtrem statusu i wyszukiwarką po nazwisku.

import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search, UserCheck, History } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { pl } from 'date-fns/locale'
import type { AllLeaveRow, LeaveStatus } from '@/lib/actions/internal-leave'

const LEAVE_TYPE_LABEL: Record<string, string> = {
    vacation: 'Urlop wypoczynkowy',
    sick_leave: 'L4',
    parental_leave: 'Opieka rodzicielska',
    unpaid_leave: 'Urlop bezpłatny',
    training: 'Szkolenie',
    on_demand: 'Urlop na żądanie',
    occasional: 'Urlop okolicznościowy',
    childcare: 'Opieka nad dzieckiem (art. 188)',
    care_leave: 'Urlop opiekuńczy',
    force_majeure: 'Siła wyższa',
    maternity: 'Urlop macierzyński',
    paternity: 'Urlop ojcowski',
    childrearing: 'Urlop wychowawczy',
    blood_donation: 'Krwiodawstwo',
    holiday_in_lieu: 'Odbiór dnia za święto',
    other: 'Inne',
}

const STATUS_BADGE: Record<LeaveStatus, { label: string; className: string }> = {
    pending: { label: 'Oczekuje', className: 'bg-warning/15 text-warning border-warning/30' },
    approved: { label: 'Zaakceptowany', className: 'bg-success/15 text-success border-success/30' },
    rejected: {
        label: 'Odrzucony',
        className: 'bg-destructive/15 text-destructive border-destructive/30',
    },
    cancelled: { label: 'Anulowany', className: 'bg-muted text-muted-foreground border-border' },
}

type StatusFilter = 'all' | LeaveStatus

const FILTERS: ReadonlyArray<{ value: StatusFilter; label: string }> = [
    { value: 'all', label: 'Wszystkie' },
    { value: 'pending', label: 'Oczekujące' },
    { value: 'approved', label: 'Zaakceptowane' },
    { value: 'cancelled', label: 'Anulowane' },
    { value: 'rejected', label: 'Odrzucone' },
]

function fmt(d: string): string {
    return format(parseISO(d), 'd LLL yyyy', { locale: pl })
}

interface Props {
    rows: AllLeaveRow[]
}

export function AllLeaveRequestsList({ rows }: Props) {
    const [status, setStatus] = useState<StatusFilter>('all')
    const [search, setSearch] = useState('')

    const counts = useMemo(() => {
        const c: Record<StatusFilter, number> = {
            all: rows.length,
            pending: 0,
            approved: 0,
            rejected: 0,
            cancelled: 0,
        }
        for (const r of rows) c[r.status] += 1
        return c
    }, [rows])

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase()
        return rows.filter((r) => {
            if (status !== 'all' && r.status !== status) return false
            if (!q) return true
            const hay = `${r.user_full_name ?? ''} ${r.user_email}`.toLowerCase()
            return hay.includes(q)
        })
    }, [rows, status, search])

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                    <History className="h-4 w-4" />
                    Wszystkie wnioski (w tym anulowane)
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                    Podgląd historii wniosków — także tych zaakceptowanych, odrzuconych i anulowanych.
                    Kolejka wyżej pokazuje tylko oczekujące.
                </p>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                    {FILTERS.map((f) => (
                        <Button
                            key={f.value}
                            variant={status === f.value ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setStatus(f.value)}
                        >
                            {f.label}
                            <span className="ml-1.5 opacity-70">{counts[f.value]}</span>
                        </Button>
                    ))}
                </div>

                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Szukaj po nazwisku lub emailu…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9"
                    />
                </div>

                {filtered.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-6 text-center">
                        Brak wniosków dla wybranego filtra.
                    </p>
                ) : (
                    <div className="max-h-[560px] overflow-y-auto divide-y divide-border/40 rounded-md border border-border/40">
                        {filtered.map((leave) => {
                            const badge = STATUS_BADGE[leave.status]
                            return (
                                <div key={leave.id} className="px-3 py-2.5">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-sm font-medium">
                                            {leave.user_full_name ?? leave.user_email}
                                        </span>
                                        <Badge variant="outline" className={badge.className}>
                                            {badge.label}
                                        </Badge>
                                        <span className="text-sm text-muted-foreground">
                                            {LEAVE_TYPE_LABEL[leave.leave_type] ?? leave.leave_type}
                                        </span>
                                        {leave.half_day && (
                                            <Badge variant="outline" className="text-[10px]">
                                                {leave.half_day === 'morning' ? '½ rano' : '½ popoł.'}
                                            </Badge>
                                        )}
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        {fmt(leave.start_date)} – {fmt(leave.end_date)}
                                    </p>
                                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                                        {leave.created_on_behalf && (
                                            <span className="text-[11px] text-muted-foreground">
                                                Wpisany przez przełożonego
                                            </span>
                                        )}
                                        {leave.source === 'outlook_oof' && (
                                            <span className="text-[11px] text-muted-foreground">
                                                Z Outlook OOF
                                            </span>
                                        )}
                                        {leave.substitute_full_name && (
                                            <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                                                <UserCheck className="h-3 w-3" />
                                                Zastępca: {leave.substitute_full_name}
                                            </span>
                                        )}
                                    </div>
                                    {leave.note && (
                                        <p className="text-xs mt-1 italic text-muted-foreground line-clamp-2">
                                            „{leave.note}”
                                        </p>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
