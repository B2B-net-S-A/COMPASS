import { CheckCircle2, XCircle } from 'lucide-react'
import { MarkdownView } from '@/components/learning/MarkdownView'
import { Card, CardContent } from '@/components/ui/card'
import type { QuizAttemptResult } from '@/lib/types/learning'
import { cn } from '@/lib/utils'

const OPTION_LABELS = ['A', 'B', 'C', 'D', 'E', 'F']

export function topicsToReview(topics: QuizAttemptResult['topics']) {
    return topics.filter(topic => topic.correct < topic.total)
}

export function QuizResultDetails({ result }: { result: QuizAttemptResult }) {
    const toReview = topicsToReview(result.topics)
    return (
        <div className="space-y-4">
            <Card>
                <CardContent className="space-y-3 p-5">
                    <h2 className="font-semibold">Wynik według tematów</h2>
                    <ul className="space-y-2 text-sm">
                        {result.topics.map(topic => (
                            <li key={topic.topic} className="flex items-center justify-between gap-3">
                                <span className="break-words">{topic.topic}</span>
                                <span className="shrink-0 tabular-nums text-muted-foreground">{topic.correct} z {topic.total}</span>
                            </li>
                        ))}
                    </ul>
                    {toReview.length > 0 && <p className="border-t border-border pt-3 text-sm"><span className="font-medium">Do powtórki: </span>{toReview.map(topic => topic.topic).join(', ')}</p>}
                </CardContent>
            </Card>
            {result.review && (
                <section aria-label="Pytania z wyjaśnieniami" className="space-y-3">
                    <h2 className="font-semibold">Pytania z wyjaśnieniami</h2>
                    {result.review.map(question => {
                        const chosen = question.options.find(option => option.id === question.selected_option_id)
                        const correct = question.voided || chosen?.is_correct === true
                        return (
                            <Card key={question.position}>
                                <CardContent className="space-y-3 p-4 sm:p-5">
                                    <p className={cn('flex items-center gap-1.5 text-xs font-medium', correct ? 'text-success' : 'text-destructive')}>
                                        {correct ? <CheckCircle2 className="size-4" aria-hidden="true" /> : <XCircle className="size-4" aria-hidden="true" />}
                                        Pytanie {question.position}{question.voided ? ', unieważnione: uznane za poprawne' : correct ? ', dobrze' : chosen ? ', błędnie' : ', bez odpowiedzi'}
                                    </p>
                                    <MarkdownView content={question.question_text} className="break-words prose-pre:overflow-x-auto prose-pre:text-xs [&_pre_code]:bg-transparent [&_pre_code]:p-0" />
                                    <ul className="space-y-2">
                                        {question.options.map((option, index) => (
                                            <li key={option.id} className={cn('rounded-lg border p-3 text-sm', option.is_correct ? 'border-success/40 bg-success/5' : option.id === question.selected_option_id ? 'border-destructive/40 bg-destructive/5' : 'border-border')}>
                                                <p className="break-words"><span className="font-semibold">{OPTION_LABELS[index]}.</span> {option.option_text}{option.is_correct && <span className="ml-2 text-xs font-medium text-success">Poprawna</span>}{option.id === question.selected_option_id && <span className="ml-2 text-xs text-muted-foreground">Twoja odpowiedź</span>}</p>
                                                {option.explanation && <p className="mt-1 break-words text-xs text-muted-foreground">{option.explanation}</p>}
                                            </li>
                                        ))}
                                    </ul>
                                </CardContent>
                            </Card>
                        )
                    })}
                </section>
            )}
        </div>
    )
}
