import { getSuccessCheckInDetail } from '@/lib/actions/consultant-success'
import { CheckInWorkflow } from '@/components/internal/success/CheckInWorkflow'
import { SuccessErrorState } from '@/components/internal/success/SuccessStates'

export const dynamic = 'force-dynamic'

export default async function SuccessCheckInDetailPage({ params }: { params: { id: string } }) {
    try {
        const detail = await getSuccessCheckInDetail(params.id)
        return <CheckInWorkflow detail={detail} />
    } catch {
        return <SuccessErrorState title="Nie znaleziono check-inu" description="Termin nie istnieje albo nie udało się pobrać prywatnych danych rozmowy." />
    }
}
