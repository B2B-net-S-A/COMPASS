'use client'

import { useState, useTransition } from 'react'
import { AlertCircle, CheckCircle2, XCircle, FileText, Link2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { toast } from '@/lib/toast'
import { toastSuccess } from '@/lib/toast-success'
import { linkBonusToInvoice } from '@/lib/actions/internal-bonus'
import type { BonusStatus, BonusWithUsers } from '@/lib/types/bonus'

interface MyInvoice {
    id: string
    invoice_number: string
    amount: number
    period_year: number
    period_month: number
    status: string
}

interface Props {
    initialBonuses: BonusWithUsers[]
    myInvoices: MyInvoice[]
}

function statusBadge(status: BonusStatus) {
    if (status === 'paid') {
        return (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-green-500">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Wypłacona
            </span>
        )
    }
    if (status === 'cancelled') {
        return (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-red-500">
                <XCircle className="h-3.5 w-3.5" />
                Anulowana
            </span>
        )
    }
    return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-yellow-500">
            <AlertCircle className="h-3.5 w-3.5" />
            Do uwzględnienia
        </span>
    )
}

function formatAmount(amount: number, currency: string): string {
    return `${Number(amount).toFixed(2)} ${currency}`
}

function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('pl-PL', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

function formatPeriod(year: number, month: number): string {
    return `${year}-${String(month).padStart(2, '0')}`
}

export function MyBonusesClient({ initialBonuses, myInvoices }: Props) {
    const [bonuses, setBonuses] = useState<BonusWithUsers[]>(initialBonuses)
    const [linkTarget, setLinkTarget] = useState<BonusWithUsers | null>(null)

    const pending = bonuses.filter((b) => b.status === 'pending')
    const paid = bonuses.filter((b) => b.status === 'paid')
    const cancelled = bonuses.filter((b) => b.status === 'cancelled')

    function onLinked(bonusId: string, invoiceId: string, invoiceNumber: string) {
        setBonuses((prev) =>
            prev.map((b) =>
                b.id === bonusId
                    ? {
                          ...b,
                          status: 'paid',
                          linked_invoice_id: invoiceId,
                          linked_invoice_number: invoiceNumber,
                          paid_at: new Date().toISOString(),
                      }
                    : b,
            ),
        )
        setLinkTarget(null)
    }

    return (
        <div className="space-y-6">
            {/* Pending section */}
            <section>
                <header className="mb-3">
                    <h2 className="text-lg font-bold">Do uwzględnienia w fakturze</h2>
                    <p className="text-sm text-muted-foreground">
                        Wystaw fakturę (Phase 19 — zakładka Faktury) uwzględniając premię, a potem zlinkuj ją tutaj.
                    </p>
                </header>
                {pending.length === 0 ? (
                    <EmptyHint text="Brak premii do uwzględnienia." />
                ) : (
                    <div className="space-y-2">
                        {pending.map((b) => (
                            <BonusRow key={b.id} bonus={b} onLink={() => setLinkTarget(b)} canLink />
                        ))}
                    </div>
                )}
            </section>

            {/* Paid section */}
            {paid.length > 0 && (
                <section>
                    <header className="mb-3">
                        <h2 className="text-lg font-bold">Wypłacone</h2>
                    </header>
                    <div className="space-y-2">
                        {paid.map((b) => (
                            <BonusRow key={b.id} bonus={b} />
                        ))}
                    </div>
                </section>
            )}

            {/* Cancelled section */}
            {cancelled.length > 0 && (
                <section>
                    <header className="mb-3">
                        <h2 className="text-lg font-bold">Anulowane</h2>
                    </header>
                    <div className="space-y-2">
                        {cancelled.map((b) => (
                            <BonusRow key={b.id} bonus={b} />
                        ))}
                    </div>
                </section>
            )}

            {linkTarget && (
                <LinkInvoiceDialog
                    bonus={linkTarget}
                    invoices={myInvoices}
                    onOpenChange={(open) => !open && setLinkTarget(null)}
                    onLinked={onLinked}
                />
            )}
        </div>
    )
}

function EmptyHint({ text }: { text: string }) {
    return (
        <div className="rounded-lg border border-dashed border-white/15 bg-white/5 p-6 text-center text-muted-foreground text-sm">
            {text}
        </div>
    )
}

interface BonusRowProps {
    bonus: BonusWithUsers
    canLink?: boolean
    onLink?: () => void
}

function BonusRow({ bonus, canLink, onLink }: BonusRowProps) {
    return (
        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
            <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-white">
                            {formatAmount(Number(bonus.amount), bonus.currency)}
                        </span>
                        {statusBadge(bonus.status)}
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">{bonus.reason}</div>
                    <div className="mt-1 text-xs text-muted-foreground space-x-3">
                        <span>Manager: {bonus.proposer_full_name ?? '—'}</span>
                        <span>Otrzymano: {formatDate(bonus.created_at)}</span>
                        {bonus.linked_invoice_number && (
                            <span>
                                <FileText className="inline h-3 w-3 mr-1" />
                                Faktura: {bonus.linked_invoice_number}
                            </span>
                        )}
                        {bonus.cancellation_reason && (
                            <span className="text-red-400">
                                Powód anul.: {bonus.cancellation_reason}
                            </span>
                        )}
                    </div>
                </div>
                {canLink && onLink && (
                    <Button size="sm" onClick={onLink}>
                        <Link2 className="h-3.5 w-3.5 mr-1.5" />
                        Linkuj z fakturą
                    </Button>
                )}
            </div>
        </div>
    )
}

// ─── Link invoice dialog ────────────────────────────────────────────────────

interface LinkDialogProps {
    bonus: BonusWithUsers
    invoices: MyInvoice[]
    onOpenChange: (open: boolean) => void
    onLinked: (bonusId: string, invoiceId: string, invoiceNumber: string) => void
}

function LinkInvoiceDialog({ bonus, invoices, onOpenChange, onLinked }: LinkDialogProps) {
    const [invoiceId, setInvoiceId] = useState('')
    const [pending, startTransition] = useTransition()

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (!invoiceId) return toast.error('Wybierz fakturę.')

        startTransition(async () => {
            try {
                const result = await linkBonusToInvoice({ id: bonus.id, invoice_id: invoiceId })
                const inv = invoices.find((i) => i.id === invoiceId)
                onLinked(result.id, invoiceId, inv?.invoice_number ?? '?')
                toastSuccess('Premia zlinkowana z fakturą.')
            } catch (err: any) {
                toast.error(err.message ?? 'Nie udało się zlinkować.')
            }
        })
    }

    return (
        <Dialog open onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Linkuj premię z fakturą</DialogTitle>
                    <DialogDescription>
                        Wybierz fakturę z Compass, w której uwzględniłeś tę premię.{' '}
                        <strong className="text-white">{formatAmount(Number(bonus.amount), bonus.currency)}</strong> —{' '}
                        {bonus.reason}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-3">
                    {invoices.length === 0 ? (
                        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
                            Nie masz jeszcze żadnych faktur w Compass. Najpierw wystaw fakturę w zakładce{' '}
                            <strong>Faktury</strong> uwzględniając premię, a potem wróć tutaj i zlinkuj.
                        </div>
                    ) : (
                        <div className="space-y-1.5">
                            <Label htmlFor="invoice-select">Faktura</Label>
                            <select
                                id="invoice-select"
                                value={invoiceId}
                                onChange={(e) => setInvoiceId(e.target.value)}
                                className="w-full rounded-md border border-white/15 bg-black/30 px-3 py-2 text-sm"
                                required
                            >
                                <option value="">— wybierz —</option>
                                {invoices.map((i) => (
                                    <option key={i.id} value={i.id}>
                                        {i.invoice_number} — {formatPeriod(i.period_year, i.period_month)} —{' '}
                                        {Number(i.amount).toFixed(2)} PLN ({i.status})
                                    </option>
                                ))}
                            </select>
                            <p className="text-xs text-muted-foreground">
                                Po zlinkowaniu premia przechodzi do statusu <strong>Wypłacona</strong>. Tej operacji
                                nie można cofnąć przez UI — wymaga interwencji admina.
                            </p>
                        </div>
                    )}
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
                            Wstecz
                        </Button>
                        <Button type="submit" disabled={pending || invoices.length === 0}>
                            {pending ? 'Linkowanie...' : 'Linkuj'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
