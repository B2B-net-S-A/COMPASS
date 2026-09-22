import { AcademyShell } from '@/components/academy/AcademyShell'
import { AcademyEmptyState } from '@/components/academy/AcademyEmptyState'
import { AcademyReport } from '@/components/academy/AcademyReport'
import { getAuthorAnalytics } from '@/lib/actions/courses-analytics'
import { getAcademyAccess } from '@/lib/actions/academy-access'

export const dynamic = 'force-dynamic'

export default async function AuthorAnalyticsPage() {
    const [result, access] = await Promise.all([getAuthorAnalytics(), getAcademyAccess()])
    const data = result.success ? result.data : null
    return <AcademyShell activeTab="teaching" access={access.success ? access.data : { isAdmin: false, canTeach: false }} title="Raport prowadzącego" description="Postępy w kursach i grupach, do których masz uprawnienie prowadzenia.">
        {!data ? <AcademyEmptyState variant="error" title="Nie udało się pobrać raportu" description="Odśwież stronę i spróbuj ponownie. Niepełnych danych nie przedstawiamy jako zerowych wyników." /> : <AcademyReport metrics={[
            { label: 'Prowadzone szkolenia', value: data.total_courses },
            { label: 'Zapisy', value: data.total_enrollments },
            { label: 'Potwierdzone ukończenia', value: data.total_completions },
            { label: 'Średnia ocena / 5', value: data.average_rating ? data.average_rating.toFixed(1) : '—' },
        ]} rows={data.courses.map(course => ({ id: course.course_id, title: course.course_title, enrollments: course.enrollments_count, completions: course.completions_count, rate: course.completion_rate, rating: course.avg_rating }))} />}
    </AcademyShell>
}
