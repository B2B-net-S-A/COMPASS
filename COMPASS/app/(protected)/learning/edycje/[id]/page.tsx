import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { AcademyStaffPanel } from '@/components/academy/AcademyStaffPanel'
import { AcademyEmptyState } from '@/components/academy/AcademyEmptyState'
import { AcademyShell } from '@/components/academy/AcademyShell'
import { AcademyPrerequisites } from '@/components/academy/AcademyPrerequisites'
import { AcademyRunDetail } from '@/components/academy/sessions/AcademyRunDetail'
import { CourseFeedback } from '@/components/academy/CourseFeedback'
import { RunMaterials } from '@/components/academy/RunMaterials'
import { Button } from '@/components/ui/button'
import { getAcademyStaff } from '@/lib/actions/academy-staff'
import { getAcademyPrerequisiteStatus } from '@/lib/actions/academy-discovery'
import { getAcademyAccess } from '@/lib/actions/academy-access'
import { getAcademyRun, getAcademyIntegrationConfig, listAcademyOrganizers, listAcademyRunParticipants } from '@/lib/actions/academy-sessions'

export const dynamic = 'force-dynamic'

export default async function AcademyRunPage({ params }: { params: { id: string } }) {
    const [access, result] = await Promise.all([getAcademyAccess(), getAcademyRun(params.id)])
    if (!access.success || !result.success) return <AcademyShell activeTab="calendar" access={access.success ? access.data : { isAdmin: false, canTeach: false }} title="Edycja szkolenia">
        <AcademyEmptyState variant="error" title="Nie udało się otworzyć edycji" description={!result.success ? result.error : !access.success ? access.error : 'Spróbuj ponownie.'} action={<Button asChild variant="outline"><Link href="/learning/kalendarz">Wróć do kalendarza</Link></Button>} />
    </AcademyShell>
    const run = result.data
    const [participants, organizers, config, staff, prerequisites] = await Promise.all([
        run.canManage ? listAcademyRunParticipants(run.id) : null,
        run.canManage ? listAcademyOrganizers() : null,
        run.canManage ? getAcademyIntegrationConfig() : null,
        run.canManage ? getAcademyStaff(run.courseId, run.id) : null,
        getAcademyPrerequisiteStatus({ courseId: run.courseId, versionId: run.versionId }),
    ])
    const enrolled = run.myRegistration?.status === 'confirmed'
    return <AcademyShell activeTab={run.canManage ? 'teaching' : 'calendar'} showCalendar access={access.data} title={run.title} description={run.courseTitle}
        action={<Button asChild variant="outline"><Link href={run.canManage ? '/learning/tworze/' + run.courseId + '/edycje' : '/learning/kalendarz'}><ArrowLeft aria-hidden="true" />{run.canManage ? 'Wszystkie edycje' : 'Kalendarz'}</Link></Button>}>
        <AcademyPrerequisites status={prerequisites.success ? prerequisites.data : undefined} error={prerequisites.success ? undefined : prerequisites.error} enrolled={enrolled} />
        <AcademyRunDetail run={run} canRegister={prerequisites.success && prerequisites.data.allCompleted}
            participants={participants?.success ? participants.data : []} participantsError={participants && !participants.success ? participants.error : undefined}
            organizers={organizers?.success ? organizers.data : []} managedTeamsAvailable={config?.success ? config.data.managedTeamsAvailable : false}
            managedTeamsReason={organizers && !organizers.success ? organizers.error : config?.success ? config.data.reason : config && !config.success ? config.error : undefined}
            userId={access.data.userId} now={new Date().toISOString()} />
        {(run.canManage || enrolled) && <RunMaterials runId={run.id} courseId={run.courseId} canManage={run.canManage} isAdmin={access.data.isAdmin} userId={access.data.userId} readOnly={run.status === 'cancelled'} />}
        {run.myRegistration?.enrollmentId && <CourseFeedback courseId={run.courseId} enrollmentId={run.myRegistration.enrollmentId} completedAt={run.myRegistration.completedAt} />}
        {staff?.success && staff.data && <AcademyStaffPanel courseId={run.courseId} runId={run.id} state={staff.data} />}
        {staff && !staff.success && <p role="alert" className="text-sm text-destructive">{staff.error}</p>}
    </AcademyShell>
}
