'use client'

import { useMemo, useState, useTransition } from 'react'
import { Plus, CheckCircle2, XCircle, Download, Pencil, Ban, Paperclip, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { toast } from '@/lib/toast'
import { toastSuccess } from '@/lib/toast-success'
import { cancelBonus, getBonusAttachmentSignedUrl } from '@/lib/actions/internal-bonus'
import { AssignBonusForm } from './AssignBonusForm'
import type {
    BonusCategory,
    BonusStatus,
    BonusWithUsers,
    EligibleEmployeeForBonus,
} from '@/lib/types/bonus'
import { BONUS_MONTHS_PL, BONUS_CATEGORIES_PL } from '@/lib/types/bonus'

type ViewerMode = 'admin' | 'manager' | 'finanse'

interface Props {
    initialBonuses: BonusWithUsers[]
    candidates: EligibleEmployeeForBonus[]
    viewerMode: ViewerMode
    currentUserId: string
}

type FilterStatus = BonusStatus | 'all' | 'active'

function statusBadge(status: BonusStatus) {
    if (status === 'assigned') {
        return (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Przypisana
            </span>
        )
    }
    if (status === 'cancelled') {
        return (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
                <XCircle className="h-3.5 w-3.5" />
                Anulowana
            </span>
        )
    }
    // Legacy statuses (pending/paid) — should not appear in new flow, but render defensively.
    if (status === 'paid') {
        return (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-info">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Wypłacona (legacy)
            </span>
        )
    }
    return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-warning">
            Oczekuje (legacy)
        </span>
    )
}

function formatAmount(amount: number, currency: string): string {
    return `${Number(amount).toFixed(2)} ${currency}`
}

function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('pl-PL', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    })
}

function periodLabel(year: number | null, month: number | null): string {
    if (!year || !month) return '—'
    return `${BONUS_MONTHS_PL[month - 1]} ${year}`
}

function categoryBadge(category: BonusCategory) {
    const label = BONUS_CATEGORIES_PL[category]
    const className =
        category === 'sales'
            ? 'bg-info/15 text-info border-info/30'
            : category === 'delivery_lead'
              ? 'bg-primary/15 text-primary border-primary/30'
              : category === 'recruiter'
                ? 'bg-warning/15 text-warning border-warning/30'
                : 'bg-muted text-muted-foreground border-border'
    return (
        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${className}`}>{label}</span>
    )
}

function AttachmentButton({ bonus }: { bonus: BonusWithUsers }) {
    const [loading, setLoading] = useState(false)
    if (!bonus.attachment_path) return null
    async function open() {
        setLoading(true)
        try {
            const url = await getBonusAttachmentSignedUrl(bonus.id)
            window.open(url, '_blank', 'noopener,noreferrer')
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Błąd pobierania załącznika')
        } finally {
            setLoading(false)
        }
    }
    return (
        <button
            type="button"
            onClick={open}
            disabled={loading}
            className="inline-flex items-center gap-1 text-xs text-info hover:text-info/80"
        >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Paperclip className="h-3 w-3" />}
            {bonus.attachment_filename ?? 'Załącznik'}
        </button>
    )
}

function categoryInlineDetails(bonus: BonusWithUsers): string | null {
    switch (bonus.category) {
        case 'sales': {
            const parts: string[] = []
            if (bonus.client_name) parts.push(`Klient: ${bonus.client_name}`)
            if (bonus.sales_service_description) parts.push(`Usługa: ${bonus.sales_service_description}`)
            return parts.length > 0 ? parts.join(' · ') : null
        }
        case 'delivery_lead': {
            const parts: string[] = []
            if (bonus.client_name) parts.push(`Klient: ${bonus.client_name}`)
            if (bonus.delivery_candidate_name) parts.push(`Kandydat: ${bonus.delivery_candidate_name}`)
            if (bonus.delivery_margin_amount != null) {
                parts.push(`Marża: ${Number(bonus.delivery_margin_amount).toFixed(2)} PLN`)
            }
            return parts.length > 0 ? parts.join(' · ') : null
        }
        case 'recruiter': {
            const parts: string[] = []
            if (bonus.client_name) parts.push(`Klient: ${bonus.client_name}`)
            if (bonus.recruiter_candidate_name) parts.push(`Kandydat: ${bonus.recruiter_candidate_name}`)
            if (bonus.recruiter_margin_per_hour != null) {
                parts.push(`Marża: ${Number(bonus.recruiter_margin_per_hour).toFixed(2)} PLN/h`)
            }
            if (bonus.recruiter_calculated_tier) {
                parts.push(`próg ${bonus.recruiter_calculated_tier}`)
            }
            return parts.length > 0 ? parts.join(' · ') : null
        }
        case 'custom':
            return null
    }
}

function exportToCsv(bonuses: BonusWithUsers[]): void {
    const rows = [
        [
            'ID',
            'Pracownik',
            'Email',
            'Manager',
            'Kwota',
            'Waluta',
            'Status',
            'Miesiąc',
            'Uzasadnienie',
            'Utworzono',
            'Anulowano',
            'Powód anulowania',
        ],
        ...bonuses.map((b) => [
            b.id,
            b.recipient_full_name ?? '',
            b.recipient_email,
            b.proposer_full_name ?? '',
            String(Number(b.amount).toFixed(2)),
            b.currency,
            b.status,
            periodLabel(b.period_year, b.period_month),
            b.reason.replace(/"/g, '""'),
            b.created_at,
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

export function BonusesAdminClient({
    initialBonuses,
    candidates,
    viewerMode,
    currentUserId,
}: Props) {
    const [bonuses, setBonuses] = useState<BonusWithUsers[]>(initialBonuses)
    const [filterStatus, setFilterStatus] = useState<FilterStatus>('active')
    const [assignOpen, setAssignOpen] = useState(false)
    const [editTarget, setEditTarget] = useState<BonusWithUsers | null>(null)
    const [cancelTarget, setCancelTarget] = useState<BonusWithUsers | null>(null)

    const canAssign = viewerMode === 'admin' || viewerMode === 'manager'
    const canCancelAny = viewerMode === 'admin'

    const filtered = useMemo(() => {
        if (filterStatus === 'all') return bonuses
        if (filterStatus === 'active') {
            return bonuses.filter((b) => b.status === 'assigned')
        }
        return bonuses.filter((b) => b.status === filterStatus)
    }, [bonuses, filterStatus])

    const totalAssigned = bonuses
        .filter((b) => b.status === 'assigned')
        .reduce((sum, b) => sum + Number(b.amount), 0)
    const totalCancelled = bonuses
        .filter((b) => b.status === 'cancelled')
        .reduce((sum, b) => sum + Number(b.amount), 0)

    function handleEdited(updated: BonusWithUsers) {
        setBonuses((prev) => prev.map((b) => (b.id === updated.id ? { ...b, ...updated } : b)))
        setEditTarget(null)
    }

    function handleCancelled(bonusId: string, reason: string) {
        setBonuses((prev) =>
            prev.map((b) =>
                b.id === bonusId
                    ? {
                          ...b,
                          status: 'cancelled' as BonusStatus,
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
                <div className="rounded-lg border border-border bg-muted p-4">
                    <div className="text-xs text-muted-foreground">Przypisane (suma)</div>
                    <div className="text-2xl font-bold text-success">
                        {totalAssigned.toFixed(2)} PLN
                    </div>
                </div>
                <div className="rounded-lg border border-border bg-muted p-4">
                    <div className="text-xs text-muted-foreground">Anulowane (suma)</div>
                    <div className="text-2xl font-bold text-destructive">
                        {totalCancelled.toFixed(2)} PLN
                    </div>
                </div>
                <div className="rounded-lg border border-border bg-muted p-4">
                    <div className="text-xs text-muted-foreground">Liczba premii</div>
                    <div className="text-2xl font-bold">{bonuses.length}</div>
                </div>
            </div>

            {/* Filters + actions */}
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex gap-1">
                    {(['active', 'cancelled', 'all'] as const).map((s) => (
                        <button
                            key={s}
                            onClick={() => setFilterStatus(s)}
                            className={`px-3 py-1.5 rounded text-xs font-medium transition ${
                                filterStatus === s
                                    ? 'bg-accent text-foreground'
                                    : 'bg-muted text-muted-foreground hover:bg-accent'
                            }`}
                        >
                            {s === 'active' && 'Aktywne'}
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
                    {canAssign && candidates.length > 0 && (
                        <Button size="sm" onClick={() => setAssignOpen(true)}>
                            <Plus className="h-3.5 w-3.5 mr-1.5" />
                            Przypisz premię
                        </Button>
                    )}
                </div>
            </div>

            {/* Bonus list */}
            {filtered.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border bg-muted p-8 text-center text-muted-foreground">
                    Brak premii w tym filtrze.
                </div>
            ) : (
                <div className="space-y-2">
                    {filtered.map((b) => {
                        const canEditRow =
                            b.status === 'assigned' &&
                            (b.proposed_by === currentUserId || canCancelAny)
                        const canCancelRow =
                            (b.status === 'assigned' || b.status === 'pending') &&
                            (b.proposed_by === currentUserId || canCancelAny)
                        return (
                            <div
                                key={b.id}
                                className="rounded-lg border border-border bg-muted p-3"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-medium">
                                                {b.recipient_full_name ?? b.recipient_email}
                                            </span>
                                            <span className="text-xs text-muted-foreground">
                                                {b.recipient_email}
                                            </span>
                                            {statusBadge(b.status)}
                                            {categoryBadge(b.category)}
                                            <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">
                                                {periodLabel(b.period_year, b.period_month)}
                                            </span>
                                        </div>
                                        <div className="mt-1 text-sm">
                                            <span className="font-semibold text-foreground">
                                                {formatAmount(Number(b.amount), b.currency)}
                                            </span>
                                            <span className="text-muted-foreground"> — {b.reason}</span>
                                        </div>
                                        {(() => {
                                            const cat = categoryInlineDetails(b)
                                            return cat ? (
                                                <div className="mt-1 text-xs text-muted-foreground">{cat}</div>
                                            ) : null
                                        })()}
                                        {b.attachment_path && (
                                            <div className="mt-1.5">
                                                <AttachmentButton bonus={b} />
                                            </div>
                                        )}
                                        <div className="mt-1 text-xs text-muted-foreground space-x-3">
                                            <span>Manager: {b.proposer_full_name ?? '—'}</span>
                                            <span>Utworzono: {formatDate(b.created_at)}</span>
                                            {b.cancellation_reason && (
                                                <span className="text-destructive">
                                                    Anul.: {b.cancellation_reason}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex gap-1.5 shrink-0">
                                        {canEditRow && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setEditTarget(b)}
                                            >
                                                <Pencil className="h-3 w-3 mr-1" />
                                                Edytuj
                                            </Button>
                                        )}
                                        {canCancelRow && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setCancelTarget(b)}
                                            >
                                                <Ban className="h-3 w-3 mr-1" />
                                                Anuluj
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Assign dialog — outside-click/Escape are blocked so a misclick can't
                discard a half-filled form; close via Anuluj or the X. */}
            <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
                <DialogContent
                    onInteractOutside={(e) => e.preventDefault()}
                    onEscapeKeyDown={(e) => e.preventDefault()}
                >
                    <DialogHeader>
                        <DialogTitle>Przypisz premię</DialogTitle>
                        <DialogDescription>
                            Pracownik dostanie email + powiadomienie w aplikacji. Bonus jest od razu zatwierdzony.
                        </DialogDescription>
                    </DialogHeader>
                    <AssignBonusForm
                        mode="assign"
                        candidates={candidates}
                        compact
                        persistDraft
                        onSuccess={() => setAssignOpen(false)}
                        onCancel={() => setAssignOpen(false)}
                    />
                </DialogContent>
            </Dialog>

            {/* Edit dialog — same accidental-close guard as the assign dialog. */}
            {editTarget && (
                <Dialog open onOpenChange={(open) => !open && setEditTarget(null)}>
                    <DialogContent
                        onInteractOutside={(e) => e.preventDefault()}
                        onEscapeKeyDown={(e) => e.preventDefault()}
                    >
                        <DialogHeader>
                            <DialogTitle>Edytuj premię</DialogTitle>
                            <DialogDescription>
                                Pracownik dostanie powiadomienie o zmianach. Okres i odbiorca są niezmienne.
                            </DialogDescription>
                        </DialogHeader>
                        <AssignBonusForm
                            mode="edit"
                            candidates={candidates}
                            compact
                            prefilled={{
                                id: editTarget.id,
                                amount: Number(editTarget.amount),
                                currency: editTarget.currency,
                                reason: editTarget.reason,
                                notes: editTarget.notes,
                                period_year: editTarget.period_year ?? new Date().getFullYear(),
                                period_month:
                                    editTarget.period_month ?? new Date().getMonth() + 1,
                                recipient_full_name: editTarget.recipient_full_name,
                            }}
                            onSuccess={(updated) => {
                                // Merge the freshly-saved row over the existing one so the list
                                // reflects the new amount/reason/notes. Falling back to editTarget
                                // (stale) would mask the persisted change. Enriched display fields
                                // (names/email) come from editTarget; updated is the canonical row.
                                handleEdited(updated ? { ...editTarget, ...updated } : editTarget)
                            }}
                            onCancel={() => setEditTarget(null)}
                        />
                    </DialogContent>
                </Dialog>
            )}

            {cancelTarget && (
                <CancelBonusDialog
                    bonus={cancelTarget}
                    onOpenChange={(open) => !open && setCancelTarget(null)}
                    onCancelled={handleCancelled}
                />
            )}
        </div>
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
        if (reason.trim().length < 3) {
            toast.error('Powód min. 3 znaki.')
            return
        }

        startTransition(async () => {
            try {
                await cancelBonus({ id: bonus.id, cancellation_reason: reason.trim() })
                onCancelled(bonus.id, reason.trim())
                toastSuccess('Premia anulowana — pracownik dostał notyfikację.')
            } catch (err) {
                const msg = err instanceof Error ? err.message : 'Nie udało się anulować.'
                toast.error(msg)
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
                        {formatAmount(Number(bonus.amount), bonus.currency)} (
                        {periodLabel(bonus.period_year, bonus.period_month)})
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-3">
                    <div className="space-y-1.5">
                        <Label htmlFor="cancel-reason">Powód anulowania</Label>
                        <textarea
                            id="cancel-reason"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="np. omyłkowo przypisana"
                            rows={3}
                            maxLength={500}
                            className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm"
                            required
                        />
                    </div>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={pending}
                        >
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
