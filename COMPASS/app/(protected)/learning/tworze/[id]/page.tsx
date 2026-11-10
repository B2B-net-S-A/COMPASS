import { notFound } from 'next/navigation'
import { AcademyShell } from '@/components/academy/AcademyShell'
import { TrainerSteps } from '@/components/academy/teaching/TrainerSteps'
import { getAcademyAccess } from '@/lib/actions/academy-access'
import { listAcademyRunMaterials } from '@/lib/actions/academy-materials'
import { getRunPublicationState, getTeachingCounts } from '@/lib/actions/academy-publication'
import { listAcademyRunPage } from '@/lib/actions/academy-sessions'
import { getCourseDetail } from '@/lib/actions/courses'
import { pickTrainerRun } from '@/lib/academy/teaching-steps'

export const dynamic = 'force-dynamic'

/** „Prowadzę” w wersji prostej: trzy kroki trenera dla jednego szkolenia. Pełny edytor zostaje pod /edit. */
export default async function TrainerStepsPage({ params }: { params: { id: string } }) {
    const [access, detail, runs] = await Promise.all([
        getAcademyAccess(),
        getCourseDetail(params.id, { author: true }),
        listAcademyRunPage({ courseId: params.id, scope: 'managed', pageSize: 50 }),
    ])
    if (!detail.success) notFound()
    const course = detail.data
    const run = runs.success ? pickTrainerRun(runs.data.items, Date.now()) : null
    const versionId = course.draft_version_id ?? course.published_version_id ?? course.version_id ?? null
    const [materials, publication, counts] = await Promise.all([
        run ? listAcademyRunMaterials(run.id) : null,
        run ? getRunPublicationState(run.id) : null,
        getTeachingCounts({ courseId: course.id, versionId }),
    ])

    return <AcademyShell activeTab="teaching" access={access.success ? access.data : { isAdmin: false, canTeach: false }} title={course.title} hideHeader>
        {(!runs.success || materials?.success === false) && <p role="alert" className="mx-auto mb-4 max-w-3xl rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">Nie udało się wczytać edycji albo plików. Odśwież stronę, aby spróbować ponownie.</p>}
        <TrainerSteps
            course={{ id: course.id, slug: course.slug, title: course.title, description: course.description, published: Boolean(course.published_version_id) }}
            run={run ? { id: run.id, title: run.title, sessions: run.sessions.filter(session => session.status !== 'cancelled').map(session => ({ startsAt: session.startsAt, timeZone: session.timeZone })) } : null}
            materials={materials?.success ? materials.data : []}
            counts={counts.success ? counts.data : { quizQuestions: 0, learnerQuestions: 0 }}
            publication={publication?.success ? publication.data : { available: false, requestedAt: null, viewers: {} }} />
    </AcademyShell>
}
