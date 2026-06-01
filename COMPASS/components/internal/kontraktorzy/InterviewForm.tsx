'use client'

// Phase 33 — Kontraktorzy: schema-driven onboarding / exit interview form.
// Replaces the two Word docx forms. Workflow: scheduled → submitted → reviewed.

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/lib/toast'
import {
    saveOnboardingInterview, saveExitInterview,
    reviewOnboardingInterview, reviewExitInterview,
} from '@/lib/actions/contractors'
import {
    INTERVIEW_STATUS_PL,
    type ContractorOnboardingInterviewRow, type ContractorExitInterviewRow, type InterviewStatus,
} from '@/lib/types/contractor'

type Kind = 'onboarding' | 'exit'
type FieldType = 'text' | 'textarea' | 'bool'
interface FieldDef { key: string; label: string; type: FieldType; group: string }

const ONBOARDING_FIELDS: FieldDef[] = [
    { key: 'tcm_role_note', label: 'Rola TCM + notatki do przekazania', type: 'textarea', group: 'Check-in po 1 dniu' },
    { key: 'first_day_note', label: 'Jak minął pierwszy dzień / czy onboarding był jasny', type: 'textarea', group: 'Check-in po 1 dniu' },
    { key: 'client_manager_name', label: 'Manager u klienta (imię i nazwisko)', type: 'text', group: 'Check-in po 1 dniu' },
    { key: 'equipment_note', label: 'Sprzęt — jaki / czy działa', type: 'textarea', group: 'Check-in po 1 dniu' },
    { key: 'system_access_note', label: 'Dostęp do systemów (VPN, poczta, aplikacje)', type: 'textarea', group: 'Check-in po 1 dniu' },
    { key: 'duties_note', label: 'Lista obowiązków / zgodna ze scope', type: 'textarea', group: 'Check-in po 1 dniu' },
    { key: 'work_note', label: 'Jak się pracuje / dotychczasowe zadania', type: 'textarea', group: 'Check-in po 2 tygodniach' },
    { key: 'manager_relation_note', label: 'Relacja z managerem / kontakt', type: 'textarea', group: 'Check-in po 2 tygodniach' },
    { key: 'missing_resolved_note', label: 'Czy braki zostały uzupełnione', type: 'textarea', group: 'Check-in po 2 tygodniach' },
    { key: 'positive_surprise', label: 'Pozytywne zaskoczenie', type: 'textarea', group: 'Check-in po 2 tygodniach' },
    { key: 'negative_surprise', label: 'Negatywne zaskoczenie', type: 'textarea', group: 'Check-in po 2 tygodniach' },
    { key: 'doubts_note', label: 'Wątpliwości / pytania', type: 'textarea', group: 'Check-in po 2 tygodniach' },
    { key: 'side_projects_interest', label: 'Chce brać udział w wewnętrznych side projektach?', type: 'bool', group: 'Case Study' },
    { key: 'cs_challenge', label: 'Wyzwanie / problem', type: 'textarea', group: 'Case Study' },
    { key: 'cs_solution', label: 'Rozwiązanie', type: 'textarea', group: 'Case Study' },
    { key: 'cs_technologies', label: 'Technologie / wirtualizacja / narzędzia', type: 'textarea', group: 'Case Study' },
    { key: 'cs_client', label: 'Klient', type: 'text', group: 'Case Study' },
    { key: 'cs_sector', label: 'Sektor', type: 'text', group: 'Case Study' },
]

const EXIT_FIELDS: FieldDef[] = [
    { key: 'formal_reason', label: 'Powód zejścia (formalny)', type: 'text', group: 'Zejście' },
    { key: 'causes', label: 'Przyczyny — co doprowadziło do tej sytuacji', type: 'textarea', group: 'Zejście' },
    { key: 'repair_potential', label: 'Co można zrobić (potencjał naprawy / złagodzenia)', type: 'textarea', group: 'Zejście' },
    { key: 'is_final', label: 'Czy to ostateczna decyzja?', type: 'bool', group: 'Zejście' },
    { key: 'can_retain_transfer', label: 'Czy uda się utrzymać / przepiąć kandydata?', type: 'bool', group: 'Rezultat' },
    { key: 'retain_transfer_note', label: 'Szczegóły utrzymania / przepięcia', type: 'textarea', group: 'Rezultat' },
    { key: 'can_extend_departure', label: 'Czy uda się wydłużyć okres zejścia?', type: 'bool', group: 'Rezultat' },
    { key: 'extend_departure_note', label: 'Szczegóły wydłużenia', type: 'textarea', group: 'Rezultat' },
    { key: 'feedback_lessons', label: 'Feedback / wnioski na przyszłość', type: 'textarea', group: 'Rezultat' },
]

const selectCls = 'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm'

type AnyInterview = ContractorOnboardingInterviewRow | ContractorExitInterviewRow

export function InterviewForm({ kind, interview, onSaved }: { kind: Kind; interview: AnyInterview; onSaved: () => void }) {
    const fields = kind === 'onboarding' ? ONBOARDING_FIELDS : EXIT_FIELDS
    const [values, setValues] = useState<Record<string, unknown>>(() => ({ ...interview }))
    const [saving, setSaving] = useState(false)
    const [reviewNote, setReviewNote] = useState((interview.reviewer_note ?? '') as string)
    const readOnly = interview.status === 'reviewed' || interview.status === 'archived'

    const set = (k: string, v: unknown) => setValues((p) => ({ ...p, [k]: v }))

    function buildPatch(): Record<string, unknown> {
        const patch: Record<string, unknown> = {}
        for (const f of fields) patch[f.key] = values[f.key] ?? null
        // editable snapshots
        for (const k of ['position_snapshot', 'client_snapshot', 'start_date', ...(kind === 'exit' ? ['end_date'] : [])]) {
            patch[k] = values[k] ?? null
        }
        return patch
    }

    async function doSave(submit: boolean) {
        setSaving(true)
        try {
            const patch = buildPatch()
            if (kind === 'onboarding') await saveOnboardingInterview(interview.id, patch, submit)
            else await saveExitInterview(interview.id, patch, submit)
            toast.success(submit ? 'Wywiad wysłany.' : 'Zapisano.')
            onSaved()
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Nie udało się zapisać.')
        } finally {
            setSaving(false)
        }
    }

    async function doReview() {
        setSaving(true)
        try {
            if (kind === 'onboarding') await reviewOnboardingInterview(interview.id, reviewNote)
            else await reviewExitInterview(interview.id, reviewNote)
            toast.success('Oznaczono jako sprawdzony.')
            onSaved()
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Nie udało się.')
        } finally {
            setSaving(false)
        }
    }

    const groups = Array.from(new Set(fields.map((f) => f.group)))

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                <Badge variant={interview.status === 'reviewed' ? 'default' : 'secondary'}>{INTERVIEW_STATUS_PL[interview.status as InterviewStatus]}</Badge>
                {interview.submitted_at && <span className="text-xs text-muted-foreground">wysłany {interview.submitted_at.slice(0, 10)}</span>}
            </div>

            {/* Snapshots */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <div><Label>Stanowisko</Label><Input value={(values.position_snapshot as string) ?? ''} disabled={readOnly} onChange={(e) => set('position_snapshot', e.target.value)} /></div>
                <div><Label>Klient</Label><Input value={(values.client_snapshot as string) ?? ''} disabled={readOnly} onChange={(e) => set('client_snapshot', e.target.value)} /></div>
                <div><Label>Start</Label><Input type="date" value={(values.start_date as string) ?? ''} disabled={readOnly} onChange={(e) => set('start_date', e.target.value)} /></div>
                {kind === 'exit' && <div><Label>Koniec</Label><Input type="date" value={(values.end_date as string) ?? ''} disabled={readOnly} onChange={(e) => set('end_date', e.target.value)} /></div>}
            </div>

            {groups.map((g) => (
                <fieldset key={g} className="rounded-md border p-3">
                    <legend className="px-1 text-sm font-semibold">{g}</legend>
                    <div className="space-y-3">
                        {fields.filter((f) => f.group === g).map((f) => (
                            <div key={f.key}>
                                <Label htmlFor={`f-${f.key}`}>{f.label}</Label>
                                {f.type === 'textarea' ? (
                                    <Textarea id={`f-${f.key}`} rows={2} disabled={readOnly} value={(values[f.key] as string) ?? ''} onChange={(e) => set(f.key, e.target.value)} />
                                ) : f.type === 'bool' ? (
                                    <select id={`f-${f.key}`} className={selectCls} disabled={readOnly}
                                        value={values[f.key] === true ? 'true' : values[f.key] === false ? 'false' : ''}
                                        onChange={(e) => set(f.key, e.target.value === '' ? null : e.target.value === 'true')}>
                                        <option value="">—</option>
                                        <option value="true">Tak</option>
                                        <option value="false">Nie</option>
                                    </select>
                                ) : (
                                    <Input id={`f-${f.key}`} disabled={readOnly} value={(values[f.key] as string) ?? ''} onChange={(e) => set(f.key, e.target.value)} />
                                )}
                            </div>
                        ))}
                    </div>
                </fieldset>
            ))}

            {!readOnly && (
                <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => doSave(false)} disabled={saving} className="gap-2">
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Zapisz roboczo
                    </Button>
                    {interview.status === 'scheduled' && (
                        <Button onClick={() => doSave(true)} disabled={saving}>Zapisz i wyślij</Button>
                    )}
                </div>
            )}

            {interview.status === 'submitted' && (
                <div className="rounded-md border bg-muted/30 p-3">
                    <Label htmlFor="rev-note">Notatka recenzenta</Label>
                    <Textarea id="rev-note" rows={2} value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} />
                    <Button className="mt-2" onClick={doReview} disabled={saving} size="sm">Oznacz jako sprawdzony</Button>
                </div>
            )}
            {interview.reviewer_note && readOnly && (
                <p className="text-sm text-muted-foreground">Notatka recenzenta: {interview.reviewer_note}</p>
            )}
        </div>
    )
}
