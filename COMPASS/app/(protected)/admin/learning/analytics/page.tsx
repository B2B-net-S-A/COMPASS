import { AcademyShell } from '@/components/academy/AcademyShell'
import { AcademyAdminNav } from '@/components/academy/AcademyAdminNav'
import { AcademyEmptyState } from '@/components/academy/AcademyEmptyState'
import { AcademyReport } from '@/components/academy/AcademyReport'
import { getAdminLmsAnalytics } from '@/lib/actions/courses-analytics'

export const dynamic = 'force-dynamic'

export default async function AdminLmsAnalyticsPage() {
    const result = await getAdminLmsAnalytics()
    const data = result.success ? result.data : null
    return <AcademyShell activeTab="admin" access={{ isAdmin: true, canTeach: true }} title="Raport Akademii" description="Zapisy, ukończenia i oceny szkoleń w całym zakresie Akademii.">
        <AcademyAdminNav active="reports" />
        {!data ? <AcademyEmptyState variant="error" title="Nie udało się pobrać raportu" description="Odśwież stronę i spróbuj ponownie. Niepełnych danych nie przedstawiamy jako zerowych wyników." /> : <AcademyReport admin metrics={[
            { label: 'Dostępne publikacje', value: data.total_published_courses },
            { label: 'Wersje do akceptacji', value: data.total_pending_review, href: '/admin/learning' },
            { label: 'Zapisy', value: data.total_enrollments },
            { label: 'Potwierdzone ukończenia', value: data.total_completions },
            { label: 'Ukończono', value: `${data.overall_completion_rate}%` },
            { label: 'Średnia ocena / 5', value: data.average_rating_all ? data.average_rating_all.toFixed(1) : '—' },
        ]} rows={data.top_courses.map(course => ({ id: course.course_id, title: course.title, enrollments: course.enrollments, completions: course.completions, rate: course.completion_rate, rating: course.avg_rating }))} months={data.monthly_enrollments} />}
    </AcademyShell>
}
