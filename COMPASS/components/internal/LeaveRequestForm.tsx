'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Paperclip, UserCheck, Mail } from 'lucide-react'
import { toast } from '@/lib/toast'
import { toastSuccess } from '@/lib/toast-success'
import {
    createLeaveRequest,
    listEligibleSubstitutes,
    previewLeaveSplit,
    uploadLeaveProof,
    type EligibleSubstitute,
    type LeaveSplitPreview,
    type LeaveType,
} from '@/lib/actions/internal-leave'

const LEAVE_TYPES: ReadonlyArray<{ value: LeaveType; label: string; needsDocs?: boolean; uopOnly?: boolean }> = [
    { value: 'vacation', label: 'Urlop wypoczynkowy' },
    // Phase 29: pozostałe typy poniżej są UoP-only (B2B/zlecenie mają tylko 'vacation').
    { value: 'on_demand', label: 'Urlop na żądanie', uopOnly: true },
    { value: 'occasional', label: 'Urlop okolicznościowy', needsDocs: true, uopOnly: true },
    { value: 'childcare', label: 'Opieka nad dzieckiem (art. 188)', uopOnly: true },
    { value: 'care_leave', label: 'Urlop opiekuńczy', uopOnly: true },
    { value: 'force_majeure', label: 'Siła wyższa', uopOnly: true },
    { value: 'sick_leave', label: 'L4 / chorobowe', needsDocs: true, uopOnly: true },
    { value: 'maternity', label: 'Urlop macierzyński', uopOnly: true },
    { value: 'paternity', label: 'Urlop ojcowski', uopOnly: true },
    { value: 'parental_leave', label: 'Urlop rodzicielski', uopOnly: true },
    { value: 'childrearing', label: 'Urlop wychowawczy', uopOnly: true },
    { value: 'unpaid_leave', label: 'Urlop bezpłatny', uopOnly: true },
    { value: 'blood_donation', label: 'Krwiodawstwo', uopOnly: true },
    { value: 'training', label: 'Urlop szkoleniowy', uopOnly: true },
    // Odbiór dnia za święto przypadające w dzień wolny (Kodeks pracy art. 130 §2).
    { value: 'holiday_in_lieu', label: 'Odbiór dnia za święto', uopOnly: true },
    { value: 'other', label: 'Inne', uopOnly: true },
]

interface LeaveRequestFormProps {
    /**
     * Czy zalogowany pracownik jest na UoP. Gdy true — widzi pełny katalog
     * 16 typów statutowych. Gdy false (B2B/zlecenie) — tylko 'vacation'
     * (Phase 29).
     */
    isUop?: boolean
    /**
     * Phase 30 — czy pracownik ma ustawioną pulę płatnych urlopów. Włącza
     * live preview "X z puli + Y bezpłatne" dla vacation/on_demand.
     */
    hasPool?: boolean
}

export function LeaveRequestForm({ isUop = false, hasPool = false }: LeaveRequestFormProps) {
    const router = useRouter()
    const [pending, startTransition] = useTransition()
    const [leaveType, setLeaveType] = useState<LeaveType>('vacation')
    const [startDate, setStartDate] = useState<string>('')
    const [endDate, setEndDate] = useState<string>('')
    const [halfDay, setHalfDay] = useState<'' | 'morning' | 'afternoon'>('')
    const [note, setNote] = useState<string>('')
    const [docUrl, setDocUrl] = useState<string>('')
    const [docFile, setDocFile] = useState<File | null>(null)
    const [uploadingDoc, setUploadingDoc] = useState(false)
    // Phase 25 — substitute + OOF
    const [substituteId, setSubstituteId] = useState<string>('')
    const [oofInternal, setOofInternal] = useState<string>('')
    const [oofExternal, setOofExternal] = useState<string>('')
    const [showOofAdvanced, setShowOofAdvanced] = useState(false)
    const [substitutes, setSubstitutes] = useState<EligibleSubstitute[]>([])

    useEffect(() => {
        let cancelled = false
        listEligibleSubstitutes()
            .then((data) => {
                if (!cancelled) setSubstitutes(data)
            })
            .catch(() => {
                // brak listy substytów nie blokuje formularza
            })
        return () => {
            cancelled = true
        }
    }, [])

    // Phase 30 — live preview płatny/bezpłatny (debounce 350ms).
    // Tylko gdy user ma pulę i typ to vacation/on_demand.
    const [splitPreview, setSplitPreview] = useState<LeaveSplitPreview | null>(null)
    const [previewLoading, setPreviewLoading] = useState(false)
    const isPoolType = leaveType === 'vacation' || leaveType === 'on_demand'
    useEffect(() => {
        if (!hasPool || !isPoolType || !startDate || !endDate || endDate < startDate) {
            setSplitPreview(null)
            return
        }
        setPreviewLoading(true)
        const handler = setTimeout(() => {
            previewLeaveSplit({
                startDate,
                endDate,
                halfDay: (startDate === endDate && halfDay) ? halfDay : null,
                leaveType,
            })
                .then((p) => setSplitPreview(p))
                .catch(() => setSplitPreview(null))
                .finally(() => setPreviewLoading(false))
        }, 350)
        return () => {
            clearTimeout(handler)
            setPreviewLoading(false)
        }
    }, [hasPool, isPoolType, startDate, endDate, halfDay, leaveType])

    const showHalfDay = startDate && endDate && startDate === endDate
    const showDocsField = LEAVE_TYPES.find((t) => t.value === leaveType)?.needsDocs ?? false

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (!startDate || !endDate) {
            toast.error('Podaj zakres dat.')
            return
        }
        if (endDate < startDate) {
            toast.error('Data końca nie może być wcześniejsza niż początek.')
            return
        }

        startTransition(async () => {
            try {
                // H2.4: jeśli wybrany plik, najpierw upload do storage
                let finalDocUrl: string | null = docUrl || null
                if (docFile) {
                    setUploadingDoc(true)
                    try {
                        const fd = new FormData()
                        fd.append('file', docFile)
                        const upRes = await uploadLeaveProof(fd)
                        finalDocUrl = upRes.path
                    } finally {
                        setUploadingDoc(false)
                    }
                }

                const res = await createLeaveRequest({
                    startDate,
                    endDate,
                    leaveType,
                    halfDay: showHalfDay && halfDay ? halfDay : null,
                    note: note || null,
                    documentationUrl: finalDocUrl,
                    substituteId: substituteId || null,
                    oofInternalMessage: oofInternal.trim() || null,
                    oofExternalMessage: oofExternal.trim() || null,
                })
                toastSuccess(
                    res.autoApproved
                        ? 'Wniosek L4 zaakceptowany automatycznie. Pamiętaj o dosłaniu zwolnienia w ciągu 7 dni.'
                        : 'Wniosek złożony. Czeka na akceptację admina. Po akceptacji ustawimy Out of Office w Outlook.',
                )
                setStartDate('')
                setEndDate('')
                setNote('')
                setDocUrl('')
                setDocFile(null)
                setHalfDay('')
                setSubstituteId('')
                setOofInternal('')
                setOofExternal('')
                setShowOofAdvanced(false)
                router.refresh()
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Nieznany błąd')
            }
        })
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Nowy wniosek</CardTitle>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="leave_type">Typ wniosku</Label>
                        <select
                            id="leave_type"
                            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            value={leaveType}
                            onChange={(e) => setLeaveType(e.target.value as LeaveType)}
                        >
                            {LEAVE_TYPES.filter((t) => !t.uopOnly || isUop).map((t) => (
                                <option key={t.value} value={t.value}>
                                    {t.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="start_date">Od</Label>
                            <Input
                                id="start_date"
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                required
                                className="min-h-[44px] text-base"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="end_date">Do</Label>
                            <Input
                                id="end_date"
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                required
                                className="min-h-[44px] text-base"
                            />
                        </div>
                    </div>

                    {showHalfDay && (
                        <div className="space-y-1.5">
                            <Label htmlFor="half_day">Połowa dnia (opcjonalnie)</Label>
                            <select
                                id="half_day"
                                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                                value={halfDay}
                                onChange={(e) => setHalfDay(e.target.value as '' | 'morning' | 'afternoon')}
                            >
                                <option value="">Cały dzień</option>
                                <option value="morning">Pierwsza połowa</option>
                                <option value="afternoon">Druga połowa</option>
                            </select>
                        </div>
                    )}

                    {/* Phase 30 — live preview podziału płatny/bezpłatny dla pracownika z pulą. */}
                    {hasPool && isPoolType && (splitPreview || previewLoading) && (
                        <PoolSplitPreview preview={splitPreview} loading={previewLoading} />
                    )}

                    {showDocsField && (
                        <>
                            <div className="space-y-1.5">
                                <Label htmlFor="doc_file" className="flex items-center gap-1.5">
                                    <Paperclip className="w-3.5 h-3.5" />
                                    Załącz skan zwolnienia (PDF/JPG, max 5 MB)
                                </Label>
                                <Input
                                    id="doc_file"
                                    type="file"
                                    accept="application/pdf,image/jpeg,image/png,image/webp"
                                    onChange={(e) => setDocFile(e.target.files?.[0] ?? null)}
                                />
                                {docFile && (
                                    <p className="text-[11px] text-muted-foreground">
                                        Wybrany: {docFile.name} ({(docFile.size / 1024).toFixed(0)} KB)
                                    </p>
                                )}
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="doc_url">…lub podaj link (opcjonalnie)</Label>
                                <Input
                                    id="doc_url"
                                    type="url"
                                    placeholder="https://drive.google.com/…"
                                    value={docUrl}
                                    onChange={(e) => setDocUrl(e.target.value)}
                                    disabled={!!docFile}
                                />
                            </div>
                        </>
                    )}

                    <div className="space-y-1.5">
                        <Label htmlFor="substitute" className="flex items-center gap-1.5">
                            <UserCheck className="w-3.5 h-3.5" />
                            Zastępca (opcjonalnie)
                        </Label>
                        <select
                            id="substitute"
                            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                            value={substituteId}
                            onChange={(e) => setSubstituteId(e.target.value)}
                        >
                            <option value="">— bez zastępcy —</option>
                            {substitutes.map((s) => (
                                <option key={s.id} value={s.id}>
                                    {s.full_name ?? s.email} ({s.email})
                                </option>
                            ))}
                        </select>
                        {substituteId && (
                            <p className="text-[11px] text-muted-foreground">
                                Zastępca dostanie email z informacją + zostanie wpisany w auto-reply
                                Outlook. Po akceptacji Twoja przychodząca poczta będzie też
                                kopiowana do zastępcy na czas urlopu (oryginały zostają w Twojej
                                skrzynce).
                            </p>
                        )}
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="note">Notatka (opcjonalna)</Label>
                        <Textarea
                            id="note"
                            rows={3}
                            maxLength={500}
                            placeholder="Powód lub dodatkowe informacje…"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                        />
                    </div>

                    <div className="space-y-1.5">
                        <button
                            type="button"
                            onClick={() => setShowOofAdvanced((v) => !v)}
                            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5"
                        >
                            <Mail className="w-3.5 h-3.5" />
                            {showOofAdvanced ? '− Ukryj tekst Out of Office' : '+ Dostosuj tekst Out of Office (opcjonalne)'}
                        </button>
                        {showOofAdvanced && (
                            <div className="space-y-3 pl-4 border-l border-border/30">
                                <div className="space-y-1">
                                    <Label htmlFor="oof_internal" className="text-xs">
                                        Auto-reply dla nadawców z b2bnetwork.pl
                                    </Label>
                                    <Textarea
                                        id="oof_internal"
                                        rows={3}
                                        maxLength={2000}
                                        placeholder="Domyślnie: 'Jestem nieobecny do DD-MM. W pilnych sprawach prosimy o kontakt z [zastępca].'"
                                        value={oofInternal}
                                        onChange={(e) => setOofInternal(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor="oof_external" className="text-xs">
                                        Auto-reply dla zewnętrznych nadawców
                                    </Label>
                                    <Textarea
                                        id="oof_external"
                                        rows={3}
                                        maxLength={2000}
                                        placeholder="Jak wyżej — zostaw puste, aby użyć tej samej treści."
                                        value={oofExternal}
                                        onChange={(e) => setOofExternal(e.target.value)}
                                    />
                                </div>
                                <p className="text-[11px] text-muted-foreground">
                                    Jeśli zostawisz puste, system wygeneruje dwujęzyczny PL+EN tekst z datą
                                    powrotu i (jeśli wybrany) emailem zastępcy.
                                </p>
                            </div>
                        )}
                    </div>

                    <Button type="submit" disabled={pending || uploadingDoc} className="w-full sm:w-auto min-h-[44px]">
                        {(pending || uploadingDoc) && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                        {uploadingDoc ? 'Wgrywam załącznik…' : 'Złóż wniosek'}
                    </Button>
                </form>
            </CardContent>
        </Card>
    )
}

// Phase 30 — banner pokazujący auto-split płatny/bezpłatny przy składaniu wniosku.
function PoolSplitPreview({ preview, loading }: { preview: LeaveSplitPreview | null; loading: boolean }) {
    if (loading) {
        return (
            <div className="rounded-md border border-border/10 bg-card/5 px-3 py-2 text-xs text-muted-foreground inline-flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" />
                Liczę pulę…
            </div>
        )
    }
    if (!preview || preview.workingDays === 0) return null

    const { paid, unpaid, workingDays, remainingBefore, remainingAfter, entitlementDays } = preview
    const allPaid = paid > 0 && unpaid === 0
    const partial = paid > 0 && unpaid > 0
    const allUnpaid = paid === 0 && unpaid > 0

    const cls = allPaid
        ? 'border-success/30 bg-success/5 text-success'
        : partial
            ? 'border-warning/30 bg-warning/5 text-warning'
            : 'border-destructive/30 bg-destructive/5 text-destructive'

    const icon = allPaid ? '✓' : partial ? '⚠' : '✗'

    return (
        <div className={`rounded-md border px-3 py-2 text-xs ${cls}`}>
            <div className="font-medium">
                {icon} Wniosek {workingDays} {workingDays === 1 ? 'dzień roboczy' : 'dni roboczych'}:{' '}
                {paid > 0 && <span>{paid} płatnych (z puli)</span>}
                {partial && <span> + </span>}
                {unpaid > 0 && <span>{unpaid} bezpłatnych</span>}
            </div>
            <div className="mt-0.5 text-muted-foreground">
                Pula {entitlementDays} dni · pozostało{' '}
                <span className="text-foreground">{remainingBefore?.toFixed(1)}</span>
                {remainingAfter != null && (
                    <>
                        {' → '}
                        <span className={`${(remainingAfter ?? 0) <= 0 ? 'text-warning' : 'text-foreground'}`}>
                            {remainingAfter.toFixed(1)} po złożeniu
                        </span>
                    </>
                )}
                {allUnpaid && ' (pula wyczerpana)'}
            </div>
        </div>
    )
}
