'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, CheckCircle2, Clock, CloudOff, Loader2 } from 'lucide-react'
import { MarkdownView } from '@/components/learning/MarkdownView'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/shared/ConfirmDialog'
import { finishQuizAttempt, saveQuizAnswer } from '@/lib/actions/course-learning'
import { answeredPercent, formatRemaining, mergeSavedAnswers, parseStoredAnswers, quizPageCount, quizPageItems } from '@/lib/academy/quiz-session'
import type { QuizAttemptSession } from '@/lib/types/learning'
import { cn } from '@/lib/utils'

const OPTION_LABELS = ['A', 'B', 'C', 'D', 'E', 'F']
const RETRY_MS = 15_000

function readLocal(key: string): Record<string, string> {
    try { return parseStoredAnswers(window.localStorage.getItem(key)) } catch { return {} }
}
function writeLocal(key: string, value: Record<string, string> | null) {
    try {
        if (value) window.localStorage.setItem(key, JSON.stringify(value))
        else window.localStorage.removeItem(key)
    } catch { /* tryb prywatny: autozapis działa dalej przez serwer */ }
}

interface QuizSessionFormProps { session: QuizAttemptSession; courseSlug: string; enrollmentId: string }

export function QuizSessionForm({ session, courseSlug, enrollmentId }: QuizSessionFormProps) {
    const router = useRouter()
    const storageKey = `academy-quiz-${session.attempt_id}`
    const [answers, setAnswers] = useState<Record<string, string>>(() => mergeSavedAnswers(session.questions, {}))
    const [unsynced, setUnsynced] = useState(0)
    const [offline, setOffline] = useState(false)
    const [page, setPage] = useState(1)
    const [remaining, setRemaining] = useState(session.remaining_seconds)
    const [error, setError] = useState<string | null>(null)
    const [submitting, setSubmitting] = useState(false)
    const [confirm, ConfirmUI] = useConfirm()
    const pending = useRef(new Map<string, string>())
    const flushing = useRef(false)
    const finished = useRef(false)
    const answersRef = useRef(answers)
    answersRef.current = answers
    const deadline = useRef(Date.now() + session.remaining_seconds * 1000)

    const goToResult = useCallback(() => {
        const params = new URLSearchParams({ attempt: session.attempt_id, enrollment: enrollmentId })
        router.push(`/learning/${courseSlug}/wyniki?${params.toString()}`)
    }, [courseSlug, enrollmentId, router, session.attempt_id])

    const flush = useCallback(async () => {
        if (flushing.current || finished.current) return
        flushing.current = true
        try {
            for (const [questionId, optionId] of Array.from(pending.current)) {
                const result = await saveQuizAnswer(session.attempt_id, questionId, optionId)
                if (!result.success) { setError(result.error); return }
                deadline.current = Date.now() + result.data.remaining_seconds * 1000
                if (pending.current.get(questionId) === optionId) pending.current.delete(questionId)
                setUnsynced(pending.current.size)
            }
            setOffline(false)
        } catch {
            setOffline(true)
        } finally {
            flushing.current = false
        }
    }, [session.attempt_id])

    const finish = useCallback(async () => {
        if (finished.current) return
        finished.current = true
        setSubmitting(true)
        setError(null)
        const payload = Object.entries(answersRef.current).map(([question_id, selected_option_id]) => ({ question_id, selected_option_id }))
        try {
            const result = await finishQuizAttempt(session.attempt_id, payload)
            if (!result.success) {
                finished.current = false
                setSubmitting(false)
                setError(result.error)
                return
            }
            writeLocal(storageKey, null)
            goToResult()
        } catch {
            finished.current = false
            setSubmitting(false)
            setOffline(true)
            setError('Brak połączenia. Twoje odpowiedzi są zapisane na tym urządzeniu. Wyślij je ponownie, gdy wróci sieć.')
        }
    }, [goToResult, session.attempt_id, storageKey])

    useEffect(() => {
        const local = readLocal(storageKey)
        const merged = mergeSavedAnswers(session.questions, local)
        setAnswers(merged)
        for (const question of session.questions) {
            const value = merged[question.question_id]
            if (value && value !== question.selected_option_id) pending.current.set(question.question_id, value)
        }
        setUnsynced(pending.current.size)
        void flush()
        const retry = window.setInterval(() => { if (pending.current.size) void flush() }, RETRY_MS)
        const online = () => void flush()
        window.addEventListener('online', online)
        return () => { window.clearInterval(retry); window.removeEventListener('online', online) }
    }, [flush, session.questions, storageKey])

    useEffect(() => {
        if (!session.has_time_limit) return
        const timer = window.setInterval(() => {
            const left = Math.max(0, Math.round((deadline.current - Date.now()) / 1000))
            setRemaining(left)
            // Baza odrzuca wysyłkę po terminie, więc formularz wysyła chwilę wcześniej.
            if (left <= 2) { window.clearInterval(timer); void finish() }
        }, 1000)
        return () => window.clearInterval(timer)
    }, [finish, session.has_time_limit])

    const select = (questionId: string, optionId: string) => {
        const next = { ...answersRef.current, [questionId]: optionId }
        setAnswers(next)
        writeLocal(storageKey, next)
        pending.current.set(questionId, optionId)
        setUnsynced(pending.current.size)
        void flush()
    }

    const total = session.questions.length
    const answered = session.questions.filter(question => answers[question.question_id]).length
    const pages = quizPageCount(total)
    const visible = quizPageItems(session.questions, page)
    const lowTime = session.has_time_limit && remaining <= 60

    const submit = async () => {
        const missing = session.questions.find(question => !answers[question.question_id])
        if (missing) {
            setError(`Brak odpowiedzi na pytanie ${missing.position}.`)
            setPage(Math.ceil(missing.position / 10))
            return
        }
        if (await confirm({ description: `Wysłać odpowiedzi? Próg zaliczenia wynosi ${session.pass_percent}%.` })) await finish()
    }

    return (
        <div className="space-y-4">
            <div className="sticky top-0 z-10 -mx-4 space-y-2 border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
                <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium">Odpowiedziano {answered} z {total}</span>
                    {session.has_time_limit && (
                        <span role="timer" aria-live="off" className={cn('inline-flex items-center gap-1.5 font-mono font-semibold tabular-nums', lowTime && 'text-destructive')}>
                            <Clock className="size-4" aria-hidden="true" />{formatRemaining(remaining)}
                        </span>
                    )}
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={answered} aria-label="Postęp testu">
                    <div className="h-full bg-primary transition-[width]" style={{ width: `${answeredPercent(answered, total)}%` }} />
                </div>
                <p role="status" className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {offline
                        ? <><CloudOff className="size-3.5" aria-hidden="true" />Brak sieci. Odpowiedzi czekają na tym urządzeniu ({unsynced}).</>
                        : unsynced > 0
                            ? <><Loader2 className="size-3.5 animate-spin" aria-hidden="true" />Zapisuję odpowiedzi…</>
                            : <><CheckCircle2 className="size-3.5" aria-hidden="true" />Odpowiedzi zapisane</>}
                </p>
            </div>

            {error && (
                <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                    <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><p>{error}</p>
                </div>
            )}

            <ol className="space-y-3">
                {visible.map(question => (
                    <li key={question.question_id} className="space-y-3 rounded-xl border border-border bg-card p-4 sm:p-5">
                        <p className="text-xs font-medium text-muted-foreground">Pytanie {question.position} z {total}</p>
                        <MarkdownView content={question.question_text} className="break-words prose-pre:overflow-x-auto prose-pre:text-xs [&_pre_code]:bg-transparent [&_pre_code]:p-0" />
                        <div className="space-y-2" role="radiogroup" aria-label={`Odpowiedzi na pytanie ${question.position}`}>
                            {question.options.map((option, index) => {
                                const selected = answers[question.question_id] === option.id
                                return (
                                    <button key={option.id} type="button" role="radio" aria-checked={selected} disabled={submitting} onClick={() => select(question.question_id, option.id)}
                                        className={cn('flex min-h-12 w-full items-start gap-3 rounded-lg border p-3 text-left text-sm transition-colors disabled:opacity-50', selected ? 'border-primary bg-primary/10' : 'border-border bg-card hover:border-primary/40')}>
                                        <span className={cn('flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold', selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border')}>{OPTION_LABELS[index]}</span>
                                        <span className="flex-1 break-words">{option.option_text}</span>
                                    </button>
                                )
                            })}
                        </div>
                    </li>
                ))}
            </ol>

            {pages > 1 && (
                <nav aria-label="Strony testu" className="flex items-center justify-between gap-2">
                    <Button type="button" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Poprzednia</Button>
                    <span className="text-sm text-muted-foreground">Strona {page} z {pages}</span>
                    <Button type="button" variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>Następna</Button>
                </nav>
            )}

            <div className="flex justify-end border-t border-border pt-4">
                <Button onClick={() => void submit()} disabled={submitting} size="lg" className="w-full gap-2 sm:w-auto">
                    {submitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                    {submitting ? 'Wysyłam…' : 'Wyślij odpowiedzi'}
                </Button>
            </div>
            <ConfirmUI />
        </div>
    )
}
