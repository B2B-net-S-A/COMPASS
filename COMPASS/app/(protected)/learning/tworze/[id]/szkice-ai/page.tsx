import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AcademyShell } from '@/components/academy/AcademyShell'
import { QuestionDraftsPanel } from '@/components/academy/quiz/QuestionDraftsPanel'
import { Button } from '@/components/ui/button'
import { getAcademyAccess } from '@/lib/actions/academy-access'
import { listQuestionDrafts } from '@/lib/actions/academy-question-drafts'
import { getCourseDetail } from '@/lib/actions/courses'
import { MIGRATION_PENDING_PL } from '@/lib/academy/migration-contract'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function QuestionDraftsPage({ params }: { params: { id: string } }) {
    const [access, detail] = await Promise.all([getAcademyAccess(), getCourseDetail(params.id, { author: true })])
    if (!access.success || !detail.success) notFound()
    const drafts = await listQuestionDrafts(detail.data.id)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = user ? await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle() : { data: null }
    return (
        <AcademyShell activeTab="teaching" access={access.data} title="Szkice pytań z AI" description={detail.data.title} action={<Button asChild variant="outline"><Link href={`/learning/tworze/${params.id}/test`}>Otwórz pulę pytań</Link></Button>}>
            {!drafts.success && <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">{drafts.error}</p>}
            {drafts.success && drafts.data.awaitingMigration && <p role="status" className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">{MIGRATION_PENDING_PL}</p>}
            {drafts.success && !drafts.data.awaitingMigration && <QuestionDraftsPanel courseId={detail.data.id} enabled={drafts.data.enabled} drafts={drafts.data.drafts} reviewerName={profile?.full_name ?? 'Ty'} />}
        </AcademyShell>
    )
}
