'use client'

// Phase 17b R2 — 4-option modal shown when user returns after their session
// was auto-closed by idle_timeout / sleep_detected within the last 30 min.
// Pattern stolen from Toggl/Hubstaff/Clockify (industry convention).

import { useState, useTransition } from 'react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { toast } from '@/lib/toast'
import {
    discardAutoClosedSession,
    mergeWithPreviousSession,
    startClockSession,
} from '@/lib/actions/internal-clock'
import type { RecentlyClosedSessionDTO } from '@/lib/hooks/useWorkClock'

interface Props {
    closed: RecentlyClosedSessionDTO
    onClose: () => void
    onSessionStarted: () => void
}

function formatDurationShort(seconds: number): string {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    if (h === 0) return `${m} min`
    return `${h}h ${m}m`
}

function detectDeviceLabel(): string {
    if (typeof navigator === 'undefined') return 'unknown'
    const ua = navigator.userAgent
    let browser = 'browser'
    if (ua.includes('Firefox')) browser = 'Firefox'
    else if (ua.includes('Edg')) browser = 'Edge'
    else if (ua.includes('Chrome')) browser = 'Chrome'
    else if (ua.includes('Safari')) browser = 'Safari'
    let os = ''
    if (ua.includes('Mac')) os = 'macOS'
    else if (ua.includes('Windows')) os = 'Windows'
    else if (ua.includes('Linux')) os = 'Linux'
    return os ? `${browser} on ${os}` : browser
}

export function IdleResumeDialog({ closed, onClose, onSessionStarted }: Props) {
    const [pending, startTransition] = useTransition()
    const [, setSelected] = useState<string | null>(null)

    const idleAgo = Math.round((Date.now() - new Date(closed.ended_at).getTime()) / 60_000)
    const tz = typeof Intl !== 'undefined'
        ? Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Warsaw'
        : 'Europe/Warsaw'

    const handleKeepAndContinue = () => {
        setSelected('keep')
        startTransition(async () => {
            try {
                await mergeWithPreviousSession(closed.id, detectDeviceLabel(), tz)
                toast.success('Sesja wznowiona — godziny zachowane')
                onSessionStarted()
                onClose()
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Błąd scalenia')
                setSelected(null)
            }
        })
    }

    const handleDiscard = () => {
        setSelected('discard')
        startTransition(async () => {
            try {
                await discardAutoClosedSession(closed.id)
                toast.success('Czas bezczynności odrzucony')
                onClose()
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Błąd')
                setSelected(null)
            }
        })
    }

    const handleDiscardAndStart = () => {
        setSelected('discard-and-start')
        startTransition(async () => {
            try {
                await discardAutoClosedSession(closed.id)
                await startClockSession({
                    deviceLabel: detectDeviceLabel(),
                    clientTz: tz,
                })
                toast.success('Nowa sesja rozpoczęta')
                onSessionStarted()
                onClose()
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Błąd')
                setSelected(null)
            }
        })
    }

    const handleAddAsEntry = () => {
        // For MVP: same as discard, but with a toast hint to add manual entry.
        // Future: deep-link to TimesheetEditor with prefilled hours from active_seconds.
        setSelected('add-as-entry')
        startTransition(async () => {
            try {
                await discardAutoClosedSession(closed.id)
                toast.info(
                    `Czas: ${formatDurationShort(closed.active_seconds)}. Dodaj go ręcznie w Timesheet jeśli to była praca.`,
                    { duration: 10000 },
                )
                onClose()
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Błąd')
                setSelected(null)
            }
        })
    }

    return (
        <Dialog open onOpenChange={(o) => !o && !pending && onClose()}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Byłeś nieaktywny ~{idleAgo} min</DialogTitle>
                    <DialogDescription>
                        Twoja sesja pracy została automatycznie zamknięta z powodu bezczynności.
                        Zarejestrowano <strong>{formatDurationShort(closed.active_seconds)}</strong>.
                        Co zrobić z czasem od ostatniej aktywności?
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-2">
                    <Button
                        variant="default"
                        onClick={handleKeepAndContinue}
                        disabled={pending}
                        className="justify-start text-left h-auto py-3"
                    >
                        <div className="flex flex-col items-start gap-0.5">
                            <span className="font-semibold">Kontynuuj pracę (zachowaj godziny)</span>
                            <span className="text-xs opacity-80 font-normal">
                                Czas idle zostanie zaliczony, nowa sesja startuje teraz.
                            </span>
                        </div>
                    </Button>
                    <Button
                        variant="outline"
                        onClick={handleDiscardAndStart}
                        disabled={pending}
                        className="justify-start text-left h-auto py-3"
                    >
                        <div className="flex flex-col items-start gap-0.5">
                            <span className="font-semibold">Odrzuć i rozpocznij nową sesję</span>
                            <span className="text-xs opacity-80 font-normal">
                                Czas idle nie zaliczony — nowa, czysta sesja.
                            </span>
                        </div>
                    </Button>
                    <Button
                        variant="outline"
                        onClick={handleAddAsEntry}
                        disabled={pending}
                        className="justify-start text-left h-auto py-3"
                    >
                        <div className="flex flex-col items-start gap-0.5">
                            <span className="font-semibold">Dodaj jako osobny wpis</span>
                            <span className="text-xs opacity-80 font-normal">
                                Sesja zamknięta, dodasz godziny ręcznie w Timesheet.
                            </span>
                        </div>
                    </Button>
                    <Button
                        variant="ghost"
                        onClick={handleDiscard}
                        disabled={pending}
                        className="justify-start text-left h-auto py-3 text-muted-foreground"
                    >
                        <div className="flex flex-col items-start gap-0.5">
                            <span className="font-semibold">Odrzuć (nie pracowałem)</span>
                            <span className="text-xs opacity-80 font-normal">
                                Czas nieaktywności nie zostanie zaliczony.
                            </span>
                        </div>
                    </Button>
                </div>

                <DialogFooter>
                    {pending && (
                        <span className="text-xs text-muted-foreground inline-flex items-center gap-2">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Zapisywanie...
                        </span>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
