'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Loader2 } from 'lucide-react'
import { useAcademyAction } from '@/components/academy/useAcademyAction'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { startQuizAttempt } from '@/lib/actions/course-learning'
import { quizBlockerMessage } from '@/lib/academy/quiz-session'
import type { QuizStatus } from '@/lib/types/learning'

const warsawTime = new Intl.DateTimeFormat('pl-PL', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Warsaw' })

export function QuizStartCard({ courseId, enrollmentId, status, kind = 'final' }: { courseId: string; enrollmentId: string; status: QuizStatus; kind?: 'final' | 'pre' }) {
    const router = useRouter()
    const [error, setError] = useState<string | null>(null)
    const [isPending, run] = useAcademyAction()
    const blockerCode = kind === 'pre' ? status.pre_blocker : status.blocker
    const blocked = quizBlockerMessage(blockerCode)

    const start = () => run(async () => {
        setError(null)
        const result = await startQuizAttempt(courseId, enrollmentId, kind)
        if (!result.success) { setError(result.error); return }
        // Strona wznawia otwartą próbę tym samym wywołaniem, więc odświeżenie nie zużywa kolejnej.
        router.refresh()
    })

    return (
        <Card>
            <CardContent className="space-y-4 p-5 sm:p-6">
                <dl className="grid grid-cols-2 gap-4 text-sm">
                    <div><dt className="text-muted-foreground">Pytań w teście</dt><dd className="text-lg font-semibold">{kind === 'pre' ? status.pre_test_count : status.question_count}</dd></div>
                    {kind === 'final' && <div><dt className="text-muted-foreground">Próg zaliczenia</dt><dd className="text-lg font-semibold">{status.pass_percent}%</dd></div>}
                    <div><dt className="text-muted-foreground">Limit czasu</dt><dd className="text-lg font-semibold">{status.time_limit_minutes ? `${status.time_limit_minutes} min` : 'Bez limitu'}</dd></div>
                    {kind === 'final' && <div><dt className="text-muted-foreground">Wykorzystane próby</dt><dd className="text-lg font-semibold">{status.attempt_limit ? `${status.attempts_used} z ${status.attempt_limit} na ${status.attempt_window_hours} h` : status.attempts_used}</dd></div>}
                </dl>
                {blocked && (
                    <p role="status" className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">
                        {blocked}{status.next_attempt_at && ` Kolejna próba: ${warsawTime.format(new Date(status.next_attempt_at))}.`}
                    </p>
                )}
                {error && <p role="alert" className="flex items-start gap-2 text-sm text-destructive"><AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{error}</p>}
                {!blockerCode && (
                    <>
                        <p className="text-sm text-muted-foreground">{kind === 'pre' ? 'Test wstępny pokazuje, co już umiesz. Nie wpływa na zaliczenie ani na limit prób.' : 'Pytania są losowane przy starcie. Czas liczy serwer od rozpoczęcia, a odpowiedzi zapisują się same.'}</p>
                        <Button onClick={() => void start()} disabled={isPending} size="lg" className="w-full gap-2 sm:w-auto">
                            {isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}{kind === 'pre' ? 'Rozpocznij test wstępny' : 'Rozpocznij test'}
                        </Button>
                    </>
                )}
            </CardContent>
        </Card>
    )
}
