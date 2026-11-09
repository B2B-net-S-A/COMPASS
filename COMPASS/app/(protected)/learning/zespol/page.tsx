import { AcademyEmptyState } from '@/components/academy/AcademyEmptyState'
import { AcademyShell } from '@/components/academy/AcademyShell'
import { ManagerTeamReport } from '@/components/academy/ManagerTeamReport'
import { getAcademyAccess } from '@/lib/actions/academy-access'
import { getManagerTeamReport } from '@/lib/actions/academy-reports'

export const dynamic = 'force-dynamic'

export default async function ManagerTeamPage() {
    const [access, result] = await Promise.all([getAcademyAccess(), getManagerTeamReport()])
    return <AcademyShell activeTab="team" access={access.success ? access.data : { isAdmin: false, canTeach: false }} title="Mój zespół" description="Ukończone programy osób z Twojego zespołu w biurze.">
        {!result.success ? <AcademyEmptyState variant="error" title="Nie udało się otworzyć raportu" description={result.error} />
            : !result.data.migrated ? <AcademyEmptyState title="Raport czeka na migrację" description="Ta funkcja zostanie włączona po zastosowaniu migracji bazy danych." />
            : result.data.members.length === 0 ? <AcademyEmptyState title="Brak osób w zespole" description="Nikt z biura nie ma Cię wskazanego jako przełożonego." />
            : <ManagerTeamReport members={result.data.members} />}
    </AcademyShell>
}
