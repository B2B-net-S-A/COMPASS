import { AcademyShell } from '@/components/academy/AcademyShell'
import { AcademyAdminNav } from '@/components/academy/AcademyAdminNav'
import { AcademyEmptyState } from '@/components/academy/AcademyEmptyState'
import { AcademyTrainersPanel } from '@/components/academy/sessions/AcademyTrainersPanel'
import { AcademyRolloutPanel } from '@/components/academy/AcademyRolloutPanel'
import { listAcademyTrainers, getAcademyRollout } from '@/lib/actions/academy-access'

export const dynamic = 'force-dynamic'

export default async function AcademyTrainersPage({ searchParams }: { searchParams: { q?: string } }) {
    const search = typeof searchParams.q === 'string' ? searchParams.q.trim().slice(0, 100) : ''
    const [result, rollout] = await Promise.all([listAcademyTrainers(search), getAcademyRollout()])
    return <AcademyShell activeTab="admin" access={{ isAdmin: true, canTeach: true }} title="Prowadzący Akademii" description="Wybierz konsultantów, którzy mogą tworzyć i prowadzić szkolenia. Każdy trener zachowuje dostęp do nauki."><AcademyAdminNav active="trainers" />{rollout.success ? <AcademyRolloutPanel key={JSON.stringify(rollout.data)} initial={rollout.data} /> : <AcademyEmptyState variant="error" title="Nie udało się odczytać dostępności Akademii" description="Nie zmieniaj uprawnień na podstawie niepełnych danych. Odśwież stronę i spróbuj ponownie." />}{result.success ? <AcademyTrainersPanel trainers={result.data} search={search} /> : <AcademyEmptyState variant="error" title="Nie udało się wczytać uprawnień" description="Odśwież stronę i spróbuj ponownie. Uprawnienia nie zostały zmienione." />}</AcademyShell>
}
