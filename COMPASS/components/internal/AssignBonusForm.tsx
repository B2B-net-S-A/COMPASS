'use client'

// Phase 23 — initial bonus assign/edit form.
// Phase 26 — uproszczony workflow (assigned), edit limited to amount/reason/notes.
// Phase 27b — 4 kategorie: sales / delivery_lead / recruiter / custom + opcjonalny attachment
//             (PDF/img max 10MB) uploadowany w drugim kroku po INSERT.

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Gift, Paperclip, X, Briefcase, TrendingUp, UserPlus, Sparkles } from 'lucide-react'
import { toast } from '@/lib/toast'
import { toastSuccess } from '@/lib/toast-success'
import {
    assignBonus,
    updateBonus,
    uploadBonusAttachment,
} from '@/lib/actions/internal-bonus'
import { listActiveClients, type ClientRow } from '@/lib/actions/internal-clients'
import type {
    AssignBonusInput,
    BonusCategory,
    BonusRow,
    EligibleEmployeeForBonus,
} from '@/lib/types/bonus'
import {
    BONUS_MIN_AMOUNT,
    BONUS_MAX_AMOUNT,
    BONUS_REASON_MIN_LENGTH,
    BONUS_REASON_MAX_LENGTH,
    BONUS_PERIOD_MAX_MONTHS_BACK,
    BONUS_MONTHS_PL,
    BONUS_CATEGORIES_PL,
    BONUS_ATTACHMENT_MAX_BYTES,
    BONUS_ATTACHMENT_ALLOWED_MIME,
    BONUS_CUSTOM_MEMO_MAX_LENGTH,
    recruiterTierForMargin,
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
    onSuccess?: (updated?: BonusRow) => void
    onCancel?: () => void
    compact?: boolean
    /** Persist unsent input to localStorage so an accidental close/reload doesn't wipe it (assign mode only). */
    persistDraft?: boolean
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

// Phase 31 — AssignBonusForm obsługuje 4 standardowe kategorie. Champions League
// ma osobny form (AssignChampionsLeagueForm) — tu wykluczamy go z typu CATEGORY_ICON
// i z dropdown'a tabów (zobacz filter w renderze).
type StandardBonusCategory = Exclude<BonusCategory, 'champions_league'>

const CATEGORY_ICON: Record<StandardBonusCategory, React.ComponentType<{ className?: string }>> = {
    sales: Briefcase,
    delivery_lead: TrendingUp,
    recruiter: UserPlus,
    custom: Sparkles,
}

// Phase 27e — persist unsent assign-form input so an accidental close (or reload)
// doesn't wipe a half-filled form. Text fields only; the File attachment can't be
// serialized and is intentionally not persisted.
const BONUS_DRAFT_KEY = 'compass:bonus-assign-draft:v1'

interface BonusDraft {
    recipientId: string
    periodKey: string
    amount: string
    currency: string
    reason: string
    notes: string
    category: BonusCategory
    clientName: string
    clientIsOther: boolean
    salesServiceDescription: string
    deliveryCandidate: string
    deliveryMarginAmount: string
    deliveryMarginPercent: string
    recruiterMargin: string
    recruiterCandidate: string
    customMemo: string
}

function readBonusDraft(): BonusDraft | null {
    if (typeof window === 'undefined') return null
    try {
        const raw = window.localStorage.getItem(BONUS_DRAFT_KEY)
        return raw ? (JSON.parse(raw) as BonusDraft) : null
    } catch {
        return null
    }
}

function clearBonusDraft(): void {
    if (typeof window === 'undefined') return
    try {
        window.localStorage.removeItem(BONUS_DRAFT_KEY)
    } catch {
        // best-effort
    }
}

// Whether a draft holds anything worth restoring (used to decide save-vs-remove
// and whether to surface the "restored" banner). Defaults like currency=PLN are ignored.
function bonusDraftHasContent(d: BonusDraft | null): boolean {
    if (!d) return false
    return Boolean(
        d.recipientId ||
            d.amount ||
            d.reason?.trim() ||
            d.notes?.trim() ||
            d.clientName ||
            d.salesServiceDescription ||
            d.deliveryCandidate ||
            d.deliveryMarginAmount ||
            d.recruiterMargin ||
            d.recruiterCandidate ||
            d.customMemo,
    )
}

export function AssignBonusForm({
    mode = 'assign',
    candidates,
    prefilledRecipientId,
    prefilled,
    onSuccess,
    onCancel,
    compact = false,
    persistDraft = false,
}: Props) {
    const router = useRouter()
    const [pending, startTransition] = useTransition()

    const periodOptions = useMemo(() => {
        const opts = buildPeriodOptions()
        // Phase 32 — w trybie edycji zapewnij, że bieżący miesiąc premii jest na liście,
        // nawet jeśli wypadł poza standardowe okno (ostatnie 12 mies. + bieżący).
        if (
            prefilled &&
            !opts.some((o) => o.year === prefilled.period_year && o.month === prefilled.period_month)
        ) {
            opts.unshift({
                year: prefilled.period_year,
                month: prefilled.period_month,
                label: `${BONUS_MONTHS_PL[prefilled.period_month - 1]} ${prefilled.period_year}`,
            })
        }
        return opts
    }, [prefilled])
    const defaultPeriodKey = useMemo(() => {
        if (prefilled) return `${prefilled.period_year}-${prefilled.period_month}`
        const now = new Date()
        return `${now.getFullYear()}-${now.getMonth() + 1}`
    }, [prefilled])

    const isEdit = mode === 'edit'
    const draftEnabled = persistDraft && !isEdit

    // Read any persisted draft exactly once on mount (assign mode only).
    const [initialDraft] = useState<BonusDraft | null>(() =>
        draftEnabled ? readBonusDraft() : null,
    )
    const [draftRestored, setDraftRestored] = useState<boolean>(() =>
        bonusDraftHasContent(initialDraft),
    )

    // Core state — seeded from the persisted draft when present, else prefilled/defaults.
    const [recipientId, setRecipientId] = useState<string>(
        initialDraft?.recipientId ?? prefilledRecipientId ?? prefilled?.id ?? '',
    )
    const [periodKey, setPeriodKey] = useState<string>(initialDraft?.periodKey ?? defaultPeriodKey)
    const [amount, setAmount] = useState<string>(
        initialDraft?.amount ?? (prefilled ? String(prefilled.amount.toFixed(2)) : ''),
    )
    const [currency, setCurrency] = useState<string>(
        initialDraft?.currency ?? prefilled?.currency ?? 'PLN',
    )
    const [reason, setReason] = useState<string>(initialDraft?.reason ?? prefilled?.reason ?? '')
    const [notes, setNotes] = useState<string>(initialDraft?.notes ?? prefilled?.notes ?? '')

    // Phase 27b — category state (only for assign mode). Phase 31: typu StandardBonusCategory
    // (Exclude<BonusCategory, 'champions_league'>) — CL ma osobny form, więc tu nigdy nie zaistnieje.
    const draftCategory = initialDraft?.category
    const initialCategory: StandardBonusCategory =
        draftCategory && draftCategory !== 'champions_league' ? draftCategory : 'custom'
    const [category, setCategory] = useState<StandardBonusCategory>(initialCategory)
    // Phase 27d — shared client (sales/delivery/recruiter) + clients list
    const [clientName, setClientName] = useState<string>(initialDraft?.clientName ?? '')
    const [clientIsOther, setClientIsOther] = useState<boolean>(initialDraft?.clientIsOther ?? false)
    const [clients, setClients] = useState<ClientRow[]>([])
    const [clientsLoaded, setClientsLoaded] = useState<boolean>(false)
    // Sales
    const [salesServiceDescription, setSalesServiceDescription] = useState<string>(
        initialDraft?.salesServiceDescription ?? '',
    )
    // Delivery (Phase 27d: candidate free-text replaces consultant dropdown)
    const [deliveryCandidate, setDeliveryCandidate] = useState<string>(
        initialDraft?.deliveryCandidate ?? '',
    )
    const [deliveryMarginAmount, setDeliveryMarginAmount] = useState<string>(
        initialDraft?.deliveryMarginAmount ?? '',
    )
    const [deliveryMarginPercent, setDeliveryMarginPercent] = useState<string>(
        initialDraft?.deliveryMarginPercent ?? '10.00',
    )
    // Recruiter
    const [recruiterMargin, setRecruiterMargin] = useState<string>(initialDraft?.recruiterMargin ?? '')
    const [recruiterCandidate, setRecruiterCandidate] = useState<string>(
        initialDraft?.recruiterCandidate ?? '',
    )
    // Custom
    const [customMemo, setCustomMemo] = useState<string>(initialDraft?.customMemo ?? '')
    // Attachment (any category) — not persisted (File can't be serialized).
    const [attachment, setAttachment] = useState<File | null>(null)

    const recipientLocked = isEdit || !!prefilledRecipientId
    // Phase 32 — miesiąc edytowalny także po przypisaniu (finanse/admin koryguje błędny okres).
    // AssignBonusForm obsługuje wyłącznie premie standardowe; Champions League (okres kwartalny)
    // edytuje się osobnym formularzem, więc tu period zawsze dotyczy zwykłej premii miesięcznej.
    const periodLocked = false

    const recipientName = useMemo(() => {
        if (prefilled?.recipient_full_name) return prefilled.recipient_full_name
        const match = candidates.find((c) => c.user_id === recipientId)
        return match?.full_name ?? match?.email ?? null
    }, [candidates, recipientId, prefilled])

    // Phase 27d — lazy-load active clients when a client-bearing category is selected
    useEffect(() => {
        if (isEdit) return
        if (category === 'custom') return
        if (clientsLoaded) return
        let cancelled = false
        listActiveClients()
            .then((data) => {
                if (!cancelled) {
                    setClients(data)
                    setClientsLoaded(true)
                }
            })
            .catch((err) => {
                if (!cancelled) {
                    toast.error(err instanceof Error ? err.message : 'Błąd ładowania klientów')
                    setClientsLoaded(true)
                }
            })
        return () => {
            cancelled = true
        }
    }, [category, clientsLoaded, isEdit])

    // Phase 27b — auto-calc Delivery amount when margin or percent changes
    useEffect(() => {
        if (isEdit) return
        if (category !== 'delivery_lead') return
        const m = Number(deliveryMarginAmount)
        const p = Number(deliveryMarginPercent)
        if (Number.isFinite(m) && m > 0 && Number.isFinite(p) && p >= 0) {
            const calc = Math.round(m * p) / 100
            setAmount(calc.toFixed(2))
        }
    }, [deliveryMarginAmount, deliveryMarginPercent, category, isEdit])

    // Phase 27b — auto-calc Recruiter amount from margin tier
    const recruiterTier = useMemo(() => {
        const m = Number(recruiterMargin)
        return Number.isFinite(m) ? recruiterTierForMargin(m) : null
    }, [recruiterMargin])

    useEffect(() => {
        if (isEdit) return
        if (category !== 'recruiter') return
        if (recruiterTier) {
            setAmount(recruiterTier.bonus.toFixed(2))
        }
    }, [recruiterTier, category, isEdit])

    // Phase 27e — persist the draft on every change (assign mode only). When the form
    // is pristine/empty we remove the key instead, so reset/submit leaves no stale draft.
    useEffect(() => {
        if (!draftEnabled) return
        const draft: BonusDraft = {
            recipientId,
            periodKey,
            amount,
            currency,
            reason,
            notes,
            category,
            clientName,
            clientIsOther,
            salesServiceDescription,
            deliveryCandidate,
            deliveryMarginAmount,
            deliveryMarginPercent,
            recruiterMargin,
            recruiterCandidate,
            customMemo,
        }
        try {
            if (bonusDraftHasContent(draft)) {
                window.localStorage.setItem(BONUS_DRAFT_KEY, JSON.stringify(draft))
            } else {
                window.localStorage.removeItem(BONUS_DRAFT_KEY)
            }
        } catch {
            // best-effort (quota / private mode)
        }
    }, [
        draftEnabled,
        recipientId,
        periodKey,
        amount,
        currency,
        reason,
        notes,
        category,
        clientName,
        clientIsOther,
        salesServiceDescription,
        deliveryCandidate,
        deliveryMarginAmount,
        deliveryMarginPercent,
        recruiterMargin,
        recruiterCandidate,
        customMemo,
    ])

    function resetForm() {
        if (isEdit) return
        if (draftEnabled) clearBonusDraft()
        if (!prefilledRecipientId) setRecipientId('')
        setPeriodKey(defaultPeriodKey)
        setAmount('')
        setCurrency('PLN')
        setReason('')
        setNotes('')
        setCategory('custom')
        setClientName('')
        setClientIsOther(false)
        setSalesServiceDescription('')
        setDeliveryCandidate('')
        setDeliveryMarginAmount('')
        setDeliveryMarginPercent('10.00')
        setRecruiterMargin('')
        setRecruiterCandidate('')
        setCustomMemo('')
        setAttachment(null)
    }

    function validateAttachmentFile(file: File): string | null {
        if (file.size === 0) return 'Plik jest pusty.'
        if (file.size > BONUS_ATTACHMENT_MAX_BYTES) {
            return `Plik za duży (max ${BONUS_ATTACHMENT_MAX_BYTES / 1024 / 1024} MB).`
        }
        const mime = file.type || 'application/octet-stream'
        if (!BONUS_ATTACHMENT_ALLOWED_MIME.includes(mime as (typeof BONUS_ATTACHMENT_ALLOWED_MIME)[number])) {
            return `Niedozwolony typ pliku (${mime}). Dozwolone: PDF, JPG, PNG, WEBP.`
        }
        return null
    }

    function handleAttachmentChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) {
            setAttachment(null)
            return
        }
        const err = validateAttachmentFile(file)
        if (err) {
            toast.error(err)
            e.target.value = ''
            return
        }
        setAttachment(file)
    }

    function buildAssignInput(): AssignBonusInput | { error: string } {
        if (!recipientId) return { error: 'Wybierz pracownika.' }
        const amountNum = Number(amount)
        if (!Number.isFinite(amountNum) || amountNum < BONUS_MIN_AMOUNT) {
            return { error: `Kwota musi być >= ${BONUS_MIN_AMOUNT}.` }
        }
        if (amountNum > BONUS_MAX_AMOUNT) {
            return { error: `Kwota za duża (max ${BONUS_MAX_AMOUNT}).` }
        }
        const reasonTrimmed = reason.trim()
        if (reasonTrimmed.length < BONUS_REASON_MIN_LENGTH) {
            return { error: `Uzasadnienie min ${BONUS_REASON_MIN_LENGTH} znaki.` }
        }
        if (reasonTrimmed.length > BONUS_REASON_MAX_LENGTH) {
            return { error: `Uzasadnienie max ${BONUS_REASON_MAX_LENGTH} znaków.` }
        }
        const [periodYearStr, periodMonthStr] = periodKey.split('-')
        const periodYear = Number(periodYearStr)
        const periodMonth = Number(periodMonthStr)

        const base = {
            recipient_user_id: recipientId,
            period_year: periodYear,
            period_month: periodMonth,
            amount: amountNum,
            currency,
            reason: reasonTrimmed,
            notes: notes.trim() || null,
        }

        const client = clientName.trim()

        switch (category) {
            case 'sales': {
                const desc = salesServiceDescription.trim()
                if (client.length < 2) return { error: 'Wybierz lub wpisz klienta (min 2 znaki).' }
                if (desc.length < 3) return { error: 'Opis usługi: minimum 3 znaki.' }
                return {
                    category: 'sales',
                    ...base,
                    client_name: client,
                    sales_service_description: desc,
                }
            }
            case 'delivery_lead': {
                if (client.length < 2) return { error: 'Wybierz lub wpisz klienta (min 2 znaki).' }
                const candidate = deliveryCandidate.trim()
                if (candidate.length < 3) {
                    return { error: 'Imię i nazwisko kandydata: minimum 3 znaki.' }
                }
                const m = Number(deliveryMarginAmount)
                if (!Number.isFinite(m) || m <= 0) {
                    return { error: 'Marża miesięczna musi być > 0.' }
                }
                const p = Number(deliveryMarginPercent)
                if (!Number.isFinite(p) || p < 0 || p > 100) {
                    return { error: 'Procent premii musi być w zakresie 0-100.' }
                }
                return {
                    category: 'delivery_lead',
                    ...base,
                    client_name: client,
                    delivery_candidate_name: candidate,
                    delivery_margin_amount: m,
                    delivery_margin_percent: p,
                }
            }
            case 'recruiter': {
                if (client.length < 2) return { error: 'Wybierz lub wpisz klienta (min 2 znaki).' }
                const m = Number(recruiterMargin)
                if (!Number.isFinite(m) || m < 0) {
                    return { error: 'Marża rekrutera (PLN/h) musi być >= 0.' }
                }
                const candidate = recruiterCandidate.trim()
                if (candidate.length < 3) {
                    return { error: 'Imię i nazwisko kandydata: minimum 3 znaki.' }
                }
                return {
                    category: 'recruiter',
                    ...base,
                    client_name: client,
                    recruiter_margin_per_hour: m,
                    recruiter_candidate_name: candidate,
                }
            }
            case 'custom': {
                const memo = customMemo.trim()
                if (memo.length < 1) {
                    return { error: 'Memo opisujące premię niestandardową jest wymagane.' }
                }
                if (memo.length > BONUS_CUSTOM_MEMO_MAX_LENGTH) {
                    return { error: `Memo za długie (max ${BONUS_CUSTOM_MEMO_MAX_LENGTH} znaków).` }
                }
                return {
                    category: 'custom',
                    ...base,
                    custom_email_memo: memo,
                }
            }
        }
    }

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault()

        if (isEdit && prefilled) {
            // Edit path: amount/reason/notes + miesiąc (Phase 32). Kategoria i odbiorca immutable per DB trigger.
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
            const [editYearStr, editMonthStr] = periodKey.split('-')
            const editPeriodYear = Number(editYearStr)
            const editPeriodMonth = Number(editMonthStr)
            startTransition(async () => {
                try {
                    const updated = await updateBonus({
                        id: prefilled.id,
                        amount: amountNum,
                        reason: reasonTrimmed,
                        notes: notes.trim() || null,
                        period_year: editPeriodYear,
                        period_month: editPeriodMonth,
                    })
                    toastSuccess('Premia zaktualizowana.')
                    router.refresh()
                    onSuccess?.(updated)
                } catch (err) {
                    toast.error(err instanceof Error ? err.message : 'Nieznany błąd.')
                }
            })
            return
        }

        // Assign path: discriminated union + optional attachment upload.
        const built = buildAssignInput()
        if ('error' in built) {
            toast.error(built.error)
            return
        }

        startTransition(async () => {
            try {
                const inserted = await assignBonus(built)
                if (attachment) {
                    try {
                        await uploadBonusAttachment(inserted.id, attachment)
                    } catch (uploadErr) {
                        toast.error(
                            `Premia zapisana, ale upload załącznika nie powiódł się: ${
                                uploadErr instanceof Error ? uploadErr.message : 'błąd'
                            }`,
                        )
                    }
                }
                toastSuccess(
                    recipientName
                        ? `Premia ${BONUS_CATEGORIES_PL[built.category]} przypisana: ${recipientName}.`
                        : `Premia ${BONUS_CATEGORIES_PL[built.category]} przypisana.`,
                )
                resetForm()
                router.refresh()
                onSuccess?.()
            } catch (err) {
                toast.error(err instanceof Error ? err.message : 'Nieznany błąd.')
            }
        })
    }

    // Explicit cancel = discard the draft. Other close paths (X button, reload)
    // intentionally keep it so the form can be resumed on reopen.
    function handleCancel() {
        if (draftEnabled) clearBonusDraft()
        onCancel?.()
    }

    const title = isEdit ? 'Edytuj premię' : 'Przypisz premię'
    const submitLabel = isEdit ? 'Zapisz zmiany' : 'Przypisz premię'

    const categoryPicker = !isEdit && (
        <div>
            <Label>Kategoria premii</Label>
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
                {/* Phase 31 — pomiń champions_league; ma osobny form (AssignChampionsLeagueForm). */}
                {(Object.keys(BONUS_CATEGORIES_PL) as BonusCategory[])
                    .filter((cat): cat is StandardBonusCategory => cat !== 'champions_league')
                    .map((cat) => {
                    const Icon = CATEGORY_ICON[cat]
                    const active = category === cat
                    return (
                        <button
                            key={cat}
                            type="button"
                            disabled={pending}
                            onClick={() => setCategory(cat)}
                            className={`rounded-md border px-3 py-3 text-xs font-medium flex flex-col items-center gap-1 transition-colors ${
                                active
                                    ? 'border-primary bg-primary/10 text-primary'
                                    : 'border-border bg-background hover:bg-muted/30'
                            }`}
                        >
                            <Icon className="h-4 w-4" />
                            {BONUS_CATEGORIES_PL[cat]}
                        </button>
                    )
                })}
            </div>
        </div>
    )

    // Phase 27d — shared client dropdown (active clients + "Inny" → free text).
    const clientSelectField = (
        <div>
            <Label htmlFor="bonus-client">Klient</Label>
            <select
                id="bonus-client"
                value={clientIsOther ? '__other__' : clientName}
                onChange={(e) => {
                    const v = e.target.value
                    if (v === '__other__') {
                        setClientIsOther(true)
                        setClientName('')
                    } else {
                        setClientIsOther(false)
                        setClientName(v)
                    }
                }}
                disabled={pending || !clientsLoaded}
                className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm"
                required={!clientIsOther}
            >
                <option value="">{clientsLoaded ? '— wybierz klienta —' : 'Ładowanie…'}</option>
                {clients.map((c) => (
                    <option key={c.id} value={c.name}>
                        {c.name}
                    </option>
                ))}
                <option value="__other__">Inny (wpisz ręcznie)…</option>
            </select>
            {clientIsOther && (
                <Input
                    className="mt-2"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    disabled={pending}
                    required
                    placeholder="Wpisz nazwę klienta"
                />
            )}
        </div>
    )

    const salesFields = !isEdit && category === 'sales' && (
        <>
            {clientSelectField}
            <div>
                <Label htmlFor="sales-service">Opis usługi</Label>
                <Textarea
                    id="sales-service"
                    value={salesServiceDescription}
                    onChange={(e) => setSalesServiceDescription(e.target.value)}
                    disabled={pending}
                    required
                    rows={2}
                    placeholder="np. Wdrożenie modułu RODO + szkolenie wewnętrzne."
                />
            </div>
        </>
    )

    const deliveryFields = !isEdit && category === 'delivery_lead' && (
        <>
            {clientSelectField}
            <div>
                <Label htmlFor="delivery-candidate">Kandydat (imię i nazwisko)</Label>
                <Input
                    id="delivery-candidate"
                    value={deliveryCandidate}
                    onChange={(e) => setDeliveryCandidate(e.target.value)}
                    disabled={pending}
                    required
                    placeholder="np. Jan Kowalski"
                />
            </div>
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <Label htmlFor="delivery-margin">Marża miesięczna [PLN]</Label>
                    <Input
                        id="delivery-margin"
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={deliveryMarginAmount}
                        onChange={(e) => setDeliveryMarginAmount(e.target.value)}
                        disabled={pending}
                        required
                        placeholder="np. 8400.00"
                    />
                </div>
                <div>
                    <Label htmlFor="delivery-percent">Procent premii [%]</Label>
                    <Input
                        id="delivery-percent"
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        value={deliveryMarginPercent}
                        onChange={(e) => setDeliveryMarginPercent(e.target.value)}
                        disabled={pending}
                        required
                    />
                </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
                Kwota auto-liczona: {deliveryMarginAmount && deliveryMarginPercent
                    ? `${Number(deliveryMarginAmount).toFixed(2)} × ${Number(deliveryMarginPercent).toFixed(2)}% = ${(Math.round(Number(deliveryMarginAmount) * Number(deliveryMarginPercent)) / 100).toFixed(2)} PLN`
                    : '—'}
                . Możesz nadpisać w polu Kwota poniżej.
            </p>
        </>
    )

    const recruiterFields = !isEdit && category === 'recruiter' && (
        <>
            {clientSelectField}
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <Label htmlFor="recruiter-margin">Marża [PLN/h]</Label>
                    <Input
                        id="recruiter-margin"
                        type="number"
                        step="0.01"
                        min="0"
                        value={recruiterMargin}
                        onChange={(e) => setRecruiterMargin(e.target.value)}
                        disabled={pending}
                        required
                        placeholder="np. 45.00"
                    />
                </div>
                <div>
                    <Label>Próg / proponowana premia</Label>
                    <div className="mt-1 text-sm rounded-md border bg-muted/30 px-3 py-2 min-h-[40px] flex items-center">
                        {recruiterTier ? (
                            <span>
                                Próg {recruiterTier.label} →{' '}
                                <strong>{recruiterTier.bonus.toLocaleString('pl-PL')} PLN</strong>
                            </span>
                        ) : (
                            <span className="text-muted-foreground text-xs">Podaj marżę</span>
                        )}
                    </div>
                </div>
            </div>
            <div>
                <Label htmlFor="recruiter-candidate">Imię i nazwisko kandydata</Label>
                <Input
                    id="recruiter-candidate"
                    value={recruiterCandidate}
                    onChange={(e) => setRecruiterCandidate(e.target.value)}
                    disabled={pending}
                    required
                    placeholder="np. Jan Kowalski"
                />
            </div>
        </>
    )

    const customFields = !isEdit && category === 'custom' && (
        <div>
            <Label htmlFor="custom-memo">Memo / podkładka</Label>
            <Textarea
                id="custom-memo"
                value={customMemo}
                onChange={(e) => setCustomMemo(e.target.value)}
                disabled={pending}
                required
                rows={3}
                placeholder="Wyjaśnij za co i dlaczego ta premia. Możesz też dodać załącznik poniżej."
            />
            <p className="text-xs text-muted-foreground mt-1">
                {customMemo.trim().length}/{BONUS_CUSTOM_MEMO_MAX_LENGTH} znaków
            </p>
        </div>
    )

    const attachmentField = !isEdit && (
        <div>
            <Label htmlFor="bonus-attachment">Załącznik (opcjonalny, PDF / JPG / PNG / WEBP, max 10 MB)</Label>
            <div className="mt-1 flex items-center gap-2">
                <Input
                    id="bonus-attachment"
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                    onChange={handleAttachmentChange}
                    disabled={pending}
                    className="flex-1"
                />
                {attachment && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                            setAttachment(null)
                            const input = document.getElementById('bonus-attachment') as HTMLInputElement | null
                            if (input) input.value = ''
                        }}
                        disabled={pending}
                    >
                        <X className="h-3.5 w-3.5" />
                    </Button>
                )}
            </div>
            {attachment && (
                <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                    <Paperclip className="h-3 w-3" />
                    {attachment.name} ({(attachment.size / 1024).toFixed(1)} KB)
                </p>
            )}
        </div>
    )

    const formBody = (
        <form onSubmit={handleSubmit} className="space-y-4">
            {draftRestored && (
                <div className="flex items-center justify-between gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
                    <span>Przywrócono niewysłane dane z poprzedniej próby.</span>
                    <button
                        type="button"
                        onClick={() => {
                            resetForm()
                            setDraftRestored(false)
                        }}
                        className="font-medium underline hover:no-underline"
                    >
                        Wyczyść
                    </button>
                </div>
            )}
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

            {categoryPicker}
            {salesFields}
            {deliveryFields}
            {recruiterFields}
            {customFields}

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

            {attachmentField}

            <div className="flex items-center justify-end gap-2 pt-2">
                {onCancel && (
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={handleCancel}
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
