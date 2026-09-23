import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { AcademyShell } from '@/components/academy/AcademyShell'
import { AcademyEmptyState } from '@/components/academy/AcademyEmptyState'
import { AcademyCalendar } from '@/components/academy/sessions/AcademyCalendar'
import { getAcademyAccess } from '@/lib/actions/academy-access'
import { listAcademyRunPage } from '@/lib/actions/academy-sessions'
import { calendarDay, shiftCalendarMonth } from '@/components/academy/sessions/calendar-model'

export const dynamic = 'force-dynamic'

export default async function AcademyCalendarPage({ searchParams }: { searchParams: { course?: string; month?: string; mine?: string; page?: string } }) {
    const courseId = typeof searchParams.course === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(searchParams.course) ? searchParams.course : undefined
    const now = new Date().toISOString()
    const month = typeof searchParams.month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(searchParams.month) ? searchParams.month : calendarDay(now).slice(0, 7)
    const parsedPage = Number(searchParams.page)
    const page = Number.isSafeInteger(parsedPage) && parsedPage >= 1 && parsedPage <= 20_000_000 ? parsedPage : 1
    const mine = searchParams.mine === '1'
    // The RPC interprets these nominal UTC dates as Warsaw month boundaries before pagination.
    const start = new Date(`${month}-01T00:00:00Z`).toISOString()
    const end = new Date(`${shiftCalendarMonth(month, 1)}-01T00:00:00Z`).toISOString()
    const [access, runs] = await Promise.all([getAcademyAccess(), listAcademyRunPage({ courseId, scope: mine ? 'my_calendar' : 'calendar', page, pageSize: 50, windowStart: start, windowEnd: end })])
    return <AcademyShell activeTab="calendar" showCalendar access={access.success ? access.data : { isAdmin: false, canTeach: false }} title="Kalendarz Akademii" description={courseId ? `Terminy wybranego szkolenia${runs?.success && runs.data.items[0] ? `: ${runs.data.items[0].courseTitle}` : '.'}` : 'Zaplanowane spotkania, terminy Twoich szkoleń i zajęcia, do których możesz dołączyć.'} action={courseId ? <Button asChild variant="outline"><Link href="/learning/kalendarz">Wszystkie szkolenia</Link></Button> : undefined}>{runs.success ? <AcademyCalendar runs={runs.data.items} now={now} month={month} mine={mine} page={page} hasMore={runs.data.hasMore} courseId={courseId} /> : <AcademyEmptyState variant="error" title="Nie udało się wczytać terminów" description="Odśwież stronę i spróbuj ponownie. Jeśli problem się powtórzy, skontaktuj się z administratorem." />}</AcademyShell>
}
