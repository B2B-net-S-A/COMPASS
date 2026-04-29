'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { GraduationCap } from 'lucide-react'
import { CourseAuthorForm } from '@/components/akademia/CourseAuthorForm'

export default function NewCoursePage() {
    const router = useRouter()

    return (
        <div className="p-6 md:p-8 max-w-3xl mx-auto space-y-6">
            <div>
                <Link href="/akademia/tworze" className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1 mb-2">
                    ← Moje szkolenia
                </Link>
                <div className="flex items-center gap-3">
                    <GraduationCap className="w-7 h-7 text-primary" />
                    <h1 className="text-3xl font-bold tracking-tight">Nowe szkolenie</h1>
                </div>
                <p className="text-muted-foreground mt-1">Krok 1/3 — meta. Po zapisie przejdziesz do edycji lekcji i quizu.</p>
            </div>

            <CourseAuthorForm
                onSuccess={(courseId) => {
                    router.push(`/akademia/tworze/${courseId}/edit`)
                }}
            />
        </div>
    )
}
