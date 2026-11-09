'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { answerRetrieval, type RetrievalReveal, type RetrievalSession } from '@/lib/actions/academy-retrieval'
import { cn } from '@/lib/utils'

const LETTERS = 'ABCDEF'

export function RetrievalRunner({ session, courseTitle }: { session: RetrievalSession; courseTitle: string }) {
    const firstOpen = session.questions.findIndex(question => !question.answer)
    const [index, setIndex] = useState(firstOpen === -1 ? session.questions.length - 1 : firstOpen)
    const [reveals, setReveals] = useState<Record<string, RetrievalReveal>>(() => Object.fromEntries(session.questions.flatMap(question => question.answer ? [[question.id, question.answer]] : [])))
    const [error, setError] = useState<string | null>(null)
    const [pending, start] = useTransition()
    const question = session.questions[index]
    const reveal = reveals[question.id]
    const last = index === session.questions.length - 1
    const finished = session.questions.every(item => reveals[item.id])

    const answer = (optionId: string) => start(async () => {
        setError(null)
        const result = await answerRetrieval(session.id, question.id, optionId).catch(() => null)
        if (!result?.success) { setError(result?.error ?? 'Nie udało się zapisać odpowiedzi. Odśwież stronę.'); return }
        setReveals(current => ({ ...current, [question.id]: result.data }))
    })

    return <div className="mx-auto w-full max-w-xl space-y-4">
        <header><h2 className="text-lg font-semibold">Powtórka: {courseTitle}, dzień {session.offset_days}</h2><p className="text-sm text-muted-foreground">{session.questions.length} pytania, około 2 minut</p></header>
        <section aria-label={`Pytanie ${index + 1} z ${session.questions.length}`} className="space-y-3 rounded-2xl border border-border bg-card p-5">
            <p className="text-xs font-medium text-muted-foreground">Pytanie {index + 1} z {session.questions.length}</p>
            <p className="font-medium">{question.text}</p>
            <ul className="space-y-2">
                {question.options.map((option, optionIndex) => {
                    const isSelected = reveal?.selected_option_id === option.id
                    const isCorrect = reveal?.correct_option_id === option.id
                    return <li key={option.id}>
                        <button type="button" disabled={!!reveal || pending} onClick={() => answer(option.id)}
                            className={cn('w-full rounded-xl border p-3 text-left text-sm', isCorrect ? 'border-success bg-success/5' : isSelected ? 'border-destructive bg-destructive/5' : 'border-border')}>
                            <span className="mr-2 font-semibold">{LETTERS[optionIndex]}</span>{option.text}
                            {isSelected && <span className="block text-xs text-muted-foreground">Twoja odpowiedź</span>}
                            {isCorrect && <span className="block text-xs font-medium text-success">Poprawna odpowiedź</span>}
                        </button>
                    </li>
                })}
            </ul>
            {reveal?.explanation && <p className="rounded-lg bg-muted p-3 text-sm">{reveal.explanation}</p>}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            {reveal && !last && <Button type="button" onClick={() => setIndex(value => value + 1)}>Następne pytanie</Button>}
            {finished && last && <p className="font-medium">Gotowe. Powtórka zapisana.</p>}
        </section>
        <div className="flex items-center justify-between gap-3"><p className="text-xs text-muted-foreground">Bez oceny. Wynik widzisz tylko Ty.</p>{finished && <Button asChild variant="outline"><Link href="/learning/powtorki">Moje powtórki</Link></Button>}</div>
    </div>
}
