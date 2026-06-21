'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
    eachDayOfInterval,
    endOfMonth,
    format,
    isWeekend,
    parseISO,
    startOfMonth,
} from 'date-fns'
import { pl } from 'date-fns/locale'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { toast } from '@/lib/toast'
import { toastSuccess } from '@/lib/toast-success'
import {
    deleteAttendanceDay,
    upsertAttendanceDay,
    type AttendanceLocation,
    type AttendanceRecord,
    type AttendanceStatus,
    type MonthData,
} from '@/lib/actions/internal-attendance'
import { AttendanceDayPopover } from './AttendanceDayPopover'

interface Props {
    data: MonthData
}

const LEAVE_LABEL_PL: Record<string, string> = {
    vacation: 'Urlop',
    sick_leave: 'L4',
    parental_leave: 'Opieka',
    unpaid_leave: 'Bezpłatny',
    training: 'Szkolenie',
    on_demand: 'Na żądanie',
    occasional: 'Okolicznościowy',
    childcare: 'Opieka dz.',
    care_leave: 'Opiekuńczy',
    force_majeure: 'Siła wyższa',
    maternity: 'Macierzyński',
    paternity: 'Ojcowski',
    childrearing: 'Wychowawczy',
    blood_donation: 'Krwiodawstwo',
    holiday_in_lieu: 'Odbiór',
    other: 'Inne',
}

interface CellMeta {
    bg: string
    text: string
    label: string
    tooltip: string
    readOnly: boolean
}

export function MonthlyAttendanceGrid({ data }: Props) {
    const router = useRouter()
    const [pending, startTransition] = useTransition()
    const [editingDate, setEditingDate] = useState<string | null>(null)

    const monthStart = startOfMonth(new Date(data.year, data.month - 1, 1))
    const monthEnd = endOfMonth(monthStart)
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd })

    const recordByDate = new Map<string, AttendanceRecord>()
    for (const r of data.records) recordByDate.set(r.date, r)

    const holidayByDate = new Map<string, string>()
    for (const h of data.holidays) holidayByDate.set(h.date, h.name_pl)

    const leaveByDate = new Map<string, { leave_type: string; half_day: string | null }>()
    for (const l of data.leaves) {
        const start = parseISO(l.start_date)
        const end = parseISO(l.end_date)
        for (const d of eachDayOfInterval({ start, end })) {
            leaveByDate.set(format(d, 'yyyy-MM-dd'), { leave_type: l.leave_type, half_day: l.half_day })
        }
    }

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
        router.push(`/internal/attendance?year=${newY}&month=${newM}`)
    }

    function saveDay(date: string, status: AttendanceStatus, location: AttendanceLocation | null, note: string) {
        startTransition(async () => {
            try {
                await upsertAttendanceDay({ date, status, location, note: note || null })
                toastSuccess('Zapisano')
                router.refresh()
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Błąd zapisu')
            }
        })
    }

    function clearDay(date: string) {
        startTransition(async () => {
            try {
                await deleteAttendanceDay(date)
                toastSuccess('Wyczyszczono')
                router.refresh()
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Błąd')
            }
        })
    }

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg capitalize">
                    {format(monthStart, 'LLLL yyyy', { locale: pl })}
                </CardTitle>
                <div className="flex gap-2 items-center">
                    {pending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                    <Button variant="outline" size="icon" onClick={() => navigateMonth(-1)} disabled={pending}>
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => navigateMonth(1)} disabled={pending}>
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-7 gap-2">
                    {['Pon', 'Wto', 'Śro', 'Czw', 'Pia', 'Sob', 'Nie'].map((d) => (
                        <div
                            key={d}
                            className="text-xs font-semibold text-center text-muted-foreground py-1"
                        >
                            {d}
                        </div>
                    ))}
                    {Array.from({ length: (monthStart.getDay() + 6) % 7 }).map((_, i) => (
                        <div key={`empty-${i}`} />
                    ))}
                    {days.map((d) => {
                        const iso = format(d, 'yyyy-MM-dd')
                        const meta = computeCellMeta({
                            date: d,
                            holiday: holidayByDate.get(iso),
                            leave: leaveByDate.get(iso),
                            record: recordByDate.get(iso),
                            isWeekend: isWeekend(d),
                            defaultLocation: data.defaultLocation,
                        })

                        return (
                            <button
                                key={iso}
                                disabled={meta.readOnly || pending}
                                onClick={() => setEditingDate(iso)}
                                className={`relative rounded-md border p-2 text-left h-20 transition-colors disabled:cursor-not-allowed hover:opacity-90 ${meta.bg}`}
                                title={meta.tooltip}
                            >
                                <div className={`text-xs font-bold ${meta.text}`}>{format(d, 'd')}</div>
                                <div
                                    className={`text-[10px] leading-tight mt-1 line-clamp-2 ${meta.text}`}
                                >
                                    {meta.label}
                                </div>
                            </button>
                        )
                    })}
                </div>

                <Legend />

                {editingDate && (
                    <AttendanceDayPopover
                        date={editingDate}
                        existing={recordByDate.get(editingDate) ?? null}
                        defaultLocation={data.defaultLocation}
                        blockedByLeave={leaveByDate.has(editingDate)}
                        onClose={() => setEditingDate(null)}
                        onSave={(status, location, note) => {
                            const date = editingDate
                            setEditingDate(null)
                            saveDay(date, status, location, note)
                        }}
                        onClear={() => {
                            const date = editingDate
                            setEditingDate(null)
                            clearDay(date)
                        }}
                    />
                )}
            </CardContent>
        </Card>
    )
}

function computeCellMeta(args: {
    date: Date
    holiday: string | undefined
    leave: { leave_type: string; half_day: string | null } | undefined
    record: AttendanceRecord | undefined
    isWeekend: boolean
    defaultLocation: AttendanceLocation
}): CellMeta {
    if (args.holiday) {
        return {
            bg: 'bg-muted border-border',
            text: 'text-muted-foreground',
            label: '🎉 ' + args.holiday,
            tooltip: 'Dzień ustawowo wolny — ' + args.holiday,
            readOnly: true,
        }
    }
    if (args.leave) {
        return {
            bg: 'bg-warning/15 border-warning/40',
            text: 'text-warning',
            label: LEAVE_LABEL_PL[args.leave.leave_type] ?? 'Urlop',
            tooltip: 'Auto-status z zaakceptowanego wniosku urlopowego',
            readOnly: true,
        }
    }
    if (args.record) {
        return statusCellMeta(args.record.status, args.record.location, args.record.note, false)
    }
    if (args.isWeekend) {
        return {
            bg: 'bg-muted/40 border-border/40',
            text: 'text-muted-foreground',
            label: 'Weekend',
            tooltip: 'Weekend — kliknij aby nadpisać (np. pracowałem w sobotę)',
            readOnly: false,
        }
    }
    return statusCellMeta('active', args.defaultLocation, null, true)
}

function statusCellMeta(
    status: AttendanceStatus,
    location: AttendanceLocation | null,
    note: string | null,
    isDefault: boolean,
): CellMeta {
    const noteSuffix = note ? ` — ${note}` : ''
    const defaultPrefix = isDefault ? 'Domyślnie ' : ''
    const tooltipPrefix = isDefault ? '(Domyślny status — kliknij aby nadpisać) ' : ''

    switch (status) {
        case 'active':
            if (location === 'remote') {
                return {
                    bg: 'bg-info/15 border-info/40',
                    text: 'text-info',
                    label: defaultPrefix + 'Remote' + noteSuffix,
                    tooltip: tooltipPrefix + 'Praca zdalna' + noteSuffix,
                    readOnly: false,
                }
            }
            return {
                bg: 'bg-success/15 border-success/40',
                text: 'text-success',
                label: defaultPrefix + 'Biuro' + noteSuffix,
                tooltip: tooltipPrefix + 'W biurze' + noteSuffix,
                readOnly: false,
            }
        case 'vacation':
            return {
                bg: 'bg-warning/20 border-warning/40',
                text: 'text-warning',
                label: 'Urlop' + noteSuffix,
                tooltip: 'Urlop wypoczynkowy' + noteSuffix,
                readOnly: false,
            }
        case 'sick_leave':
            return {
                bg: 'bg-destructive/15 border-destructive/40',
                text: 'text-destructive',
                label: 'L4' + noteSuffix,
                tooltip: 'Zwolnienie lekarskie' + noteSuffix,
                readOnly: false,
            }
        case 'parental_leave':
            return {
                bg: 'bg-pink-500/15 border-pink-500/40',
                text: 'text-pink-200',
                label: 'Opieka' + noteSuffix,
                tooltip: 'Opieka rodzicielska' + noteSuffix,
                readOnly: false,
            }
        case 'unpaid_leave':
            return {
                bg: 'bg-muted border-border',
                text: 'text-muted-foreground',
                label: 'Bezpłatny' + noteSuffix,
                tooltip: 'Urlop bezpłatny' + noteSuffix,
                readOnly: false,
            }
        // Phase 29 / Attendance STRICT: business_trip i training są typami w
        // AttendanceStatus, ale nie są dostępne do wpisania przez dialog (pracownik
        // wpisuje tylko swoją lokalizację). Defensive fallback dla legacy danych —
        // w prod 0 takich rekordów, ale gdyby się pojawiły, lecą do default branch
        // (statutory leave fallback) jako szare/teal tile.
        case 'holiday_in_lieu':
            return {
                bg: 'bg-primary/15 border-primary/40',
                text: 'text-primary',
                label: 'Odbiór' + noteSuffix,
                tooltip: 'Odbiór dnia za święto' + noteSuffix,
                readOnly: false,
            }
        case 'other':
            return {
                bg: 'bg-warning/15 border-warning/40',
                text: 'text-warning',
                label: 'Inne' + noteSuffix,
                tooltip: 'Inny status' + noteSuffix,
                readOnly: false,
            }
        default: {
            // Statutory leave types (Phase 27k) synced into attendance:
            // on_demand, occasional, childcare, care_leave, force_majeure,
            // maternity, paternity, childrearing, blood_donation.
            const leaveLabel = LEAVE_LABEL_PL[status] ?? 'Urlop'
            return {
                bg: 'bg-success/15 border-success/40',
                text: 'text-success',
                label: leaveLabel + noteSuffix,
                tooltip: leaveLabel + noteSuffix,
                readOnly: false,
            }
        }
    }
}

function Legend() {
    return (
        <div className="mt-6 flex flex-wrap gap-2 text-[10px]">
            <Badge variant="outline" className="bg-success/15 text-success border-success/40">
                Biuro
            </Badge>
            <Badge variant="outline" className="bg-info/15 text-info border-info/40">
                Remote
            </Badge>
            <Badge variant="outline" className="bg-warning/20 text-warning border-warning/40">
                Urlop
            </Badge>
            <Badge variant="outline" className="bg-muted text-muted-foreground">
                Święto / weekend
            </Badge>
        </div>
    )
}
