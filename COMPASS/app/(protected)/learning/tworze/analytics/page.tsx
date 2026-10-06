import { AcademyShell } from '@/components/academy/AcademyShell'
import { AcademyEmptyState } from '@/components/academy/AcademyEmptyState'
import { CourseSurveyHistory } from '@/components/academy/CourseSurveyHistory'
import { AcademyReport } from '@/components/academy/AcademyReport'
import { getAuthorAnalytics, getAdminLmsAnalytics } from '@/lib/actions/courses-analytics'
import { getAcademyAccess } from '@/lib/actions/academy-access'

export const dynamic = 'force-dynamic'

export default async function AuthorAnalyticsPage() {
    const access = await getAcademyAccess()
    const managesAcademy = access.success && access.data.canManageAcademy
    const globalResult = managesAcademy ? await getAdminLmsAnalytics() : null
    const result = !managesAcademy ? await getAuthorAnalytics() : null
    const data = result?.success ? result.data : null
    const globalData = globalResult?.success ? globalResult.data : null
    return <AcademyShell activeTab="teaching" access={access.success ? access.data : { isAdmin: false, canTeach: false }} title={managesAcademy ? 'Raport całej Akademii' : 'Raport prowadzącego'} description={managesAcademy ? 'Zapisy, ukończenia i oceny wszystkich szkoleń, także prowadzonych przez inne osoby.' : 'Postępy w kursach i grupach, do których masz uprawnienie prowadzenia.'}>
        {globalData ? <AcademyReport admin metrics={[
            { label: 'Dostępne publikacje', value: globalData.total_published_courses },
            { label: 'Wersje do akceptacji', value: globalData.total_pending_review },
            { label: 'Zapisy', value: globalData.total_enrollments },
            { label: 'Potwierdzone ukończenia', value: globalData.total_completions },
            { label: 'Ukończono', value: `${globalData.overall_completion_rate}%` },
            { label: 'Średnia ocena / 5', value: globalData.average_rating_all ? globalData.average_rating_all.toFixed(1) : '—' },
        ]} rows={globalData.top_courses.map(course => ({ id: course.course_id, title: course.title, enrollments: course.enrollments, completions: course.completions, rate: course.completion_rate, rating: course.avg_rating }))} months={globalData.monthly_enrollments} /> : !data ? <AcademyEmptyState variant="error" title="Nie udało się pobrać raportu" description="Odśwież stronę i spróbuj ponownie. Niepełnych danych nie przedstawiamy jako zerowych wyników." /> : <AcademyReport metrics={[
            { label: 'Prowadzone szkolenia', value: data.total_courses },
            { label: 'Zapisy', value: data.total_enrollments },
            { label: 'Potwierdzone ukończenia', value: data.total_completions },
            { label: 'Średnia ocena / 5', value: data.average_rating ? data.average_rating.toFixed(1) : '—' },
        ]} rows={data.courses.map(course => ({ id: course.course_id, title: course.course_title, enrollments: course.enrollments_count, completions: course.completions_count, rate: course.completion_rate, rating: course.avg_rating }))} />}
        <CourseSurveyHistory />
    </AcademyShell>
}
