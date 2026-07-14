// Phase 33 — Kontraktor detail (TCM + admin): timeline, conversations, interviews, movements.

import { notFound } from 'next/navigation'
import { getContractorDetail, listTcmProfiles } from '@/lib/actions/contractors'
import { ContractorDetailClient } from '@/components/internal/kontraktorzy/ContractorDetailClient'

export const dynamic = 'force-dynamic'

export default async function ContractorDetailPage(props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const tcmProfiles = await listTcmProfiles()
    try {
        const detail = await getContractorDetail(params.id)
        return <ContractorDetailClient detail={detail} tcmProfiles={tcmProfiles} />
    } catch {
        notFound()
    }
}
