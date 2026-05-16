'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { markExitInterviewReviewed } from '@/lib/actions/lifecycle'
import { toast } from '@/lib/toast'
import { toastSuccess } from '@/lib/toast-success'
import type { ExitInterview } from '@/lib/types/lifecycle'

const EXIT_REASON_LABEL: Record<string, string> = {
    new_opportunity: 'Nowa oferta pracy',
    compensation: 'Wynagrodzenie',
    role_misfit: 'Niedopasowanie roli',
    management: 'Zarządzanie',
    work_life_balance: 'Work-life balance',
    career_growth: 'Rozwój kariery',
    personal: 'Powody osobiste',
    other: 'Inne',
}

interface Props {
    interview: ExitInterview
}

export function ExitInterviewReviewPanel({ interview }: Props) {
    const router = useRouter()
    const [note, setNote] = useState('')
    const [isPending, startTransition] = useTransition()

    function handleMarkReviewed() {
        startTransition(async () => {
            try {
                await markExitInterviewReviewed(interview.id, note.trim() || null)
                toastSuccess('Oznaczono jako reviewed.')
                router.refresh()
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Błąd przy zapisie.')
            }
        })
    }

    return (
        <div className="space-y-4">
            <Section label="Powód odejścia">
                <div className="text-base font-medium">{EXIT_REASON_LABEL[interview.exit_reason ?? ''] ?? '—'}</div>
                {interview.exit_reason_detail && (
                    <p className="text-sm text-muted-foreground mt-1 italic">"{interview.exit_reason_detail}"</p>
                )}
            </Section>

            <Section label="NPS (poleciłby pracodawcę)">
                <div className="text-3xl font-bold">{interview.nps_score ?? '—'}/10</div>
            </Section>

            <Section label="Satysfakcja">
                <ul className="text-sm space-y-1">
                    <li>Zespół: <strong>{interview.satisfaction_team ?? '—'}/5</strong></li>
                    <li>Manager: <strong>{interview.satisfaction_manager ?? '—'}/5</strong></li>
                    <li>Projekty: <strong>{interview.satisfaction_projects ?? '—'}/5</strong></li>
                    <li>
                        Poleciłby pracę u nas:{' '}
                        <strong>
                            {interview.would_recommend === true ? 'Tak' : interview.would_recommend === false ? 'Nie' : '—'}
                        </strong>
                    </li>
                </ul>
            </Section>

            {interview.what_worked && (
                <Section label="Co działało dobrze">
                    <p className="text-sm whitespace-pre-wrap">{interview.what_worked}</p>
                </Section>
            )}

            {interview.what_to_improve && (
                <Section label="Co można poprawić">
                    <p className="text-sm whitespace-pre-wrap">{interview.what_to_improve}</p>
                </Section>
            )}

            {interview.knowledge_transfer_notes && (
                <Section label="Knowledge transfer">
                    <p className="text-sm whitespace-pre-wrap">{interview.knowledge_transfer_notes}</p>
                </Section>
            )}

            {interview.status === 'submitted' && (
                <div className="rounded-lg border-2 border-cyan-400/30 bg-cyan-400/5 p-4 space-y-3">
                    <label className="block text-sm font-medium">Notatka TCM (opcjonalna)</label>
                    <textarea
                        className="w-full rounded border bg-background px-3 py-2 text-sm"
                        rows={3}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Wnioski z review, plan działania, follow-up..."
                    />
                    <Button onClick={handleMarkReviewed} disabled={isPending}>
                        {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        Oznacz jako reviewed
                    </Button>
                </div>
            )}

            {interview.status === 'reviewed' && interview.reviewer_note && (
                <Section label="Notatka TCM">
                    <p className="text-sm whitespace-pre-wrap italic">{interview.reviewer_note}</p>
                    <p className="text-xs text-muted-foreground mt-2">
                        Reviewed: {interview.reviewed_at ? new Date(interview.reviewed_at).toLocaleString('pl-PL') : '—'}
                    </p>
                </Section>
            )}
        </div>
    )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="rounded-lg border bg-card p-4">
            <div className="text-xs uppercase text-muted-foreground mb-2">{label}</div>
            {children}
        </div>
    )
}
