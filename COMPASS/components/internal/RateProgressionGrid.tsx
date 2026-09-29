'use client'

// Phase 27h — 24-month progression grid. Siatka JEST harmonogramem od przyszłego miesiąca:
// zaplanowane zmiany są wstępnie wpisane i edytowalne, a zapis zastępuje wszystko od
// pierwszego miesiąca siatki (wcześniej: tylko dopisywanie za ostatnim krokiem rampy).
// The user fills only the months where the rate changes; equal/empty months collapse
// server-side (buildChangePoints).

import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/lib/toast'
import { listScheduledRateChanges, setRateProgression } from '@/lib/actions/internal-rates'
import type { RateCurrency, RateProgressionEntry } from '@/lib/types/rates'
import { horizonMonthsFor } from '@/lib/rates/progression'
import { BONUS_MONTHS_PL } from '@/lib/types/bonus'

interface MonthCell {
    iso: string
    label: string
}

function buildMonths(count: number): MonthCell[] {
    const now = new Date()
    const cells: MonthCell[] = []
    for (let i = 1; i <= count; i++) {
        const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1))
        const y = d.getUTCFullYear()
        const m = d.getUTCMonth() + 1
        cells.push({ iso: `${y}-${String(m).padStart(2, '0')}-01`, label: `${BONUS_MONTHS_PL[m - 1]} ${y}` })
    }
    return cells
}

interface Props {
    userId: string
    currentRate: number | null
    currentCurrency: RateCurrency | null
    onSaved: () => void
}

export function RateProgressionGrid({ userId, currentRate, currentCurrency, onSaved }: Props) {
    const [latestScheduled, setLatestScheduled] = useState<string | null>(null)
    // Siatka sięga co najmniej do ostatniego zaplanowanego kroku — zapis zastępuje wszystko od
    // pierwszego miesiąca siatki, więc krok poza nią zostałby skasowany bez ostrzeżenia.
    const months = useMemo(() => {
        const first = buildMonths(1)[0].iso
        return buildMonths(horizonMonthsFor(first, latestScheduled))
    }, [latestScheduled])
    const [currency, setCurrency] = useState<RateCurrency>(currentCurrency ?? 'PLN')
    const [values, setValues] = useState<Record<string, string>>({})
    const [scheduledCount, setScheduledCount] = useState(0)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        let active = true
        setLoading(true)
        listScheduledRateChanges(userId)
            .then((rows) => {
                if (!active) return
                const prefill: Record<string, string> = {}
                for (const r of rows) prefill[r.effective_from] = r.hourly_rate.toFixed(2)
                setValues(prefill)
                setScheduledCount(rows.length)
                setLatestScheduled(rows.length ? rows[rows.length - 1].effective_from : null)
            })
            .catch((e) => toast.error(e instanceof Error ? e.message : 'Błąd ładowania harmonogramu.'))
            .finally(() => {
                if (active) setLoading(false)
            })
        return () => {
            active = false
        }
    }, [userId])

    async function handleSave() {
        const entries: RateProgressionEntry[] = []
        for (const m of months) {
            const raw = values[m.iso]?.trim()
            if (!raw) continue
            const num = Number(raw)
            if (!Number.isFinite(num) || num < 0) {
                toast.error(`${m.label}: stawka musi być liczbą >= 0.`)
                return
            }
            entries.push({ effective_from: m.iso, hourly_rate: num })
        }
        if (entries.length === 0 && scheduledCount === 0) {
            toast.error('Wpisz stawkę w co najmniej jednym miesiącu.')
            return
        }
        setSaving(true)
        try {
            const res = await setRateProgression({
                user_id: userId,
                currency,
                replace_from: months[0].iso,
                entries,
            })
            if (!res?.success) {
                toast.error(res?.error ?? 'Błąd zapisu progresji.')
                return
            }
            const count = res.data.inserted_count
            toast.success(
                count === 0
                    ? 'Usunięto zaplanowane zmiany stawki.'
                    : `Zapisano progresję: ${count} ${count === 1 ? 'zmiana' : 'zmiany/zmian'}. Wysłano powiadomienia.`,
            )
            onSaved()
        } catch {
            toast.error('Błąd zapisu progresji. Odśwież stronę i spróbuj ponownie.')
        } finally {
            setSaving(false)
        }
    }

    if (loading) {
        return (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <Loader2 className="h-4 w-4 animate-spin" /> Ładowanie harmonogramu…
            </div>
        )
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                    Obecna stawka:{' '}
                    {currentRate != null ? `${currentRate.toFixed(2)} ${currentCurrency ?? ''}/h` : 'brak'}. Wypełnij
                    tylko miesiące, w których stawka się zmienia — pozostałe dziedziczą poprzednią.
                </p>
                <div className="shrink-0">
                    <Label htmlFor="prog-currency" className="sr-only">
                        Waluta
                    </Label>
                    <select
                        id="prog-currency"
                        value={currency}
                        onChange={(e) => setCurrency(e.target.value as RateCurrency)}
                        disabled={saving}
                        className="rounded-md border bg-background px-2 py-1 text-sm"
                    >
                        <option value="PLN">PLN</option>
                        <option value="EUR">EUR</option>
                        <option value="USD">USD</option>
                    </select>
                </div>
            </div>

            <p className="text-[11px] text-muted-foreground">
                Zapis zastępuje cały harmonogram od {months[0].label}
                {scheduledCount > 0 ? ` (wpisane niżej ${scheduledCount} zaplanowane zmiany możesz poprawić lub wyczyścić)` : ''}.
                Zmianę bieżącego lub minionego miesiąca zrobisz w trybie „Stała”.
            </p>

            <div className="max-h-[40vh] overflow-y-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                    <tbody>
                        {months.map((m) => (
                            <tr key={m.iso} className="border-b border-border/20 last:border-0">
                                <td className="p-2 whitespace-nowrap">{m.label}</td>
                                <td className="p-2">
                                    <Input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        inputMode="decimal"
                                        aria-label={`Stawka od ${m.label}`}
                                        value={values[m.iso] ?? ''}
                                        onChange={(e) => setValues((prev) => ({ ...prev, [m.iso]: e.target.value }))}
                                        placeholder="—"
                                        disabled={saving}
                                        className="h-8"
                                    />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="flex justify-end">
                <Button onClick={handleSave} disabled={saving}>
                    {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Zapisz progresję
                </Button>
            </div>
        </div>
    )
}
