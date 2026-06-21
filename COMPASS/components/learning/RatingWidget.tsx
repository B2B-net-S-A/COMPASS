'use client'

import { useState, useTransition } from 'react'
import { Star, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { submitRating } from '@/lib/actions/course-learning'

interface RatingWidgetProps {
    courseId: string
    initialRating?: number
    initialComment?: string | null
    onSaved?: () => void
}

export function RatingWidget({ courseId, initialRating, initialComment, onSaved }: RatingWidgetProps) {
    const [rating, setRating] = useState<number>(initialRating ?? 0)
    const [hoverRating, setHoverRating] = useState<number>(0)
    const [comment, setComment] = useState<string>(initialComment ?? '')
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()

    const isUpdating = !!initialRating

    const handleSubmit = () => {
        if (rating < 1 || rating > 5) {
            setError('Wybierz ocenę od 1 do 5 gwiazdek')
            return
        }
        setError(null)
        setSuccess(null)
        startTransition(async () => {
            const res = await submitRating(courseId, rating, comment.trim() || undefined)
            if (!res.success) {
                setError(res.error)
                return
            }
            setSuccess(isUpdating ? 'Ocena zaktualizowana ✓' : 'Dziękujemy za ocenę! ✓')
            setTimeout(() => setSuccess(null), 3000)
            onSaved?.()
        })
    }

    return (
        <Card className="bg-gradient-to-br from-warning/10 to-primary/10 border-warning/20">
            <CardContent className="p-5 space-y-4">
                <div>
                    <h3 className="text-lg font-semibold mb-1">{isUpdating ? 'Twoja ocena' : 'Oceń szkolenie'}</h3>
                    <p className="text-xs text-muted-foreground">
                        Twoja ocena wpływa na multiplier punktów autora (im wyższa średnia kursu, tym więcej dostaje za ucznia).
                    </p>
                </div>

                <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((n) => {
                        const filled = (hoverRating || rating) >= n
                        return (
                            <button
                                key={n}
                                type="button"
                                onClick={() => setRating(n)}
                                onMouseEnter={() => setHoverRating(n)}
                                onMouseLeave={() => setHoverRating(0)}
                                disabled={isPending}
                                className="p-1 transition-transform hover:scale-110"
                                aria-label={`${n} ${n === 1 ? 'gwiazdka' : 'gwiazdek'}`}
                            >
                                <Star
                                    className={`w-8 h-8 transition-colors ${
                                        filled ? 'fill-warning text-warning' : 'text-muted-foreground'
                                    }`}
                                />
                            </button>
                        )
                    })}
                    <span className="ml-3 text-sm text-muted-foreground">
                        {rating > 0 ? `${rating}/5` : 'Wybierz ocenę'}
                    </span>
                </div>

                <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Komentarz (opcjonalnie)</label>
                    <Textarea
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        rows={3}
                        placeholder="Co Ci się podobało? Co można poprawić?"
                        disabled={isPending}
                    />
                </div>

                {error && (
                    <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        {error}
                    </div>
                )}
                {success && (
                    <div className="p-3 rounded-lg bg-success/10 border border-success/20 text-sm text-success flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4" /> {success}
                    </div>
                )}

                <Button onClick={handleSubmit} disabled={isPending || rating === 0} className="gap-2">
                    {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                    {isUpdating ? 'Zapisz zmiany' : 'Wyślij ocenę'}
                </Button>
            </CardContent>
        </Card>
    )
}
