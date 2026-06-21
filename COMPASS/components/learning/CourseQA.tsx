'use client'

import { useEffect, useState, useTransition } from 'react'
import { MessageSquare, Send, CheckCircle2, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { pl } from 'date-fns/locale'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { toast } from '@/lib/toast'
import { toastSuccess } from '@/lib/toast-success'
import {
    askQuestion,
    answerQuestion,
    listCourseQuestions,
    listAnswersForQuestion,
    type CourseQuestion,
    type CourseAnswer,
} from '@/lib/actions/course-qa'

interface CourseQAProps {
    courseId: string
    lessonId?: string
    /** When true, ukrywa formularz dodawania pytania (np. dla nieaktywnego kursu). */
    readOnly?: boolean
}

function getInitials(name: string | null, fallback: string): string {
    if (name) return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    return fallback.slice(0, 2).toUpperCase()
}

export function CourseQA({ courseId, lessonId, readOnly = false }: CourseQAProps) {
    const [pending, startTransition] = useTransition()
    const [questions, setQuestions] = useState<CourseQuestion[]>([])
    const [loading, setLoading] = useState(true)
    const [newQuestion, setNewQuestion] = useState('')
    const [expandedQid, setExpandedQid] = useState<string | null>(null)
    const [answersMap, setAnswersMap] = useState<Map<string, CourseAnswer[]>>(new Map())
    const [answerDraft, setAnswerDraft] = useState<Map<string, string>>(new Map())

    useEffect(() => {
        startTransition(async () => {
            const res = await listCourseQuestions(courseId, lessonId)
            if (res.success) setQuestions(res.data)
            setLoading(false)
        })
    }, [courseId, lessonId])

    const handleAsk = () => {
        if (newQuestion.trim().length < 10) {
            toast.error('Pytanie musi mieć min 10 znaków.')
            return
        }
        startTransition(async () => {
            const res = await askQuestion({ courseId, lessonId, questionText: newQuestion })
            if (!res.success) {
                toast.error(res.error)
                return
            }
            toastSuccess('Pytanie dodane (+5 pkt loyalty)')
            setNewQuestion('')
            // Refresh list
            const refreshed = await listCourseQuestions(courseId, lessonId)
            if (refreshed.success) setQuestions(refreshed.data)
        })
    }

    const toggleExpand = async (qid: string) => {
        if (expandedQid === qid) {
            setExpandedQid(null)
            return
        }
        setExpandedQid(qid)
        if (!answersMap.has(qid)) {
            const res = await listAnswersForQuestion(qid)
            if (res.success) {
                setAnswersMap((m) => new Map(m).set(qid, res.data))
            }
        }
    }

    const handleAnswer = (qid: string) => {
        const draft = (answerDraft.get(qid) ?? '').trim()
        if (draft.length < 5) {
            toast.error('Odpowiedź musi mieć min 5 znaków.')
            return
        }
        startTransition(async () => {
            const res = await answerQuestion({ questionId: qid, answerText: draft })
            if (!res.success) {
                toast.error(res.error)
                return
            }
            toastSuccess('Odpowiedź dodana')
            setAnswerDraft((m) => {
                const next = new Map(m)
                next.set(qid, '')
                return next
            })
            // Refresh
            const [refreshed, ansRes] = await Promise.all([
                listCourseQuestions(courseId, lessonId),
                listAnswersForQuestion(qid),
            ])
            if (refreshed.success) setQuestions(refreshed.data)
            if (ansRes.success) {
                setAnswersMap((m) => new Map(m).set(qid, ansRes.data))
            }
        })
    }

    return (
        <Card className="bg-card border-border">
            <CardContent className="p-5 space-y-4">
                <div className="flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-primary" />
                    <h3 className="font-semibold">Pytania i odpowiedzi</h3>
                    {questions.length > 0 && (
                        <Badge variant="outline" className="text-[10px]">{questions.length}</Badge>
                    )}
                </div>

                {!readOnly && (
                    <div className="space-y-2">
                        <Textarea
                            placeholder="Zadaj pytanie do tej lekcji lub kursu… (min 10 znaków)"
                            rows={3}
                            value={newQuestion}
                            onChange={(e) => setNewQuestion(e.target.value)}
                            maxLength={2000}
                            disabled={pending}
                        />
                        <div className="flex justify-end">
                            <Button onClick={handleAsk} size="sm" disabled={pending} className="gap-1.5">
                                {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                                Zadaj pytanie
                            </Button>
                        </div>
                    </div>
                )}

                {loading ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">Ładuję…</p>
                ) : questions.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                        Brak pytań. Bądź pierwszy!
                    </p>
                ) : (
                    <div className="space-y-3">
                        {questions.map((q) => {
                            const isExpanded = expandedQid === q.id
                            const answers = answersMap.get(q.id) ?? []
                            return (
                                <div key={q.id} className="border border-border rounded-lg p-3 space-y-2">
                                    <div className="flex items-start gap-3">
                                        <Avatar className="h-7 w-7">
                                            <AvatarImage src={q.user_avatar_url || undefined} />
                                            <AvatarFallback className="text-[10px]">
                                                {getInitials(q.user_full_name, q.user_id)}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-xs font-medium">
                                                    {q.user_full_name ?? 'Anonimowy'}
                                                </span>
                                                <span className="text-[10px] text-muted-foreground">
                                                    {formatDistanceToNow(new Date(q.created_at), {
                                                        addSuffix: true,
                                                        locale: pl,
                                                    })}
                                                </span>
                                                {q.is_resolved && (
                                                    <Badge variant="outline" className="text-[10px] border-success/30 text-success bg-success/10">
                                                        <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" />
                                                        Rozwiązane
                                                    </Badge>
                                                )}
                                            </div>
                                            <p className="text-sm mt-1 whitespace-pre-wrap break-words">
                                                {q.question_text}
                                            </p>
                                        </div>
                                    </div>

                                    <button
                                        onClick={() => toggleExpand(q.id)}
                                        className="text-xs text-primary hover:underline flex items-center gap-1 ml-10"
                                    >
                                        {isExpanded ? (
                                            <ChevronUp className="w-3 h-3" />
                                        ) : (
                                            <ChevronDown className="w-3 h-3" />
                                        )}
                                        {q.answers_count > 0
                                            ? `${q.answers_count} odpowied${q.answers_count === 1 ? 'ź' : 'zi'}`
                                            : 'Odpowiedz'}
                                    </button>

                                    {isExpanded && (
                                        <div className="ml-10 space-y-2 pt-1">
                                            {answers.map((a) => (
                                                <div
                                                    key={a.id}
                                                    className={`p-2 rounded border ${
                                                        a.is_author_answer
                                                            ? 'border-primary/30 bg-primary/5'
                                                            : 'border-border bg-card'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <Avatar className="h-5 w-5">
                                                            <AvatarImage src={a.user_avatar_url || undefined} />
                                                            <AvatarFallback className="text-[8px]">
                                                                {getInitials(a.user_full_name, a.user_id)}
                                                            </AvatarFallback>
                                                        </Avatar>
                                                        <span className="text-xs font-medium">
                                                            {a.user_full_name ?? 'Anonimowy'}
                                                        </span>
                                                        {a.is_author_answer && (
                                                            <Badge variant="outline" className="text-[10px] border-primary/40 text-primary bg-primary/10">
                                                                Autor
                                                            </Badge>
                                                        )}
                                                        <span className="text-[10px] text-muted-foreground">
                                                            {formatDistanceToNow(new Date(a.created_at), {
                                                                addSuffix: true,
                                                                locale: pl,
                                                            })}
                                                        </span>
                                                    </div>
                                                    <p className="text-sm whitespace-pre-wrap break-words">{a.answer_text}</p>
                                                </div>
                                            ))}

                                            {!readOnly && (
                                                <div className="space-y-1.5 pt-1">
                                                    <Textarea
                                                        placeholder="Twoja odpowiedź…"
                                                        rows={2}
                                                        value={answerDraft.get(q.id) ?? ''}
                                                        onChange={(e) =>
                                                            setAnswerDraft((m) => {
                                                                const next = new Map(m)
                                                                next.set(q.id, e.target.value)
                                                                return next
                                                            })
                                                        }
                                                        maxLength={5000}
                                                        disabled={pending}
                                                    />
                                                    <div className="flex justify-end">
                                                        <Button
                                                            size="sm"
                                                            onClick={() => handleAnswer(q.id)}
                                                            disabled={pending}
                                                            variant="outline"
                                                            className="gap-1.5"
                                                        >
                                                            {pending ? (
                                                                <Loader2 className="w-3 h-3 animate-spin" />
                                                            ) : (
                                                                <Send className="w-3 h-3" />
                                                            )}
                                                            Odpowiedz
                                                        </Button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
