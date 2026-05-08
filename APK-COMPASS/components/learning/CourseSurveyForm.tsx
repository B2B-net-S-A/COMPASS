'use client'

import { useState, useTransition } from 'react'
import { Heart, Send, Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/lib/toast'
import { toastSuccess } from '@/lib/toast-success'
import { submitCourseSurvey } from '@/lib/actions/course-survey'

interface CourseSurveyFormProps {
    courseId: string
}

/**
 * A2.5: Post-course survey — 3 pytania (NPS, best part, improvement).
 */
export function CourseSurveyForm({ courseId }: CourseSurveyFormProps) {
    const [pending, startTransition] = useTransition()
    const [nps, setNps] = useState<number | null>(null)
    const [bestPart, setBestPart] = useState('')
    const [improvement, setImprovement] = useState('')
    const [submitted, setSubmitted] = useState(false)

    const handleSubmit = () => {
        if (nps === null) {
            toast.error('Wybierz ocenę 1-10.')
            return
        }
        startTransition(async () => {
            const res = await submitCourseSurvey({
                courseId,
                npsScore: nps,
                bestPart,
                improvementSuggestion: improvement,
            })
            if (!res.success) {
                toast.error(res.error)
                return
            }
            toastSuccess('Dziękujemy za feedback!')
            setSubmitted(true)
        })
    }

    if (submitted) {
        return (
            <Card className="bg-green-500/5 border-green-500/20">
                <CardContent className="p-5 text-center space-y-2">
                    <Heart className="w-8 h-8 text-green-400 mx-auto" />
                    <p className="font-semibold">Dziękujemy!</p>
                    <p className="text-xs text-muted-foreground">
                        Twój feedback pomaga autorowi i innym studentom.
                    </p>
                </CardContent>
            </Card>
        )
    }

    return (
        <Card>
            <CardContent className="p-5 space-y-4">
                <div>
                    <h3 className="font-semibold mb-1">Wypełnij krótką ankietę</h3>
                    <p className="text-xs text-muted-foreground">
                        3 pytania — pomóż autorowi ulepszyć kurs.
                    </p>
                </div>

                {/* NPS 1-10 */}
                <div className="space-y-2">
                    <label className="text-sm font-medium">
                        1. Czy poleciłbyś ten kurs koledze? (1 = nigdy, 10 = zdecydowanie)
                    </label>
                    <div className="flex gap-1 flex-wrap">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                            <button
                                key={n}
                                type="button"
                                onClick={() => setNps(n)}
                                disabled={pending}
                                className={`w-9 h-9 rounded-md border text-sm font-medium transition-colors ${
                                    nps === n
                                        ? n >= 9
                                            ? 'bg-green-500/20 border-green-500/50 text-green-300'
                                            : n >= 7
                                              ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                                              : 'bg-red-500/20 border-red-500/50 text-red-300'
                                        : 'bg-white/5 border-white/10 hover:border-white/30'
                                }`}
                            >
                                {n}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Best part */}
                <div className="space-y-1.5">
                    <label className="text-sm font-medium">2. Co było najlepsze?</label>
                    <Textarea
                        rows={2}
                        maxLength={1000}
                        value={bestPart}
                        onChange={(e) => setBestPart(e.target.value)}
                        placeholder="np. Konkrety przykłady kodu, jasne tłumaczenie konceptów…"
                        disabled={pending}
                    />
                </div>

                {/* Improvement */}
                <div className="space-y-1.5">
                    <label className="text-sm font-medium">3. Co byś zmienił?</label>
                    <Textarea
                        rows={2}
                        maxLength={1000}
                        value={improvement}
                        onChange={(e) => setImprovement(e.target.value)}
                        placeholder="np. Więcej ćwiczeń praktycznych, krótsze lekcje…"
                        disabled={pending}
                    />
                </div>

                <Button onClick={handleSubmit} disabled={pending} className="gap-2 w-full sm:w-auto">
                    {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Wyślij feedback
                </Button>
            </CardContent>
        </Card>
    )
}
