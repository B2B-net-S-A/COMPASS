'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { eachDayOfInterval, endOfMonth, format, isWeekend, parseISO, startOfMonth } from 'date-fns'
import { pl } from 'date-fns/locale'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { roleLabelPl } from '@/lib/types/role'
import type { TeamCalendarData } from '@/lib/actions/internal-attendance'

interface Props {
    data: TeamCalendarData
    filter: 'all' | 'internal' | 'admin'
}

interface CellInfo {
    bg: string
    label: string
    title: string
}

const LEAVE_LABEL_PL: Record<string, string> = {
    vacation: 'Urlop',
    sick_leave: 'L4',
    parental_leave: 'Opieka',
    unpaid_leave: 'Bezpłatny',
    training: 'Szkolenie',
    other: 'Inne',
}

const LEAVE_BG: Record<string, string> = {
    vacation: 'bg-yellow-500/40',
    sick_leave: 'bg-red-500/40',
    parental_leave: 'bg-pink-500/40',
    unpaid_leave: 'bg-gray-500/40',
    training: 'bg-cyan-500/40',
    other: 'bg-orange-500/40',
}

export function VacationCalendar({ data, filter }: Props) {
    const router = useRouter()

    const monthStart = startOfMonth(new Date(data.year, data.month - 1, 1))
    const monthEnd = endOfMonth(monthStart)
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd })

    // Filter employees
    const employees = useMemo(() => {
        if (filter === 'internal') return data.employees.filter((e) => e.role === 'internal')
        if (filter === 'admin') return data.employees.filter((e) => e.role === 'admin')
        return data.employees
    }, [data.employees, filter])

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

    // Index attendance (business_trip / training)
    const attIdx = useMemo(() => {
        const map = new Map<string, { status: string }>()
        for (const a of data.attendances) {
            map.set(`${a.user_id}|${a.date}`, { status: a.status })
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
        const params = new URLSearchParams({ year: String(newY), month: String(newM), filter })
        router.push(`/internal/calendar?${params}`)
    }

    function setFilter(next: 'all' | 'internal' | 'admin') {
        const params = new URLSearchParams({
            year: String(data.year),
            month: String(data.month),
            filter: next,
        })
        router.push(`/internal/calendar?${params}`)
    }

    function cellFor(userId: string, day: Date): CellInfo {
        const iso = format(day, 'yyyy-MM-dd')
        const key = `${userId}|${iso}`
        const holiday = holidayName.get(iso)
        if (holiday) return { bg: 'bg-muted', label: '', title: holiday }
        if (isWeekend(day)) return { bg: 'bg-muted/30', label: '', title: 'Weekend' }
        const leave = leaveIdx.get(key)
        if (leave) {
            return {
                bg: LEAVE_BG[leave.leave_type] ?? 'bg-yellow-500/40',
                label: LEAVE_LABEL_PL[leave.leave_type]?.[0] ?? 'U',
                title: LEAVE_LABEL_PL[leave.leave_type] ?? 'Urlop',
            }
        }
        const att = attIdx.get(key)
        if (att?.status === 'business_trip') {
            return { bg: 'bg-purple-500/40', label: 'D', title: 'Delegacja' }
        }
        if (att?.status === 'training') {
            return { bg: 'bg-cyan-500/40', label: 'S', title: 'Szkolenie' }
        }
        return { bg: '', label: '', title: '' }
    }

    function getInitials(name: string | null, email: string) {
        if (name) return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
        return email.slice(0, 2).toUpperCase()
    }

    return (
        <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <CardTitle className="text-lg capitalize">
                    {format(monthStart, 'LLLL yyyy', { locale: pl })}
                </CardTitle>
                <div className="flex flex-wrap gap-2 items-center">
                    <div className="flex gap-1 items-center mr-2">
                        <Button
                            variant={filter === 'all' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setFilter('all')}
                        >
                            Wszyscy ({data.employees.length})
                        </Button>
                        <Button
                            variant={filter === 'internal' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setFilter('internal')}
                        >
                            Internal
                        </Button>
                        <Button
                            variant={filter === 'admin' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setFilter('admin')}
                        >
                            Admin
                        </Button>
                    </div>
                    <Button variant="outline" size="icon" onClick={() => navigateMonth(-1)}>
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => navigateMonth(1)}>
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                {employees.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">
                        Brak pracowników wewnętrznych spełniających filtr.
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

                <div className="mt-6 flex flex-wrap gap-2 text-[10px]">
                    <Badge className="bg-yellow-500/40 text-yellow-100 border-transparent">U — Urlop</Badge>
                    <Badge className="bg-red-500/40 text-red-100 border-transparent">L — L4</Badge>
                    <Badge className="bg-pink-500/40 text-pink-100 border-transparent">O — Opieka</Badge>
                    <Badge className="bg-purple-500/40 text-purple-100 border-transparent">D — Delegacja</Badge>
                    <Badge className="bg-cyan-500/40 text-cyan-100 border-transparent">S — Szkolenie</Badge>
                    <Badge variant="outline" className="bg-muted text-muted-foreground">
                        Święto / weekend
                    </Badge>
                </div>
            </CardContent>
        </Card>
    )
}
