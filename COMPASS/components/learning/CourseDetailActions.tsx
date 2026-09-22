'use client'

import { useState } from 'react'
import { useAcademyAction } from '@/components/academy/useAcademyAction'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2, Play } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CourseCompletion } from '@/components/academy/CourseCompletion'
import { enrollInCourse } from '@/lib/actions/course-learning'
import { academyCourseHref } from '@/lib/academy/navigation'
import type { CourseDeliveryMode } from '@/lib/types/learning'

interface CourseDetailActionsProps {
    courseId: string
    courseSlug: string
    isEnrolled: boolean
    hasLessons: boolean
    hasQuiz: boolean
    deliveryMode?: CourseDeliveryMode
    enrollmentId?: string | null
    runId?: string | null
    revokedAt?: string | null
    revokedReason?: string | null
    completedAt?: string | null
}

export function CourseDetailActions({ courseId, courseSlug, hasLessons, hasQuiz, deliveryMode = 'self_paced', enrollmentId, runId, completedAt, revokedAt, revokedReason }: CourseDetailActionsProps) {
    const router = useRouter()
    const [error, setError] = useState<string | null>(null)
    const [isPending, startTransition] = useAcademyAction()

    function enroll() {
        setError(null)
        startTransition(async () => {
            try {
                const result = await enrollInCourse(courseId)
                if (!result.success) { setError(result.error); return }
                router.push(academyCourseHref(courseSlug, result.data.enrollmentId))
                router.refresh()
            } catch {
                setError('Połączenie zostało przerwane. Spróbuj ponownie.')
            }
        })
    }

    return <Card className="border-primary/30 bg-primary/5"><CardContent className="space-y-4 p-5">
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {!enrollmentId && (deliveryMode === 'self_paced' ? <>
            <p className="text-sm">Zapisz się, aby uzyskać dostęp do materiałów i zachować postęp nauki.</p>
            <Button onClick={enroll} disabled={isPending} className="gap-2">
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}Zapisz się i rozpocznij
            </Button>
        </> : <>
            <p className="text-sm">Wybierz edycję szkolenia z dogodnym terminem. Zapis obejmuje wszystkie wymagane spotkania tej edycji.</p>
            <Button asChild><Link href={`/learning/kalendarz?course=${encodeURIComponent(courseId)}`}>Wybierz termin</Link></Button>
        </>)}
        {enrollmentId && <>
            <p className="text-sm font-medium">{revokedAt ? 'Historia szkolenia' : completedAt ? 'Szkolenie ukończone' : 'Jesteś zapisany na szkolenie'}</p>
            <div className="flex flex-wrap gap-2">
                {hasLessons && <Button asChild className="gap-2"><Link href={academyCourseHref(courseSlug, enrollmentId, '/lekcja/first')}><Play className="h-4 w-4" />Kontynuuj naukę</Link></Button>}
                {hasQuiz && <Button asChild variant="outline"><Link href={academyCourseHref(courseSlug, enrollmentId, '/quiz')}>Quiz końcowy</Link></Button>}
                {runId && <Button asChild variant="outline"><Link href={`/learning/edycje/${runId}`}>Spotkania i obecność</Link></Button>}
            </div>
            <CourseCompletion key={enrollmentId} courseId={courseId} enrollmentId={enrollmentId} completedAt={completedAt} revokedAt={revokedAt} revokedReason={revokedReason} />
        </>}
    </CardContent></Card>
}
