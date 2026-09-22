import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { AcademyShell } from '@/components/academy/AcademyShell'
import { AcademyEmptyState } from '@/components/academy/AcademyEmptyState'
import { AcademyCalendar } from '@/components/academy/sessions/AcademyCalendar'
import { getAcademyAccess } from '@/lib/actions/academy-access'
import { listAcademyRuns } from '@/lib/actions/academy-sessions'

export const dynamic = 'force-dynamic'

export default async function AcademyCalendarPage({ searchParams }: { searchParams: { course?: string } }) {
    const courseId = typeof searchParams.course === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(searchParams.course) ? searchParams.course : undefined
    const [access, runs] = await Promise.all([getAcademyAccess(), listAcademyRuns(courseId)])
    return <AcademyShell activeTab="calendar" showCalendar access={access.success ? access.data : { isAdmin: false, canTeach: false }} title="Kalendarz Akademii" description={courseId ? `Terminy wybranego szkolenia${runs.success && runs.data[0] ? `: ${runs.data[0].courseTitle}` : '.'}` : 'Zaplanowane spotkania, terminy Twoich szkoleń i zajęcia, do których możesz dołączyć.'} action={courseId ? <Button asChild variant="outline"><Link href="/learning/kalendarz">Wszystkie szkolenia</Link></Button> : undefined}>{runs.success ? <AcademyCalendar runs={runs.data} now={new Date().toISOString()} /> : <AcademyEmptyState variant="error" title="Nie udało się wczytać terminów" description="Odśwież stronę i spróbuj ponownie. Jeśli problem się powtórzy, skontaktuj się z administratorem." />}</AcademyShell>
}
