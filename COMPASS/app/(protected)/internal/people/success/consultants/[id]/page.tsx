import { getSuccessConsultantDetail } from '@/lib/actions/consultant-success'
import { ConsultantProfileView, type ConsultantProfileTab } from '@/components/internal/success/ConsultantProfileView'
import { SuccessErrorState } from '@/components/internal/success/SuccessStates'

export const dynamic = 'force-dynamic'

const TABS: ConsultantProfileTab[] = ['overview', 'timeline', 'check-ins', 'feedback', 'actions']

export default async function SuccessConsultantDetailPage({ params, searchParams }: { params: { id: string }; searchParams?: { tab?: string; focus?: string } }) {
    try {
        const detail = await getSuccessConsultantDetail(params.id)
        const tab = TABS.includes(searchParams?.tab as ConsultantProfileTab) ? searchParams!.tab as ConsultantProfileTab : 'overview'
        return <ConsultantProfileView detail={detail} tab={tab} focusId={searchParams?.focus} />
    } catch {
        return <SuccessErrorState title="Nie znaleziono profilu konsultanta" description="Profil nie istnieje albo nie udało się pobrać prywatnych danych Consultant Success." />
    }
}
