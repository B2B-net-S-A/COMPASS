'use client'

// Phase 27a — Admin-only dialog for entering overtime hours (>8h/day) on an
// employee's timesheet. Standard flow caps days at 8h; this dialog uses the
// `adminOverrideTimesheetEntry` server action which records:
//   - is_overtime_override = TRUE
//   - override_reason (≥5 chars)
//   - override_by (admin's profile UUID)
//   - override_at (server timestamp)
// DB trigger `enforce_overtime_override_admin_only` rejects non-admin override_by.

import { useEffect, useMemo, useState } from 'react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, AlertCircle, RotateCcw } from 'lucide-react'
import { toast } from '@/lib/toast'
import {
    adminOverrideTimesheetEntry,
    clearOvertimeOverride,
} from '@/lib/actions/internal-timesheet'
import {
    getEmployeeMonthEntries,
    type EmployeeMonthEntryRow,
} from '@/lib/actions/internal-employee-profile'

interface Props {
    open: boolean
    onOpenChange: (open: boolean) => void
    userId: string
    employeeName: string
    year: number
    month: number
    onSuccess?: () => void
}

const REASON_MIN = 5
const REASON_MAX = 1000
const HOURS_MAX = 16

export function OvertimeOverrideDialog({
    open,
    onOpenChange,
    userId,
    employeeName,
    year,
    month,
    onSuccess,
}: Props) {
    const [entries, setEntries] = useState<EmployeeMonthEntryRow[]>([])
    const [loading, setLoading] = useState(false)
    const [selectedEntryId, setSelectedEntryId] = useState<string>('')
    const [hours, setHours] = useState<string>('10')
    const [reason, setReason] = useState<string>('')
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        if (!open) return
        let cancelled = false
        setLoading(true)
        getEmployeeMonthEntries(userId, year, month)
            .then((data) => {
                if (cancelled) return
                setEntries(data)
                // Default-select first entry (or first with existing override).
                const overrideRow = data.find((e) => e.is_overtime_override)
                if (overrideRow) {
                    setSelectedEntryId(overrideRow.id)
                    setHours(String(overrideRow.hours))
                    setReason(overrideRow.override_reason ?? '')
                } else if (data.length > 0) {
                    setSelectedEntryId(data[0].id)
                    setHours(String(Math.max(data[0].hours, 9)))
                    setReason('')
                } else {
                    setSelectedEntryId('')
                }
            })
            .catch((err: unknown) => {
                if (cancelled) return
                toast.error(err instanceof Error ? err.message : 'Błąd ładowania wpisów')
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [open, userId, year, month])

    const selectedEntry = useMemo(
        () => entries.find((e) => e.id === selectedEntryId) ?? null,
        [entries, selectedEntryId],
    )

    const reasonTrimmed = reason.trim()
    const reasonValid = reasonTrimmed.length >= REASON_MIN && reasonTrimmed.length <= REASON_MAX
    const hoursNum = Number(hours)
    const hoursValid =
        Number.isFinite(hoursNum) && hoursNum > 0 && hoursNum <= HOURS_MAX
    const canSubmit = selectedEntry && hoursValid && reasonValid && !saving
    const canClear =
        selectedEntry && selectedEntry.is_overtime_override && !saving

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (!selectedEntry || !canSubmit) return
        setSaving(true)
        try {
            await adminOverrideTimesheetEntry({
                entryId: selectedEntry.id,
                hours: hoursNum,
                reason: reasonTrimmed,
            })
            toast.success(`Wpisano ${hoursNum}h nadgodzin za ${selectedEntry.work_date}.`)
            onSuccess?.()
            onOpenChange(false)
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Błąd zapisu nadgodzin')
        } finally {
            setSaving(false)
        }
    }

    async function handleClear() {
        if (!selectedEntry || !canClear) return
        if (
            !window.confirm(
                `Cofnąć override dla ${selectedEntry.work_date}? Godziny wrócą do 8h, dane override zostaną wyczyszczone.`,
            )
        ) {
            return
        }
        setSaving(true)
        try {
            await clearOvertimeOverride(selectedEntry.id)
            toast.success('Override cofnięty.')
            onSuccess?.()
            onOpenChange(false)
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Błąd cofania override')
        } finally {
            setSaving(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Wpisz nadgodziny</DialogTitle>
                    <DialogDescription className="text-xs">
                        {employeeName} · {year}-{String(month).padStart(2, '0')}. Tylko administrator może
                        wpisać &gt; 8h/dzień. Audit log + powiadomienie do pracownika.
                    </DialogDescription>
                </DialogHeader>

                {loading ? (
                    <div className="py-12 flex items-center justify-center">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                ) : entries.length === 0 ? (
                    <div className="py-8 flex flex-col items-center gap-3 text-center">
                        <AlertCircle className="h-8 w-8 text-warning" />
                        <p className="text-sm text-muted-foreground">
                            Brak wpisów dla {year}-{String(month).padStart(2, '0')}. Pracownik musi
                            najpierw dodać dzień jako 8h, dopiero potem admin może go zwiększyć.
                        </p>
                        <Button variant="outline" onClick={() => onOpenChange(false)}>
                            Zamknij
                        </Button>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="entry_select" className="text-sm">
                                Wybierz dzień
                            </Label>
                            <select
                                id="entry_select"
                                value={selectedEntryId}
                                onChange={(e) => {
                                    const id = e.target.value
                                    setSelectedEntryId(id)
                                    const entry = entries.find((x) => x.id === id)
                                    if (entry) {
                                        setHours(String(entry.hours))
                                        setReason(entry.override_reason ?? '')
                                    }
                                }}
                                className="w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[44px]"
                                required
                            >
                                {entries.map((entry) => (
                                    <option key={entry.id} value={entry.id}>
                                        {entry.work_date} · {entry.hours.toFixed(2)}h
                                        {entry.is_overtime_override ? ' (OT)' : ''}
                                        {entry.project ? ` · ${entry.project}` : ''}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {selectedEntry?.is_overtime_override && (
                            <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-xs space-y-1">
                                <p className="font-medium text-warning">
                                    Ten dzień ma już override.
                                </p>
                                {selectedEntry.override_by_name && (
                                    <p className="text-muted-foreground">
                                        Wpisał: {selectedEntry.override_by_name}
                                    </p>
                                )}
                                {selectedEntry.override_at && (
                                    <p className="text-muted-foreground">
                                        Kiedy: {new Date(selectedEntry.override_at).toLocaleString('pl-PL')}
                                    </p>
                                )}
                                <p className="text-muted-foreground">
                                    Powód: {selectedEntry.override_reason}
                                </p>
                            </div>
                        )}

                        <div className="space-y-1.5">
                            <Label htmlFor="ot_hours" className="text-sm">
                                Godziny <span className="text-xs text-muted-foreground">(max {HOURS_MAX})</span>
                            </Label>
                            <Input
                                id="ot_hours"
                                type="number"
                                step="0.25"
                                min="0.25"
                                max={HOURS_MAX}
                                inputMode="decimal"
                                value={hours}
                                onChange={(e) => setHours(e.target.value)}
                                required
                                className="min-h-[44px] text-base"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="ot_reason" className="text-sm">
                                Uzasadnienie <span className="text-xs text-muted-foreground">(min {REASON_MIN} znaków)</span>
                            </Label>
                            <Textarea
                                id="ot_reason"
                                rows={3}
                                maxLength={REASON_MAX}
                                placeholder="np. Deployment kryzysowy weekendowy — klient X / projekt Y"
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                required
                                className="text-base"
                            />
                            <p className="text-[10px] text-muted-foreground">
                                {reasonTrimmed.length}/{REASON_MAX}
                            </p>
                        </div>

                        <DialogFooter className="flex-col sm:flex-row gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => onOpenChange(false)}
                                disabled={saving}
                                className="w-full sm:w-auto min-h-[44px]"
                            >
                                Anuluj
                            </Button>
                            {canClear && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={handleClear}
                                    disabled={!canClear}
                                    className="w-full sm:w-auto min-h-[44px] border-warning/30"
                                >
                                    <RotateCcw className="h-4 w-4 mr-1.5" />
                                    Cofnij override
                                </Button>
                            )}
                            <Button
                                type="submit"
                                disabled={!canSubmit}
                                className="w-full sm:w-auto min-h-[44px]"
                            >
                                {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                                Zapisz nadgodziny
                            </Button>
                        </DialogFooter>
                    </form>
                )}
            </DialogContent>
        </Dialog>
    )
}
