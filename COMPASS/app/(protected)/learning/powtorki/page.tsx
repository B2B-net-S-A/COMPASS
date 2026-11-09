import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AcademyEmptyState } from '@/components/academy/AcademyEmptyState'
import { AcademyShell } from '@/components/academy/AcademyShell'
import { isAcademySwitchOn } from '@/lib/academy/switches'
import { getAcademyAccess } from '@/lib/actions/academy-access'
import { listMyRetrievals } from '@/lib/actions/academy-retrieval'

export const dynamic = 'force-dynamic'

export default async function RetrievalListPage() {
    if (!isAcademySwitchOn('ACADEMY_RETRIEVAL_ENABLED')) notFound()
    const [access, result] = await Promise.all([getAcademyAccess(), listMyRetrievals()])
    return <AcademyShell activeTab="my" access={access.success ? access.data : { isAdmin: false, canTeach: false }} title="Powtórki" description="Krótkie pytania po szkoleniu. Bez oceny, wynik widzisz tylko Ty.">
        {!result.success ? <AcademyEmptyState variant="error" title="Nie udało się pobrać powtórek" description={result.error} />
            : result.data.length === 0 ? <AcademyEmptyState title="Brak powtórek" description="Pierwsza pojawi się 14 dni po ukończeniu szkolenia." />
            : <ul className="space-y-2">{result.data.map(item => <li key={item.id}>
                <Link href={`/learning/powtorki/${item.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 hover:bg-muted">
                    <span><span className="block font-medium">{item.course_title}</span><span className="text-sm text-muted-foreground">Dzień {item.offset_days}</span></span>
                    <span className="text-sm text-muted-foreground">{item.completed_at ? 'Ukończona' : 'Do zrobienia'}</span>
                </Link></li>)}</ul>}
    </AcademyShell>
}
