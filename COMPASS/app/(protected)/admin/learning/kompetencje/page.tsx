import { AcademyAdminNav } from '@/components/academy/AcademyAdminNav'
import { AcademyEmptyState } from '@/components/academy/AcademyEmptyState'
import { AcademyShell } from '@/components/academy/AcademyShell'
import { CompetenceReport } from '@/components/academy/CompetenceReport'
import { ProgrammeCompletions } from '@/components/academy/ProgrammeCompletions'
import { getCompetenceReport, getProgrammeCompletions } from '@/lib/actions/academy-reports'

export const dynamic = 'force-dynamic'

export default async function CompetenceReportPage() {
    const [result, programmes] = await Promise.all([getCompetenceReport(), getProgrammeCompletions()])
    return <AcademyShell activeTab="admin" access={{ isAdmin: true, canTeach: true }} title="Raport kompetencji" description="Programy ukończone w Akademii COMPASS, z wersją i drogą.">
        <AcademyAdminNav active="competence" />
        {!result.success ? <AcademyEmptyState variant="error" title="Nie udało się pobrać raportu" description={result.error} />
            : !result.data.migrated ? <AcademyEmptyState title="Raport czeka na migrację" description="Ta funkcja zostanie włączona po zastosowaniu migracji bazy danych." />
            : <div className="space-y-4">
                <CompetenceReport rows={result.data.rows} active={result.data.active} lastExport={result.data.lastExport} generatedAt={new Date().toISOString()} />
                <ProgrammeCompletions result={programmes} />
            </div>}
    </AcademyShell>
}
