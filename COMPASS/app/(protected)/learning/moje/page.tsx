import { AcademyShell } from '@/components/academy/AcademyShell'
import { AcademyEmptyState } from '@/components/academy/AcademyEmptyState'
import { AcademyMyLearning } from '@/components/academy/AcademyMyLearning'
import { getMyEnrollmentsPage } from '@/lib/actions/course-learning'
import { getAcademyAccess } from '@/lib/actions/academy-access'
import { getMyAcademyRunOverview } from '@/lib/actions/academy-sessions'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

function pageNumber(value?: string) {
    const parsed = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : 1
    return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 100_000 ? parsed : 1
}

export default async function MyEnrollmentsPage({ searchParams }: { searchParams: { activePage?: string; completedPage?: string; revokedPage?: string; waitlistPage?: string } }) {
    const activePage = pageNumber(searchParams.activePage)
    const completedPage = pageNumber(searchParams.completedPage)
    const revokedPage = pageNumber(searchParams.revokedPage)
    const waitlistPage = pageNumber(searchParams.waitlistPage)
    const [access, result, overview] = await Promise.all([
        getAcademyAccess(),
        getMyEnrollmentsPage({ activePage, completedPage, revokedPage }),
        getMyAcademyRunOverview(waitlistPage),
    ])
    if (overview.success) {
        const lastPage = Math.max(1, Math.ceil(overview.data.waiting.total / overview.data.waiting.pageSize))
        if (waitlistPage > lastPage) {
            redirect(`/learning/moje?${new URLSearchParams({
                activePage: String(activePage), completedPage: String(completedPage),
                revokedPage: String(revokedPage), waitlistPage: String(lastPage),
            })}`)
        }
    }
    return <AcademyShell activeTab="my" access={access.success ? access.data : { isAdmin: false, canTeach: false }} title="Moje szkolenia" description="Twój postęp, najbliższe zajęcia, lista rezerwowa i certyfikaty.">
        {!overview.success && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">Nie udało się odczytać terminów i listy rezerwowej. Odśwież stronę, aby je sprawdzić.</p>}
        {!result.success ? <AcademyEmptyState variant="error" title="Nie udało się wczytać postępów" description="Odśwież stronę i spróbuj ponownie. Twoje zapisy i ukończenia pozostają zachowane." /> : <AcademyMyLearning enrollments={result.data.items} pagination={result.data} overview={overview.success ? overview.data : undefined} />}
    </AcademyShell>
}
