'use client'

// Phase 31 — Champions League (premia kwartalna, manualna).
// Dedykowany, mały form (oddzielony od 1000-liniowego AssignBonusForm).
// Wspiera mode 'assign' (full form) i 'edit' (tylko amount/reason/notes — period/place immutable).

import { useEffect, useMemo, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Trophy } from 'lucide-react'
import { toast } from '@/lib/toast'
import { toastSuccess } from '@/lib/toast-success'
import { assignBonus, updateBonus } from '@/lib/actions/internal-bonus'
import type {
    AssignBonusInputChampionsLeague,
    BonusRow,
    ChampionsLeagueRank,
    EligibleEmployeeForBonus,
    Quarter,
} from '@/lib/types/bonus'
import {
    BONUS_MIN_AMOUNT,
    BONUS_MAX_AMOUNT,
    BONUS_REASON_MIN_LENGTH,
    BONUS_REASON_MAX_LENGTH,
    BONUS_QUARTERS_PL,
    CHAMPIONS_LEAGUE_AMOUNTS,
    CHAMPIONS_LEAGUE_MAX_QUARTERS_BACK,
    CHAMPIONS_LEAGUE_PLACE_LABELS_PL,
    championsLeagueAmountForPlace,
} from '@/lib/types/bonus'

export type ChampionsLeagueFormMode = 'assign' | 'edit'

interface PrefilledEdit {
    id: string
    amount: number
    currency: string
    reason: string
    notes?: string | null
    period_year: number
    period_quarter: Quarter
    place_rank: ChampionsLeagueRank
    recipient_full_name?: string | null
}

interface Props {
    mode?: ChampionsLeagueFormMode
    candidates: EligibleEmployeeForBonus[]
    prefilled?: PrefilledEdit
    onSuccess?: (updated?: BonusRow) => void
    onCancel?: () => void
}

interface QuarterOption {
    year: number
    quarter: Quarter
    label: string
}

function buildQuarterOptions(): QuarterOption[] {
    const now = new Date()
    const currentYear = now.getUTCFullYear()
    const currentMonth = now.getUTCMonth() + 1
    const currentQuarter = Math.ceil(currentMonth / 3) as Quarter

    const options: QuarterOption[] = []
    // Past CHAMPIONS_LEAGUE_MAX_QUARTERS_BACK + current quarter, newest first.
    for (let offset = 0; offset <= CHAMPIONS_LEAGUE_MAX_QUARTERS_BACK; offset++) {
        const targetIdx = currentYear * 4 + currentQuarter - offset
        const year = Math.floor((targetIdx - 1) / 4)
        const quarter = (((targetIdx - 1) % 4) + 1) as Quarter
        options.push({
            year,
            quarter,
            label: `${BONUS_QUARTERS_PL[quarter - 1]} ${year}`,
        })
    }
    return options
}

export function AssignChampionsLeagueForm({
    mode = 'assign',
    candidates,
    prefilled,
    onSuccess,
    onCancel,
}: Props) {
    const isEdit = mode === 'edit'
    const quarterOptions = useMemo(buildQuarterOptions, [])
    const defaultQuarter = quarterOptions[0]

    const [recipientId, setRecipientId] = useState<string>(candidates[0]?.user_id ?? '')
    const [periodYear, setPeriodYear] = useState<number>(prefilled?.period_year ?? defaultQuarter.year)
    const [periodQuarter, setPeriodQuarter] = useState<Quarter>(
        prefilled?.period_quarter ?? defaultQuarter.quarter,
    )
    const [placeRank, setPlaceRank] = useState<ChampionsLeagueRank>(prefilled?.place_rank ?? 1)
    const [amount, setAmount] = useState<string>(
        prefilled
            ? String(prefilled.amount)
            : String(championsLeagueAmountForPlace(1)),
    )
    const [reason, setReason] = useState<string>(prefilled?.reason ?? '')
    const [notes, setNotes] = useState<string>(prefilled?.notes ?? '')
    const [pending, startTransition] = useTransition()

    // Auto-prefill amount gdy zmienia się miejsce (tylko assign mode i tylko gdy user
    // nie nadpisał ręcznie — sprawdzamy że current amount = default jakiegoś miejsca).
    useEffect(() => {
        if (isEdit) return
        const defaults = Object.values(CHAMPIONS_LEAGUE_AMOUNTS).map(String)
        if (defaults.includes(amount)) {
            setAmount(String(championsLeagueAmountForPlace(placeRank)))
        }
    }, [placeRank, isEdit, amount])

    function handleQuarterChange(value: string) {
        const opt = quarterOptions.find((o) => `${o.year}-${o.quarter}` === value)
        if (opt) {
            setPeriodYear(opt.year)
            setPeriodQuarter(opt.quarter)
        }
    }

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault()

        const parsedAmount = Number(amount)
        if (!Number.isFinite(parsedAmount) || parsedAmount < BONUS_MIN_AMOUNT) {
            toast.error(`Kwota musi być >= ${BONUS_MIN_AMOUNT}.`)
            return
        }
        if (parsedAmount > BONUS_MAX_AMOUNT) {
            toast.error(`Kwota za duża (max ${BONUS_MAX_AMOUNT}).`)
            return
        }
        const trimmedReason = reason.trim()
        if (trimmedReason.length < BONUS_REASON_MIN_LENGTH) {
            toast.error(`Uzasadnienie min. ${BONUS_REASON_MIN_LENGTH} znaki.`)
            return
        }
        if (trimmedReason.length > BONUS_REASON_MAX_LENGTH) {
            toast.error(`Uzasadnienie za długie (max ${BONUS_REASON_MAX_LENGTH}).`)
            return
        }

        if (isEdit && prefilled) {
            startTransition(async () => {
                try {
                    const updated = await updateBonus({
                        id: prefilled.id,
                        amount: parsedAmount,
                        reason: trimmedReason,
                        notes: notes.trim() || null,
                    })
                    toastSuccess('Premia Champions League zaktualizowana.')
                    onSuccess?.(updated)
                } catch (err) {
                    const msg = err instanceof Error ? err.message : 'Nie udało się zapisać.'
                    toast.error(msg)
                }
            })
            return
        }

        if (!recipientId) {
            toast.error('Wybierz pracownika.')
            return
        }

        const input: AssignBonusInputChampionsLeague = {
            category: 'champions_league',
            recipient_user_id: recipientId,
            period_year: periodYear,
            period_quarter: periodQuarter,
            place_rank: placeRank,
            amount: parsedAmount,
            currency: 'PLN',
            reason: trimmedReason,
            notes: notes.trim() || null,
        }

        startTransition(async () => {
            try {
                await assignBonus(input)
                toastSuccess(`🏆 Champions League ${BONUS_QUARTERS_PL[periodQuarter - 1]} ${periodYear} przypisana — pracownik dostał email.`)
                onSuccess?.()
            } catch (err) {
                const msg = err instanceof Error ? err.message : 'Nie udało się przypisać premii.'
                toast.error(msg)
            }
        })
    }

    const ranks: ChampionsLeagueRank[] = [1, 2, 3]
    const recipientLabel = prefilled?.recipient_full_name ?? (
        candidates.find((c) => c.user_id === recipientId)?.full_name ?? '—'
    )

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            {/* Pracownik (recipient) */}
            <div className="space-y-1.5">
                <Label htmlFor="cl-recipient">Pracownik</Label>
                {isEdit ? (
                    <div className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
                        {recipientLabel}
                        <span className="ml-2 text-xs">(nie można zmienić)</span>
                    </div>
                ) : (
                    <select
                        id="cl-recipient"
                        value={recipientId}
                        onChange={(e) => setRecipientId(e.target.value)}
                        required
                        className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm"
                    >
                        <option value="">— wybierz —</option>
                        {candidates.map((c) => (
                            <option key={c.user_id} value={c.user_id}>
                                {c.full_name ?? c.email} ({c.email})
                            </option>
                        ))}
                    </select>
                )}
            </div>

            {/* Kwartał */}
            <div className="space-y-1.5">
                <Label htmlFor="cl-quarter">Kwartał</Label>
                {isEdit ? (
                    <div className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
                        {BONUS_QUARTERS_PL[periodQuarter - 1]} {periodYear}
                        <span className="ml-2 text-xs">(nie można zmienić)</span>
                    </div>
                ) : (
                    <select
                        id="cl-quarter"
                        value={`${periodYear}-${periodQuarter}`}
                        onChange={(e) => handleQuarterChange(e.target.value)}
                        className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm"
                    >
                        {quarterOptions.map((o) => (
                            <option key={`${o.year}-${o.quarter}`} value={`${o.year}-${o.quarter}`}>
                                {o.label}
                            </option>
                        ))}
                    </select>
                )}
            </div>

            {/* Miejsce (1/2/3) */}
            <div className="space-y-1.5">
                <Label>Miejsce</Label>
                {isEdit ? (
                    <div className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
                        {CHAMPIONS_LEAGUE_PLACE_LABELS_PL[placeRank]}
                        <span className="ml-2 text-xs">(nie można zmienić)</span>
                    </div>
                ) : (
                    <div className="grid grid-cols-3 gap-2">
                        {ranks.map((rank) => {
                            const active = placeRank === rank
                            return (
                                <button
                                    key={rank}
                                    type="button"
                                    onClick={() => setPlaceRank(rank)}
                                    className={`rounded-md border px-3 py-2 text-sm transition ${
                                        active
                                            ? 'border-warning/60 bg-warning/15 text-warning'
                                            : 'border-border bg-muted text-muted-foreground hover:border-border'
                                    }`}
                                >
                                    <div className="text-lg">{CHAMPIONS_LEAGUE_PLACE_LABELS_PL[rank].split(' ')[0]}</div>
                                    <div className="text-xs">
                                        {rank}. miejsce
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                        {CHAMPIONS_LEAGUE_AMOUNTS[rank]} PLN
                                    </div>
                                </button>
                            )
                        })}
                    </div>
                )}
            </div>

            {/* Kwota (editable z prefillem) */}
            <div className="space-y-1.5">
                <Label htmlFor="cl-amount">Kwota (PLN)</Label>
                <Input
                    id="cl-amount"
                    type="number"
                    step="0.01"
                    min={BONUS_MIN_AMOUNT}
                    max={BONUS_MAX_AMOUNT}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                />
                {!isEdit && Number(amount) !== championsLeagueAmountForPlace(placeRank) && (
                    <p className="text-xs text-warning">
                        ⚠ Nadpisałeś domyślną kwotę ({championsLeagueAmountForPlace(placeRank)} PLN dla {placeRank}. miejsca).
                    </p>
                )}
            </div>

            {/* Uzasadnienie */}
            <div className="space-y-1.5">
                <Label htmlFor="cl-reason">Uzasadnienie</Label>
                <Textarea
                    id="cl-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Krótkie uzasadnienie zwycięstwa (widoczne dla pracownika i w audicie)"
                    rows={3}
                    minLength={BONUS_REASON_MIN_LENGTH}
                    maxLength={BONUS_REASON_MAX_LENGTH}
                    required
                />
            </div>

            {/* Notes (opcjonalne) */}
            <div className="space-y-1.5">
                <Label htmlFor="cl-notes">Notatka (opcjonalna, widoczna tylko dla managera/admina)</Label>
                <Textarea
                    id="cl-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    maxLength={500}
                />
            </div>

            <div className="flex justify-end gap-2 pt-2">
                {onCancel && (
                    <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
                        Wstecz
                    </Button>
                )}
                <Button type="submit" disabled={pending} className="bg-warning/90 hover:bg-warning text-black">
                    {pending ? (
                        <>
                            <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                            {isEdit ? 'Zapisywanie...' : 'Przypisywanie...'}
                        </>
                    ) : (
                        <>
                            <Trophy className="h-3.5 w-3.5 mr-1.5" />
                            {isEdit ? 'Zapisz zmiany' : 'Przypisz Champions League'}
                        </>
                    )}
                </Button>
            </div>
        </form>
    )
}
