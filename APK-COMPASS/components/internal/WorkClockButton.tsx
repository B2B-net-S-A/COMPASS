'use client'

import { useEffect, useState } from 'react'
import { Play, Square, Pause, Loader2, Clock, Coffee, ChevronUp, Phone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useWorkClock } from '@/lib/hooks/useWorkClock'
import { toast } from '@/lib/toast'
import { MonitoringConsentDialog } from './MonitoringConsentDialog'
import { IdleWarningToast } from './IdleWarningToast'
import { IdleResumeDialog } from './IdleResumeDialog'
import { getMyConsentState } from '@/lib/actions/internal-clock'

function formatDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function formatRemainingPause(pausedUntilIso: string): string {
    const remainingMs = new Date(pausedUntilIso).getTime() - Date.now()
    if (remainingMs <= 0) return '0:00'
    const m = Math.floor(remainingMs / 60_000)
    const s = Math.floor((remainingMs % 60_000) / 1000)
    return `${m}:${String(s).padStart(2, '0')}`
}

export function WorkClockButton() {
    const clock = useWorkClock({ enabled: true })
    const [hasConsent, setHasConsent] = useState<boolean | null>(null)
    const [consentDialogOpen, setConsentDialogOpen] = useState(false)
    const [stopConfirmOpen, setStopConfirmOpen] = useState(false)
    const [transferDialogOpen, setTransferDialogOpen] = useState(false)
    const [pendingError, setPendingError] = useState<string | null>(null)

    useEffect(() => {
        let cancelled = false
        getMyConsentState()
            .then((state) => {
                if (!cancelled) setHasConsent(state.hasConsent)
            })
            .catch(() => {
                if (!cancelled) setHasConsent(false)
            })
        return () => {
            cancelled = true
        }
    }, [])

    if (hasConsent === null || clock.loading) {
        return (
            <div className="fixed bottom-6 right-6 z-40">
                <Button variant="secondary" size="lg" disabled className="shadow-xl">
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Zegar...
                </Button>
            </div>
        )
    }

    async function handleStart() {
        try {
            await clock.start()
            toast.success('Zegar pracy uruchomiony')
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Błąd startu'
            if (msg.includes('innym urządzeniu')) {
                setTransferDialogOpen(true)
            } else {
                setPendingError(msg)
                toast.error(msg)
            }
        }
    }

    async function handleStop() {
        try {
            await clock.stop()
            toast.success('Zegar zatrzymany — godziny zapisane')
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'Błąd zatrzymania')
        } finally {
            setStopConfirmOpen(false)
        }
    }

    async function handleTransfer() {
        try {
            await clock.transfer()
            toast.success('Sesja przejęta na to urządzenie')
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'Błąd przejęcia sesji')
        } finally {
            setTransferDialogOpen(false)
        }
    }

    async function handlePause(minutes: 30 | 60 | 120) {
        try {
            const reason = (`break_${minutes}` as const) as 'break_30' | 'break_60' | 'break_120'
            await clock.pause(minutes, reason)
            toast.success(`Pauza ${minutes} min — zegar zatrzymany`)
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'Błąd pauzy')
        }
    }

    async function handleResume() {
        try {
            await clock.resume()
            toast.success('Praca wznowiona')
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'Błąd wznowienia')
        }
    }

    // Stopped + no consent → show CTA opening consent dialog
    if (!hasConsent) {
        return (
            <>
                <div className="fixed bottom-6 right-6 z-40">
                    <Button
                        size="lg"
                        variant="secondary"
                        className="shadow-xl bg-amber-600/20 border border-amber-500/30 text-amber-200 hover:bg-amber-600/30"
                        onClick={() => setConsentDialogOpen(true)}
                    >
                        <Clock className="h-4 w-4 mr-2" />
                        Włącz zegar pracy
                    </Button>
                </div>
                <MonitoringConsentDialog
                    open={consentDialogOpen}
                    onOpenChange={setConsentDialogOpen}
                    onAccepted={() => setHasConsent(true)}
                />
            </>
        )
    }

    // Stopped + consent → start button (with R2 IdleResumeDialog if applicable)
    if (!clock.sessionId) {
        return (
            <>
                <div className="fixed bottom-6 right-6 z-40">
                    <Button
                        size="lg"
                        className="shadow-xl bg-green-600 hover:bg-green-700 text-white"
                        onClick={handleStart}
                    >
                        <Play className="h-4 w-4 mr-2" />
                        Start pracy
                    </Button>
                </div>
                <AlertDialog open={transferDialogOpen} onOpenChange={setTransferDialogOpen}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Aktywna sesja na innym urządzeniu</AlertDialogTitle>
                            <AlertDialogDescription>
                                Masz już aktywną sesję pracy na innym urządzeniu. Czy chcesz ją
                                przejąć tutaj? Stara sesja zostanie zamknięta.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Anuluj</AlertDialogCancel>
                            <AlertDialogAction onClick={handleTransfer}>Przejmij</AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
                {clock.lastClosedSession && (
                    <IdleResumeDialog
                        closed={clock.lastClosedSession}
                        onClose={clock.clearLastClosedSession}
                        onSessionStarted={() => {
                            clock.clearLastClosedSession()
                            clock.refreshFromServer()
                        }}
                    />
                )}
            </>
        )
    }

    // Running / paused — counter + controls
    const isPaused = clock.state === 'paused_break'
    const stateLabel = isPaused
        ? `Pauza (${formatRemainingPause(clock.pausedUntil ?? new Date().toISOString())} do końca)`
        : clock.state === 'idle'
          ? 'Idle (>20 min)'
          : clock.state === 'paused_hidden'
            ? 'Wstrzymany (karta nieaktywna)'
            : 'Pracujesz'

    const accent = isPaused
        ? 'bg-purple-600 hover:bg-purple-700'
        : clock.state === 'idle'
          ? 'bg-amber-600 hover:bg-amber-700'
          : clock.state === 'paused_hidden'
            ? 'bg-slate-600 hover:bg-slate-700'
            : 'bg-blue-600 hover:bg-blue-700'

    return (
        <>
            <div className="fixed bottom-6 right-6 z-40 flex items-center gap-2">
                <div className="bg-zinc-900/95 backdrop-blur border border-zinc-700 rounded-lg px-4 py-3 shadow-xl">
                    <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                        {stateLabel}
                        {clock.mediaActive && (
                            <span
                                className="inline-flex items-center gap-1 text-[10px] text-green-300 border border-green-500/30 bg-green-500/10 rounded px-1 py-0.5"
                                title="Wykryto aktywny call — próg idle wydłużony do 60 min"
                            >
                                <Phone className="h-2.5 w-2.5" />
                                Call
                            </span>
                        )}
                    </div>
                    <div className="text-2xl font-mono font-semibold tabular-nums">
                        {formatDuration(clock.elapsedSeconds)}
                    </div>
                </div>
                {isPaused ? (
                    <Button
                        size="lg"
                        className={`shadow-xl text-white ${accent}`}
                        onClick={handleResume}
                    >
                        <Play className="h-4 w-4 mr-2" />
                        Wznów
                    </Button>
                ) : (
                    <>
                        {/* R3: pause dropdown */}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    size="lg"
                                    variant="outline"
                                    className="shadow-xl bg-zinc-900/95 border-zinc-700 text-zinc-100 hover:bg-zinc-800"
                                >
                                    <Coffee className="h-4 w-4 mr-2" />
                                    Pauza
                                    <ChevronUp className="h-3 w-3 ml-1 opacity-60" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handlePause(30)}>
                                    30 minut
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handlePause(60)}>
                                    1 godzina
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handlePause(120)}>
                                    2 godziny
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <Button
                            size="lg"
                            className={`shadow-xl text-white ${accent}`}
                            onClick={() => setStopConfirmOpen(true)}
                        >
                            {clock.state === 'idle' ? (
                                <Pause className="h-4 w-4 mr-2" />
                            ) : (
                                <Square className="h-4 w-4 mr-2" />
                            )}
                            Stop
                        </Button>
                    </>
                )}
            </div>

            {/* R1: idle warning at 50 min */}
            <IdleWarningToast show={clock.showIdleWarning} onConfirm={clock.keepAlive} />

            <AlertDialog open={stopConfirmOpen} onOpenChange={setStopConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Zakończyć pracę?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Zegar zostanie zatrzymany, a aktualna sesja zapisana ({formatDuration(clock.elapsedSeconds)}).
                            Możesz później wypełnić timesheet z trackingu.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Kontynuuj pracę</AlertDialogCancel>
                        <AlertDialogAction onClick={handleStop}>Zakończ</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {pendingError && <span className="sr-only">{pendingError}</span>}
        </>
    )
}
