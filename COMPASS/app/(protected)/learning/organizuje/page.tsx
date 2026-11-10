import { redirect } from 'next/navigation'
import { AcademyEmptyState } from '@/components/academy/AcademyEmptyState'
import { AcademyShell } from '@/components/academy/AcademyShell'
import { NewLiveTrainingForm } from '@/components/academy/organize/NewLiveTrainingForm'
import { OrganizerBoard } from '@/components/academy/organize/OrganizerBoard'
import { getAcademyAccess } from '@/lib/actions/academy-access'
import { getOrganizerBoard, listLiveTrainers } from '@/lib/actions/academy-organize'
import { getAcademyIntegrationConfig, listAcademyOrganizers } from '@/lib/actions/academy-sessions'
import { buildTodo, sortBoard } from '@/lib/academy/organize-board'

export const dynamic = 'force-dynamic'

/** „Organizuję”: organizator, admin, TCM. Zastępuje kokpit i 14 paneli edycji jako miejsce codziennej pracy. */
export default async function OrganizerPage() {
    const access = await getAcademyAccess()
    if (!access.success || (!access.data.canManageAcademy && !access.data.isAdmin && access.data.canReview !== true)) redirect('/learning')
    const [board, trainers, organizers, config] = await Promise.all([
        getOrganizerBoard(),
        access.data.canManageAcademy ? listLiveTrainers() : null,
        access.data.canManageAcademy ? listAcademyOrganizers() : null,
        access.data.canManageAcademy ? getAcademyIntegrationConfig() : null,
    ])
    const now = Date.now()
    const teamsOrganizerId = config?.success && config.data.managedTeamsAvailable && organizers?.success ? organizers.data.find(item => item.enabled)?.id ?? null : null

    return <AcademyShell activeTab="admin" access={access.data} title="Organizuję" description="Co czeka na Ciebie, stan każdego szkolenia i nowa zapowiedź w jednym miejscu.">
        {board.success
            ? <OrganizerBoard todo={buildTodo(board.data.runs, board.data.materials, board.data.requests, board.data.userId, now)} runs={sortBoard(board.data.runs, board.data.materials, now)}
                form={access.data.canManageAcademy ? <NewLiveTrainingForm trainers={trainers?.success ? trainers.data : []} teamsOrganizerId={teamsOrganizerId} /> : null} />
            : <AcademyEmptyState variant="error" title="Nie udało się wczytać szkoleń" description={board.error} />}
    </AcademyShell>
}
