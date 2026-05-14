'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Loader2, Play, AlertCircle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { enrollInCourse } from '@/lib/actions/course-learning'

interface CourseDetailActionsProps {
    courseId: string
    courseSlug: string
    isEnrolled: boolean
    hasLessons: boolean
    hasQuiz: boolean
}

export function CourseDetailActions({ courseId, courseSlug, isEnrolled, hasLessons, hasQuiz }: CourseDetailActionsProps) {
    const router = useRouter()
    const [enrolled, setEnrolled] = useState(isEnrolled)
    const [error, setError] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()

    const handleEnroll = () => {
        setError(null)
        startTransition(async () => {
            const res = await enrollInCourse(courseId)
            if (!res.success) {
                setError(res.error)
                return
            }
            setEnrolled(true)
            router.refresh()
        })
    }

    return (
        <Card className="bg-gradient-to-r from-burgundy/10 to-primary/10 border-primary/30">
            <CardContent className="p-5 space-y-3">
                {error && (
                    <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400 flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        {error}
                    </div>
                )}

                {!enrolled && (
                    <div className="space-y-2">
                        <p className="text-sm">
                            Zapisz się na kurs, by uzyskać dostęp do lekcji i quizu. Po zdaniu otrzymasz{' '}
                            <strong className="text-primary">+20 pkt</strong> lojalnościowych.
                        </p>
                        <Button onClick={handleEnroll} disabled={isPending} size="lg" className="gap-2">
                            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                            Zapisz się i zacznij naukę
                        </Button>
                    </div>
                )}

                {enrolled && hasLessons && (
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-5 h-5 text-green-400" />
                            <span className="text-sm font-medium">Jesteś zapisany na kurs</span>
                        </div>
                        <div className="flex gap-2">
                            <Link href={`/learning/${courseSlug}/lekcja/first`}>
                                <Button size="sm" className="gap-2">
                                    <Play className="w-3.5 h-3.5" /> Kontynuuj naukę
                                </Button>
                            </Link>
                            {hasQuiz && (
                                <Link href={`/learning/${courseSlug}/quiz`}>
                                    <Button variant="outline" size="sm" className="gap-2">
                                        Quiz końcowy
                                    </Button>
                                </Link>
                            )}
                        </div>
                    </div>
                )}

                {enrolled && !hasLessons && (
                    <p className="text-sm text-muted-foreground">Kurs nie ma jeszcze lekcji.</p>
                )}
            </CardContent>
        </Card>
    )
}
