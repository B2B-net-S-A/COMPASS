'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from '@/lib/toast'
import { toastSuccess } from '@/lib/toast-success'
import { submitOnboardingCheckin } from '@/lib/actions/lifecycle'
import type { CheckinDay, OnboardingProgress } from '@/lib/types/lifecycle'

interface Props {
    progress: OnboardingProgress
    startedAt: string
}

export function OnboardingCheckinPanel({ progress, startedAt }: Props) {
    const router = useRouter()
    const [editingDay, setEditingDay] = useState<CheckinDay | null>(null)
    const [score, setScore] = useState<number>(3)
    const [note, setNote] = useState<string>('')
    const [isPending, startTransition] = useTransition()

    const daysSinceStart = Math.floor((Date.now() - new Date(startedAt).getTime()) / (1000 * 60 * 60 * 24))

    const checkins: Array<{ day: CheckinDay; at: string | null; score: number | null; note: string | null }> = [
        { day: 1, at: progress.checkin_day1_at, score: progress.checkin_day1_score, note: progress.checkin_day1_note },
        { day: 7, at: progress.checkin_day7_at, score: progress.checkin_day7_score, note: progress.checkin_day7_note },
        { day: 30, at: progress.checkin_day30_at, score: progress.checkin_day30_score, note: progress.checkin_day30_note },
    ]

    function handleSubmit(day: CheckinDay) {
        startTransition(async () => {
            try {
                await submitOnboardingCheckin(progress.id, day, score, note.trim() || null)
                toastSuccess(`Check-in dzień ${day} zapisany`)
                setEditingDay(null)
                setScore(3)
                setNote('')
                router.refresh()
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Błąd przy zapisie check-inu')
            }
        })
    }

    return (
        <div className="space-y-3">
            {checkins.map((c) => {
                const isAvailable = daysSinceStart >= c.day
                const isFilled = c.at !== null

                return (
                    <div key={c.day} className="rounded-lg border bg-card p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="font-semibold">Dzień {c.day}</div>
                                <div className="text-xs text-muted-foreground">
                                    {isFilled
                                        ? `Wypełnione: ${new Date(c.at!).toLocaleDateString('pl-PL')}`
                                        : isAvailable
                                            ? 'Dostępne do wypełnienia'
                                            : `Otworzy się za ${c.day - daysSinceStart} dni`}
                                </div>
                            </div>
                            {isFilled && c.score !== null && (
                                <div className="text-2xl">
                                    {'⭐'.repeat(c.score)}
                                    <span className="text-muted-foreground text-sm ml-1">({c.score}/5)</span>
                                </div>
                            )}
                        </div>
                        {isFilled && c.note && (
                            <p className="text-sm text-muted-foreground mt-2 italic">"{c.note}"</p>
                        )}
                        {!isFilled && isAvailable && editingDay !== c.day && (
                            <Button variant="outline" size="sm" className="mt-2" onClick={() => setEditingDay(c.day)}>
                                Wypełnij check-in
                            </Button>
                        )}
                        {editingDay === c.day && (
                            <div className="mt-3 space-y-3">
                                <div>
                                    <label className="text-xs text-muted-foreground">Jak Ci się układa? (1-5)</label>
                                    <div className="flex gap-2 mt-1">
                                        {[1, 2, 3, 4, 5].map((n) => (
                                            <button
                                                key={n}
                                                type="button"
                                                onClick={() => setScore(n)}
                                                className={`w-10 h-10 rounded border-2 transition ${
                                                    score === n
                                                        ? 'border-cyan-400 bg-cyan-400/10 text-cyan-400'
                                                        : 'border-muted hover:border-muted-foreground'
                                                }`}
                                            >
                                                {n}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <label className="text-xs text-muted-foreground">Komentarz (opcjonalnie)</label>
                                    <textarea
                                        value={note}
                                        onChange={(e) => setNote(e.target.value)}
                                        className="w-full mt-1 rounded border bg-background px-3 py-2 text-sm"
                                        rows={3}
                                        placeholder="Co się Ci podoba, co możemy poprawić?"
                                    />
                                </div>
                                <div className="flex gap-2">
                                    <Button size="sm" onClick={() => handleSubmit(c.day)} disabled={isPending}>
                                        {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Zapisz'}
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={() => setEditingDay(null)} disabled={isPending}>
                                        Anuluj
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                )
            })}
        </div>
    )
}
