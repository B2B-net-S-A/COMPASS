'use client'

import { useState, useTransition } from 'react'
import { Loader2, FileText, AlertCircle, CheckCircle2, XCircle, Upload, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from '@/lib/toast'
import { toastSuccess } from '@/lib/toast-success'
import {
    submitInvoice,
    updateRejectedInvoice,
    getInvoiceFileSignedUrl,
    type EligiblePeriod,
    type InvoiceRow,
} from '@/lib/actions/internal-invoice'

interface Props {
    initialInvoices: InvoiceRow[]
    eligiblePeriods: EligiblePeriod[]
}

function statusBadge(status: InvoiceRow['status']) {
    if (status === 'approved') {
        return (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-green-500">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Zaakceptowana
            </span>
        )
    }
    if (status === 'rejected') {
        return (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-red-500">
                <XCircle className="h-3.5 w-3.5" />
                Odrzucona
            </span>
        )
    }
    return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-yellow-500">
            <AlertCircle className="h-3.5 w-3.5" />
            Oczekuje
        </span>
    )
}

function formatPeriod(year: number, month: number): string {
    return `${year}-${String(month).padStart(2, '0')}`
}

function formatAmount(amount: number, currency: string): string {
    return `${amount.toFixed(2)} ${currency}`
}

export function InvoicesUserPanel({ initialInvoices, eligiblePeriods }: Props) {
    const [invoices, setInvoices] = useState<InvoiceRow[]>(initialInvoices)
    const [submitOpen, setSubmitOpen] = useState(false)
    const [editTarget, setEditTarget] = useState<InvoiceRow | null>(null)

    function onSubmittedNew(newInvoice: InvoiceRow) {
        setInvoices((prev) => [newInvoice, ...prev])
        setSubmitOpen(false)
    }

    function onResubmitted(updated: InvoiceRow) {
        setInvoices((prev) => prev.map((i) => (i.id === updated.id ? updated : i)))
        setEditTarget(null)
    }

    const now = new Date()
    const currentEligible = eligiblePeriods.find(
        (p) => p.year === now.getFullYear() && p.month === now.getMonth() + 1,
    )
    const submitDisabled = !eligiblePeriods.some((p) => p.approved_timesheet)
    const submitTooltip = submitDisabled
        ? 'Najpierw zatwierdź timesheet — w sekcji Timesheet, wyślij do akceptacji i poczekaj na zgodę admina.'
        : ''

    return (
        <section className="space-y-4">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h2 className="text-xl font-semibold">Faktury</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                        Wystawiaj faktury za okresy z zatwierdzonym timesheetem. Plik PDF, max 10 MB.
                    </p>
                </div>
                <Button
                    onClick={() => setSubmitOpen(true)}
                    disabled={submitDisabled}
                    title={submitTooltip}
                >
                    <Upload className="mr-2 h-4 w-4" />
                    Wyślij fakturę
                </Button>
            </div>

            {submitDisabled && (
                <div className="rounded-md border border-yellow-500/30 bg-yellow-500/5 p-3 text-sm text-yellow-200">
                    Brak zatwierdzonych timesheetów. Wystaw faktury możesz dopiero po akceptacji timesheet'u za dany okres.
                </div>
            )}

            <RejectedBanner invoices={invoices} onPick={setEditTarget} />

            {invoices.length === 0 ? (
                <div className="rounded-md border border-border bg-card p-6 text-center text-sm text-muted-foreground">
                    Nie masz jeszcze żadnych faktur.
                </div>
            ) : (
                <div className="overflow-x-auto rounded-md border border-border">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                            <tr>
                                <th className="px-3 py-2 text-left font-medium">Numer</th>
                                <th className="px-3 py-2 text-left font-medium">Okres</th>
                                <th className="px-3 py-2 text-right font-medium">Kwota</th>
                                <th className="px-3 py-2 text-left font-medium">Status</th>
                                <th className="px-3 py-2 text-left font-medium">Wystawiona</th>
                                <th className="px-3 py-2 text-left font-medium">Plik</th>
                            </tr>
                        </thead>
                        <tbody>
                            {invoices.map((inv) => (
                                <tr key={inv.id} className="border-t border-border">
                                    <td className="px-3 py-2 font-mono">{inv.invoice_number}</td>
                                    <td className="px-3 py-2">{formatPeriod(inv.period_year, inv.period_month)}</td>
                                    <td className="px-3 py-2 text-right tabular-nums">{formatAmount(inv.amount, inv.currency)}</td>
                                    <td className="px-3 py-2">{statusBadge(inv.status)}</td>
                                    <td className="px-3 py-2 text-muted-foreground">
                                        {new Date(inv.issue_date).toLocaleDateString('pl-PL')}
                                    </td>
                                    <td className="px-3 py-2">
                                        <InvoiceFileDownloadButton invoiceId={inv.id} fileName={inv.file_name} />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {submitOpen && (
                <SubmitInvoiceDialog
                    open={submitOpen}
                    onOpenChange={setSubmitOpen}
                    eligiblePeriods={eligiblePeriods}
                    onSubmitted={onSubmittedNew}
                />
            )}

            {editTarget && (
                <ResubmitInvoiceDialog
                    open={!!editTarget}
                    onOpenChange={(o) => !o && setEditTarget(null)}
                    invoice={editTarget}
                    onResubmitted={onResubmitted}
                />
            )}
        </section>
    )
}

function RejectedBanner({ invoices, onPick }: { invoices: InvoiceRow[]; onPick: (i: InvoiceRow) => void }) {
    const rejected = invoices.filter((i) => i.status === 'rejected')
    if (rejected.length === 0) return null
    return (
        <div className="space-y-2">
            {rejected.map((inv) => (
                <div
                    key={inv.id}
                    className="rounded-md border border-red-500/30 bg-red-500/5 p-3 text-sm"
                >
                    <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                            <p className="font-medium text-red-200">
                                Faktura odrzucona: {inv.invoice_number} ({formatPeriod(inv.period_year, inv.period_month)})
                            </p>
                            {inv.rejection_reason && (
                                <p className="text-red-200/80">
                                    <strong>Powód:</strong> {inv.rejection_reason}
                                </p>
                            )}
                        </div>
                        <Button size="sm" variant="outline" onClick={() => onPick(inv)}>
                            Popraw i wyślij ponownie
                        </Button>
                    </div>
                </div>
            ))}
        </div>
    )
}

function SubmitInvoiceDialog({
    open,
    onOpenChange,
    eligiblePeriods,
    onSubmitted,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    eligiblePeriods: EligiblePeriod[]
    onSubmitted: (inv: InvoiceRow) => void
}) {
    const [invoiceNumber, setInvoiceNumber] = useState('')
    const [amount, setAmount] = useState('')
    const [dueDate, setDueDate] = useState('')
    const [notes, setNotes] = useState('')
    const [periodKey, setPeriodKey] = useState<string>('')
    const [file, setFile] = useState<File | null>(null)
    const [isPending, startTransition] = useTransition()

    const availablePeriods = eligiblePeriods.filter((p) => p.approved_timesheet)

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (!file) {
            toast.error('Wybierz plik PDF.')
            return
        }
        if (!periodKey) {
            toast.error('Wybierz okres.')
            return
        }
        const [yStr, mStr] = periodKey.split('-')
        const amt = Number(amount.replace(',', '.'))
        startTransition(async () => {
            try {
                const result = await submitInvoice(
                    {
                        invoice_number: invoiceNumber.trim(),
                        amount: amt,
                        due_date: dueDate || null,
                        period_year: Number(yStr),
                        period_month: Number(mStr),
                        notes: notes.trim() || null,
                    },
                    file,
                )
                toastSuccess(`Faktura ${result.invoice_number} wysłana do akceptacji.`)
                onSubmitted(result)
            } catch (err: unknown) {
                toast.error(err instanceof Error ? err.message : 'Nieznany błąd')
            }
        })
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Wyślij fakturę</DialogTitle>
                    <DialogDescription>
                        Plik PDF, max 10 MB. Trafia do akceptacji do Finanse.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="inv-number">Numer faktury</Label>
                        <Input
                            id="inv-number"
                            placeholder="FV/2026/05/001"
                            value={invoiceNumber}
                            onChange={(e) => setInvoiceNumber(e.target.value)}
                            required
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="inv-amount">Kwota (PLN)</Label>
                        <Input
                            id="inv-amount"
                            type="number"
                            step="0.01"
                            min="0.01"
                            placeholder="5000.00"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            required
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="inv-period">Okres (rok-miesiąc)</Label>
                        <select
                            id="inv-period"
                            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                            value={periodKey}
                            onChange={(e) => setPeriodKey(e.target.value)}
                            required
                        >
                            <option value="">— wybierz —</option>
                            {availablePeriods.map((p) => {
                                const k = `${p.year}-${p.month}`
                                return (
                                    <option key={k} value={k}>
                                        {formatPeriod(p.year, p.month)} (timesheet zatwierdzony
                                        {p.existing_invoices_count > 0 ? `, faktur w okresie: ${p.existing_invoices_count}` : ''})
                                    </option>
                                )
                            })}
                        </select>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="inv-due">Termin płatności (opcjonalnie)</Label>
                        <Input
                            id="inv-due"
                            type="date"
                            value={dueDate}
                            onChange={(e) => setDueDate(e.target.value)}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="inv-notes">Uwagi (opcjonalnie)</Label>
                        <Input
                            id="inv-notes"
                            placeholder="np. korekta za usługi serwisowe"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="inv-file">Plik PDF</Label>
                        <Input
                            id="inv-file"
                            type="file"
                            accept="application/pdf,.pdf"
                            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                            required
                        />
                        {file && (
                            <p className="text-xs text-muted-foreground">
                                {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                            </p>
                        )}
                    </div>
                    <DialogFooter className="gap-2">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
                            Anuluj
                        </Button>
                        <Button type="submit" disabled={isPending}>
                            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                            Wyślij do akceptacji
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}

function ResubmitInvoiceDialog({
    open,
    onOpenChange,
    invoice,
    onResubmitted,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    invoice: InvoiceRow
    onResubmitted: (inv: InvoiceRow) => void
}) {
    const [invoiceNumber, setInvoiceNumber] = useState(invoice.invoice_number)
    const [amount, setAmount] = useState(String(invoice.amount))
    const [dueDate, setDueDate] = useState(invoice.due_date ?? '')
    const [notes, setNotes] = useState(invoice.notes ?? '')
    const [newFile, setNewFile] = useState<File | null>(null)
    const [isPending, startTransition] = useTransition()

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        const amt = Number(amount.replace(',', '.'))
        startTransition(async () => {
            try {
                const result = await updateRejectedInvoice(
                    invoice.id,
                    {
                        invoice_number: invoiceNumber.trim(),
                        amount: amt,
                        due_date: dueDate || null,
                        notes: notes.trim() || null,
                    },
                    newFile ?? undefined,
                )
                toastSuccess(`Faktura ${result.invoice_number} wysłana ponownie.`)
                onResubmitted(result)
            } catch (err: unknown) {
                toast.error(err instanceof Error ? err.message : 'Nieznany błąd')
            }
        })
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Popraw fakturę</DialogTitle>
                    <DialogDescription>
                        Powód odrzucenia: {invoice.rejection_reason ?? '—'}. Możesz zmienić dane i/lub załączyć nowy PDF.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="re-number">Numer faktury</Label>
                        <Input id="re-number" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} required />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="re-amount">Kwota (PLN)</Label>
                        <Input
                            id="re-amount"
                            type="number"
                            step="0.01"
                            min="0.01"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            required
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="re-due">Termin płatności</Label>
                        <Input id="re-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="re-notes">Uwagi</Label>
                        <Input id="re-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="re-file">Nowy plik (opcjonalnie — zostaw puste żeby zachować obecny)</Label>
                        <Input
                            id="re-file"
                            type="file"
                            accept="application/pdf,.pdf"
                            onChange={(e) => setNewFile(e.target.files?.[0] ?? null)}
                        />
                        {newFile ? (
                            <p className="text-xs text-muted-foreground">
                                {newFile.name} ({(newFile.size / 1024 / 1024).toFixed(2)} MB)
                            </p>
                        ) : (
                            <p className="text-xs text-muted-foreground">Obecny plik: {invoice.file_name}</p>
                        )}
                    </div>
                    <DialogFooter className="gap-2">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
                            Anuluj
                        </Button>
                        <Button type="submit" disabled={isPending}>
                            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                            Wyślij ponownie
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}

function InvoiceFileDownloadButton({ invoiceId, fileName }: { invoiceId: string; fileName: string }) {
    const [isPending, startTransition] = useTransition()
    function handleClick() {
        startTransition(async () => {
            try {
                const url = await getInvoiceFileSignedUrl(invoiceId)
                window.open(url, '_blank', 'noopener,noreferrer')
            } catch (err: unknown) {
                toast.error(err instanceof Error ? err.message : 'Nieznany błąd')
            }
        })
    }
    return (
        <button
            type="button"
            onClick={handleClick}
            disabled={isPending}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50"
            title={fileName}
        >
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            <FileText className="h-3.5 w-3.5" />
            PDF
        </button>
    )
}
