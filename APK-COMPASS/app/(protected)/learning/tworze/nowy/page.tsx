import Link from 'next/link'
import { GraduationCap } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { NewCourseClient } from './NewCourseClient'

export const dynamic = 'force-dynamic'

interface PageProps {
    searchParams: { type?: string }
}

// Phase 1.4 (2026-05-04): wizard accepts ?type=company to default the form to a company course.
// Server-side role check determines whether company-type selector is enabled in the form
// (admin/trainer only — consultants get a silent downgrade in createCourse if they bypass UI).
export default async function NewCoursePage({ searchParams }: PageProps) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    let role = 'consultant'
    if (user) {
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
        role = profile?.role || 'consultant'
    }

    const isAdminOrTrainer = ['admin'].includes(role)
    const defaultType = searchParams.type === 'company' && isAdminOrTrainer ? 'company' : 'consultant'

    return (
        <div className="p-6 md:p-8 max-w-3xl mx-auto space-y-6">
            <div>
                <Link href="/learning/tworze" className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1 mb-2">
                    ← Moje szkolenia
                </Link>
                <div className="flex items-center gap-3">
                    <GraduationCap className="w-7 h-7 text-primary" />
                    <h1 className="text-3xl font-bold tracking-tight">Nowe szkolenie</h1>
                </div>
                <p className="text-muted-foreground mt-1">Krok 1/3 — meta. Po zapisie przejdziesz do edycji lekcji i quizu.</p>
            </div>

            <NewCourseClient
                allowCompanyType={isAdminOrTrainer}
                defaultCourseType={defaultType}
            />
        </div>
    )
}
