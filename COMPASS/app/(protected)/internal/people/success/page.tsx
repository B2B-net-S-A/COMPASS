import { getSuccessDashboard } from '@/lib/actions/consultant-success'
import { PageHeader } from '@/components/ds/PageHeader'
import { SuccessDashboardView } from '@/components/internal/success/SuccessDashboardView'
import { SuccessErrorState } from '@/components/internal/success/SuccessStates'

export const dynamic = 'force-dynamic'

export default async function ConsultantSuccessPage() {
    try {
        const dashboard = await getSuccessDashboard()
        return (
            <main className="space-y-6">
                <PageHeader
                    eyebrow="People Ops"
                    title="Consultant Success"
                    description="Codzienna kolejka kontaktów, prywatny status relacji i ustalenia dotyczące konsultantów."
                    breadcrumb={[{ label: 'People Ops', href: '/internal/people' }, { label: 'Consultant Success' }]}
                />
                <SuccessDashboardView dashboard={dashboard} />
            </main>
        )
    } catch {
        return <SuccessErrorState description="Nie udało się pobrać pulpitu Consultant Success." />
    }
}
