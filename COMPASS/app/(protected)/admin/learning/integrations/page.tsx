import { AcademyOperationsHealth } from '@/components/academy/AcademyOperationsHealth'
import { getAcademyOperationsHealth } from '@/lib/actions/academy-operations'
import { MaterialCleanupQueue } from '@/components/academy/MaterialCleanupQueue'
import { AcademyShell } from '@/components/academy/AcademyShell'
import { MaterialScanQueue } from '@/components/academy/MaterialScanQueue'
import { AcademyAdminNav } from '@/components/academy/AcademyAdminNav'
import { AcademyEmptyState } from '@/components/academy/AcademyEmptyState'
import { AcademyIdentitiesPanel } from '@/components/academy/sessions/AcademyIdentitiesPanel'
import { AcademyIntegrationsPanel } from '@/components/academy/sessions/AcademyIntegrationsPanel'
import { getAcademyIntegrationConfig, listAcademyIntegrationIssuesPage, listAcademyM365IdentitiesPage, listAcademyOrganizerCandidates, listAcademyOrganizers } from '@/lib/actions/academy-sessions'

export const dynamic = 'force-dynamic'

export default async function AcademyIntegrationsPage({ searchParams }: { searchParams: { identity?: string; identityPage?: string } }) {
    const search = typeof searchParams.identity === 'string' ? searchParams.identity.trim().slice(0, 100) : ''
    const requestedPage = typeof searchParams.identityPage === 'string' && /^\d+$/.test(searchParams.identityPage) ? Number(searchParams.identityPage) : 1
    const identityPage = Number.isSafeInteger(requestedPage) && requestedPage >= 1 && requestedPage <= 100_000 ? requestedPage : 1
    const [config, organizers, candidates, issues, identities, health] = await Promise.all([getAcademyIntegrationConfig(), listAcademyOrganizers(), listAcademyOrganizerCandidates(), listAcademyIntegrationIssuesPage(), listAcademyM365IdentitiesPage({ search, page: identityPage }), getAcademyOperationsHealth()])
    return <AcademyShell activeTab="admin" access={{ isAdmin: true, canTeach: true }} title="Teams i synchronizacja" description="Konfiguracja gospodarzy spotkań i nadzór nad operacjami Akademii."><AcademyAdminNav active="integrations" /><AcademyOperationsHealth result={health} />{config.success && organizers.success && candidates.success && issues.success ? <AcademyIntegrationsPanel organizers={organizers.data} candidates={candidates.data} issuesPage={issues.data} managedTeamsAvailable={config.data.managedTeamsAvailable} reason={config.data.reason} rawAttendanceRetentionDays={config.data.rawAttendanceRetentionDays} retentionWarning={config.data.retentionWarning} /> : <AcademyEmptyState variant="error" title="Nie udało się wczytać konfiguracji" description="Odśwież stronę i spróbuj ponownie. Nie zmieniono konfiguracji spotkań." />}{identities.success && candidates.success ? <AcademyIdentitiesPanel identitiesPage={identities.data} initialCandidates={candidates.data} search={search} /> : <AcademyEmptyState variant="error" title="Nie udało się wczytać powiązań kont Teams" description="Odśwież stronę i spróbuj ponownie." />}<MaterialScanQueue /><MaterialCleanupQueue /></AcademyShell>
}
