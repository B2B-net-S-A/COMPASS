'use client'

import { useState, useTransition, useEffect } from 'react'
import { Plus, Trash2, Loader2, Save, Check, AlertCircle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
    setQuizQuestions,
    QUIZ_MIN_QUESTIONS,
    QUIZ_MAX_QUESTIONS,
    QUIZ_OPTIONS_PER_QUESTION,
    type QuizQuestionInput,
    type CourseQuizQuestionAuthor,
} from '@/lib/actions/courses'

interface QuizEditorProps {
    courseId: string
    initialQuestions: CourseQuizQuestionAuthor[]
    onChanged?: () => void
}

interface DraftQuestion {
    question_text: string
    options: { option_text: string; is_correct: boolean }[]
}

const OPTION_LABELS = ['A', 'B', 'C', 'D']

function createEmptyQuestion(): DraftQuestion {
    return {
        question_text: '',
        options: Array.from({ length: QUIZ_OPTIONS_PER_QUESTION }, () => ({
            option_text: '',
            is_correct: false,
        })),
    }
}

export function QuizEditor({ courseId, initialQuestions, onChanged }: QuizEditorProps) {
    const [draft, setDraft] = useState<DraftQuestion[]>([])
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()

    useEffect(() => {
        if (initialQuestions.length > 0) {
            setDraft(
                initialQuestions.map((q) => ({
                    question_text: q.question_text,
                    options: q.options.map((o) => ({ option_text: o.option_text, is_correct: o.is_correct })),
                })),
            )
        } else {
            setDraft([createEmptyQuestion(), createEmptyQuestion(), createEmptyQuestion(), createEmptyQuestion()])
        }
    }, [initialQuestions])

    const handleAddQuestion = () => {
        if (draft.length >= QUIZ_MAX_QUESTIONS) return
        setDraft([...draft, createEmptyQuestion()])
    }

    const handleRemoveQuestion = (idx: number) => {
        if (draft.length <= QUIZ_MIN_QUESTIONS) {
            setError(`Quiz musi mieć co najmniej ${QUIZ_MIN_QUESTIONS} pytań`)
            return
        }
        setDraft(draft.filter((_, i) => i !== idx))
    }

    const updateQuestion = (idx: number, field: 'question_text', value: string) => {
        setDraft(draft.map((q, i) => (i === idx ? { ...q, [field]: value } : q)))
    }

    const setOptionText = (qIdx: number, oIdx: number, value: string) => {
        setDraft(
            draft.map((q, i) => {
                if (i !== qIdx) return q
                return {
                    ...q,
                    options: q.options.map((o, j) => (j === oIdx ? { ...o, option_text: value } : o)),
                }
            }),
        )
    }

    const setOptionCorrect = (qIdx: number, oIdx: number) => {
        setDraft(
            draft.map((q, i) => {
                if (i !== qIdx) return q
                // single-choice: tylko jedna opcja może być is_correct
                return {
                    ...q,
                    options: q.options.map((o, j) => ({ ...o, is_correct: j === oIdx })),
                }
            }),
        )
    }

    const handleSave = () => {
        setError(null)
        setSuccess(null)
        const payload: QuizQuestionInput[] = draft.map((q) => ({
            question_text: q.question_text,
            options: q.options,
        }))
        startTransition(async () => {
            const res = await setQuizQuestions(courseId, payload)
            if (!res.success) {
                setError(res.error)
                return
            }
            setSuccess('Quiz zapisany ✓')
            setTimeout(() => setSuccess(null), 3000)
            onChanged?.()
        })
    }

    const allValid = draft.every(
        (q) =>
            q.question_text.trim().length > 0 &&
            q.options.every((o) => o.option_text.trim().length > 0) &&
            q.options.filter((o) => o.is_correct).length === 1,
    )

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-semibold">Quiz końcowy</h3>
                    <p className="text-xs text-muted-foreground">
                        {QUIZ_MIN_QUESTIONS}–{QUIZ_MAX_QUESTIONS} pytań ABCD (single-choice). Próg zaliczenia: 70%.
                    </p>
                </div>
                <Badge variant={allValid ? 'default' : 'outline'} className="text-xs">
                    {draft.length} / {QUIZ_MAX_QUESTIONS} pytań
                </Badge>
            </div>

            {error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    {error}
                </div>
            )}
            {success && (
                <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-sm text-green-400 flex items-center gap-2">
                    <Check className="w-4 h-4" /> {success}
                </div>
            )}

            <div className="space-y-3">
                {draft.map((q, qIdx) => (
                    <Card key={qIdx} className="bg-white/5 border-white/10">
                        <CardContent className="p-4 space-y-3">
                            <div className="flex items-start gap-3">
                                <Badge variant="outline" className="mt-1.5 text-[10px]">
                                    {qIdx + 1}
                                </Badge>
                                <div className="flex-1">
                                    <label className="text-xs text-muted-foreground mb-1 block">Treść pytania</label>
                                    <Textarea
                                        value={q.question_text}
                                        onChange={(e) => updateQuestion(qIdx, 'question_text', e.target.value)}
                                        rows={2}
                                        placeholder="np. Co oznacza skrót REST w architekturze API?"
                                        disabled={isPending}
                                    />
                                </div>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleRemoveQuestion(qIdx)}
                                    disabled={isPending || draft.length <= QUIZ_MIN_QUESTIONS}
                                    className="h-8 w-8 p-0 text-red-400 hover:text-red-500 hover:bg-red-500/10 mt-1"
                                    title="Usuń pytanie"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                            </div>

                            <div className="space-y-2 pl-7">
                                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                    Opcje (zaznacz jedną poprawną)
                                </p>
                                {q.options.map((o, oIdx) => (
                                    <div
                                        key={oIdx}
                                        className={`flex items-center gap-2 p-2 rounded border ${
                                            o.is_correct ? 'bg-green-500/10 border-green-500/30' : 'bg-white/5 border-white/10'
                                        }`}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => setOptionCorrect(qIdx, oIdx)}
                                            disabled={isPending}
                                            className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${
                                                o.is_correct ? 'border-green-500 bg-green-500/20' : 'border-white/20 hover:border-white/40'
                                            }`}
                                            title={o.is_correct ? 'Poprawna odpowiedź' : 'Zaznacz jako poprawną'}
                                        >
                                            {o.is_correct && <Check className="w-3 h-3 text-green-400" />}
                                        </button>
                                        <Badge variant="outline" className="text-[10px] w-7 justify-center">
                                            {OPTION_LABELS[oIdx]}
                                        </Badge>
                                        <Input
                                            value={o.option_text}
                                            onChange={(e) => setOptionText(qIdx, oIdx, e.target.value)}
                                            placeholder={`Opcja ${OPTION_LABELS[oIdx]}`}
                                            className="flex-1"
                                            disabled={isPending}
                                        />
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <div className="flex items-center justify-between gap-3">
                <Button
                    onClick={handleAddQuestion}
                    variant="outline"
                    size="sm"
                    disabled={isPending || draft.length >= QUIZ_MAX_QUESTIONS}
                    className="gap-2"
                >
                    <Plus className="w-4 h-4" /> Dodaj pytanie
                </Button>
                <Button onClick={handleSave} disabled={isPending || !allValid} size="sm" className="gap-2">
                    {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Zapisz quiz
                </Button>
            </div>
        </div>
    )
}
