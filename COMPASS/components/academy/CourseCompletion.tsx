'use client'

import { useState } from 'react'
import { useAcademyAction } from '@/components/academy/useAcademyAction'
import { useRouter } from 'next/navigation'
import { Award, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { completeAcademyCourse } from '@/lib/actions/course-learning'
import { academyCertificateHref, academyCompletionMessage } from '@/lib/academy/navigation'

export function CourseCompletion({ courseId, enrollmentId, completedAt, revokedAt, revokedReason }: {
    courseId: string; enrollmentId: string; completedAt?: string | null; revokedAt?: string | null; revokedReason?: string | null
}) {
    const router = useRouter()
    const [completed, setCompleted] = useState(!!completedAt)
    const [message, setMessage] = useState<string | null>(null)
    const [pending, startTransition] = useAcademyAction()
    const done = completed || !!completedAt

    function checkCompletion() {
        setMessage(null)
        startTransition(async () => {
            try {
                const result = await completeAcademyCourse(courseId, enrollmentId)
                if (!result.success) { setMessage(result.error); return }
                if (!result.data.completed) { setMessage(academyCompletionMessage(result.data.reason)); return }
                setCompleted(true)
                router.refresh()
            } catch {
                setMessage('Połączenie zostało przerwane. Spróbuj ponownie.')
            }
        })
    }

    if (revokedAt) return <div role="status" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
        <p className="font-semibold text-destructive">Ukończenie i certyfikat unieważnione</p>
        <p>{revokedReason}</p><p className="mt-1 text-muted-foreground">Historia nauki została zachowana. To ukończenie nie potwierdza już wymagań wstępnych do nowych szkoleń.</p>
    </div>
    return <div className="space-y-2">
        {done ? <Button asChild variant="outline" className="gap-2">
            <a href={academyCertificateHref(courseId, enrollmentId)}><Award className="h-4 w-4" />Pobierz certyfikat</a>
        </Button> : <Button variant="outline" onClick={checkCompletion} disabled={pending} className="gap-2">
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}Sprawdź warunki ukończenia
        </Button>}
        {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
    </div>
}
