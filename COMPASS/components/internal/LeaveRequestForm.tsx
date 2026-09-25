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
    previewOofMessages,
    uploadLeaveProof,
    type EligibleSubstitute,
    type LeaveSplitPreview,
    type LeaveType,
    type OofMessagesPreview,
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
    // Phase 41c — opt-in na przekazywanie poczty. Domyślnie wyłączone.
    const [forwardMail, setForwardMail] = useState(false)

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

    // Phase 53 — live preview domyślnej automatycznej odpowiedzi (debounce 350ms).
    // Ten sam builder co przy akceptacji wniosku, więc podgląd nigdy nie kłamie.
    const [oofPreview, setOofPreview] = useState<OofMessagesPreview | null>(null)
    useEffect(() => {
        if (!showOofAdvanced || !startDate || !endDate || endDate < startDate) {
            setOofPreview(null)
            return
        }
        const handler = setTimeout(() => {
            previewOofMessages({
                startDate,
                endDate,
                halfDay: startDate === endDate && halfDay ? halfDay : null,
                substituteId: substituteId || null,
            })
                .then((p) => {
                    // Deploy-skew guard: stary bundle + nowa akcja może zwrócić undefined.
                    if (p && typeof p.internal === 'string') setOofPreview(p)
                    else setOofPreview(null)
                })
                .catch(() => setOofPreview(null))
        }, 350)
        return () => clearTimeout(handler)
    }, [showOofAdvanced, startDate, endDate, halfDay, substituteId])

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
            // H2.4: jeśli wybrany plik, najpierw upload do storage
            let finalDocUrl: string | null = docUrl || null
            if (docFile) {
                setUploadingDoc(true)
                try {
                    const fd = new FormData()
                    fd.append('file', docFile)
                    const upRes = await uploadLeaveProof(fd)
                    if (!upRes?.success) {
                        toast.error(upRes?.error ?? 'Nie udało się wgrać załącznika.')
                        return
                    }
                    finalDocUrl = upRes.data.path
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
                forwardMail: Boolean(substituteId) && forwardMail,
            })
            if (!res?.success) {
                toast.error(res?.error ?? 'Nie udało się złożyć wniosku.')
                return
            }
            toastSuccess(
                res.data.autoApproved
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
            setForwardMail(false)
            router.refresh()
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
                                Outlook.
                            </p>
                        )}
                    </div>

                    {/*
                      Phase 41c — przekazywanie poczty jest osobną, świadomą zgodą.
                      Wskazanie zastępcy samo w sobie znaczy tylko tyle, że jego nazwisko
                      trafi do auto-reply; oddanie mu wglądu w skrzynkę to inna decyzja.
                    */}
                    {substituteId && (
                        <div className="rounded-md border p-3 space-y-1.5">
                            <label className="flex items-start gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="mt-0.5"
                                    checked={forwardMail}
                                    onChange={(e) => setForwardMail(e.target.checked)}
                                />
                                <span className="text-sm font-medium">
                                    Przekazuj moją pocztę do zastępcy na czas urlopu
                                </span>
                            </label>
                            <p className="text-[11px] text-muted-foreground pl-6">
                                Zastępca dostanie kopię wiadomości od osób spoza firmy (klienci,
                                kandydaci), wysłanych bezpośrednio do Ciebie między pierwszym
                                a ostatnim dniem urlopu — oryginały zostają u Ciebie. Maile od
                                współpracowników, zaproszenia na spotkania i powiadomienia
                                automatyczne (Teams, noreply) nie są przekazywane. Możesz to
                                wyłączyć w każdej chwili, także w trakcie urlopu, na liście
                                swoich wniosków.
                            </p>
                        </div>
                    )}

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
                                        placeholder="Zostaw puste, aby użyć domyślnej treści — podgląd poniżej."
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
                                        placeholder="Zostaw puste, aby użyć domyślnej treści — podgląd poniżej."
                                        value={oofExternal}
                                        onChange={(e) => setOofExternal(e.target.value)}
                                    />
                                </div>
                                <p className="text-[11px] text-muted-foreground">
                                    Puste pola = treść domyślna: wewnętrzna po polsku, zewnętrzna
                                    PL + EN, z datą powrotu (pierwszy dzień roboczy) i kontaktem na
                                    czas nieobecności (zastępca, a bez zastępcy — Twój manager).
                                </p>
                                {oofPreview && (
                                    <div className="space-y-2">
                                        {!oofPreview.willSetOof && (
                                            <p className="text-[11px] text-amber-600 dark:text-amber-500">
                                                Dla jednodniowego urlopu na pół dnia automatyczna
                                                odpowiedź nie zostanie ustawiona — jesteś w pracy
                                                przez część dnia.
                                            </p>
                                        )}
                                        <div className="space-y-1">
                                            <p className="text-[11px] font-medium text-muted-foreground">
                                                Podgląd domyślnej odpowiedzi — nadawcy z b2bnetwork.pl
                                            </p>
                                            <div
                                                className="rounded-md border border-border/40 bg-muted/30 p-3 text-xs leading-relaxed [&_p]:mb-1.5 [&_p:last-child]:mb-0 [&_hr]:my-2 [&_hr]:border-border/40"
                                                // Własny szablon z oof-template.ts — wszystkie
                                                // interpolacje przechodzą przez escapeHtml.
                                                dangerouslySetInnerHTML={{ __html: oofPreview.internal }}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-[11px] font-medium text-muted-foreground">
                                                Podgląd domyślnej odpowiedzi — nadawcy zewnętrzni
                                            </p>
                                            <div
                                                className="rounded-md border border-border/40 bg-muted/30 p-3 text-xs leading-relaxed [&_p]:mb-1.5 [&_p:last-child]:mb-0 [&_hr]:my-2 [&_hr]:border-border/40"
                                                dangerouslySetInnerHTML={{ __html: oofPreview.external }}
                                            />
                                        </div>
                                    </div>
                                )}
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
