import { AcademyShell } from '@/components/academy/AcademyShell'
import { AcademyAdminNav } from '@/components/academy/AcademyAdminNav'
import { AcademyEmptyState } from '@/components/academy/AcademyEmptyState'
import { AcademyTrainersPanel } from '@/components/academy/sessions/AcademyTrainersPanel'
import { AcademyRolloutPanel } from '@/components/academy/AcademyRolloutPanel'
import { listAcademyTrainerPage, getAcademyRollout } from '@/lib/actions/academy-access'

export const dynamic = 'force-dynamic'

export default async function AcademyTrainersPage({ searchParams }: { searchParams: { q?: string; page?: string } }) {
    const search = typeof searchParams.q === 'string' ? searchParams.q.trim().slice(0, 100) : ''
    const requestedPage = typeof searchParams.page === 'string' && /^\d+$/.test(searchParams.page) ? Number(searchParams.page) : 1
    const page = Number.isSafeInteger(requestedPage) && requestedPage >= 1 && requestedPage <= 100_000 ? requestedPage : 1
    const [result, rollout] = await Promise.all([listAcademyTrainerPage({ search, page }), getAcademyRollout()])
    return <AcademyShell activeTab="admin" access={{ isAdmin: true, canTeach: true }} title="Prowadzący Akademii" description="Wybierz konsultantów, którzy mogą tworzyć i prowadzić szkolenia. Każdy trener zachowuje dostęp do nauki."><AcademyAdminNav active="trainers" />{rollout.success ? <AcademyRolloutPanel key={JSON.stringify(rollout.data)} initial={rollout.data} /> : <AcademyEmptyState variant="error" title="Nie udało się odczytać dostępności Akademii" description="Nie zmieniaj uprawnień na podstawie niepełnych danych. Odśwież stronę i spróbuj ponownie." />}{result.success ? <AcademyTrainersPanel trainers={result.data.items} search={search} page={result.data.page} pageSize={result.data.pageSize} total={result.data.total} /> : <AcademyEmptyState variant="error" title="Nie udało się wczytać uprawnień" description="Odśwież stronę i spróbuj ponownie. Uprawnienia nie zostały zmienione." />}</AcademyShell>
}
