import { notFound } from 'next/navigation'
import { AcademyEmptyState } from '@/components/academy/AcademyEmptyState'
import { AcademyShell } from '@/components/academy/AcademyShell'
import { RetrievalRunner } from '@/components/academy/RetrievalRunner'
import { isAcademySwitchOn } from '@/lib/academy/switches'
import { getAcademyAccess } from '@/lib/actions/academy-access'
import { listMyRetrievals, openRetrieval } from '@/lib/actions/academy-retrieval'

export const dynamic = 'force-dynamic'

export default async function RetrievalPage({ params }: { params: { id: string } }) {
    if (!isAcademySwitchOn('ACADEMY_RETRIEVAL_ENABLED')) notFound()
    const [access, session, list] = await Promise.all([getAcademyAccess(), openRetrieval(params.id), listMyRetrievals()])
    const courseTitle = list.success ? list.data.find(item => item.id === params.id)?.course_title ?? 'szkolenie' : 'szkolenie'
    return <AcademyShell activeTab="my" access={access.success ? access.data : { isAdmin: false, canTeach: false }} title="Powtórka">
        {session.success ? <RetrievalRunner session={session.data} courseTitle={courseTitle} /> : <AcademyEmptyState variant="error" title="Nie udało się otworzyć powtórki" description={session.error} />}
    </AcademyShell>
}
