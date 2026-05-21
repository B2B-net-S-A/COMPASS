'use client'

// Phase 27h — 24-month progression grid. Append-only: months at or before the user's
// latest already-scheduled month are locked. The user fills only the months where the
// rate changes; equal/empty months collapse server-side (buildChangePoints).

import { useEffect, useMemo, useState } from 'react'
import { Loader2, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/lib/toast'
import { listScheduledRateChanges, setRateProgression } from '@/lib/actions/internal-rates'
import type { RateCurrency, RateProgressionEntry } from '@/lib/types/rates'
import { RATE_PROGRESSION_MAX_MONTHS } from '@/lib/types/rates'
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
    const months = useMemo(() => buildMonths(RATE_PROGRESSION_MAX_MONTHS), [])
    const [currency, setCurrency] = useState<RateCurrency>(currentCurrency ?? 'PLN')
    const [values, setValues] = useState<Record<string, string>>({})
    const [scheduled, setScheduled] = useState<Record<string, number>>({})
    const [latestScheduled, setLatestScheduled] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        let active = true
        setLoading(true)
        listScheduledRateChanges(userId)
            .then((rows) => {
                if (!active) return
                const map: Record<string, number> = {}
                for (const r of rows) map[r.effective_from] = r.hourly_rate
                setScheduled(map)
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

    function isLocked(iso: string): boolean {
        return latestScheduled !== null && iso <= latestScheduled
    }

    async function handleSave() {
        const entries: RateProgressionEntry[] = []
        for (const m of months) {
            if (isLocked(m.iso)) continue
            const raw = values[m.iso]?.trim()
            if (!raw) continue
            const num = Number(raw)
            if (!Number.isFinite(num) || num < 0) {
                toast.error(`${m.label}: stawka musi być liczbą >= 0.`)
                return
            }
            entries.push({ effective_from: m.iso, hourly_rate: num })
        }
        if (entries.length === 0) {
            toast.error('Wpisz stawkę w co najmniej jednym (odblokowanym) miesiącu.')
            return
        }
        setSaving(true)
        try {
            const res = await setRateProgression({ user_id: userId, currency, entries })
            toast.success(
                `Zapisano progresję: ${res.inserted_count} ${res.inserted_count === 1 ? 'zmiana' : 'zmiany/zmian'}. Wysłano powiadomienia.`,
            )
            onSaved()
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Błąd zapisu progresji.')
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

    const hasLocked = latestScheduled !== null

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

            {hasLocked && (
                <p className="text-[11px] text-amber-400">
                    Miesiące do {latestScheduled} są już zaplanowane i zablokowane (dozwolone tylko dopisywanie
                    kolejnych).
                </p>
            )}

            <div className="max-h-[40vh] overflow-y-auto rounded-lg border border-white/10">
                <table className="w-full text-sm">
                    <tbody>
                        {months.map((m) => {
                            const locked = isLocked(m.iso)
                            const lockedRate = scheduled[m.iso]
                            return (
                                <tr key={m.iso} className="border-b border-border/20 last:border-0">
                                    <td className="p-2 whitespace-nowrap">{m.label}</td>
                                    <td className="p-2">
                                        {locked ? (
                                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                                <Lock className="h-3 w-3" />
                                                {lockedRate != null ? `${lockedRate.toFixed(2)} ${currency}/h` : 'zaplanowane'}
                                            </div>
                                        ) : (
                                            <Input
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                inputMode="decimal"
                                                value={values[m.iso] ?? ''}
                                                onChange={(e) =>
                                                    setValues((prev) => ({ ...prev, [m.iso]: e.target.value }))
                                                }
                                                placeholder="—"
                                                disabled={saving}
                                                className="h-8"
                                            />
                                        )}
                                    </td>
                                </tr>
                            )
                        })}
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
