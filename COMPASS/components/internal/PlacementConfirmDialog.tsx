'use client'

// Phase 28 follow-up — edit-before-generate at 168h confirmation.
// Clicking "168h" no longer generates the DL + recruiter bonuses straight away. Instead this
// dialog opens pre-filled with the computed payout for all recipients (separately, like the
// manual "Przypisz premię" form) so the manager can adjust amount / month / reason / notes,
// or skip any recipient, before bonuses are created and notifications are sent.

import { useMemo, useState, useTransition } from 'react'
import { Loader2, CheckCircle2, TrendingUp, UserPlus } from 'lucide-react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { confirmPlacementHours } from '@/lib/actions/placements'
import {
    bonusPeriodFromEligibleDate,
    defaultDlBonusReason,
    defaultRecruiterBonusReason,
    type ConfirmPlacementHoursOverrides,
    type PlacementBonusOverride,
    type PlacementWithBonusStatus,
} from '@/lib/types/placement'
import {
    BONUS_MAX_AMOUNT,
    BONUS_MIN_AMOUNT,
    BONUS_MONTHS_PL,
    BONUS_NOTES_MAX_LENGTH,
    BONUS_PERIOD_MAX_MONTHS_BACK,
    BONUS_REASON_MAX_LENGTH,
    BONUS_REASON_MIN_LENGTH,
} from '@/lib/types/bonus'

interface Props {
    placement: PlacementWithBonusStatus | null
    onClose: () => void
    onConfirmed: () => void
}

interface PeriodOption {
    key: string
    year: number
    month: number
    label: string
}

function pln(n: number | string): string {
    return `${Number(n).toLocaleString('pl-PL')} zł`
}

/**
 * Period dropdown = last 12 months + current, guaranteeing the placement's eligible month
 * is selectable even when it falls outside that window (a future month for an early confirm,
 * or an older one for a late confirm).
 *
 * `now` is the browser's local clock, so the window edge can differ by a day from Warsaw
 * near midnight. That's intentionally tolerated here: the list is only a convenience, the
 * eligible month is always present via `ensure`, and the server (authoritative) does not
 * restrict the period at all — so a boundary-day skew never blocks a valid confirmation.
 */
function buildPeriodOptions(ensure: { year: number; month: number }): PeriodOption[] {
    const now = new Date()
    const raw: Array<{ year: number; month: number }> = []
    for (let i = BONUS_PERIOD_MAX_MONTHS_BACK; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        raw.push({ year: d.getFullYear(), month: d.getMonth() + 1 })
    }
    if (!raw.some((o) => o.year === ensure.year && o.month === ensure.month)) {
        raw.push(ensure)
    }
    return raw
        .sort((a, b) => a.year - b.year || a.month - b.month)
        .map((o) => ({
            key: `${o.year}-${o.month}`,
            year: o.year,
            month: o.month,
            label: `${BONUS_MONTHS_PL[o.month - 1]} ${o.year}`,
        }))
}

/** One editable bonus draft (shared shape for DL + recruiter cards). */
interface Draft {
    amount: string
    periodKey: string
    reason: string
    notes: string
}

function parseDraft(d: Draft): PlacementBonusOverride | { error: string } {
    const amount = Number(d.amount)
    if (!Number.isFinite(amount) || amount < BONUS_MIN_AMOUNT) {
        return { error: `Kwota musi być >= ${BONUS_MIN_AMOUNT}.` }
    }
    if (amount > BONUS_MAX_AMOUNT) {
        return { error: `Kwota za duża (max ${BONUS_MAX_AMOUNT}).` }
    }
    const reason = d.reason.trim()
    if (reason.length < BONUS_REASON_MIN_LENGTH) {
        return { error: `Uzasadnienie min ${BONUS_REASON_MIN_LENGTH} znaki.` }
    }
    if (reason.length > BONUS_REASON_MAX_LENGTH) {
        return { error: `Uzasadnienie max ${BONUS_REASON_MAX_LENGTH} znaków.` }
    }
    const notes = d.notes.trim()
    if (notes.length > BONUS_NOTES_MAX_LENGTH) {
        return { error: `Notatka max ${BONUS_NOTES_MAX_LENGTH} znaków.` }
    }
    const [yearStr, monthStr] = d.periodKey.split('-')
    return {
        amount,
        reason,
        periodYear: Number(yearStr),
        periodMonth: Number(monthStr),
        notes: notes || null,
    }
}

/** Inner form — remounted per placement (via key) so each open starts from fresh prefill. */
function ConfirmForm({ placement, onClose, onConfirmed }: { placement: PlacementWithBonusStatus } & Omit<Props, 'placement'>) {
    const [pending, startTransition] = useTransition()

    const eligible = useMemo(
        () => bonusPeriodFromEligibleDate(placement.bonus_eligible_date),
        [placement.bonus_eligible_date],
    )
    const periodOptions = useMemo(() => buildPeriodOptions(eligible), [eligible])
    const defaultPeriodKey = `${eligible.year}-${eligible.month}`

    const createDlDraft = (): Draft => ({
        amount: Number(placement.dl_bonus_amount).toFixed(2),
        periodKey: defaultPeriodKey,
        reason: defaultDlBonusReason(
            placement.consultant_name,
            placement.client_name,
            Number(placement.monthly_margin),
        ),
        notes: '',
    })
    const additionalDlRecipient =
        placement.additional_dl_recipient_id && placement.additional_dl_recipient_name
            ? {
                id: placement.additional_dl_recipient_id,
                name: placement.additional_dl_recipient_name,
            }
            : null

    const [dl, setDl] = useState<Draft>(createDlDraft)
    const [additionalDl, setAdditionalDl] = useState<Draft>(createDlDraft)
    const [rec, setRec] = useState<Draft>({
        amount: Number(placement.recruiter_bonus_amount).toFixed(2),
        periodKey: defaultPeriodKey,
        reason: defaultRecruiterBonusReason(
            placement.consultant_name,
            placement.client_name,
            placement.recruiter_tier,
            Number(placement.margin_per_hour),
        ),
        notes: '',
    })
    const [generateDlBonus, setGenerateDlBonus] = useState(true)
    const [generateAdditionalDlBonus, setGenerateAdditionalDlBonus] = useState(additionalDlRecipient !== null)
    const [generateRecruiterBonus, setGenerateRecruiterBonus] = useState(true)
    const selectedBonusCount =
        Number(generateDlBonus) +
        Number(additionalDlRecipient !== null && generateAdditionalDlBonus) +
        Number(generateRecruiterBonus)

    function submit() {
        if (selectedBonusCount === 0) {
            toast.error('Wybierz co najmniej jedną premię do naliczenia.')
            return
        }

        let dlOverride: PlacementBonusOverride | null = null
        if (generateDlBonus) {
            const parsed = parseDraft(dl)
            if ('error' in parsed) {
                toast.error(`Premia DL: ${parsed.error}`)
                return
            }
            dlOverride = parsed
        }

        let additionalDlOverride: PlacementBonusOverride | null = null
        if (additionalDlRecipient && generateAdditionalDlBonus) {
            const parsed = parseDraft(additionalDl)
            if ('error' in parsed) {
                toast.error(`Premia DL dla ${additionalDlRecipient.name}: ${parsed.error}`)
                return
            }
            additionalDlOverride = parsed
        }

        let recruiterOverride: PlacementBonusOverride | null = null
        if (generateRecruiterBonus) {
            const parsed = parseDraft(rec)
            if ('error' in parsed) {
                toast.error(`Premia rekrutera: ${parsed.error}`)
                return
            }
            recruiterOverride = parsed
        }

        const overrides: ConfirmPlacementHoursOverrides = {
            dl: dlOverride,
            ...(additionalDlRecipient ? { additionalDl: additionalDlOverride } : {}),
            recruiter: recruiterOverride,
        }
        startTransition(async () => {
            try {
                const result = await confirmPlacementHours(placement.id, overrides)
                if (!result.success) {
                    toast.error(result.error)
                    return
                }
                toast.success(
                    selectedBonusCount === 1
                        ? 'Potwierdzono 168h — wybrana premia została naliczona.'
                        : `Potwierdzono 168h — ${selectedBonusCount} premie zostały naliczone.`,
                )
                onConfirmed()
            } catch {
                toast.error('Nie udało się potwierdzić 168h. Spróbuj ponownie.')
            }
        })
    }

    return (
        <>
            <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5" /> Potwierdź 168h i przypisz premie
                </DialogTitle>
                <DialogDescription>
                    {placement.consultant_name} @ {placement.client_name}. Sprawdź dane i odznacz premię,
                    której nie chcesz naliczać. Dopiero potwierdzenie utworzy wybrane premie i wyśle
                    powiadomienia.
                </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
                <BonusCard
                    icon={<TrendingUp className="h-4 w-4" />}
                    heading="Premia Delivery Lead"
                    recipientLabel="Delivery Lead"
                    recipientName={placement.delivery_lead_raw}
                    basis={`Klient: ${placement.client_name} · Konsultant: ${placement.consultant_name} · Marża mies.: ${pln(placement.monthly_margin)} · 10% z marży`}
                    draft={dl}
                    setDraft={setDl}
                    periodOptions={periodOptions}
                    selected={generateDlBonus}
                    onSelectedChange={setGenerateDlBonus}
                    disabled={pending}
                />
                {additionalDlRecipient ? (
                    <BonusCard
                        icon={<TrendingUp className="h-4 w-4" />}
                        heading={`Premia Delivery Lead — ${additionalDlRecipient.name}`}
                        recipientLabel="Delivery Lead (dodatkowy odbiorca)"
                        recipientName={additionalDlRecipient.name}
                        basis={`Klient: ${placement.client_name} · Konsultant: ${placement.consultant_name} · Marża mies.: ${pln(placement.monthly_margin)} · 10% z marży`}
                        draft={additionalDl}
                        setDraft={setAdditionalDl}
                        periodOptions={periodOptions}
                        selected={generateAdditionalDlBonus}
                        onSelectedChange={setGenerateAdditionalDlBonus}
                        disabled={pending}
                    />
                ) : null}
                <BonusCard
                    icon={<UserPlus className="h-4 w-4" />}
                    heading="Premia rekrutera"
                    recipientLabel="Rekruter"
                    recipientName={placement.recruiter_raw}
                    basis={`Klient: ${placement.client_name} · Konsultant: ${placement.consultant_name} · Marża/h: ${Number(placement.margin_per_hour)} zł/h · próg ${placement.recruiter_tier}`}
                    draft={rec}
                    setDraft={setRec}
                    periodOptions={periodOptions}
                    selected={generateRecruiterBonus}
                    onSelectedChange={setGenerateRecruiterBonus}
                    disabled={pending}
                />
            </div>

            <DialogFooter>
                {selectedBonusCount === 0 ? (
                    <p className="mr-auto self-center text-sm text-destructive" role="alert">
                        Wybierz co najmniej jedną premię.
                    </p>
                ) : null}
                <Button variant="ghost" onClick={onClose} disabled={pending}>
                    Anuluj
                </Button>
                <Button onClick={submit} disabled={pending || selectedBonusCount === 0} className="gap-2">
                    {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    {selectedBonusCount === 0
                        ? 'Wybierz premię'
                        : selectedBonusCount === 1
                            ? 'Generuj wybraną premię'
                            : `Generuj ${selectedBonusCount} premie`}
                </Button>
            </DialogFooter>
        </>
    )
}

interface BonusCardProps {
    icon: React.ReactNode
    heading: string
    recipientLabel: string
    recipientName: string
    basis: string
    draft: Draft
    setDraft: React.Dispatch<React.SetStateAction<Draft>>
    periodOptions: PeriodOption[]
    selected: boolean
    onSelectedChange: (selected: boolean) => void
    disabled: boolean
}

function BonusCard({
    icon,
    heading,
    recipientLabel,
    recipientName,
    basis,
    draft,
    setDraft,
    periodOptions,
    selected,
    onSelectedChange,
    disabled,
}: BonusCardProps) {
    const idBase = heading.replace(/\s+/g, '-').toLowerCase()
    return (
        <div className={cn('rounded-lg border bg-muted/20 p-4 space-y-3', !selected && 'border-dashed bg-muted/40')}>
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                    {icon} {heading}
                </div>
                <div className="flex items-center gap-2">
                    <Checkbox
                        id={`${idBase}-selected`}
                        checked={selected}
                        onCheckedChange={(checked) => onSelectedChange(checked === true)}
                        disabled={disabled}
                        aria-label={`Nalicz premię: ${heading}`}
                    />
                    <Label htmlFor={`${idBase}-selected`} className="cursor-pointer text-sm font-medium">
                        Nalicz tę premię
                    </Label>
                </div>
            </div>

            {!selected ? (
                <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground" role="status">
                    Premia dla {recipientName} nie zostanie naliczona, a odbiorca nie dostanie powiadomienia.
                </p>
            ) : (
                <>
                    <div>
                        <Label>Odbiorca ({recipientLabel})</Label>
                        <div className="mt-1 rounded-md border bg-background px-3 py-2 text-sm" aria-readonly="true">
                            {recipientName}
                        </div>
                    </div>

                    <p className="text-[11px] text-muted-foreground">{basis}</p>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Label htmlFor={`${idBase}-amount`}>Kwota [PLN]</Label>
                            <Input
                                id={`${idBase}-amount`}
                                type="number"
                                step="0.01"
                                min={BONUS_MIN_AMOUNT}
                                max={BONUS_MAX_AMOUNT}
                                value={draft.amount}
                                onChange={(e) => setDraft((d) => ({ ...d, amount: e.target.value }))}
                                disabled={disabled}
                                required
                            />
                        </div>
                        <div>
                            <Label htmlFor={`${idBase}-period`}>Miesiąc premii</Label>
                            <select
                                id={`${idBase}-period`}
                                value={draft.periodKey}
                                onChange={(e) => setDraft((d) => ({ ...d, periodKey: e.target.value }))}
                                disabled={disabled}
                                className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm"
                                required
                            >
                                {periodOptions.map((p) => (
                                    <option key={p.key} value={p.key}>
                                        {p.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div>
                        <Label htmlFor={`${idBase}-reason`}>Uzasadnienie (widoczne w mailu do pracownika)</Label>
                        <Textarea
                            id={`${idBase}-reason`}
                            value={draft.reason}
                            onChange={(e) => setDraft((d) => ({ ...d, reason: e.target.value }))}
                            disabled={disabled}
                            required
                            rows={2}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                            {draft.reason.trim().length}/{BONUS_REASON_MAX_LENGTH} znaków
                        </p>
                    </div>

                    <div>
                        <Label htmlFor={`${idBase}-notes`}>Notatka wewnętrzna (opcjonalna)</Label>
                        <Textarea
                            id={`${idBase}-notes`}
                            value={draft.notes}
                            onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                            disabled={disabled}
                            rows={1}
                            maxLength={BONUS_NOTES_MAX_LENGTH}
                            placeholder="Widoczna dla managera i admina."
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                            {draft.notes.trim().length}/{BONUS_NOTES_MAX_LENGTH} znaków
                        </p>
                    </div>
                </>
            )}
        </div>
    )
}

/**
 * Controlled shell — the parent table opens it by setting `placement` and closes by nulling
 * it. The inner form is keyed by placement id so the prefill resets on every open.
 */
export function PlacementConfirmDialog({ placement, onClose, onConfirmed }: Props) {
    return (
        <Dialog
            open={placement !== null}
            onOpenChange={(o) => {
                if (!o) onClose()
            }}
        >
            <DialogContent className="max-w-2xl">
                {placement && (
                    <ConfirmForm
                        key={placement.id}
                        placement={placement}
                        onClose={onClose}
                        onConfirmed={onConfirmed}
                    />
                )}
            </DialogContent>
        </Dialog>
    )
}
