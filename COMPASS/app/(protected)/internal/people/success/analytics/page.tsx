import { getSuccessDashboard, listSuccessCheckIns, listSuccessConsultants } from '@/lib/actions/consultant-success'
import { PageHeader } from '@/components/ds/PageHeader'
import { SuccessAnalyticsView } from '@/components/internal/success/SuccessAnalyticsView'
import { SuccessErrorState } from '@/components/internal/success/SuccessStates'

export const dynamic = 'force-dynamic'

export default async function SuccessAnalyticsPage() {
    try {
        const [dashboard, consultants, checkIns] = await Promise.all([
            getSuccessDashboard(),
            listSuccessConsultants(),
            listSuccessCheckIns(),
        ])
        return (
            <main className="space-y-6">
                <PageHeader eyebrow="Consultant Success" title="Analityka" description="Pokrycie kontaktu, terminowość check-inów, action steps i ręczne statusy relacji." breadcrumb={[{ label: 'Consultant Success', href: '/internal/people/success' }, { label: 'Analityka' }]} />
                <SuccessAnalyticsView dashboard={dashboard} consultants={consultants} checkIns={checkIns} />
            </main>
        )
    } catch {
        return <SuccessErrorState description="Nie udało się policzyć analityki Consultant Success." />
    }
}
