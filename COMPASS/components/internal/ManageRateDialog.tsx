'use client'

// Phase 27i — "Zarządzaj stawką" dialog: hourly rate only.
// Fixed rate from any month (12 back … 12 ahead) or a forward progression (24-month grid),
// plus copy-progression-from-another. Zapis od miesiąca X zastępuje wszystko od X.
// Contract type + documents live in ManageContractDialog ("Zarządzaj umową").

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2 } from 'lucide-react'
import { toast } from '@/lib/toast'
import {
    setRateProgression,
    previewCopyProgression,
    copyRateProgression,
} from '@/lib/actions/internal-rates'
import type {
    RateCurrency,
    UserRateDirectoryRow,
    CopyProgressionResult,
    SkippedCopyReason,
} from '@/lib/types/rates'
import { RATE_BACKDATE_MAX_MONTHS } from '@/lib/types/rates'
import { BONUS_MONTHS_PL } from '@/lib/types/bonus'
import { RateProgressionGrid } from './RateProgressionGrid'

interface Props {
    target: UserRateDirectoryRow
    employees: UserRateDirectoryRow[]
    onOpenChange: (open: boolean) => void
}

interface MonthOption {
    value: string
    label: string
    /** -N = N miesięcy wstecz, 0 = bieżący, >0 = przyszły. */
    offset: number
}

function buildMonthOptions(back: number, ahead: number): MonthOption[] {
    const now = new Date()
    const opts: MonthOption[] = []
    for (let i = ahead; i >= -back; i--) {
        const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1))
        const y = d.getUTCFullYear()
        const m = d.getUTCMonth() + 1
        const iso = `${y}-${String(m).padStart(2, '0')}-01`
        const suffix = i === 0 ? ' — bieżący' : i < 0 ? ' — wstecz' : ''
        opts.push({ value: iso, label: `${BONUS_MONTHS_PL[m - 1]} ${y}${suffix}`, offset: i })
    }
    return opts.reverse()
}

const SKIP_REASON_PL: Record<SkippedCopyReason, string> = {
    past: 'przeszłość',
    conflict: 'koliduje z harmonogramem',
    no_change: 'bez zmiany',
}

export function ManageRateDialog({ target, employees, onOpenChange }: Props) {
    const router = useRouter()
    const monthOptions = useMemo(() => buildMonthOptions(RATE_BACKDATE_MAX_MONTHS, 12), [])
    const name = target.full_name ?? target.email

    // Rate mode
    const [mode, setMode] = useState<'fixed' | 'progressive'>(target.is_progressive ? 'progressive' : 'fixed')

    // Fixed (single) rate
    const [rate, setRate] = useState<string>(target.current_rate?.toString() ?? '')
    const [currency, setCurrency] = useState<RateCurrency>(target.current_currency ?? 'PLN')
    const [effFrom, setEffFrom] = useState<string>(
        monthOptions.find((o) => o.offset === 1)?.value ?? monthOptions[0]?.value ?? '',
    )
    const effOffset = monthOptions.find((o) => o.value === effFrom)?.offset ?? 1
    const [reason, setReason] = useState<string>('')
    const [savingFixed, setSavingFixed] = useState(false)

    // Copy progression
    const [copyFrom, setCopyFrom] = useState<string>('')
    const [preview, setPreview] = useState<CopyProgressionResult | null>(null)
    const [previewing, setPreviewing] = useState(false)
    const [applyingCopy, setApplyingCopy] = useState(false)

    function refreshDirectory() {
        router.refresh()
    }

    async function handleSaveFixed(e: React.FormEvent) {
        e.preventDefault()
        const rateNum = Number(rate)
        if (!Number.isFinite(rateNum) || rateNum < 0) {
            toast.error('Stawka musi być liczbą >= 0.')
            return
        }
        if (!effFrom) {
            toast.error('Wybierz miesiąc obowiązywania.')
            return
        }
        setSavingFixed(true)
        try {
            const res = await setRateProgression({
                user_id: target.user_id,
                currency,
                replace_from: effFrom,
                entries: [{ effective_from: effFrom, hourly_rate: rateNum }],
                reason: reason.trim() || null,
            })
            if (!res?.success) {
                toast.error(res?.error ?? 'Błąd zapisu stawki.')
                return
            }
            toast.success(`Stawka ${rateNum.toFixed(2)} ${currency}/h od ${effFrom}. Wysłano powiadomienia.`)
            refreshDirectory()
            onOpenChange(false)
        } catch {
            toast.error('Błąd zapisu stawki. Odśwież stronę i spróbuj ponownie.')
        } finally {
            setSavingFixed(false)
        }
    }

    async function handlePreviewCopy() {
        if (!copyFrom) {
            toast.error('Wybierz pracownika, od którego skopiować progresję.')
            return
        }
        setPreviewing(true)
        setPreview(null)
        try {
            const res = await previewCopyProgression({ from_user_id: copyFrom, to_user_id: target.user_id })
            if (!res?.success) {
                toast.error(res?.error ?? 'Błąd podglądu kopii.')
                return
            }
            setPreview(res.data)
            if (res.data.applied.length === 0 && res.data.skipped.length === 0) {
                toast.info('Wybrany pracownik nie ma zaplanowanej progresji do skopiowania.')
            }
        } catch {
            toast.error('Błąd podglądu kopii. Odśwież stronę i spróbuj ponownie.')
        } finally {
            setPreviewing(false)
        }
    }

    async function handleApplyCopy() {
        setApplyingCopy(true)
        try {
            const res = await copyRateProgression({ from_user_id: copyFrom, to_user_id: target.user_id })
            if (!res?.success) {
                toast.error(res?.error ?? 'Błąd kopiowania progresji.')
                return
            }
            const count = res.data.inserted_count
            if (count === 0) {
                toast.error('Nic nie skopiowano (brak pasujących miesięcy).')
            } else {
                toast.success(
                    `Skopiowano ${count} ${count === 1 ? 'zmianę' : 'zmiany/zmian'}. Wysłano powiadomienia.`,
                )
                refreshDirectory()
                onOpenChange(false)
            }
        } catch {
            toast.error('Błąd kopiowania progresji. Odśwież stronę i spróbuj ponownie.')
        } finally {
            setApplyingCopy(false)
        }
    }

    const copyCandidates = employees.filter((emp) => emp.user_id !== target.user_id)

    return (
        <Dialog open onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Zarządzaj stawką — {name}</DialogTitle>
                    <DialogDescription className="text-xs">{target.email}</DialogDescription>
                </DialogHeader>

                <div className="space-y-6">
                    {/* ─── Stawka (fixed / progressive) ───────────────────── */}
                    <section className="space-y-3">
                        <h3 className="text-sm font-semibold">Stawka godzinowa</h3>
                        <div className="flex gap-2">
                            <Button
                                type="button"
                                size="sm"
                                variant={mode === 'fixed' ? 'default' : 'outline'}
                                onClick={() => setMode('fixed')}
                            >
                                Stała
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                variant={mode === 'progressive' ? 'default' : 'outline'}
                                onClick={() => setMode('progressive')}
                            >
                                Progresywna
                            </Button>
                        </div>

                        {mode === 'fixed' ? (
                            <form onSubmit={handleSaveFixed} className="space-y-3">
                                <div className="grid grid-cols-3 gap-2">
                                    <div className="col-span-2">
                                        <Label htmlFor="fixed-rate">Stawka</Label>
                                        <Input
                                            id="fixed-rate"
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            value={rate}
                                            onChange={(e) => setRate(e.target.value)}
                                            placeholder="np. 250.00"
                                            disabled={savingFixed}
                                            required
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor="fixed-currency">Waluta</Label>
                                        <select
                                            id="fixed-currency"
                                            value={currency}
                                            onChange={(e) => setCurrency(e.target.value as RateCurrency)}
                                            disabled={savingFixed}
                                            className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm"
                                        >
                                            <option value="PLN">PLN</option>
                                            <option value="EUR">EUR</option>
                                            <option value="USD">USD</option>
                                        </select>
                                    </div>
                                </div>
                                <div>
                                    <Label htmlFor="fixed-eff">Obowiązuje od</Label>
                                    <select
                                        id="fixed-eff"
                                        value={effFrom}
                                        onChange={(e) => setEffFrom(e.target.value)}
                                        disabled={savingFixed}
                                        className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm"
                                        required
                                    >
                                        {monthOptions.map((o) => (
                                            <option key={o.value} value={o.value}>
                                                {o.label} (od {o.value})
                                            </option>
                                        ))}
                                    </select>
                                    <p className="mt-1 text-[11px] text-muted-foreground">
                                        Stawka obowiązuje od wybranego miesiąca bezterminowo i zastępuje wszystko, co
                                        było ustawione od tego miesiąca
                                        {target.scheduled_changes_count > 0 && target.next_scheduled_from
                                            ? ` — także ${target.scheduled_changes_count} zaplanowane zmiany (najbliższa od ${target.next_scheduled_from}: ${target.next_scheduled_rate?.toFixed(2) ?? '—'})`
                                            : ''}
                                        .
                                    </p>
                                    {effOffset <= 0 && (
                                        <p className="mt-1 text-[11px] text-warning">
                                            Zmiana {effOffset === 0 ? 'od bieżącego miesiąca' : 'wstecz'} przeliczy
                                            rozliczenie (payroll) za miesiące od {effFrom}.
                                        </p>
                                    )}
                                </div>
                                <div>
                                    <Label htmlFor="fixed-reason">Notatka (opcjonalna)</Label>
                                    <Textarea
                                        id="fixed-reason"
                                        value={reason}
                                        onChange={(e) => setReason(e.target.value)}
                                        placeholder="np. coroczna podwyżka inflacyjna"
                                        rows={2}
                                        maxLength={500}
                                        disabled={savingFixed}
                                    />
                                </div>
                                <div className="flex justify-end">
                                    <Button type="submit" disabled={savingFixed}>
                                        {savingFixed && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                        Zapisz stawkę
                                    </Button>
                                </div>
                            </form>
                        ) : (
                            <RateProgressionGrid
                                userId={target.user_id}
                                currentRate={target.current_rate}
                                currentCurrency={target.current_currency}
                                onSaved={() => {
                                    refreshDirectory()
                                    onOpenChange(false)
                                }}
                            />
                        )}
                    </section>

                    <div className="border-t border-border/40" />

                    {/* ─── Copy progression ───────────────────────────────── */}
                    <section className="space-y-2">
                        <h3 className="text-sm font-semibold">Skopiuj progresję od pracownika</h3>
                        <div className="flex items-end gap-2">
                            <div className="flex-1">
                                <Label htmlFor="copy-from" className="sr-only">
                                    Pracownik źródłowy
                                </Label>
                                <select
                                    id="copy-from"
                                    value={copyFrom}
                                    onChange={(e) => {
                                        setCopyFrom(e.target.value)
                                        setPreview(null)
                                    }}
                                    disabled={previewing || applyingCopy}
                                    className="block w-full rounded-md border bg-background px-3 py-2 text-sm"
                                >
                                    <option value="">— wybierz pracownika —</option>
                                    {copyCandidates.map((emp) => (
                                        <option key={emp.user_id} value={emp.user_id}>
                                            {(emp.full_name ?? emp.email) + (emp.is_progressive ? ' • progresja' : '')}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={handlePreviewCopy}
                                disabled={!copyFrom || previewing || applyingCopy}
                            >
                                {previewing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                Podgląd
                            </Button>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                            Kopiuje przyszłe miesiące progresji źródłowego pracownika (dopisywanie). Miesiące
                            kolidujące z istniejącym harmonogramem są pomijane.
                        </p>

                        {preview && (preview.applied.length > 0 || preview.skipped.length > 0) && (
                            <div className="rounded-lg border border-border p-3 space-y-2 text-xs">
                                {preview.applied.length > 0 && (
                                    <div>
                                        <div className="font-medium text-success mb-1">
                                            Do zastosowania ({preview.applied.length}):
                                        </div>
                                        <ul className="space-y-0.5">
                                            {preview.applied.map((a) => (
                                                <li key={a.effective_from} className="font-mono tabular-nums">
                                                    {a.effective_from}: {a.hourly_rate.toFixed(2)}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                                {preview.skipped.length > 0 && (
                                    <div>
                                        <div className="font-medium text-warning mb-1">
                                            Pominięte ({preview.skipped.length}):
                                        </div>
                                        <ul className="space-y-0.5">
                                            {preview.skipped.map((s) => (
                                                <li key={`${s.effective_from}-${s.reason}`} className="font-mono tabular-nums">
                                                    {s.effective_from}: {s.hourly_rate.toFixed(2)} — {SKIP_REASON_PL[s.reason]}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                                {preview.applied.length > 0 && (
                                    <div className="flex justify-end pt-1">
                                        <Button type="button" onClick={handleApplyCopy} disabled={applyingCopy}>
                                            {applyingCopy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                            Zastosuj kopię
                                        </Button>
                                    </div>
                                )}
                            </div>
                        )}
                    </section>
                </div>
            </DialogContent>
        </Dialog>
    )
}
