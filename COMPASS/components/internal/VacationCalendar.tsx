'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { eachDayOfInterval, endOfMonth, format, isWeekend, parseISO, startOfMonth } from 'date-fns'
import { pl } from 'date-fns/locale'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { ChevronLeft, ChevronRight, X as XIcon } from 'lucide-react'
import { roleLabelPl } from '@/lib/types/role'
import type { TeamCalendarData } from '@/lib/actions/internal-attendance'

// Status the public calendar can filter by (mirrors the 2 overlay types it renders).
export type CalendarStatusFilter = 'all' | 'ooo' | 'remote'

interface Props {
    data: TeamCalendarData
    // Initial filter values (from URL) — persisted across month navigation.
    role: string
    status: CalendarStatusFilter
}

interface CellInfo {
    bg: string
    label: string
    title: string
}

// Phase 29: kalendarz publiczny (/internal?tab=calendar) pokazuje tylko 3 statusy:
//   OOO (Out of Office)  — każdy zatwierdzony urlop + delegacja + szkolenie
//   Zdalnie (Z)          — attendance.status='active' AND location='remote'
//   Święto / weekend     — public_holidays + sobota/niedziela
// Szczegółowe typy urlopu (L4, opiekuńczy, okolicznościowy itd.) są widoczne
// w "Wnioskach urlopowych" (/internal?tab=leaves) — tutaj świadomie konsolidujemy
// żeby koledzy w zespole nie widzieli rodzaju nieobecności (privacy by default).
const OOO_BG = 'bg-amber-500/40'
const OOO_LABEL = 'X'
const OOO_TITLE = 'Out of Office'

// Stable display order for the role dropdown (HR-zone roles present on the calendar).
const ROLE_ORDER = ['internal', 'manager', 'finanse', 'talent_community', 'admin']

export function VacationCalendar({ data, role, status }: Props) {
    const router = useRouter()

    // Filters live as client state (all data is already on the client) so toggling
    // is instant — no server round-trip. Month navigation re-seeds them from the URL.
    const [roleFilter, setRoleFilter] = useState<string>(role)
    const [statusFilter, setStatusFilter] = useState<CalendarStatusFilter>(status)

    const monthStart = startOfMonth(new Date(data.year, data.month - 1, 1))
    const monthEnd = endOfMonth(monthStart)
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd })

    // user_ids actually on the calendar that have each status this month. The server
    // already scoped leaves (approved, overlapping month) and attendances (active +
    // remote, within month), so membership alone implies ≥1 matching day. Intersect
    // with the roster so counts never include off-calendar users (e.g. exited).
    const employeeIds = useMemo(() => new Set(data.employees.map((e) => e.id)), [data.employees])
    const oooUserIds = useMemo(
        () => new Set(data.leaves.map((l) => l.user_id).filter((id) => employeeIds.has(id))),
        [data.leaves, employeeIds],
    )
    const remoteUserIds = useMemo(
        () => new Set(data.attendances.map((a) => a.user_id).filter((id) => employeeIds.has(id))),
        [data.attendances, employeeIds],
    )

    // Role options derived from the roster actually present this month (+ counts).
    const roleOptions = useMemo(() => {
        const counts = new Map<string, number>()
        for (const e of data.employees) counts.set(e.role, (counts.get(e.role) ?? 0) + 1)
        const present = ROLE_ORDER.filter((r) => counts.has(r))
        for (const r of Array.from(counts.keys())) if (!present.includes(r)) present.push(r)
        return present.map((r) => ({ value: r, label: roleLabelPl(r), count: counts.get(r) ?? 0 }))
    }, [data.employees])

    // Apply role + status filters (AND).
    const employees = useMemo(() => {
        return data.employees.filter((e) => {
            if (roleFilter !== 'all' && e.role !== roleFilter) return false
            if (statusFilter === 'ooo' && !oooUserIds.has(e.id)) return false
            if (statusFilter === 'remote' && !remoteUserIds.has(e.id)) return false
            return true
        })
    }, [data.employees, roleFilter, statusFilter, oooUserIds, remoteUserIds])

    const filtersActive = roleFilter !== 'all' || statusFilter !== 'all'

    // Index leaves: user_id+date → leave info
    const leaveIdx = useMemo(() => {
        const map = new Map<string, { leave_type: string }>()
        for (const l of data.leaves) {
            const start = parseISO(l.start_date)
            const end = parseISO(l.end_date)
            for (const d of eachDayOfInterval({ start, end })) {
                map.set(`${l.user_id}|${format(d, 'yyyy-MM-dd')}`, { leave_type: l.leave_type })
            }
        }
        return map
    }, [data.leaves])

    // Index attendance (business_trip / training / remote workday)
    const attIdx = useMemo(() => {
        const map = new Map<string, { status: string; location: string | null }>()
        for (const a of data.attendances) {
            map.set(`${a.user_id}|${a.date}`, { status: a.status, location: a.location })
        }
        return map
    }, [data.attendances])

    const holidayDates = useMemo(() => new Set(data.holidays.map((h) => h.date)), [data.holidays])
    const holidayName = useMemo(() => {
        const m = new Map<string, string>()
        for (const h of data.holidays) m.set(h.date, h.name_pl)
        return m
    }, [data.holidays])

    function navigateMonth(delta: number) {
        let newY = data.year
        let newM = data.month + delta
        if (newM < 1) {
            newM = 12
            newY -= 1
        }
        if (newM > 12) {
            newM = 1
            newY += 1
        }
        const params = new URLSearchParams({
            tab: 'calendar',
            year: String(newY),
            month: String(newM),
        })
        // Carry the active filters so they survive the month change (server refetch).
        if (roleFilter !== 'all') params.set('role', roleFilter)
        if (statusFilter !== 'all') params.set('status', statusFilter)
        router.push(`/internal?${params}`)
    }

    function resetFilters() {
        setRoleFilter('all')
        setStatusFilter('all')
    }

    function cellFor(userId: string, day: Date): CellInfo {
        const iso = format(day, 'yyyy-MM-dd')
        const key = `${userId}|${iso}`
        const holiday = holidayName.get(iso)
        if (holiday) return { bg: 'bg-muted', label: '', title: holiday }
        if (isWeekend(day)) return { bg: 'bg-muted/30', label: '', title: 'Weekend' }
        // The status filter is per-day: when one status is picked, only that overlay
        // is painted — the other status renders blank for that day.
        // Phase 29 — każdy urlop dowolnego typu → OOO (typ widoczny tylko w /internal?tab=leave).
        if (statusFilter !== 'remote' && leaveIdx.has(key)) {
            return { bg: OOO_BG, label: OOO_LABEL, title: OOO_TITLE }
        }
        // Attendance STRICT: jedyny attendance overlay to praca zdalna. Nieobecności
        // (delegacja/szkolenie/urlop) idą z leave_requests, nie z attendance_records.
        if (statusFilter !== 'ooo') {
            const att = attIdx.get(key)
            if (att?.status === 'active' && att.location === 'remote') {
                return { bg: 'bg-blue-500/40', label: 'Z', title: 'Praca zdalna' }
            }
        }
        return { bg: '', label: '', title: '' }
    }

    function getInitials(name: string | null, email: string) {
        if (name) return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
        return email.slice(0, 2).toUpperCase()
    }

    return (
        <Card>
            <CardHeader className="flex flex-col gap-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <CardTitle className="text-lg capitalize">
                        {format(monthStart, 'LLLL yyyy', { locale: pl })}
                    </CardTitle>
                    <div className="flex gap-2 items-center">
                        <Button variant="outline" size="icon" onClick={() => navigateMonth(-1)}>
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="icon" onClick={() => navigateMonth(1)}>
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                    <Select value={roleFilter} onValueChange={setRoleFilter}>
                        <SelectTrigger className="h-9 w-[220px]" aria-label="Filtr po roli">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Wszystkie role ({data.employees.length})</SelectItem>
                            {roleOptions.map((o) => (
                                <SelectItem key={o.value} value={o.value}>
                                    {o.label} ({o.count})
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Select
                        value={statusFilter}
                        onValueChange={(v) => setStatusFilter(v as CalendarStatusFilter)}
                    >
                        <SelectTrigger className="h-9 w-[200px]" aria-label="Filtr po statusie">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Wszystkie statusy</SelectItem>
                            <SelectItem value="ooo">Out of Office ({oooUserIds.size})</SelectItem>
                            <SelectItem value="remote">Praca zdalna ({remoteUserIds.size})</SelectItem>
                        </SelectContent>
                    </Select>
                    {filtersActive && (
                        <Button variant="ghost" size="sm" className="h-9" onClick={resetFilters}>
                            <XIcon className="h-3.5 w-3.5 mr-1" />
                            Wyczyść
                        </Button>
                    )}
                    <span className="text-xs text-muted-foreground ml-auto">
                        {employees.length} / {data.employees.length} prac.
                    </span>
                </div>
            </CardHeader>
            <CardContent>
                {employees.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">
                        {filtersActive
                            ? 'Brak pracowników spełniających wybrane filtry.'
                            : 'Brak pracowników strefy HR.'}
                    </p>
                ) : (
                    <div className="overflow-auto max-h-[70vh]">
                        <table className="w-full border-collapse text-xs">
                            <thead>
                                <tr>
                                    <th className="sticky left-0 top-0 bg-card text-left p-2 min-w-[180px] border-b border-border z-30">
                                        Pracownik
                                    </th>
                                    {days.map((d) => {
                                        const isWE = isWeekend(d)
                                        const isHoliday = holidayDates.has(format(d, 'yyyy-MM-dd'))
                                        return (
                                            <th
                                                key={d.toISOString()}
                                                className={`sticky top-0 z-20 bg-card p-1 text-center font-medium border-b border-border min-w-[24px] ${
                                                    isWE || isHoliday ? 'text-muted-foreground/60' : ''
                                                }`}
                                                title={
                                                    isHoliday
                                                        ? holidayName.get(format(d, 'yyyy-MM-dd'))
                                                        : undefined
                                                }
                                            >
                                                {format(d, 'd')}
                                            </th>
                                        )
                                    })}
                                </tr>
                            </thead>
                            <tbody>
                                {employees.map((emp) => (
                                    <tr key={emp.id} className="hover:bg-muted/30">
                                        <td className="sticky left-0 bg-card p-2 border-b border-border/50 z-10">
                                            <div className="flex items-center gap-2">
                                                <Avatar className="h-6 w-6">
                                                    <AvatarImage src={emp.avatar_url || undefined} />
                                                    <AvatarFallback className="text-[10px]">
                                                        {getInitials(emp.full_name, emp.email)}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <div className="leading-tight">
                                                    <div className="text-xs font-medium">
                                                        {emp.full_name ?? emp.email.split('@')[0]}
                                                    </div>
                                                    <div className="text-[10px] text-muted-foreground">
                                                        {roleLabelPl(emp.role)}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        {days.map((d) => {
                                            const meta = cellFor(emp.id, d)
                                            return (
                                                <td
                                                    key={d.toISOString()}
                                                    className={`text-center font-bold text-[10px] border-b border-border/50 ${meta.bg}`}
                                                    title={meta.title}
                                                >
                                                    {meta.label || ''}
                                                </td>
                                            )
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                <div className="mt-6 flex flex-wrap gap-2 text-[10px] items-center">
                    {statusFilter !== 'remote' && (
                        <Badge className="bg-amber-500/40 text-amber-100 border-transparent">X — Out of Office</Badge>
                    )}
                    {statusFilter !== 'ooo' && (
                        <Badge className="bg-blue-500/40 text-blue-100 border-transparent">Z — Zdalnie</Badge>
                    )}
                    <Badge variant="outline" className="bg-muted text-muted-foreground">
                        Święto / weekend
                    </Badge>
                    <span className="text-[10px] text-muted-foreground ml-2">
                        Szczegóły urlopów (typ, data) widoczne w zakładce „Wnioski urlopowe".
                    </span>
                </div>
            </CardContent>
        </Card>
    )
}
