'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAcademyAction } from '@/components/academy/useAcademyAction'
import { createTwinCourse } from '@/lib/actions/academy-twin-course'

export function TwinCourseButton({ runId }: { runId: string }) {
    const router = useRouter()
    const [pending, perform] = useAcademyAction()
    const [error, setError] = useState<string | null>(null)

    function create() {
        setError(null)
        perform(async () => {
            try {
                const result = await createTwinCourse(runId)
                if (!result?.success) { setError(result?.error ?? 'Nie udało się utworzyć kursu. Spróbuj ponownie.'); return }
                router.push(`/learning/tworze/${result.data.courseId}/edit`)
            } catch {
                setError('Połączenie zostało przerwane. Spróbuj ponownie.')
            }
        })
    }

    return <section className="space-y-2 rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Kurs dla nieobecnych</h2>
        <p className="text-sm text-muted-foreground">Powstanie szkic kursu z modułów z tą samą pulą pytań i listą osób, których nie było. Moduły dodaje prowadzący, a szkic przechodzi zwykłą akceptację. Nic nie zostanie wysłane.</p>
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={create}>{pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}Utwórz kurs dla nieobecnych</Button>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </section>
}
