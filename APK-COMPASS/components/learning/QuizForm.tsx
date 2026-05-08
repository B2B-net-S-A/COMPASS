'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, AlertCircle, RefreshCw, AlertTriangle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { submitQuizAttempt } from '@/lib/actions/course-learning'
import type { QuizQuestionForAttempt, QuizSubmissionResult } from '@/lib/types/learning'

interface QuizFormProps {
    courseId: string
    courseSlug: string
    questions: QuizQuestionForAttempt[]
}

const OPTION_LABELS = ['A', 'B', 'C', 'D']

export function QuizForm({ courseId, courseSlug, questions }: QuizFormProps) {
    const router = useRouter()
    const [answers, setAnswers] = useState<Record<string, string>>({}) // questionId → selectedOptionId
    const [error, setError] = useState<string | null>(null)
    const [unansweredId, setUnansweredId] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()
    const questionRefs = useRef<Record<string, HTMLDivElement | null>>({})

    const allAnswered = questions.every((q) => !!answers[q.question_id])
    const firstUnanswered = questions.find((q) => !answers[q.question_id])

    const handleSelect = (questionId: string, optionId: string) => {
        setAnswers((prev) => ({ ...prev, [questionId]: optionId }))
        // A1.6: zniknij ostrzeżenie gdy user uzupełnia
        if (unansweredId === questionId) setUnansweredId(null)
    }

    const submit = () => {
        if (!allAnswered) {
            const target = firstUnanswered
            if (target) {
                setUnansweredId(target.question_id)
                setError(`Brak odpowiedzi na pytanie ${target.question_order}.`)
                // Scroll do pierwszego nieodpowiedzianego
                questionRefs.current[target.question_id]?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center',
                })
            }
            return
        }
        if (!window.confirm('Wysłać odpowiedzi? Punkty otrzymujesz tylko za pierwsze zaliczające podejście (≥70%).')) return

        setError(null)
        setUnansweredId(null)
        startTransition(async () => {
            try {
                const payload = questions.map((q) => ({
                    question_id: q.question_id,
                    selected_option_id: answers[q.question_id],
                }))
                const res = await submitQuizAttempt(courseId, payload)
                if (!res.success) {
                    setError(res.error)
                    return
                }
                const result = res.data as QuizSubmissionResult
                const params = new URLSearchParams({
                    score: String(result.score_percent),
                    passed: String(result.passed),
                    already: String(result.already_awarded),
                    award: result.award_status ?? '',
                })
                router.push(`/learning/${courseSlug}/wyniki?${params.toString()}`)
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : 'Błąd sieci. Spróbuj ponownie.'
                setError(msg)
            }
        })
    }

    const handleSubmit = () => submit()
    const handleRetry = () => {
        setError(null)
        submit()
    }

    return (
        <div className="space-y-4">
            <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 text-sm text-amber-300">
                <p className="font-medium mb-1">Quiz końcowy</p>
                <p className="text-xs">
                    Próg zaliczenia: <strong>70%</strong>. Możesz podchodzić wielokrotnie, ale punkty otrzymujesz tylko
                    za pierwsze zaliczające podejście.
                </p>
            </div>

            {error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div className="flex-1">
                        <p>{error}</p>
                        {/* Retry pokazuje się tylko gdy submit się wykonał (allAnswered) ale failował */}
                        {allAnswered && !isPending && (
                            <Button
                                onClick={handleRetry}
                                size="sm"
                                variant="outline"
                                className="mt-2 gap-1.5 h-7 text-xs"
                                disabled={isPending}
                            >
                                <RefreshCw className="w-3 h-3" />
                                Spróbuj ponownie
                            </Button>
                        )}
                    </div>
                </div>
            )}

            <div className="space-y-3">
                {questions.map((q, qIdx) => {
                    const selected = answers[q.question_id]
                    const isUnanswered = unansweredId === q.question_id
                    const hasNoOptions = !Array.isArray(q.options) || q.options.length === 0
                    return (
                        <Card
                            key={q.question_id}
                            ref={(el) => {
                                questionRefs.current[q.question_id] = el
                            }}
                            className={`bg-white/5 transition-colors ${
                                isUnanswered ? 'border-red-500/60 ring-1 ring-red-500/40' : 'border-white/10'
                            }`}
                        >
                            <CardContent className="p-5 space-y-3">
                                <div className="flex items-start gap-3">
                                    <Badge variant="outline" className="text-[10px] mt-0.5">
                                        {qIdx + 1}
                                    </Badge>
                                    <p className="font-medium flex-1">{q.question_text}</p>
                                </div>
                                {hasNoOptions ? (
                                    <div className="pl-7 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-center gap-2">
                                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                        Pytanie nie ma opcji. Skontaktuj się z autorem kursu.
                                    </div>
                                ) : (
                                    <div className="space-y-2 pl-7">
                                        {q.options.map((o, oIdx) => (
                                            <button
                                                key={o.id}
                                                type="button"
                                                onClick={() => handleSelect(q.question_id, o.id)}
                                                disabled={isPending}
                                                className={`w-full text-left p-3 rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                                                    selected === o.id
                                                        ? 'bg-primary/20 border-primary/50 text-foreground'
                                                        : 'bg-white/5 border-white/10 hover:border-white/20'
                                                }`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div
                                                        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${
                                                            selected === o.id
                                                                ? 'border-primary bg-primary/20'
                                                                : 'border-white/20'
                                                        }`}
                                                    >
                                                        {selected === o.id && <div className="w-2 h-2 rounded-full bg-primary" />}
                                                    </div>
                                                    <Badge variant="outline" className="text-[10px] w-7 justify-center">
                                                        {OPTION_LABELS[oIdx]}
                                                    </Badge>
                                                    <span className="text-sm flex-1">{o.option_text}</span>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                                {isUnanswered && (
                                    <p className="pl-7 text-xs text-red-400 flex items-center gap-1.5">
                                        <AlertCircle className="w-3 h-3" />
                                        Wybierz odpowiedź na to pytanie
                                    </p>
                                )}
                            </CardContent>
                        </Card>
                    )
                })}
            </div>

            <div className="flex justify-between items-center pt-4 border-t border-white/10">
                <p className="text-xs text-muted-foreground">
                    Odpowiedziano: <strong>{Object.keys(answers).length}/{questions.length}</strong>
                </p>
                <Button onClick={handleSubmit} disabled={isPending} size="lg" className="gap-2">
                    {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                    {isPending ? 'Wysyłam…' : 'Wyślij odpowiedzi'}
                </Button>
            </div>
        </div>
    )
}
