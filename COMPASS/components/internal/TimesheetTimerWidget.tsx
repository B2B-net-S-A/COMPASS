'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Play, Square, X, Loader2, Clock } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/lib/toast'
import { toastSuccess } from '@/lib/toast-success'
import {
    startTimer,
    stopActiveTimer,
    cancelActiveTimer,
    type TimesheetTimerRow,
} from '@/lib/actions/timesheet-timer'

interface Props {
    initialActive: TimesheetTimerRow | null
}

function formatDuration(ms: number): string {
    const totalSec = Math.floor(ms / 1000)
    const h = Math.floor(totalSec / 3600)
    const m = Math.floor((totalSec % 3600) / 60)
    const s = totalSec % 60
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/**
 * H3.6: TimerWidget — Beebole-style start/stop dla timesheet.
 * Używane jako alternatywa do manual entry. Po stop user może konwertować
 * timer na timesheet entry (przez "Dodaj do timesheetu" button w pending list).
 */
export function TimesheetTimerWidget({ initialActive }: Props) {
    const router = useRouter()
    const [active, setActive] = useState<TimesheetTimerRow | null>(initialActive)
    const [now, setNow] = useState<number>(Date.now())
    const [project, setProject] = useState('')
    const [description, setDescription] = useState('')
    const [pending, startTransition] = useTransition()

    // Tick co 1s gdy timer aktywny
    useEffect(() => {
        if (!active) return
        const interval = setInterval(() => setNow(Date.now()), 1000)
        return () => clearInterval(interval)
    }, [active])

    const elapsedMs = active ? now - new Date(active.started_at).getTime() : 0

    const handleStart = () => {
        startTransition(async () => {
            try {
                const t = await startTimer({
                    project: project || null,
                    description: description || 'Praca standardowa',
                })
                setActive(t)
                toastSuccess('Timer uruchomiony')
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Błąd')
            }
        })
    }

    const handleStop = () => {
        startTransition(async () => {
            try {
                const t = await stopActiveTimer()
                setActive(null)
                setProject('')
                setDescription('')
                toastSuccess(`Zatrzymano. Czas: ${t.hours_calculated}h. Dodaj do timesheetu z listy "Pending".`)
                router.refresh()
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Błąd')
                if ((e as Error).message?.includes('krócej niż 1 min')) {
                    setActive(null)
                }
            }
        })
    }

    const handleCancel = () => {
        if (!window.confirm('Anulować timer? Czas zostanie utracony.')) return
        startTransition(async () => {
            try {
                await cancelActiveTimer()
                setActive(null)
                toastSuccess('Timer anulowany')
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Błąd')
            }
        })
    }

    if (active) {
        return (
            <Card className="bg-gradient-to-r from-success/10 to-success/5 border-success/30">
                <CardContent className="p-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    <div className="flex items-center gap-3 flex-1">
                        <div className="w-12 h-12 rounded-full bg-success/20 flex items-center justify-center shrink-0 animate-pulse">
                            <Clock className="w-6 h-6 text-success" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-xs uppercase tracking-wide text-success font-medium">Timer aktywny</p>
                            <p className="text-3xl font-bold tabular-nums">{formatDuration(elapsedMs)}</p>
                            <p className="text-xs text-muted-foreground truncate mt-0.5">
                                {active.project ?? 'Bez projektu'} · {active.description}
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                        <Button onClick={handleStop} disabled={pending} className="gap-2 bg-success hover:bg-success/90 text-success-foreground">
                            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
                            Zatrzymaj
                        </Button>
                        <Button onClick={handleCancel} disabled={pending} variant="outline" size="icon" title="Anuluj timer">
                            <X className="w-4 h-4" />
                        </Button>
                    </div>
                </CardContent>
            </Card>
        )
    }

    return (
        <Card className="bg-card border-border">
            <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                    <Clock className="w-5 h-5 text-primary" />
                    <h3 className="font-semibold">Timer</h3>
                    <Badge variant="outline" className="text-[10px]">opcjonalny</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                    Zacznij timer rano, zatrzymaj wieczorem — system automatycznie obliczy godziny i doda jako wpis.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="space-y-1">
                        <Label htmlFor="timer_project" className="text-xs">Projekt (opcjonalny)</Label>
                        <Input
                            id="timer_project"
                            placeholder="np. Klient X"
                            value={project}
                            onChange={(e) => setProject(e.target.value)}
                            disabled={pending}
                        />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="timer_desc" className="text-xs">Opis</Label>
                        <Input
                            id="timer_desc"
                            placeholder="Praca standardowa"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            disabled={pending}
                        />
                    </div>
                </div>
                <Button onClick={handleStart} disabled={pending} className="w-full sm:w-auto gap-2">
                    {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                    Uruchom timer
                </Button>
            </CardContent>
        </Card>
    )
}
