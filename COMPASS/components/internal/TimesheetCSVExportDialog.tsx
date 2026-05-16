'use client'

// Phase 24c — CSV export dialog. Admin/manager wybiera zakres miesięcy + opcjonalnie
// pracownika (gdy uruchomiony z EmployeeProfileDialog forUser jest pre-set).
// Gdy forUser=null → admin musi wskazać pracownika via dropdown (Phase 24 v2 nice-to-have).
// Dla teraz: forUser=null wymaga wybrania pracownika przez dropdown poniżej.

import { useEffect, useState, useTransition } from 'react'
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
import { Loader2, Download } from 'lucide-react'
import { toast } from '@/lib/toast'
import { toastSuccess } from '@/lib/toast-success'
import {
    exportEmployeeTimesheetsCSV,
    type CSVExportRange,
} from '@/lib/actions/internal-employee-profile'

interface Props {
    open: boolean
    onOpenChange: (open: boolean) => void
    forUser: { id: string; label: string } | null
    defaultYear: number
    defaultMonth: number
}

export function TimesheetCSVExportDialog({
    open,
    onOpenChange,
    forUser,
    defaultYear,
    defaultMonth,
}: Props) {
    const [pending, startTransition] = useTransition()
    const [fromYear, setFromYear] = useState(defaultYear)
    const [fromMonth, setFromMonth] = useState(Math.max(1, defaultMonth - 2))
    const [toYear, setToYear] = useState(defaultYear)
    const [toMonth, setToMonth] = useState(defaultMonth)

    useEffect(() => {
        if (open) {
            setFromYear(defaultYear)
            setFromMonth(Math.max(1, defaultMonth - 2))
            setToYear(defaultYear)
            setToMonth(defaultMonth)
        }
    }, [open, defaultYear, defaultMonth])

    function downloadCsv(filename: string, content: string) {
        const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = filename
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
    }

    function handleExport() {
        if (!forUser) {
            toast.error('Aby wyeksportować CSV, otwórz "Profil" wybranego pracownika.')
            return
        }
        const range: CSVExportRange = {
            fromYear,
            fromMonth,
            toYear,
            toMonth,
        }
        startTransition(async () => {
            try {
                const result = await exportEmployeeTimesheetsCSV(forUser.id, range)
                downloadCsv(result.filename, result.content)
                toastSuccess(`Eksport: ${result.row_count} wierszy`)
                onOpenChange(false)
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Błąd')
            }
        })
    }

    const yearOptions: number[] = []
    for (let y = defaultYear - 2; y <= defaultYear + 1; y++) yearOptions.push(y)
    const monthOptions: number[] = Array.from({ length: 12 }, (_, i) => i + 1)

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Eksport CSV — timesheety</DialogTitle>
                    <DialogDescription className="text-xs">
                        {forUser ? (
                            <>
                                Pracownik: <strong>{forUser.label}</strong>
                            </>
                        ) : (
                            <>Wybierz pracownika z widoku Profil → "Eksport CSV".</>
                        )}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <Label className="text-xs">Od (miesiąc)</Label>
                            <div className="flex gap-1">
                                <select
                                    className="flex-1 rounded-md border bg-background px-2 py-1 text-sm"
                                    value={fromMonth}
                                    onChange={(e) => setFromMonth(Number(e.target.value))}
                                >
                                    {monthOptions.map((m) => (
                                        <option key={m} value={m}>
                                            {String(m).padStart(2, '0')}
                                        </option>
                                    ))}
                                </select>
                                <select
                                    className="w-20 rounded-md border bg-background px-2 py-1 text-sm"
                                    value={fromYear}
                                    onChange={(e) => setFromYear(Number(e.target.value))}
                                >
                                    {yearOptions.map((y) => (
                                        <option key={y} value={y}>
                                            {y}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">Do (miesiąc)</Label>
                            <div className="flex gap-1">
                                <select
                                    className="flex-1 rounded-md border bg-background px-2 py-1 text-sm"
                                    value={toMonth}
                                    onChange={(e) => setToMonth(Number(e.target.value))}
                                >
                                    {monthOptions.map((m) => (
                                        <option key={m} value={m}>
                                            {String(m).padStart(2, '0')}
                                        </option>
                                    ))}
                                </select>
                                <select
                                    className="w-20 rounded-md border bg-background px-2 py-1 text-sm"
                                    value={toYear}
                                    onChange={(e) => setToYear(Number(e.target.value))}
                                >
                                    {yearOptions.map((y) => (
                                        <option key={y} value={y}>
                                            {y}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                        Maksymalny zakres: 24 miesiące. CSV zawiera kolumny: Pracownik, Email, Rok,
                        Miesiąc, Status, Data, Projekt, Godziny, Opis. Format UTF-8 z BOM dla Excela.
                    </p>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Anuluj
                    </Button>
                    <Button onClick={handleExport} disabled={pending || !forUser}>
                        {pending ? (
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                            <Download className="h-4 w-4 mr-1" />
                        )}
                        Pobierz CSV
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
