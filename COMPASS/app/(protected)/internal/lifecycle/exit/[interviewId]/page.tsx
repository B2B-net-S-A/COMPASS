import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createLifecycleClient as createClient } from '@/lib/supabase/lifecycle-client'
import { requireLifecycleManagerAction } from '@/lib/auth/internal-guard'
import { ExitInterviewReviewPanel } from '../../components/ExitInterviewReviewPanel'
import type { ExitInterview } from '@/lib/types/lifecycle'

export const dynamic = 'force-dynamic'

export default async function ExitInterviewReviewPage({ params }: { params: { interviewId: string } }) {
    await requireLifecycleManagerAction() // TCM/admin only

    const supabase = createClient()
    const { data: interview, error } = await supabase
        .from('exit_interviews')
        .select('*, user:profiles!user_id(full_name, email)')
        .eq('id', params.interviewId)
        .single()

    if (error || !interview) notFound()

    const i = interview as ExitInterview & { user: { full_name: string | null; email: string | null } | null }

    return (
        <div className="container mx-auto p-6 max-w-3xl space-y-6">
            <header>
                <Link href="/internal/lifecycle/exit" className="text-xs text-muted-foreground underline">
                    ← Powrót do kolejki
                </Link>
                <h1 className="text-2xl font-bold mt-1">
                    Exit interview — {i.is_anonymous ? <em>anonimowo</em> : i.user?.full_name ?? i.user?.email}
                </h1>
                <p className="text-sm text-muted-foreground">
                    Status: <strong>{i.status}</strong> • Rola: {i.role_snapshot} • Staż: {i.tenure_months ?? '?'} mies.
                </p>
            </header>

            <ExitInterviewReviewPanel interview={i} />
        </div>
    )
}
