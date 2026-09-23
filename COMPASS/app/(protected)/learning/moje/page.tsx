import { AcademyShell } from '@/components/academy/AcademyShell'
import { AcademyEmptyState } from '@/components/academy/AcademyEmptyState'
import { AcademyMyLearning } from '@/components/academy/AcademyMyLearning'
import { getMyEnrollmentsPage } from '@/lib/actions/course-learning'
import { getAcademyAccess } from '@/lib/actions/academy-access'
import { listMyAcademyRuns } from '@/lib/actions/academy-sessions'

export const dynamic = 'force-dynamic'

function pageNumber(value?: string) {
    const parsed = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : 1
    return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 100_000 ? parsed : 1
}

export default async function MyEnrollmentsPage({ searchParams }: { searchParams: { activePage?: string; completedPage?: string; revokedPage?: string } }) {
    const [access, result, runs] = await Promise.all([
        getAcademyAccess(),
        getMyEnrollmentsPage({ activePage: pageNumber(searchParams.activePage), completedPage: pageNumber(searchParams.completedPage), revokedPage: pageNumber(searchParams.revokedPage) }),
        listMyAcademyRuns(),
    ])
    return <AcademyShell activeTab="my" access={access.success ? access.data : { isAdmin: false, canTeach: false }} title="Moje szkolenia" description="Twój postęp, najbliższe zajęcia, lista rezerwowa i certyfikaty.">
        {!runs.success && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">Nie udało się odczytać terminów i listy rezerwowej. Odśwież stronę, aby je sprawdzić.</p>}
        {!result.success ? <AcademyEmptyState variant="error" title="Nie udało się wczytać postępów" description="Odśwież stronę i spróbuj ponownie. Twoje zapisy i ukończenia pozostają zachowane." /> : <AcademyMyLearning enrollments={result.data.items} pagination={result.data} runs={runs.success ? runs.data : undefined} now={new Date().toISOString()} />}
    </AcademyShell>
}
