'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDownToLine, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toast } from '@/lib/toast'
import { toastSuccess } from '@/lib/toast-success'
import { convertTimerToEntry, type TimesheetTimerRow } from '@/lib/actions/timesheet-timer'
import { format, parseISO } from 'date-fns'
import { pl } from 'date-fns/locale'

interface Props {
    timers: TimesheetTimerRow[]
    timesheetId: string
    /** When true, list pokazuje się tylko jeśli są pending timery (auto-hide). */
    hideIfEmpty?: boolean
}

/**
 * H3.6: lista zatrzymanych timerów które nie zostały jeszcze skonwertowane
 * do timesheet entries. User klika "Dodaj do timesheetu" → tworzy się wpis.
 */
export function TimerPendingList({ timers, timesheetId, hideIfEmpty = false }: Props) {
    const router = useRouter()
    const [pendingId, setPendingId] = useState<string | null>(null)
    const [pending, startTransition] = useTransition()

    if (timers.length === 0 && hideIfEmpty) return null

    const handleConvert = (timerId: string) => {
        setPendingId(timerId)
        startTransition(async () => {
            try {
                await convertTimerToEntry(timerId, timesheetId)
                toastSuccess('Dodano do timesheetu')
                router.refresh()
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Błąd')
            } finally {
                setPendingId(null)
            }
        })
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-sm">Zatrzymane timery do dodania ({timers.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
                {timers.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-2">Brak.</p>
                ) : (
                    timers.map((t) => (
                        <div
                            key={t.id}
                            className="flex flex-wrap items-center gap-3 p-2 border border-border rounded text-sm"
                        >
                            <div className="flex-1 min-w-0">
                                <p className="font-medium tabular-nums">
                                    {format(parseISO(t.work_date), 'd LLL', { locale: pl })} ·{' '}
                                    <span className="text-primary">{t.hours_calculated}h</span>
                                </p>
                                <p className="text-xs text-muted-foreground truncate">
                                    {t.project ?? 'Bez projektu'} · {t.description}
                                </p>
                            </div>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleConvert(t.id)}
                                disabled={pending}
                                className="gap-1.5"
                            >
                                {pendingId === t.id ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                    <ArrowDownToLine className="w-3.5 h-3.5" />
                                )}
                                Dodaj do timesheetu
                            </Button>
                        </div>
                    ))
                )}
            </CardContent>
        </Card>
    )
}
