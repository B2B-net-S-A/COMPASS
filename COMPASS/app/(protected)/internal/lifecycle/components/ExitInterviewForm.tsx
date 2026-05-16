'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { submitExitInterview } from '@/lib/actions/lifecycle'
import { toast } from '@/lib/toast'
import { toastSuccess } from '@/lib/toast-success'
import type { ExitReason } from '@/lib/types/lifecycle'

const EXIT_REASONS: Array<{ value: ExitReason; label: string }> = [
    { value: 'new_opportunity', label: 'Nowa oferta pracy' },
    { value: 'compensation', label: 'Wynagrodzenie' },
    { value: 'role_misfit', label: 'Niedopasowanie roli' },
    { value: 'management', label: 'Zarządzanie / relacja z managerem' },
    { value: 'work_life_balance', label: 'Work-life balance' },
    { value: 'career_growth', label: 'Rozwój kariery' },
    { value: 'personal', label: 'Powody osobiste' },
    { value: 'other', label: 'Inne' },
]

interface Props {
    interviewId: string
}

export function ExitInterviewForm({ interviewId }: Props) {
    const router = useRouter()
    const [exitReason, setExitReason] = useState<ExitReason | ''>('')
    const [exitReasonDetail, setExitReasonDetail] = useState('')
    const [npsScore, setNpsScore] = useState<number | null>(null)
    const [satTeam, setSatTeam] = useState<number | null>(null)
    const [satManager, setSatManager] = useState<number | null>(null)
    const [satProjects, setSatProjects] = useState<number | null>(null)
    const [wouldRecommend, setWouldRecommend] = useState<boolean | null>(null)
    const [whatWorked, setWhatWorked] = useState('')
    const [whatToImprove, setWhatToImprove] = useState('')
    const [knowledgeNotes, setKnowledgeNotes] = useState('')
    const [isAnonymous, setIsAnonymous] = useState(false)
    const [confirmOpen, setConfirmOpen] = useState(false)
    const [isPending, startTransition] = useTransition()

    function validate(): string | null {
        if (!exitReason) return 'Wybierz powód odejścia.'
        if (npsScore === null) return 'Wybierz NPS (0-10).'
        return null
    }

    function handleConfirmSubmit() {
        const err = validate()
        if (err) {
            toast.error(err)
            return
        }
        startTransition(async () => {
            try {
                await submitExitInterview({
                    interviewId,
                    isAnonymous,
                    exitReason: exitReason as ExitReason,
                    exitReasonDetail: exitReasonDetail.trim() || null,
                    npsScore: npsScore!,
                    satisfactionTeam: satTeam,
                    satisfactionManager: satManager,
                    satisfactionProjects: satProjects,
                    wouldRecommend,
                    whatWorked: whatWorked.trim() || null,
                    whatToImprove: whatToImprove.trim() || null,
                    knowledgeTransferNotes: knowledgeNotes.trim() || null,
                })
                toastSuccess('Dziękujemy! Twoja ankieta została wysłana.')
                router.refresh()
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Błąd przy wysyłaniu ankiety.')
                setConfirmOpen(false)
            }
        })
    }

    return (
        <div className="space-y-6">
            {/* Reason */}
            <fieldset className="rounded-lg border bg-card p-4 space-y-3">
                <legend className="px-2 font-semibold">1. Powód odejścia</legend>
                <select
                    className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                    value={exitReason}
                    onChange={(e) => setExitReason(e.target.value as ExitReason)}
                >
                    <option value="">— Wybierz —</option>
                    {EXIT_REASONS.map((r) => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                </select>
                <textarea
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    rows={3}
                    placeholder="Możesz rozwinąć (opcjonalnie)"
                    value={exitReasonDetail}
                    onChange={(e) => setExitReasonDetail(e.target.value)}
                />
            </fieldset>

            {/* NPS */}
            <fieldset className="rounded-lg border bg-card p-4 space-y-3">
                <legend className="px-2 font-semibold">2. NPS — czy poleciłbyś B2B Network jako pracodawcę? (0-10)</legend>
                <div className="flex flex-wrap gap-2">
                    {Array.from({ length: 11 }, (_, n) => (
                        <button
                            key={n}
                            type="button"
                            onClick={() => setNpsScore(n)}
                            className={`w-10 h-10 rounded border-2 text-sm ${
                                npsScore === n
                                    ? 'border-cyan-400 bg-cyan-400/10 text-cyan-400'
                                    : 'border-muted hover:border-muted-foreground'
                            }`}
                        >
                            {n}
                        </button>
                    ))}
                </div>
            </fieldset>

            {/* Satisfaction */}
            <fieldset className="rounded-lg border bg-card p-4 space-y-3">
                <legend className="px-2 font-semibold">3. Satysfakcja (1-5)</legend>
                <SatisfactionRow label="Zespół" value={satTeam} onChange={setSatTeam} />
                <SatisfactionRow label="Manager" value={satManager} onChange={setSatManager} />
                <SatisfactionRow label="Projekty" value={satProjects} onChange={setSatProjects} />
                <div className="pt-2">
                    <span className="text-sm">Czy poleciłbyś pracę u nas znajomemu?</span>
                    <div className="flex gap-2 mt-1">
                        <button
                            type="button"
                            onClick={() => setWouldRecommend(true)}
                            className={`px-4 py-2 rounded border text-sm ${
                                wouldRecommend === true ? 'border-green-400 bg-green-400/10' : 'border-muted'
                            }`}
                        >
                            Tak
                        </button>
                        <button
                            type="button"
                            onClick={() => setWouldRecommend(false)}
                            className={`px-4 py-2 rounded border text-sm ${
                                wouldRecommend === false ? 'border-red-400 bg-red-400/10' : 'border-muted'
                            }`}
                        >
                            Nie
                        </button>
                    </div>
                </div>
            </fieldset>

            {/* Open text */}
            <fieldset className="rounded-lg border bg-card p-4 space-y-3">
                <legend className="px-2 font-semibold">4. Swobodna wypowiedź (opcjonalnie)</legend>
                <div>
                    <label className="text-xs text-muted-foreground">Co działało dobrze?</label>
                    <textarea
                        className="w-full mt-1 rounded-md border bg-background px-3 py-2 text-sm"
                        rows={3}
                        value={whatWorked}
                        onChange={(e) => setWhatWorked(e.target.value)}
                    />
                </div>
                <div>
                    <label className="text-xs text-muted-foreground">Co możemy poprawić?</label>
                    <textarea
                        className="w-full mt-1 rounded-md border bg-background px-3 py-2 text-sm"
                        rows={3}
                        value={whatToImprove}
                        onChange={(e) => setWhatToImprove(e.target.value)}
                    />
                </div>
                <div>
                    <label className="text-xs text-muted-foreground">Knowledge transfer — notatki dla zespołu</label>
                    <textarea
                        className="w-full mt-1 rounded-md border bg-background px-3 py-2 text-sm"
                        rows={4}
                        placeholder="Najważniejsze projekty, kontakty, dokumentacja — co warto przekazać następcy."
                        value={knowledgeNotes}
                        onChange={(e) => setKnowledgeNotes(e.target.value)}
                    />
                </div>
            </fieldset>

            {/* Anonymity */}
            <fieldset className="rounded-lg border-2 border-amber-400/30 bg-amber-400/5 p-4 space-y-2">
                <label className="flex items-center gap-2 text-sm">
                    <input
                        type="checkbox"
                        checked={isAnonymous}
                        onChange={(e) => setIsAnonymous(e.target.checked)}
                        className="h-4 w-4"
                    />
                    <span><strong>Wyślij anonimowo</strong></span>
                </label>
                <p className="text-xs text-muted-foreground pl-6">
                    Anonimowo: Twoje imię i nazwisko nie zostanie zapisane. TCM będzie widzieć Twoje odpowiedzi tylko jako część agregowanych danych (rola, staż, powód odejścia).
                    {' '}Domyślnie ankieta jest podpisana — TCM widzi kto co napisał.
                </p>
            </fieldset>

            {/* Submit */}
            <div className="flex justify-end gap-2">
                <Button onClick={() => setConfirmOpen(true)} disabled={isPending}>
                    Wyślij ankietę
                </Button>
            </div>

            {confirmOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-card rounded-lg border p-6 max-w-md mx-4">
                        <h3 className="font-bold text-lg mb-2">Potwierdź wysłanie</h3>
                        <p className="text-sm text-muted-foreground mb-4">
                            {isAnonymous
                                ? 'Wysyłasz ankietę ANONIMOWO. Twoje imię i nazwisko nie zostanie zapisane.'
                                : 'Wysyłasz ankietę z imienia i nazwiska. TCM będzie widzieć Twoje odpowiedzi.'}
                        </p>
                        <p className="text-sm text-muted-foreground mb-4">
                            Po wysłaniu nie będzie można edytować odpowiedzi.
                        </p>
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={isPending}>
                                Anuluj
                            </Button>
                            <Button onClick={handleConfirmSubmit} disabled={isPending}>
                                {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                                Potwierdź wysłanie
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

function SatisfactionRow({
    label,
    value,
    onChange,
}: {
    label: string
    value: number | null
    onChange: (v: number) => void
}) {
    return (
        <div className="flex items-center gap-3">
            <span className="text-sm w-24">{label}</span>
            <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                    <button
                        key={n}
                        type="button"
                        onClick={() => onChange(n)}
                        className={`w-8 h-8 rounded border-2 text-xs ${
                            value === n
                                ? 'border-cyan-400 bg-cyan-400/10 text-cyan-400'
                                : 'border-muted hover:border-muted-foreground'
                        }`}
                    >
                        {n}
                    </button>
                ))}
            </div>
        </div>
    )
}
