'use client'

// Phase 27c — Change rate dialog. Effective_from MUST be 1st of a future month.
// Generates 12 month options starting from next month.

import { useMemo, useState } from 'react'
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
import { Loader2 } from 'lucide-react'
import { toast } from '@/lib/toast'
import { setUserRate } from '@/lib/actions/internal-rates'
import type { RateCurrency, UserRateDirectoryRow } from '@/lib/types/rates'
import { BONUS_MONTHS_PL } from '@/lib/types/bonus'

interface Props {
    target: UserRateDirectoryRow
    onOpenChange: (open: boolean) => void
    onSuccess: (userId: string, rate: number, currency: string, effectiveFrom: string) => void
}

interface MonthOption {
    value: string // YYYY-MM-DD (1st of month)
    label: string
}

function buildFutureMonthOptions(): MonthOption[] {
    const now = new Date()
    const opts: MonthOption[] = []
    for (let i = 1; i <= 12; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
        const year = d.getFullYear()
        const month = d.getMonth() + 1
        const iso = `${year}-${String(month).padStart(2, '0')}-01`
        opts.push({ value: iso, label: `${BONUS_MONTHS_PL[month - 1]} ${year} (od ${iso})` })
    }
    return opts
}

export function ChangeRateDialog({ target, onOpenChange, onSuccess }: Props) {
    const monthOptions = useMemo(() => buildFutureMonthOptions(), [])
    const [rate, setRate] = useState<string>(target.current_rate?.toString() ?? '')
    const [currency, setCurrency] = useState<RateCurrency>(target.current_currency ?? 'PLN')
    const [effectiveFrom, setEffectiveFrom] = useState<string>(monthOptions[0]?.value ?? '')
    const [reason, setReason] = useState<string>('')
    const [saving, setSaving] = useState<boolean>(false)

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        const rateNum = Number(rate)
        if (!Number.isFinite(rateNum) || rateNum < 0) {
            toast.error('Stawka musi być >= 0.')
            return
        }
        if (!effectiveFrom) {
            toast.error('Wybierz miesiąc obowiązywania.')
            return
        }
        setSaving(true)
        try {
            await setUserRate({
                user_id: target.user_id,
                hourly_rate: rateNum,
                currency,
                effective_from: effectiveFrom,
                reason: reason.trim() || null,
            })
            toast.success(
                `Stawka ${rateNum.toFixed(2)} ${currency}/h ustawiona od ${effectiveFrom}. Wysłano powiadomienia.`,
            )
            onSuccess(target.user_id, rateNum, currency, effectiveFrom)
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Błąd zapisu stawki.')
        } finally {
            setSaving(false)
        }
    }

    const currentRateLabel =
        target.current_rate != null
            ? `${target.current_rate.toFixed(2)} ${target.current_currency}/h (od ${target.current_effective_from})`
            : 'Brak stawki — to będzie pierwsza.'

    return (
        <Dialog open onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Zmień stawkę godzinową</DialogTitle>
                    <DialogDescription className="text-xs">
                        {target.full_name ?? target.email}. Aktualna stawka: {currentRateLabel}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-3">
                    <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-2">
                            <Label htmlFor="rate-amount">Nowa stawka</Label>
                            <Input
                                id="rate-amount"
                                type="number"
                                step="0.01"
                                min="0"
                                value={rate}
                                onChange={(e) => setRate(e.target.value)}
                                placeholder="np. 250.00"
                                disabled={saving}
                                required
                            />
                        </div>
                        <div>
                            <Label htmlFor="rate-currency">Waluta</Label>
                            <select
                                id="rate-currency"
                                value={currency}
                                onChange={(e) => setCurrency(e.target.value as RateCurrency)}
                                disabled={saving}
                                className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm"
                            >
                                <option value="PLN">PLN</option>
                                <option value="EUR">EUR</option>
                                <option value="USD">USD</option>
                            </select>
                        </div>
                    </div>
                    <div>
                        <Label htmlFor="rate-effective">Obowiązuje od</Label>
                        <select
                            id="rate-effective"
                            value={effectiveFrom}
                            onChange={(e) => setEffectiveFrom(e.target.value)}
                            disabled={saving}
                            className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm"
                            required
                        >
                            {monthOptions.map((o) => (
                                <option key={o.value} value={o.value}>
                                    {o.label}
                                </option>
                            ))}
                        </select>
                        <p className="text-[10px] text-muted-foreground mt-1">
                            Stawka wchodzi w życie zawsze 1. dnia miesiąca, nigdy mid-month.
                        </p>
                    </div>
                    <div>
                        <Label htmlFor="rate-reason">Notatka (opcjonalna)</Label>
                        <Textarea
                            id="rate-reason"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="np. coroczna podwyżka inflacyjna"
                            rows={2}
                            maxLength={500}
                            disabled={saving}
                        />
                    </div>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={saving}
                        >
                            Anuluj
                        </Button>
                        <Button type="submit" disabled={saving}>
                            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            Zapisz stawkę
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
