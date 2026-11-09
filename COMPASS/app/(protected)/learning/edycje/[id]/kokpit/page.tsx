import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { AcademyEmptyState } from '@/components/academy/AcademyEmptyState'
import { AcademyShell } from '@/components/academy/AcademyShell'
import { EditionCockpit } from '@/components/academy/sessions/EditionCockpit'
import { Button } from '@/components/ui/button'
import { editionClosingSteps } from '@/lib/academy/edition-closing'
import { editionCockpitIssues, editionCockpitSteps } from '@/lib/academy/edition-cockpit'
import { readCockpitOutbox, readCockpitQuestions } from '@/lib/academy/edition-cockpit-server'
import { summarizeRunPeople } from '@/lib/academy/run-people'
import { academyClient } from '@/lib/academy/server'
import { getAcademyAccess } from '@/lib/actions/academy-access'
import { getAcademyRunPeople } from '@/lib/actions/academy-run-people'
import { getAcademyRun, listAcademyRunParticipants } from '@/lib/actions/academy-sessions'
import { listAcademyRunMaterials } from '@/lib/actions/academy-materials'
import { listAcademyWebinarExceptions, listAcademyWebinarRoster } from '@/lib/actions/academy-webinar-import'
import { getCourseDetail } from '@/lib/actions/courses'
import type { AcademyRunMaterial } from '@/lib/types/academy-materials'

export const dynamic = 'force-dynamic'

/** Oś jednej edycji, złożona wyłącznie z danych istniejących paneli. */
export default async function EditionCockpitPage({ params }: { params: { id: string } }) {
    const [access, result] = await Promise.all([getAcademyAccess(), getAcademyRun(params.id)])
    if (!access.success || !result.success || !result.data.canManage || !access.data.canManageAcademy) notFound()
    const run = result.data
    const client = academyClient()
    const [people, participants, roster, exceptions, materials, course, outbox, questions] = await Promise.all([
        getAcademyRunPeople(run.id), listAcademyRunParticipants(run.id), listAcademyWebinarRoster(run.id), listAcademyWebinarExceptions(run.id),
        listAcademyRunMaterials(run.id), getCourseDetail(run.courseId), readCockpitOutbox(client, run.id), readCockpitQuestions(client, run.versionId),
    ])
    const back = <Button asChild variant="outline"><Link href={`/learning/edycje/${run.id}`}><ArrowLeft aria-hidden="true" />Edycja</Link></Button>
    if (!people.success || !participants.success) return <AcademyShell activeTab="teaching" access={access.data} title="Kokpit edycji" description={run.title} action={back}><AcademyEmptyState variant="error" title="Nie udało się otworzyć kokpitu" description="Odśwież stronę. Brak danych nie jest zerowym wynikiem." /></AcademyShell>
    const summary = summarizeRunPeople(people.data.people)
    const closing = editionClosingSteps({
        run, summary, participants: participants.data, roster: roster.success ? roster.data : [],
        exceptions: exceptions.success ? { available: exceptions.data.available, open: exceptions.data.items.filter(item => item.status === 'open').length } : { available: false, open: 0 },
        materials: materials.success ? materials.data as AcademyRunMaterial[] : null,
        attendancePercent: course.success ? course.data.completion_rules?.attendance_percent ?? 80 : 80,
    })
    const sessions = run.sessions.filter(session => session.status === 'scheduled').sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
    const registrations = { confirmed: summary.confirmed, capacity: run.capacity, waitlisted: summary.waitlisted, withoutAccount: summary.withoutAccount, cancelled: participants.data.filter(person => person.status === 'cancelled').length }
    const input = { runId: run.id, sessionStart: sessions[0]?.startsAt ?? null, sessionEnd: sessions.at(-1)?.endsAt ?? null, ...registrations, outbox, questions, closing, now: Date.now() }
    const steps = editionCockpitSteps(input)
    return <AcademyShell activeTab="teaching" access={access.data} title="Kokpit edycji" description={`${run.courseTitle} · ${run.title}`} action={back}>
        <EditionCockpit steps={steps} issues={editionCockpitIssues(input, steps)} registrations={registrations} participantsHref={`/learning/edycje/${run.id}`} />
    </AcademyShell>
}
