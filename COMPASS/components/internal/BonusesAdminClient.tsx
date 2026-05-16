'use client'

import { useState, useTransition } from 'react'
import { Plus, AlertCircle, CheckCircle2, XCircle, FileText, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { toast } from '@/lib/toast'
import { toastSuccess } from '@/lib/toast-success'
import { proposeBonus, cancelBonus } from '@/lib/actions/internal-bonus'
import type { BonusStatus, BonusWithUsers, ProposeBonusInput } from '@/lib/types/bonus'

type ViewerMode = 'admin' | 'manager' | 'finanse'

interface Recipient {
    id: string
    full_name: string | null
    email: string
    role: string
}

interface Props {
    initialBonuses: BonusWithUsers[]
    recipients: Recipient[]
    viewerMode: ViewerMode
    currentUserId: string
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
            Oczekuje
        </span>
    )
}

function formatAmount(amount: number, currency: string): string {
    return `${Number(amount).toFixed(2)} ${currency}`
}

function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('pl-PL', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

function exportToCsv(bonuses: BonusWithUsers[]): void {
    const rows = [
        ['ID', 'Pracownik', 'Email', 'Manager', 'Kwota', 'Waluta', 'Status', 'Powód', 'Faktura', 'Utworzono', 'Wypłacono', 'Anulowano', 'Powód anulowania'],
        ...bonuses.map((b) => [
            b.id,
            b.recipient_full_name ?? '',
            b.recipient_email,
            b.proposer_full_name ?? '',
            String(Number(b.amount).toFixed(2)),
            b.currency,
            b.status,
            b.reason.replace(/"/g, '""'),
            b.linked_invoice_number ?? '',
            b.created_at,
            b.paid_at ?? '',
            b.cancelled_at ?? '',
            b.cancellation_reason?.replace(/"/g, '""') ?? '',
        ]),
    ]
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n')
    const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `bonuses-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
}

export function BonusesAdminClient({ initialBonuses, recipients, viewerMode, currentUserId }: Props) {
    const [bonuses, setBonuses] = useState<BonusWithUsers[]>(initialBonuses)
    const [filterStatus, setFilterStatus] = useState<BonusStatus | 'all'>(
        viewerMode === 'finanse' ? 'all' : 'pending',
    )
    const [proposeOpen, setProposeOpen] = useState(false)
    const [cancelTarget, setCancelTarget] = useState<BonusWithUsers | null>(null)

    const canPropose = viewerMode === 'admin' || viewerMode === 'manager'
    const canCancelAny = viewerMode === 'admin'

    const filtered = filterStatus === 'all' ? bonuses : bonuses.filter((b) => b.status === filterStatus)

    const totalPaid = bonuses
        .filter((b) => b.status === 'paid')
        .reduce((sum, b) => sum + Number(b.amount), 0)
    const totalPending = bonuses
        .filter((b) => b.status === 'pending')
        .reduce((sum, b) => sum + Number(b.amount), 0)

    function onProposed(newBonus: BonusWithUsers) {
        setBonuses((prev) => [newBonus, ...prev])
        setProposeOpen(false)
    }

    function onCancelled(bonusId: string, reason: string) {
        setBonuses((prev) =>
            prev.map((b) =>
                b.id === bonusId
                    ? {
                          ...b,
                          status: 'cancelled',
                          cancelled_at: new Date().toISOString(),
                          cancelled_by: currentUserId,
                          cancellation_reason: reason,
                      }
                    : b,
            ),
        )
        setCancelTarget(null)
    }

    return (
        <div className="space-y-4">
            {/* Summary stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                    <div className="text-xs text-muted-foreground">Wypłacone (suma)</div>
                    <div className="text-2xl font-bold text-green-400">{totalPaid.toFixed(2)} PLN</div>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                    <div className="text-xs text-muted-foreground">Oczekujące (suma)</div>
                    <div className="text-2xl font-bold text-yellow-400">{totalPending.toFixed(2)} PLN</div>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                    <div className="text-xs text-muted-foreground">Liczba premii</div>
                    <div className="text-2xl font-bold">{bonuses.length}</div>
                </div>
            </div>

            {/* Filters + actions */}
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex gap-1">
                    {(['pending', 'paid', 'cancelled', 'all'] as const).map((s) => (
                        <button
                            key={s}
                            onClick={() => setFilterStatus(s)}
                            className={`px-3 py-1.5 rounded text-xs font-medium transition ${
                                filterStatus === s
                                    ? 'bg-white/15 text-white'
                                    : 'bg-white/5 text-muted-foreground hover:bg-white/10'
                            }`}
                        >
                            {s === 'pending' && 'Oczekujące'}
                            {s === 'paid' && 'Wypłacone'}
                            {s === 'cancelled' && 'Anulowane'}
                            {s === 'all' && 'Wszystkie'}
                        </button>
                    ))}
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => exportToCsv(filtered)}>
                        <Download className="h-3.5 w-3.5 mr-1.5" />
                        CSV
                    </Button>
                    {canPropose && recipients.length > 0 && (
                        <Button size="sm" onClick={() => setProposeOpen(true)}>
                            <Plus className="h-3.5 w-3.5 mr-1.5" />
                            Dodaj premię
                        </Button>
                    )}
                </div>
            </div>

            {/* Bonus list */}
            {filtered.length === 0 ? (
                <div className="rounded-lg border border-dashed border-white/15 bg-white/5 p-8 text-center text-muted-foreground">
                    Brak premii w tym filtrze.
                </div>
            ) : (
                <div className="space-y-2">
                    {filtered.map((b) => (
                        <div key={b.id} className="rounded-lg border border-white/10 bg-white/5 p-3">
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-medium">{b.recipient_full_name ?? b.recipient_email}</span>
                                        <span className="text-xs text-muted-foreground">{b.recipient_email}</span>
                                        {statusBadge(b.status)}
                                    </div>
                                    <div className="mt-1 text-sm">
                                        <span className="font-semibold text-white">{formatAmount(Number(b.amount), b.currency)}</span>
                                        <span className="text-muted-foreground"> — {b.reason}</span>
                                    </div>
                                    <div className="mt-1 text-xs text-muted-foreground space-x-3">
                                        <span>Manager: {b.proposer_full_name ?? '—'}</span>
                                        <span>Utworzono: {formatDate(b.created_at)}</span>
                                        {b.linked_invoice_number && (
                                            <span>
                                                <FileText className="inline h-3 w-3 mr-1" />
                                                {b.linked_invoice_number}
                                            </span>
                                        )}
                                        {b.cancellation_reason && (
                                            <span className="text-red-400">Anul.: {b.cancellation_reason}</span>
                                        )}
                                    </div>
                                </div>
                                {b.status === 'pending' && (canCancelAny || b.proposed_by === currentUserId) && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setCancelTarget(b)}
                                    >
                                        Anuluj
                                    </Button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {proposeOpen && (
                <ProposeBonusDialog
                    open={proposeOpen}
                    onOpenChange={setProposeOpen}
                    recipients={recipients}
                    onProposed={onProposed}
                />
            )}

            {cancelTarget && (
                <CancelBonusDialog
                    bonus={cancelTarget}
                    onOpenChange={(open) => !open && setCancelTarget(null)}
                    onCancelled={onCancelled}
                />
            )}
        </div>
    )
}

// ─── Propose dialog ─────────────────────────────────────────────────────────

interface ProposeDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    recipients: Recipient[]
    onProposed: (bonus: BonusWithUsers) => void
}

function ProposeBonusDialog({ open, onOpenChange, recipients, onProposed }: ProposeDialogProps) {
    const [recipientId, setRecipientId] = useState('')
    const [amount, setAmount] = useState('')
    const [currency, setCurrency] = useState('PLN')
    const [reason, setReason] = useState('')
    const [notes, setNotes] = useState('')
    const [pending, startTransition] = useTransition()

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        const amountNum = Number(amount)
        if (!recipientId) return toast.error('Wybierz pracownika.')
        if (!Number.isFinite(amountNum) || amountNum <= 0) return toast.error('Kwota musi być dodatnia.')
        if (reason.trim().length < 3) return toast.error('Powód min. 3 znaki.')

        startTransition(async () => {
            try {
                const input: ProposeBonusInput = {
                    recipient_user_id: recipientId,
                    amount: amountNum,
                    currency,
                    reason: reason.trim(),
                    notes: notes.trim() || null,
                }
                const result = await proposeBonus(input)
                // Enrich locally with recipient name.
                const recipient = recipients.find((r) => r.id === recipientId)
                onProposed({
                    ...result,
                    amount: Number(result.amount),
                    recipient_full_name: recipient?.full_name ?? null,
                    recipient_email: recipient?.email ?? '',
                    proposer_full_name: null,
                    proposer_email: null,
                    linked_invoice_number: null,
                })
                toastSuccess('Premia dodana — pracownik dostał notyfikację.')
            } catch (err: any) {
                toast.error(err.message ?? 'Nie udało się dodać premii.')
            }
        })
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Dodaj premię</DialogTitle>
                    <DialogDescription>
                        Pracownik dostanie notyfikację (in-app, email, push) i uwzględni premię w fakturze.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-3">
                    <div className="space-y-1.5">
                        <Label htmlFor="bonus-recipient">Pracownik</Label>
                        <select
                            id="bonus-recipient"
                            value={recipientId}
                            onChange={(e) => setRecipientId(e.target.value)}
                            className="w-full rounded-md border border-white/15 bg-black/30 px-3 py-2 text-sm"
                            required
                        >
                            <option value="">— wybierz —</option>
                            {recipients.map((r) => (
                                <option key={r.id} value={r.id}>
                                    {r.full_name ?? r.email} ({r.email})
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-2 space-y-1.5">
                            <Label htmlFor="bonus-amount">Kwota</Label>
                            <input
                                id="bonus-amount"
                                type="number"
                                step="0.01"
                                min="1"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                className="w-full rounded-md border border-white/15 bg-black/30 px-3 py-2 text-sm"
                                required
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="bonus-currency">Waluta</Label>
                            <select
                                id="bonus-currency"
                                value={currency}
                                onChange={(e) => setCurrency(e.target.value)}
                                className="w-full rounded-md border border-white/15 bg-black/30 px-3 py-2 text-sm"
                            >
                                <option value="PLN">PLN</option>
                                <option value="EUR">EUR</option>
                                <option value="USD">USD</option>
                            </select>
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="bonus-reason">Powód (widoczny dla pracownika)</Label>
                        <textarea
                            id="bonus-reason"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="np. premia rekrutacyjna kandydat Jan Kowalski tier Mid (§3 regulaminu)"
                            rows={3}
                            maxLength={1000}
                            className="w-full rounded-md border border-white/15 bg-black/30 px-3 py-2 text-sm"
                            required
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="bonus-notes">Notatki wewnętrzne (opcjonalne, niewidoczne dla pracownika)</Label>
                        <textarea
                            id="bonus-notes"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows={2}
                            className="w-full rounded-md border border-white/15 bg-black/30 px-3 py-2 text-sm"
                        />
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
                            Anuluj
                        </Button>
                        <Button type="submit" disabled={pending}>
                            {pending ? 'Wysyłanie...' : 'Dodaj premię'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}

// ─── Cancel dialog ──────────────────────────────────────────────────────────

interface CancelDialogProps {
    bonus: BonusWithUsers
    onOpenChange: (open: boolean) => void
    onCancelled: (bonusId: string, reason: string) => void
}

function CancelBonusDialog({ bonus, onOpenChange, onCancelled }: CancelDialogProps) {
    const [reason, setReason] = useState('')
    const [pending, startTransition] = useTransition()

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (reason.trim().length < 3) return toast.error('Powód min. 3 znaki.')

        startTransition(async () => {
            try {
                await cancelBonus({ id: bonus.id, cancellation_reason: reason.trim() })
                onCancelled(bonus.id, reason.trim())
                toastSuccess('Premia anulowana — pracownik dostał notyfikację.')
            } catch (err: any) {
                toast.error(err.message ?? 'Nie udało się anulować.')
            }
        })
    }

    return (
        <Dialog open onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Anuluj premię</DialogTitle>
                    <DialogDescription>
                        {bonus.recipient_full_name ?? bonus.recipient_email} —{' '}
                        {formatAmount(Number(bonus.amount), bonus.currency)}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-3">
                    <div className="space-y-1.5">
                        <Label htmlFor="cancel-reason">Powód anulowania</Label>
                        <textarea
                            id="cancel-reason"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="np. kandydat odszedł przed probacją"
                            rows={3}
                            maxLength={500}
                            className="w-full rounded-md border border-white/15 bg-black/30 px-3 py-2 text-sm"
                            required
                        />
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
                            Wstecz
                        </Button>
                        <Button type="submit" variant="destructive" disabled={pending}>
                            {pending ? 'Anulowanie...' : 'Anuluj premię'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
