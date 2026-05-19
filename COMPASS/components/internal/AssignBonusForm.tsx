'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Gift } from 'lucide-react'
import { toast } from '@/lib/toast'
import { toastSuccess } from '@/lib/toast-success'
import { assignBonus, updateBonus } from '@/lib/actions/internal-bonus'
import type { EligibleEmployeeForBonus } from '@/lib/types/bonus'
import {
    BONUS_MIN_AMOUNT,
    BONUS_MAX_AMOUNT,
    BONUS_REASON_MIN_LENGTH,
    BONUS_REASON_MAX_LENGTH,
    BONUS_PERIOD_MAX_MONTHS_BACK,
    BONUS_MONTHS_PL,
} from '@/lib/types/bonus'

export type BonusFormMode = 'assign' | 'edit'

interface PrefilledEdit {
    id: string
    amount: number
    currency: string
    reason: string
    notes?: string | null
    period_year: number
    period_month: number
    recipient_full_name?: string | null
}

interface Props {
    mode?: BonusFormMode
    candidates: EligibleEmployeeForBonus[]
    prefilledRecipientId?: string
    prefilled?: PrefilledEdit
    onSuccess?: () => void
    onCancel?: () => void
    compact?: boolean
}

interface PeriodOption {
    year: number
    month: number
    label: string
}

function buildPeriodOptions(): PeriodOption[] {
    const now = new Date()
    const options: PeriodOption[] = []
    for (let i = BONUS_PERIOD_MAX_MONTHS_BACK; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const year = d.getFullYear()
        const month = d.getMonth() + 1
        options.push({
            year,
            month,
            label: `${BONUS_MONTHS_PL[month - 1]} ${year}`,
        })
    }
    return options.reverse()
}

export function AssignBonusForm({
    mode = 'assign',
    candidates,
    prefilledRecipientId,
    prefilled,
    onSuccess,
    onCancel,
    compact = false,
}: Props) {
    const router = useRouter()
    const [pending, startTransition] = useTransition()

    const periodOptions = useMemo(() => buildPeriodOptions(), [])
    const defaultPeriodKey = useMemo(() => {
        if (prefilled) return `${prefilled.period_year}-${prefilled.period_month}`
        const now = new Date()
        return `${now.getFullYear()}-${now.getMonth() + 1}`
    }, [prefilled])

    const [recipientId, setRecipientId] = useState<string>(
        prefilledRecipientId ?? prefilled?.id ?? '',
    )
    const [periodKey, setPeriodKey] = useState<string>(defaultPeriodKey)
    const [amount, setAmount] = useState<string>(
        prefilled ? String(prefilled.amount.toFixed(2)) : '',
    )
    const [currency, setCurrency] = useState<string>(prefilled?.currency ?? 'PLN')
    const [reason, setReason] = useState<string>(prefilled?.reason ?? '')
    const [notes, setNotes] = useState<string>(prefilled?.notes ?? '')

    const isEdit = mode === 'edit'
    const recipientLocked = isEdit || !!prefilledRecipientId
    const periodLocked = isEdit

    const recipientName = useMemo(() => {
        if (prefilled?.recipient_full_name) return prefilled.recipient_full_name
        const match = candidates.find((c) => c.user_id === recipientId)
        return match?.full_name ?? match?.email ?? null
    }, [candidates, recipientId, prefilled])

    function resetForm() {
        if (isEdit) return
        if (!prefilledRecipientId) setRecipientId('')
        setPeriodKey(defaultPeriodKey)
        setAmount('')
        setCurrency('PLN')
        setReason('')
        setNotes('')
    }

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault()

        if (!recipientId && !isEdit) {
            toast.error('Wybierz pracownika.')
            return
        }
        const amountNum = Number(amount)
        if (!Number.isFinite(amountNum) || amountNum < BONUS_MIN_AMOUNT) {
            toast.error(`Kwota musi być >= ${BONUS_MIN_AMOUNT}.`)
            return
        }
        if (amountNum > BONUS_MAX_AMOUNT) {
            toast.error(`Kwota za duża (max ${BONUS_MAX_AMOUNT}).`)
            return
        }
        const reasonTrimmed = reason.trim()
        if (reasonTrimmed.length < BONUS_REASON_MIN_LENGTH) {
            toast.error(`Uzasadnienie min ${BONUS_REASON_MIN_LENGTH} znaki.`)
            return
        }
        if (reasonTrimmed.length > BONUS_REASON_MAX_LENGTH) {
            toast.error(`Uzasadnienie max ${BONUS_REASON_MAX_LENGTH} znaków.`)
            return
        }

        const [periodYearStr, periodMonthStr] = periodKey.split('-')
        const periodYear = Number(periodYearStr)
        const periodMonth = Number(periodMonthStr)

        startTransition(async () => {
            try {
                if (isEdit && prefilled) {
                    await updateBonus({
                        id: prefilled.id,
                        amount: amountNum,
                        reason: reasonTrimmed,
                        notes: notes.trim() || null,
                    })
                    toastSuccess('Premia zaktualizowana.')
                } else {
                    await assignBonus({
                        recipient_user_id: recipientId,
                        period_year: periodYear,
                        period_month: periodMonth,
                        amount: amountNum,
                        currency,
                        reason: reasonTrimmed,
                        notes: notes.trim() || null,
                    })
                    toastSuccess(
                        recipientName
                            ? `Premia przypisana: ${recipientName}.`
                            : 'Premia przypisana.',
                    )
                    resetForm()
                }
                router.refresh()
                onSuccess?.()
            } catch (err) {
                const msg = err instanceof Error ? err.message : 'Nieznany błąd.'
                toast.error(msg)
            }
        })
    }

    const title = isEdit ? 'Edytuj premię' : 'Przypisz premię'
    const submitLabel = isEdit ? 'Zapisz zmiany' : 'Przypisz premię'

    const formBody = (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div>
                <Label htmlFor="bonus-recipient">Pracownik</Label>
                {recipientLocked ? (
                    <div
                        className="mt-1 text-sm rounded-md border bg-muted/30 px-3 py-2"
                        aria-readonly="true"
                    >
                        {recipientName ?? 'Nieznany pracownik'}
                    </div>
                ) : (
                    <select
                        id="bonus-recipient"
                        value={recipientId}
                        onChange={(e) => setRecipientId(e.target.value)}
                        className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm"
                        disabled={pending}
                        required
                    >
                        <option value="">— wybierz —</option>
                        {candidates.map((c) => (
                            <option key={c.user_id} value={c.user_id}>
                                {c.full_name ?? c.email} ({c.role})
                            </option>
                        ))}
                    </select>
                )}
            </div>

            <div>
                <Label htmlFor="bonus-period">Miesiąc premii</Label>
                {periodLocked ? (
                    <div
                        className="mt-1 text-sm rounded-md border bg-muted/30 px-3 py-2"
                        aria-readonly="true"
                    >
                        {periodOptions.find((p) => `${p.year}-${p.month}` === periodKey)?.label ?? periodKey}
                    </div>
                ) : (
                    <select
                        id="bonus-period"
                        value={periodKey}
                        onChange={(e) => setPeriodKey(e.target.value)}
                        className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm"
                        disabled={pending}
                        required
                    >
                        {periodOptions.map((p) => (
                            <option key={`${p.year}-${p.month}`} value={`${p.year}-${p.month}`}>
                                {p.label}
                            </option>
                        ))}
                    </select>
                )}
            </div>

            <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                    <Label htmlFor="bonus-amount">Kwota</Label>
                    <Input
                        id="bonus-amount"
                        type="number"
                        step="0.01"
                        min={BONUS_MIN_AMOUNT}
                        max={BONUS_MAX_AMOUNT}
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        disabled={pending}
                        required
                        placeholder="np. 500.00"
                    />
                </div>
                <div>
                    <Label htmlFor="bonus-currency">Waluta</Label>
                    <Input
                        id="bonus-currency"
                        value={currency}
                        onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 3))}
                        disabled={pending || isEdit}
                        maxLength={3}
                        placeholder="PLN"
                    />
                </div>
            </div>

            <div>
                <Label htmlFor="bonus-reason">Uzasadnienie</Label>
                <Textarea
                    id="bonus-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    disabled={pending}
                    required
                    rows={3}
                    placeholder="np. Premia za pozyskanie kandydata Senior Java Developer dla projektu X."
                />
                <p className="text-xs text-muted-foreground mt-1">
                    {reason.trim().length}/{BONUS_REASON_MAX_LENGTH} znaków
                </p>
            </div>

            <div>
                <Label htmlFor="bonus-notes">Notatka wewnętrzna (opcjonalna)</Label>
                <Textarea
                    id="bonus-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    disabled={pending}
                    rows={2}
                    placeholder="Widoczna dla managera i admina."
                />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
                {onCancel && (
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={onCancel}
                        disabled={pending}
                    >
                        Anuluj
                    </Button>
                )}
                <Button type="submit" disabled={pending}>
                    {pending ? (
                        <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Zapisuję…
                        </>
                    ) : (
                        <>
                            <Gift className="h-4 w-4 mr-2" /> {submitLabel}
                        </>
                    )}
                </Button>
            </div>
        </form>
    )

    if (compact) return formBody

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                    <Gift className="h-4 w-4" /> {title}
                </CardTitle>
            </CardHeader>
            <CardContent>{formBody}</CardContent>
        </Card>
    )
}
