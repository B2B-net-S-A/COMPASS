'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { academyCourseHref } from '@/lib/academy/navigation'
import { enrollInCourse } from '@/lib/actions/course-learning'

export function CertificateRenewButton({ courseId, courseSlug }: { courseId: string; courseSlug: string }) {
    const router = useRouter()
    const [error, setError] = useState<string | null>(null)
    const [pending, start] = useTransition()
    const renew = () => start(async () => {
        setError(null)
        const result = await enrollInCourse(courseId).catch(() => null)
        if (!result?.success) { setError(result?.error ?? 'Nie udało się otworzyć kolejnego cyklu. Spróbuj ponownie.'); return }
        router.push(academyCourseHref(courseSlug, result.data.enrollmentId))
    })
    return <div className="space-y-1">
        <Button type="button" disabled={pending} onClick={renew}>Odnów certyfikat</Button>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
}
