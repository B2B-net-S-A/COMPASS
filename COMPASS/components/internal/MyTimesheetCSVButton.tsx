'use client'

// Phase 24c — client button do pobrania CSV własnych timesheetów. Zakres ustawia
// dialog. Server action exportMyTimesheetsCSV waliduje range + log audit.

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
import { Label } from '@/components/ui/label'
import { FileSpreadsheet, Loader2, Download } from 'lucide-react'
import { toast } from '@/lib/toast'
import { toastSuccess } from '@/lib/toast-success'
import {
    exportMyTimesheetsCSV,
    type CSVExportRange,
} from '@/lib/actions/internal-employee-profile'

interface Props {
    defaultYear?: number
    defaultMonth?: number
}

export function MyTimesheetCSVButton({ defaultYear, defaultMonth }: Props) {
    const now = new Date()
    const initialY = defaultYear ?? now.getFullYear()
    const initialM = defaultMonth ?? now.getMonth() + 1
    const [open, setOpen] = useState(false)
    const [pending, startTransition] = useTransition()
    const [fromYear, setFromYear] = useState(initialY)
    const [fromMonth, setFromMonth] = useState(Math.max(1, initialM - 2))
    const [toYear, setToYear] = useState(initialY)
    const [toMonth, setToMonth] = useState(initialM)

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
        const range: CSVExportRange = { fromYear, fromMonth, toYear, toMonth }
        startTransition(async () => {
            try {
                const result = await exportMyTimesheetsCSV(range)
                downloadCsv(result.filename, result.content)
                toastSuccess(`Eksport: ${result.row_count} wierszy`)
                setOpen(false)
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Błąd')
            }
        })
    }

    const yearOptions: number[] = []
    for (let y = initialY - 2; y <= initialY + 1; y++) yearOptions.push(y)
    const monthOptions: number[] = Array.from({ length: 12 }, (_, i) => i + 1)

    return (
        <>
            <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
                <FileSpreadsheet className="h-4 w-4 mr-1" />
                Eksport CSV
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Eksport CSV — moje timesheety</DialogTitle>
                        <DialogDescription className="text-xs">
                            Wybierz zakres miesięcy. Plik UTF-8 z BOM, kompatybilny z Excelem.
                        </DialogDescription>
                    </DialogHeader>
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
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setOpen(false)}>
                            Anuluj
                        </Button>
                        <Button onClick={handleExport} disabled={pending}>
                            {pending ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            ) : (
                                <Download className="h-4 w-4 mr-1" />
                            )}
                            Pobierz
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
