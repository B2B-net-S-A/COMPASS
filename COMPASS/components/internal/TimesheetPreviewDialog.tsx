'use client'

// Phase 24c — Preview dialog for admin/manager timesheet review.
// Opens on row click in TimesheetAdminList. Shows day-by-day entries with
// description + project + source badge BEFORE the approver decides.
//
// Phase 27f — the approver (admin OR manager-of-team) can now correct entries
// in place while the timesheet is 'draft' or 'submitted', without waiting for
// the employee to submit. Add / edit / delete map to approver* server actions
// that re-check team scope server-side. Overtime-override rows stay read-only
// here (admin-only panel).

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Check, X, Loader2, FileDown, Unlock, Clock, AlertTriangle, Pencil, Trash2, Plus } from 'lucide-react'
import { format, parseISO, startOfMonth, endOfMonth } from 'date-fns'
import { pl } from 'date-fns/locale'
import { toast } from '@/lib/toast'
import { toastSuccess } from '@/lib/toast-success'
import { useConfirm } from '@/components/shared/ConfirmDialog'
import {
    approverAddEntry,
    approverDeleteEntry,
    approverUpdateEntry,
    approveTimesheet,
    unlockTimesheet,
    type TimesheetEntryRow,
    type TimesheetWithEntriesAndUser,
} from '@/lib/actions/internal-timesheet'
import { TimesheetEntryDialog } from './TimesheetEntryDialog'

interface Props {
    timesheet: TimesheetWithEntriesAndUser | null
    open: boolean
    onOpenChange: (open: boolean) => void
    onRequestReject: (t: TimesheetWithEntriesAndUser) => void
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
    draft: { label: 'Szkic', className: 'bg-gray-500/15 text-gray-300 border-gray-500/30' },
    submitted: {
        label: 'Oczekuje',
        className: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',
    },
    approved: {
        label: 'Zaakceptowany',
        className: 'bg-green-500/15 text-green-300 border-green-500/30',
    },
    rejected: {
        label: 'Odrzucony',
        className: 'bg-red-500/15 text-red-300 border-red-500/30',
    },
}

export function TimesheetPreviewDialog({ timesheet, open, onOpenChange, onRequestReject }: Props) {
    const router = useRouter()
    const [pending, startTransition] = useTransition()
    const [confirm, ConfirmUI] = useConfirm()

    // Phase 27f — local entry state so approver edits reflect immediately without
    // a full reopen. Seeded per opened timesheet (loadedId guard avoids flicker
    // before the seeding effect runs and survives router.refresh of the parent).
    const [localEntries, setLocalEntries] = useState<TimesheetEntryRow[]>([])
    const [loadedId, setLoadedId] = useState<string | null>(null)
    const [editingEntry, setEditingEntry] = useState<TimesheetEntryRow | null>(null)
    const [creating, setCreating] = useState(false)

    useEffect(() => {
        if (timesheet && timesheet.id !== loadedId) {
            setLocalEntries(timesheet.entries)
            setLoadedId(timesheet.id)
        }
    }, [timesheet, loadedId])

    if (!timesheet) return null

    const entries = timesheet.id === loadedId ? localEntries : timesheet.entries
    const editable = timesheet.status === 'draft' || timesheet.status === 'submitted'
    const status = STATUS_BADGE[timesheet.status]
    const totalHours = entries.reduce((sum, e) => sum + Number(e.hours), 0)
    const monthLabel = `${timesheet.year}-${String(timesheet.month).padStart(2, '0')}`
    const ref = new Date(timesheet.year, timesheet.month - 1, 1)
    const minDate = format(startOfMonth(ref), 'yyyy-MM-dd')
    const maxDate = format(endOfMonth(ref), 'yyyy-MM-dd')

    function handleApprove() {
        if (!timesheet) return
        startTransition(async () => {
            try {
                await approveTimesheet(timesheet.id)
                toastSuccess(`Zaakceptowano ${timesheet.user_email}`)
                onOpenChange(false)
                router.refresh()
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Błąd')
            }
        })
    }

    function handleUnlock() {
        if (!timesheet) return
        startTransition(async () => {
            try {
                await unlockTimesheet(timesheet.id)
                toastSuccess('Odblokowano — pracownik może edytować')
                onOpenChange(false)
                router.refresh()
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Błąd')
            }
        })
    }

    function handleAddEntry(values: {
        workDate: string
        hours: number
        project: string | null
        description: string
    }) {
        if (!timesheet) return
        startTransition(async () => {
            try {
                const created = await approverAddEntry({ timesheetId: timesheet.id, ...values })
                setLocalEntries((prev) =>
                    [...prev, created].sort((a, b) => a.work_date.localeCompare(b.work_date)),
                )
                toastSuccess('Wpis dodany')
                setCreating(false)
                router.refresh()
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Błąd')
            }
        })
    }

    function handleUpdateEntry(values: {
        workDate: string
        hours: number
        project: string | null
        description: string
    }) {
        if (!editingEntry) return
        const id = editingEntry.id
        startTransition(async () => {
            try {
                const updated = await approverUpdateEntry({
                    entryId: id,
                    workDate: values.workDate,
                    hours: values.hours,
                    project: values.project,
                    description: values.description,
                })
                setLocalEntries((prev) =>
                    prev
                        .map((e) => (e.id === id ? updated : e))
                        .sort((a, b) => a.work_date.localeCompare(b.work_date)),
                )
                toastSuccess('Zaktualizowano')
                setEditingEntry(null)
                router.refresh()
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Błąd')
            }
        })
    }

    async function handleDeleteEntry(entry: TimesheetEntryRow) {
        const ok = await confirm({
            title: 'Usunąć wpis',
            description: `${format(parseISO(entry.work_date), 'd LLL', { locale: pl })} — ${entry.hours}h. ${entry.description}`,
            confirmLabel: 'Usuń',
            variant: 'destructive',
        })
        if (!ok) return
        startTransition(async () => {
            try {
                await approverDeleteEntry(entry.id)
                setLocalEntries((prev) => prev.filter((e) => e.id !== entry.id))
                toastSuccess('Usunięto')
                router.refresh()
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Błąd')
            }
        })
    }

    return (
        <>
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col">
                <DialogHeader>
                    <div className="flex items-center gap-3 flex-wrap">
                        <DialogTitle className="text-base">
                            {timesheet.user_full_name ?? timesheet.user_email}
                        </DialogTitle>
                        <Badge variant="outline" className={status?.className}>
                            {status?.label ?? timesheet.status}
                        </Badge>
                    </div>
                    <DialogDescription className="text-xs">
                        Timesheet za {monthLabel} · {entries.length} wpisów · suma{' '}
                        <strong>{totalHours.toFixed(2)} h</strong>
                        {timesheet.submitted_at && (
                            <>
                                {' '}
                                · złożony{' '}
                                {format(parseISO(timesheet.submitted_at), 'd LLL yyyy HH:mm', {
                                    locale: pl,
                                })}
                            </>
                        )}
                    </DialogDescription>
                </DialogHeader>

                {timesheet.rejection_note && (
                    <div className="rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-200">
                        <strong>Poprzedni powód odrzucenia:</strong> {timesheet.rejection_note}
                    </div>
                )}

                {editable && (
                    <p className="text-[11px] text-muted-foreground">
                        Możesz poprawić wpisy bezpośrednio — zmiany zapisują się od razu na koncie
                        pracownika i są audytowane.
                    </p>
                )}

                <ScrollArea className="flex-1 -mx-6 px-6">
                    {entries.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-8 text-center">
                            Brak wpisów w timesheecie.
                        </p>
                    ) : (
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b text-xs text-muted-foreground sticky top-0 bg-background z-10">
                                    <th className="text-left py-2 pr-2 font-medium">Data</th>
                                    <th className="text-left py-2 pr-2 font-medium">Projekt</th>
                                    <th className="text-left py-2 pr-2 font-medium">Opis</th>
                                    <th className="text-right py-2 pr-2 font-medium">Godziny</th>
                                    {editable && <th className="py-2" />}
                                </tr>
                            </thead>
                            <tbody>
                                {entries.map((e) => (
                                    <tr key={e.id} className="border-b border-border/40">
                                        <td className="py-2 pr-2 whitespace-nowrap text-xs align-top">
                                            <div>
                                                {format(parseISO(e.work_date), 'd LLL', {
                                                    locale: pl,
                                                })}
                                            </div>
                                            <div className="text-[10px] text-muted-foreground capitalize">
                                                {format(parseISO(e.work_date), 'EEEE', {
                                                    locale: pl,
                                                })}
                                            </div>
                                        </td>
                                        <td className="py-2 pr-2 text-xs align-top">
                                            {e.project ?? (
                                                <span className="text-muted-foreground">—</span>
                                            )}
                                        </td>
                                        <td className="py-2 pr-2 text-xs align-top max-w-[400px]">
                                            <p className="whitespace-pre-wrap break-words">
                                                {e.description}
                                            </p>
                                            <div className="flex flex-wrap gap-1 mt-1">
                                                {(e.source === 'clock_suggested' ||
                                                    e.source === 'clock_accepted') && (
                                                    <span className="inline-flex items-center gap-1 text-[10px] text-blue-300">
                                                        <Clock className="h-3 w-3" />
                                                        z zegara
                                                        {e.tracked_hours != null && (
                                                            <span className="ml-1 text-muted-foreground">
                                                                ({Number(e.tracked_hours).toFixed(2)}h)
                                                            </span>
                                                        )}
                                                    </span>
                                                )}
                                                {e.correction_required && (
                                                    <span className="inline-flex items-center gap-1 text-[10px] text-amber-300">
                                                        <AlertTriangle className="h-3 w-3" />
                                                        wymaga korekty
                                                    </span>
                                                )}
                                                {e.is_overtime_override && (
                                                    <span className="inline-flex items-center gap-1 text-[10px] text-purple-300">
                                                        <Clock className="h-3 w-3" />
                                                        nadgodziny (panel admina)
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="py-2 pr-2 text-right font-mono text-xs tabular-nums align-top">
                                            {Number(e.hours).toFixed(2)}
                                        </td>
                                        {editable && (
                                            <td className="py-2 text-right whitespace-nowrap align-top">
                                                {e.is_overtime_override ? (
                                                    <span className="text-[10px] text-muted-foreground">
                                                        —
                                                    </span>
                                                ) : (
                                                    <>
                                                        <Button
                                                            size="icon"
                                                            variant="ghost"
                                                            className="h-7 w-7"
                                                            onClick={() => setEditingEntry(e)}
                                                            disabled={pending}
                                                            title="Edytuj wpis"
                                                        >
                                                            <Pencil className="h-3.5 w-3.5" />
                                                        </Button>
                                                        <Button
                                                            size="icon"
                                                            variant="ghost"
                                                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                                            onClick={() => handleDeleteEntry(e)}
                                                            disabled={pending}
                                                            title="Usuń wpis"
                                                        >
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        </Button>
                                                    </>
                                                )}
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
                                    <td className="py-2 pr-2 text-right font-mono tabular-nums">
                                        {totalHours.toFixed(2)} h
                                    </td>
                                    {editable && <td />}
                                </tr>
                            </tfoot>
                        </table>
                    )}
                </ScrollArea>

                <DialogFooter className="flex flex-wrap gap-2">
                    {editable && (
                        <Button
                            variant="outline"
                            onClick={() => setCreating(true)}
                            disabled={pending}
                            className="mr-auto"
                        >
                            <Plus className="h-4 w-4 mr-1" />
                            Dodaj wpis
                        </Button>
                    )}
                    {timesheet.status === 'submitted' && (
                        <>
                            <Button
                                variant="outline"
                                onClick={() => onRequestReject(timesheet)}
                                disabled={pending}
                                className="text-destructive hover:text-destructive"
                            >
                                <X className="h-4 w-4 mr-1" />
                                Odrzuć
                            </Button>
                            <Button onClick={handleApprove} disabled={pending}>
                                {pending ? (
                                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                ) : (
                                    <Check className="h-4 w-4 mr-1" />
                                )}
                                Akceptuj
                            </Button>
                        </>
                    )}
                    {timesheet.status === 'approved' && (
                        <>
                            <Button
                                variant="ghost"
                                onClick={handleUnlock}
                                disabled={pending}
                                title="Cofnij do szkicu — pracownik będzie mógł edytować"
                            >
                                <Unlock className="h-4 w-4 mr-1" />
                                Odblokuj
                            </Button>
                            <a
                                href={`/internal/timesheet/${timesheet.year}/${timesheet.month}/pdf?user=${timesheet.user_id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                <Button variant="outline">
                                    <FileDown className="h-4 w-4 mr-1" />
                                    Pobierz PDF
                                </Button>
                            </a>
                        </>
                    )}
                    {timesheet.status === 'rejected' && (
                        <Button variant="ghost" onClick={handleUnlock} disabled={pending}>
                            <Unlock className="h-4 w-4 mr-1" />
                            Odblokuj do edycji
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>

        {(editingEntry || creating) && (
            <TimesheetEntryDialog
                open
                initial={editingEntry}
                minDate={minDate}
                maxDate={maxDate}
                saving={pending}
                existingEntries={entries}
                onOpenChange={(o) => {
                    if (!o) {
                        setEditingEntry(null)
                        setCreating(false)
                    }
                }}
                onSubmit={editingEntry ? handleUpdateEntry : handleAddEntry}
            />
        )}
        <ConfirmUI />
        </>
    )
}
