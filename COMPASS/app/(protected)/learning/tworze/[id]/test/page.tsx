import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AcademyShell } from '@/components/academy/AcademyShell'
import { QuizBankEditor } from '@/components/academy/quiz/QuizBankEditor'
import { Button } from '@/components/ui/button'
import { getAcademyAccess } from '@/lib/actions/academy-access'
import { getQuizBank } from '@/lib/actions/academy-quiz-bank'
import { getCourseDetail } from '@/lib/actions/courses'
import { MIGRATION_PENDING_PL } from '@/lib/academy/migration-contract'

export const dynamic = 'force-dynamic'

export default async function QuizBankPage({ params }: { params: { id: string } }) {
    const [access, detail] = await Promise.all([getAcademyAccess(), getCourseDetail(params.id, { author: true })])
    if (!access.success || !detail.success) notFound()
    const bank = await getQuizBank(detail.data.id)
    return (
        <AcademyShell activeTab="teaching" access={access.data} title="Test końcowy i bank pytań" description={detail.data.title} action={<div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link href={`/learning/tworze/${params.id}/szkice-ai`}>Szkice pytań z AI</Link></Button><Button asChild variant="outline"><Link href={`/learning/tworze/${params.id}/edit`}>Wróć do szkolenia</Link></Button></div>}>
            {!bank.success && <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">{bank.error}</p>}
            {bank.success && bank.data.awaitingMigration && <p role="status" className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">{MIGRATION_PENDING_PL}</p>}
            {bank.success && !bank.data.awaitingMigration && <QuizBankEditor bank={bank.data} />}
        </AcademyShell>
    )
}
