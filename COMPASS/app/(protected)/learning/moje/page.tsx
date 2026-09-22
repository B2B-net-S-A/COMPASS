import { AcademyShell } from '@/components/academy/AcademyShell'
import { AcademyEmptyState } from '@/components/academy/AcademyEmptyState'
import { AcademyMyLearning } from '@/components/academy/AcademyMyLearning'
import { getMyEnrollments } from '@/lib/actions/course-learning'
import { getAcademyAccess } from '@/lib/actions/academy-access'
import { listAcademyRuns } from '@/lib/actions/academy-sessions'

export const dynamic = 'force-dynamic'

export default async function MyEnrollmentsPage() {
    const [access, result, runs] = await Promise.all([getAcademyAccess(), getMyEnrollments(), listAcademyRuns()])
    return <AcademyShell activeTab="my" access={access.success ? access.data : { isAdmin: false, canTeach: false }} title="Moje szkolenia" description="Twój postęp, najbliższe zajęcia, lista rezerwowa i certyfikaty.">
        {!runs.success && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">Nie udało się odczytać terminów i listy rezerwowej. Odśwież stronę, aby je sprawdzić.</p>}
        {!result.success ? <AcademyEmptyState variant="error" title="Nie udało się wczytać postępów" description="Odśwież stronę i spróbuj ponownie. Twoje zapisy i ukończenia pozostają zachowane." /> : <AcademyMyLearning enrollments={result.data} runs={runs.success ? runs.data : undefined} now={new Date().toISOString()} />}
    </AcademyShell>
}
