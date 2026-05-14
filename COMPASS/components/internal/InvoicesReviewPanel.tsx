'use client'

import { useState, useTransition } from 'react'
import { Loader2, FileText, AlertCircle, CheckCircle2, XCircle, Download, ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from '@/lib/toast'
import { toastSuccess } from '@/lib/toast-success'
import {
    approveInvoice,
    rejectInvoice,
    getInvoiceFileSignedUrl,
    getTimesheetForInvoiceReview,
    type InvoiceStatus,
    type InvoiceWithUser,
    type TimesheetSummaryForInvoiceData,
} from '@/lib/actions/internal-invoice'

interface Props {
    initialInvoices: InvoiceWithUser[]
}

function statusBadge(status: InvoiceStatus) {
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
    return `${Number(amount).toFixed(2)} ${currency}`
}

export function InvoicesReviewPanel({ initialInvoices }: Props) {
    const [invoices, setInvoices] = useState<InvoiceWithUser[]>(initialInvoices)
    const [filterStatus, setFilterStatus] = useState<InvoiceStatus | 'all'>('submitted')
    const [expanded, setExpanded] = useState<string | null>(null)
    const [rejectTarget, setRejectTarget] = useState<InvoiceWithUser | null>(null)

    const filtered =
        filterStatus === 'all'
            ? invoices
            : invoices.filter((i) => i.status === filterStatus)

    function onDecided(invoiceId: string, status: InvoiceStatus, reason?: string) {
        setInvoices((prev) =>
            prev.map((i) =>
                i.id === invoiceId
                    ? {
                          ...i,
                          status,
                          rejection_reason: status === 'rejected' ? (reason ?? null) : null,
                          reviewed_at: new Date().toISOString(),
                      }
                    : i,
            ),
        )
    }

    return (
        <section className="space-y-4">
            <div>
                <h2 className="text-xl font-semibold">Faktury do akceptacji</h2>
                <p className="text-sm text-muted-foreground mt-1">
                    Weryfikuj faktury wystawione przez pracowników biurowych. Każdą fakturę możesz porównać
                    z godzinami z timesheetu pracownika (przycisk "Pokaż timesheet").
                </p>
            </div>

            <div className="flex items-center gap-2">
                <Label className="text-xs uppercase text-muted-foreground">Filtr:</Label>
                {(['submitted', 'approved', 'rejected', 'all'] as const).map((s) => (
                    <button
                        key={s}
                        type="button"
                        onClick={() => setFilterStatus(s)}
                        className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                            filterStatus === s
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted text-muted-foreground hover:bg-muted/70'
                        }`}
                    >
                        {s === 'submitted' ? 'Oczekujące' : s === 'approved' ? 'Zaakceptowane' : s === 'rejected' ? 'Odrzucone' : 'Wszystkie'}
                    </button>
                ))}
            </div>

            {filtered.length === 0 ? (
                <div className="rounded-md border border-border bg-card p-6 text-center text-sm text-muted-foreground">
                    Brak faktur w tym filtrze.
                </div>
            ) : (
                <div className="space-y-2">
                    {filtered.map((inv) => (
                        <InvoiceReviewRow
                            key={inv.id}
                            invoice={inv}
                            expanded={expanded === inv.id}
                            onToggle={() => setExpanded(expanded === inv.id ? null : inv.id)}
                            onApproved={() => onDecided(inv.id, 'approved')}
                            onRejectClick={() => setRejectTarget(inv)}
                        />
                    ))}
                </div>
            )}

            {rejectTarget && (
                <RejectInvoiceDialog
                    invoice={rejectTarget}
                    open={!!rejectTarget}
                    onOpenChange={(o) => !o && setRejectTarget(null)}
                    onRejected={(reason) => {
                        onDecided(rejectTarget.id, 'rejected', reason)
                        setRejectTarget(null)
                    }}
                />
            )}
        </section>
    )
}

function InvoiceReviewRow({
    invoice,
    expanded,
    onToggle,
    onApproved,
    onRejectClick,
}: {
    invoice: InvoiceWithUser
    expanded: boolean
    onToggle: () => void
    onApproved: () => void
    onRejectClick: () => void
}) {
    const [isApproving, startApproving] = useTransition()

    function handleApprove() {
        startApproving(async () => {
            try {
                await approveInvoice(invoice.id)
                toastSuccess(`Faktura ${invoice.invoice_number} zaakceptowana.`)
                onApproved()
            } catch (err: unknown) {
                toast.error(err instanceof Error ? err.message : 'Nieznany błąd')
            }
        })
    }

    return (
        <div className="rounded-md border border-border bg-card overflow-hidden">
            <button
                type="button"
                onClick={onToggle}
                className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-muted/40"
            >
                {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <div className="flex-1 grid grid-cols-2 md:grid-cols-5 gap-2 items-center text-sm">
                    <div className="font-mono">{invoice.invoice_number}</div>
                    <div className="text-muted-foreground">{invoice.user_full_name ?? invoice.user_email}</div>
                    <div className="text-muted-foreground">{formatPeriod(invoice.period_year, invoice.period_month)}</div>
                    <div className="text-right tabular-nums font-medium">
                        {formatAmount(invoice.amount, invoice.currency)}
                    </div>
                    <div>{statusBadge(invoice.status)}</div>
                </div>
            </button>

            {expanded && (
                <div className="border-t border-border p-4 space-y-4 bg-muted/20">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div>
                            <p className="text-xs uppercase text-muted-foreground mb-1">Wystawiona</p>
                            <p>{new Date(invoice.issue_date).toLocaleDateString('pl-PL')}</p>
                        </div>
                        <div>
                            <p className="text-xs uppercase text-muted-foreground mb-1">Termin płatności</p>
                            <p>{invoice.due_date ? new Date(invoice.due_date).toLocaleDateString('pl-PL') : '—'}</p>
                        </div>
                        <div className="md:col-span-2">
                            <p className="text-xs uppercase text-muted-foreground mb-1">Uwagi pracownika</p>
                            <p>{invoice.notes ?? '—'}</p>
                        </div>
                        {invoice.rejection_reason && (
                            <div className="md:col-span-2">
                                <p className="text-xs uppercase text-muted-foreground mb-1">Powód odrzucenia</p>
                                <p className="text-red-300">{invoice.rejection_reason}</p>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        <InvoiceFileDownloadButton invoiceId={invoice.id} fileName={invoice.file_name} />
                        <TimesheetSummaryToggle invoiceId={invoice.id} />
                    </div>

                    {invoice.status === 'submitted' && (
                        <div className="flex items-center gap-2 pt-2 border-t border-border">
                            <Button onClick={handleApprove} disabled={isApproving} size="sm">
                                {isApproving ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                    <CheckCircle2 className="mr-2 h-4 w-4" />
                                )}
                                Zaakceptuj
                            </Button>
                            <Button onClick={onRejectClick} variant="outline" size="sm">
                                <XCircle className="mr-2 h-4 w-4" />
                                Odrzuć
                            </Button>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

function TimesheetSummaryToggle({ invoiceId }: { invoiceId: string }) {
    const [open, setOpen] = useState(false)
    const [data, setData] = useState<TimesheetSummaryForInvoiceData | null>(null)
    const [isPending, startTransition] = useTransition()

    function handleToggle() {
        if (open) {
            setOpen(false)
            return
        }
        if (data) {
            setOpen(true)
            return
        }
        startTransition(async () => {
            try {
                const ts = await getTimesheetForInvoiceReview(invoiceId)
                setData(ts)
                setOpen(true)
            } catch (err: unknown) {
                toast.error(err instanceof Error ? err.message : 'Nieznany błąd')
            }
        })
    }

    return (
        <div className="w-full">
            <Button onClick={handleToggle} variant="outline" size="sm" disabled={isPending}>
                {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {open ? 'Ukryj timesheet' : 'Pokaż timesheet'}
            </Button>
            {open && data && (
                <div className="mt-2 rounded-md border border-border bg-background p-3 text-xs">
                    {!data.timesheet_id ? (
                        <p className="text-muted-foreground">Brak timesheetu za ten okres.</p>
                    ) : (
                        <>
                            <div className="mb-2 flex items-center gap-2">
                                <span className="text-muted-foreground">Status timesheetu:</span>
                                <span className="font-medium">{data.status}</span>
                                <span className="ml-auto text-muted-foreground">
                                    Suma godzin: <strong className="text-foreground tabular-nums">{data.total_hours.toFixed(2)}</strong>
                                </span>
                            </div>
                            <table className="w-full">
                                <thead>
                                    <tr className="text-muted-foreground">
                                        <th className="text-left py-1">Data</th>
                                        <th className="text-right py-1">Godz.</th>
                                        <th className="text-left py-1 pl-2">Projekt</th>
                                        <th className="text-left py-1 pl-2">Opis</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.entries.map((e, idx) => (
                                        <tr key={idx} className="border-t border-border/50">
                                            <td className="py-1">{e.work_date}</td>
                                            <td className="py-1 text-right tabular-nums">{Number(e.hours).toFixed(2)}</td>
                                            <td className="py-1 pl-2">{e.project ?? '—'}</td>
                                            <td className="py-1 pl-2 text-muted-foreground">{e.description}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </>
                    )}
                </div>
            )}
        </div>
    )
}

function RejectInvoiceDialog({
    invoice,
    open,
    onOpenChange,
    onRejected,
}: {
    invoice: InvoiceWithUser
    open: boolean
    onOpenChange: (open: boolean) => void
    onRejected: (reason: string) => void
}) {
    const [reason, setReason] = useState('')
    const [isPending, startTransition] = useTransition()

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (!reason.trim()) {
            toast.error('Podaj powód odrzucenia.')
            return
        }
        startTransition(async () => {
            try {
                await rejectInvoice(invoice.id, reason.trim())
                toastSuccess(`Faktura ${invoice.invoice_number} odrzucona.`)
                onRejected(reason.trim())
            } catch (err: unknown) {
                toast.error(err instanceof Error ? err.message : 'Nieznany błąd')
            }
        })
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Odrzuć fakturę</DialogTitle>
                    <DialogDescription>
                        Pracownik dostanie email z powodem i będzie mógł poprawić.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="rej-reason">Powód odrzucenia (wymagany)</Label>
                        <textarea
                            id="rej-reason"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            rows={4}
                            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            placeholder="np. Kwota nie odpowiada godzinom z timesheetu (168h × 250 PLN = 42000 PLN, faktura: 45000 PLN)"
                            required
                        />
                    </div>
                    <DialogFooter className="gap-2">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
                            Anuluj
                        </Button>
                        <Button type="submit" variant="destructive" disabled={isPending}>
                            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
                            Odrzuć
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
        <Button onClick={handleClick} variant="outline" size="sm" disabled={isPending}>
            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            <FileText className="mr-1 h-4 w-4" />
            {fileName}
        </Button>
    )
}
