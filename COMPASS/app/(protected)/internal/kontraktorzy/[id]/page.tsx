// Legacy contractor detail remains the rollback surface while Consultant
// Success is disabled. Once enabled, old deep links preserve the contractor id.

import { notFound, redirect } from 'next/navigation'
import { getContractorDetail, listTcmProfiles } from '@/lib/actions/contractors'
import { listCards } from '@/lib/actions/tech-map'
import { ContractorDetailClient } from '@/components/internal/kontraktorzy/ContractorDetailClient'
import { isConsultantSuccessEnabled } from '@/lib/consultant-success/flags'

export const dynamic = 'force-dynamic'

export default async function ContractorDetailPage({ params }: { params: { id: string } }) {
    if (isConsultantSuccessEnabled()) {
        redirect(`/internal/people/success/consultants/${params.id}`)
    }

    const tcmProfiles = await listTcmProfiles()
    try {
        const detail = await getContractorDetail(params.id)
        // Phase 46 — karty wywiadów mapy technologicznej na wspólnej osi z logiem rozmów.
        const techCards = await listCards({ contractorId: params.id })
        return <ContractorDetailClient detail={detail} tcmProfiles={tcmProfiles} techCards={techCards} />
    } catch {
        notFound()
    }
}
