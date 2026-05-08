'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Pencil, Plus, Trash2, Loader2, Send, FileDown, ChevronLeft, ChevronRight, Wand2, Clock, AlertTriangle } from 'lucide-react'
import { format, parseISO, startOfMonth, endOfMonth } from 'date-fns'
import { pl } from 'date-fns/locale'
import { toast } from '@/lib/toast'
import { toastSuccess } from '@/lib/toast-success'
import { useConfirm } from '@/components/shared/ConfirmDialog'
import {
    addEntry,
    deleteEntry,
    quickFillMonth,
    submitTimesheet,
    updateEntry,
    type TimesheetEntryRow,
    type TimesheetWithEntries,
} from '@/lib/actions/internal-timesheet'
import { suggestTimesheetEntriesFromClock } from '@/lib/actions/internal-clock'
import { TimesheetEntryDialog } from './TimesheetEntryDialog'

interface Props {
    timesheet: TimesheetWithEntries
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
    draft: { label: 'Szkic', className: 'bg-gray-500/15 text-gray-300 border-gray-500/30' },
    submitted: { label: 'Oczekuje akceptacji', className: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30' },
    approved: { label: 'Zaakceptowany', className: 'bg-green-500/15 text-green-300 border-green-500/30' },
    rejected: { label: 'Odrzucony', className: 'bg-red-500/15 text-red-300 border-red-500/30' },
}

export function TimesheetEditor({ timesheet }: Props) {
    const router = useRouter()
    const [pending, startTransition] = useTransition()
    const [editingEntry, setEditingEntry] = useState<TimesheetEntryRow | null>(null)
    const [creating, setCreating] = useState(false)
    const [confirm, ConfirmUI] = useConfirm()

    const editable = timesheet.status === 'draft'
    const status = STATUS_BADGE[timesheet.status]

    const ref = new Date(timesheet.year, timesheet.month - 1, 1)
    const minDate = format(startOfMonth(ref), 'yyyy-MM-dd')
    const maxDate = format(endOfMonth(ref), 'yyyy-MM-dd')

    const totalHours = useMemo(
        () => timesheet.entries.reduce((sum, e) => sum + Number(e.hours), 0),
        [timesheet.entries],
    )

    function navigateMonth(delta: number) {
        let newY = timesheet.year
        let newM = timesheet.month + delta
        if (newM < 1) {
            newM = 12
            newY -= 1
        }
        if (newM > 12) {
            newM = 1
            newY += 1
        }
        router.push(`/internal/timesheet/${newY}/${newM}`)
    }

    function handleAdd(values: { workDate: string; hours: number; project: string | null; description: string }) {
        startTransition(async () => {
            try {
                await addEntry({ timesheetId: timesheet.id, ...values })
                toastSuccess('Wpis dodany')
                setCreating(false)
                router.refresh()
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Błąd')
            }
        })
    }

    function handleUpdate(values: { workDate: string; hours: number; project: string | null; description: string }) {
        if (!editingEntry) return
        const id = editingEntry.id
        startTransition(async () => {
            try {
                await updateEntry({
                    entryId: id,
                    workDate: values.workDate,
                    hours: values.hours,
                    project: values.project,
                    description: values.description,
                })
                toastSuccess('Zaktualizowano')
                setEditingEntry(null)
                router.refresh()
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Błąd')
            }
        })
    }

    async function handleDelete(entry: TimesheetEntryRow) {
        const ok = await confirm({
            title: 'Usunąć wpis',
            description: `${format(parseISO(entry.work_date), 'd LLL', { locale: pl })} — ${entry.hours}h. ${entry.description}`,
            confirmLabel: 'Usuń',
            variant: 'destructive',
        })
        if (!ok) return
        startTransition(async () => {
            try {
                await deleteEntry(entry.id)
                toastSuccess('Usunięto')
                router.refresh()
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Błąd')
            }
        })
    }

    async function handleSubmit() {
        const ok = await confirm({
            title: 'Złożyć timesheet',
            description: `Złożyć timesheet za ${format(ref, 'LLLL yyyy', { locale: pl })}? Po złożeniu nie będziesz mógł go edytować — admin musi zaakceptować lub odrzucić.`,
            confirmLabel: 'Złóż',
        })
        if (!ok) return
        startTransition(async () => {
            try {
                await submitTimesheet(timesheet.id)
                toastSuccess('Timesheet złożony')
                router.refresh()
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Błąd')
            }
        })
    }

    async function handleFillFromClock() {
        const hasSuggestions = timesheet.entries.some(
            (e) => e.source === 'clock_suggested' || e.source === 'clock_accepted',
        )
        const ok = await confirm({
            title: hasSuggestions ? 'Odśwież propozycje z zegara?' : 'Wypełnij z trackingu zegara?',
            description: hasSuggestions
                ? `Usunie istniejące wpisy oznaczone „z zegara" i wstawi je ponownie z aktualnych danych. Wpisy ręczne pozostaną nietknięte.`
                : `${format(ref, 'LLLL yyyy', { locale: pl })}: wstawi propozycje wpisów na podstawie sesji z work clock. Pomija dni z urlopem/L4 i dni z istniejącymi wpisami. Możesz potem edytować — każda zmiana >1h od trackingu zostanie oznaczona jako wymagająca akceptacji admina.`,
            confirmLabel: hasSuggestions ? 'Odśwież' : 'Wypełnij',
        })
        if (!ok) return
        startTransition(async () => {
            try {
                const res = await suggestTimesheetEntriesFromClock({
                    timesheetId: timesheet.id,
                    overwriteSuggestions: hasSuggestions,
                })
                if (res.inserted === 0 && res.total_days_with_tracking === 0) {
                    toast.warning('Brak danych z trackingu w tym miesiącu')
                } else {
                    const parts = [`Dodano ${res.inserted} wpisów z trackingu`]
                    if (res.skipped_existing > 0) {
                        parts.push(`pominięto ${res.skipped_existing} (już istniały)`)
                    }
                    toastSuccess(parts.join(' · '))
                }
                router.refresh()
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Błąd')
            }
        })
    }

    async function handleQuickFill() {
        const hasEntries = timesheet.entries.length > 0
        const ok = await confirm({
            title: hasEntries
                ? 'Nadpisać miesiąc 8h × dzień roboczy?'
                : 'Wypełnić miesiąc 8h × dzień roboczy?',
            description: hasEntries
                ? `${format(ref, 'LLLL yyyy', { locale: pl })}: USUNIE wszystkie istniejące wpisy i wypełni od zera 8h dla każdego dnia roboczego (pomijając weekendy, święta i Twoje urlopy).`
                : `${format(ref, 'LLLL yyyy', { locale: pl })}: wypełni 8h dla każdego dnia roboczego (pomija weekendy, święta i Twoje urlopy). Możesz potem ręcznie poprawić poszczególne dni.`,
            confirmLabel: hasEntries ? 'Nadpisz' : 'Wypełnij',
            variant: hasEntries ? 'destructive' : 'default',
        })
        if (!ok) return
        startTransition(async () => {
            try {
                const res = await quickFillMonth({
                    timesheetId: timesheet.id,
                    hoursPerDay: 8,
                    overwrite: hasEntries,
                })
                const parts = [`Dodano ${res.inserted} dni × 8h`]
                if (res.skipped_leave > 0) parts.push(`${res.skipped_leave} pominięte (urlop)`)
                if (res.skipped_pending_leave > 0)
                    parts.push(`${res.skipped_pending_leave} pominięte (oczekujący wniosek urlopowy)`)
                if (res.skipped_existing > 0) parts.push(`${res.skipped_existing} pominięte (już istniały)`)
                toastSuccess(parts.join(' · '))
                router.refresh()
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Błąd')
            }
        })
    }

    return (
        <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <CardTitle className="text-lg capitalize flex items-center gap-2">
                        {format(ref, 'LLLL yyyy', { locale: pl })}
                        <Badge variant="outline" className={status?.className}>
                            {status?.label ?? timesheet.status}
                        </Badge>
                    </CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                        Suma: <strong>{totalHours.toFixed(2)} h</strong> / {timesheet.entries.length} wpisów
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {timesheet.status === 'approved' && (
                        <a
                            href={`/internal/timesheet/${timesheet.year}/${timesheet.month}/pdf`}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            <Button variant="outline" size="sm">
                                <FileDown className="h-4 w-4 mr-2" />
                                Pobierz PDF
                            </Button>
                        </a>
                    )}
                    {pending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                    <Button variant="outline" size="icon" onClick={() => navigateMonth(-1)} disabled={pending}>
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => navigateMonth(1)} disabled={pending}>
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* H2.7: po reject status auto wraca do 'draft' z rejection_note,
                    user widzi powód i może natychmiast edytować + wysłać ponownie. */}
                {timesheet.status === 'draft' && timesheet.rejection_note && (
                    <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
                        <strong>Odrzucony przez admina:</strong> {timesheet.rejection_note}
                        <p className="text-xs mt-1 text-red-300/80">
                            Popraw wpisy zgodnie z uwagami i wyślij timesheet ponownie. Po następnym
                            wysłaniu komunikat zniknie.
                        </p>
                    </div>
                )}
                {/* Stary status 'rejected' (jeśli kiedyś wystąpi w danych historycznych) */}
                {timesheet.status === 'rejected' && timesheet.rejection_note && (
                    <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
                        <strong>Odrzucony przez admina:</strong> {timesheet.rejection_note}
                        <p className="text-xs mt-1 text-red-300/80">
                            Skontaktuj się z adminem, aby odblokować edycję.
                        </p>
                    </div>
                )}

                {timesheet.status === 'submitted' && (
                    <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-200">
                        Timesheet czeka na akceptację admina. W tym statusie nie można edytować wpisów.
                    </div>
                )}

                {timesheet.status === 'approved' && (
                    <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-200">
                        Timesheet zaakceptowany. Hash dokumentu: <code className="text-[10px]">{timesheet.pdf_hash?.slice(0, 12)}…</code>
                    </div>
                )}

                {timesheet.entries.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-6 text-center">
                        Brak wpisów. Dodaj pierwszy poniżej.
                    </p>
                ) : (
                    <>
                        {/* H3.2: mobile-first layout — lista kart na <md, tabela na >=md */}
                        <div className="md:hidden space-y-2">
                            {timesheet.entries.map((e) => (
                                <div
                                    key={e.id}
                                    className="border border-border/40 rounded-lg p-3 bg-card hover:bg-muted/20 active:bg-muted/30"
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold capitalize">
                                                {format(parseISO(e.work_date), 'EEEE, d LLLL', { locale: pl })}
                                            </p>
                                            {e.project && (
                                                <p className="text-xs text-muted-foreground mt-0.5">
                                                    {e.project}
                                                </p>
                                            )}
                                            <p className="text-sm mt-1.5 break-words whitespace-pre-wrap">
                                                {e.description}
                                            </p>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <p className="text-lg font-bold tabular-nums text-primary">
                                                {Number(e.hours).toFixed(2)}h
                                            </p>
                                        </div>
                                    </div>
                                    {editable && (
                                        <div className="flex gap-2 mt-3 pt-2 border-t border-border/30">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="flex-1 min-h-[44px]"
                                                onClick={() => setEditingEntry(e)}
                                                disabled={pending}
                                            >
                                                <Pencil className="h-4 w-4 mr-2" />
                                                Edytuj
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="flex-1 min-h-[44px] text-destructive hover:text-destructive"
                                                onClick={() => handleDelete(e)}
                                                disabled={pending}
                                            >
                                                <Trash2 className="h-4 w-4 mr-2" />
                                                Usuń
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            ))}
                            <div className="border-t pt-3 flex justify-between items-center font-bold">
                                <span>Razem</span>
                                <span className="text-xl tabular-nums text-primary">
                                    {totalHours.toFixed(2)} h
                                </span>
                            </div>
                        </div>

                    <div className="hidden md:block overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b text-xs text-muted-foreground">
                                    <th className="text-left py-2 pr-2 font-medium">Data</th>
                                    <th className="text-left py-2 pr-2 font-medium">Projekt</th>
                                    <th className="text-left py-2 pr-2 font-medium">Opis</th>
                                    <th className="text-right py-2 pr-2 font-medium">Godziny</th>
                                    {editable && <th className="py-2" />}
                                </tr>
                            </thead>
                            <tbody>
                                {timesheet.entries.map((e) => (
                                    <tr key={e.id} className="border-b border-border/40 hover:bg-muted/30">
                                        <td className="py-2 pr-2 whitespace-nowrap text-xs">
                                            {format(parseISO(e.work_date), 'd LLL', { locale: pl })}
                                            <span className="text-muted-foreground ml-1 text-[10px]">
                                                {format(parseISO(e.work_date), 'EEE', { locale: pl })}
                                            </span>
                                        </td>
                                        <td className="py-2 pr-2 text-xs">
                                            {e.project ?? <span className="text-muted-foreground">—</span>}
                                        </td>
                                        <td className="py-2 pr-2 text-xs max-w-[400px]">
                                            <span className="line-clamp-2">{e.description}</span>
                                            {(e.source === 'clock_suggested' || e.source === 'clock_accepted') && (
                                                <span
                                                    className="inline-flex items-center gap-1 ml-2 text-[10px] text-blue-300"
                                                    title={
                                                        e.tracked_hours != null
                                                            ? `Z trackingu: ${Number(e.tracked_hours).toFixed(2)}h`
                                                            : 'Wpis z trackingu'
                                                    }
                                                >
                                                    <Clock className="h-3 w-3" />
                                                    z zegara
                                                </span>
                                            )}
                                            {e.correction_required && (
                                                <span
                                                    className="inline-flex items-center gap-1 ml-2 text-[10px] text-amber-300"
                                                    title={
                                                        e.tracked_hours != null
                                                            ? `Różnica vs tracking: ${(Number(e.hours) - Number(e.tracked_hours)).toFixed(2)}h`
                                                            : 'Wymaga zatwierdzenia korekty'
                                                    }
                                                >
                                                    <AlertTriangle className="h-3 w-3" />
                                                    wymaga korekty
                                                </span>
                                            )}
                                        </td>
                                        <td className="py-2 pr-2 text-right font-mono text-xs">
                                            {Number(e.hours).toFixed(2)}
                                        </td>
                                        {editable && (
                                            <td className="py-2 text-right whitespace-nowrap">
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    className="h-7 w-7"
                                                    onClick={() => setEditingEntry(e)}
                                                    disabled={pending}
                                                >
                                                    <Pencil className="h-3.5 w-3.5" />
                                                </Button>
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                                    onClick={() => handleDelete(e)}
                                                    disabled={pending}
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="font-bold">
                                    <td colSpan={3} className="py-2 pr-2 text-right">
                                        Razem
                                    </td>
                                    <td className="py-2 pr-2 text-right font-mono">
                                        {totalHours.toFixed(2)} h
                                    </td>
                                    {editable && <td />}
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                    </>
                )}

                {editable && (
                    <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 pt-2 border-t">
                        <Button
                            onClick={() => setCreating(true)}
                            disabled={pending}
                            className="min-h-[44px] w-full sm:w-auto"
                        >
                            <Plus className="h-4 w-4 mr-2" />
                            Dodaj wpis
                        </Button>
                        <Button
                            variant="outline"
                            onClick={handleQuickFill}
                            disabled={pending}
                            title="Wypełni cały miesiąc 8h × dzień roboczy. Pomija weekendy, święta i Twoje urlopy."
                            className="min-h-[44px] w-full sm:w-auto"
                        >
                            <Wand2 className="h-4 w-4 mr-2" />
                            Wypełnij miesiąc 8h
                        </Button>
                        <Button
                            variant="outline"
                            onClick={handleFillFromClock}
                            disabled={pending}
                            title="Wstawi propozycje wpisów na podstawie zarejestrowanych sesji pracy. Wpisy >1h różnicy od trackingu wymagają akceptacji admina."
                        >
                            <Clock className="h-4 w-4 mr-2" />
                            Wypełnij z trackingu
                        </Button>
                        <Button
                            variant="default"
                            onClick={handleSubmit}
                            disabled={pending || timesheet.entries.length === 0}
                            className="min-h-[44px] w-full sm:w-auto sm:ml-auto"
                        >
                            <Send className="h-4 w-4 mr-2" />
                            Złóż timesheet
                        </Button>
                    </div>
                )}
            </CardContent>

            {(editingEntry || creating) && (
                <TimesheetEntryDialog
                    open
                    initial={editingEntry}
                    minDate={minDate}
                    maxDate={maxDate}
                    saving={pending}
                    existingEntries={timesheet.entries}
                    onOpenChange={(o) => {
                        if (!o) {
                            setEditingEntry(null)
                            setCreating(false)
                        }
                    }}
                    onSubmit={editingEntry ? handleUpdate : handleAdd}
                />
            )}
            <ConfirmUI />
        </Card>
    )
}
