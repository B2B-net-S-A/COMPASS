import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { AcademyEmptyState } from '@/components/academy/AcademyEmptyState'
import { AcademyShell } from '@/components/academy/AcademyShell'
import { EditionClosingScreen } from '@/components/academy/sessions/EditionClosingScreen'
import { Button } from '@/components/ui/button'
import { editionClosingSteps } from '@/lib/academy/edition-closing'
import { summarizeRunPeople } from '@/lib/academy/run-people'
import { getAcademyAccess } from '@/lib/actions/academy-access'
import { getEditionOperationCounter } from '@/lib/actions/academy-edition-closing'
import { getCourseDetail } from '@/lib/actions/courses'
import { listAcademyRunMaterials } from '@/lib/actions/academy-materials'
import { TwinCourseButton } from '@/components/academy/sessions/TwinCourseButton'
import { getAcademyRunPeople } from '@/lib/actions/academy-run-people'
import { getAcademyRun, listAcademyRunParticipants } from '@/lib/actions/academy-sessions'
import { listAcademyWebinarExceptions, listAcademyWebinarRoster } from '@/lib/actions/academy-webinar-import'
import type { AcademyRunMaterial } from '@/lib/types/academy-materials'

export const dynamic = 'force-dynamic'

export default async function EditionClosingPage({ params }: { params: { id: string } }) {
    const [access, result] = await Promise.all([getAcademyAccess(), getAcademyRun(params.id)])
    if (!access.success || !result.success || !result.data.canManage || !access.data.canManageAcademy) notFound()
    const run = result.data
    const [people, participants, roster, exceptions, materials, counter, course] = await Promise.all([
        getAcademyRunPeople(run.id), listAcademyRunParticipants(run.id), listAcademyWebinarRoster(run.id), listAcademyWebinarExceptions(run.id),
        listAcademyRunMaterials(run.id), getEditionOperationCounter(run.id), getCourseDetail(run.courseId),
    ])
    const back = <Button asChild variant="outline"><Link href={`/learning/edycje/${run.id}`}><ArrowLeft aria-hidden="true" />Edycja</Link></Button>
    if (!people.success || !participants.success) return <AcademyShell activeTab="teaching" access={access.data} title="Zamknięcie edycji" description={run.title} action={back}><AcademyEmptyState variant="error" title="Nie udało się wczytać stanu edycji" description={!people.success ? people.error : !participants.success ? participants.error : 'Odśwież stronę.'} /></AcademyShell>
    const steps = editionClosingSteps({
        run, summary: summarizeRunPeople(people.data.people), participants: participants.data, roster: roster.success ? roster.data : [],
        exceptions: exceptions.success ? { available: exceptions.data.available, open: exceptions.data.items.filter(item => item.status === 'open').length } : { available: false, open: 0 },
        materials: materials.success ? materials.data as AcademyRunMaterial[] : null,
        attendancePercent: course.success ? course.data.completion_rules?.attendance_percent ?? 80 : 80,
    })
    const now = Date.now()
    const sessionsEnded = run.sessions.filter(session => session.status === 'scheduled').every(session => Date.parse(session.actualEndsAt ?? session.endsAt) <= now)
    return <AcademyShell activeTab="teaching" access={access.data} title="Zamknięcie edycji" description={`${run.courseTitle} · ${run.title}`} action={back}>
        <EditionClosingScreen runId={run.id} steps={steps} counter={counter.success ? counter.data : null} sessionsEnded={sessionsEnded} />
        {sessionsEnded && <div className="mt-6"><TwinCourseButton runId={run.id} /></div>}
    </AcademyShell>
}
