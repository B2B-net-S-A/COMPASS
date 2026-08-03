// Phase 46 — strona wywiadu: brief „przed rozmową" + formularz nowej karty.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { listActiveClients } from '@/lib/actions/internal-clients'
import {
    getPreInterviewBrief,
    listClientAreas,
    listTechnologies,
    listVendors,
} from '@/lib/actions/tech-map'
import { warsawDate } from '@/lib/oof/oof-dates'
import type { CardInput, PreInterviewBrief as Brief } from '@/lib/types/tech-map'
import { InterviewCardForm } from '@/components/internal/people/mapa/InterviewCardForm'
import { PreInterviewBrief } from '@/components/internal/people/mapa/PreInterviewBrief'

export const dynamic = 'force-dynamic'

export default async function WywiadPage({ params }: { params: { contractorId: string } }) {
    let brief: Brief
    try {
        brief = await getPreInterviewBrief(params.contractorId)
    } catch {
        notFound()
    }

    const [clients, areas, technologies, vendors] = await Promise.all([
        listActiveClients(),
        listClientAreas(),
        listTechnologies(),
        listVendors(),
    ])

    const initial: CardInput = {
        contractorId: brief.contractor.id,
        clientId: brief.matchedClientId ?? '',
        clientAreaId: null,
        interviewDate: warsawDate(new Date()),
        block: brief.plannedBlock.block,
        status: null,
        satisfaction: null,
        satisfactionComment: null,
        projectEndMonth: null,
        projectEndYear: null,
        projectEndUnknown: false,
        hiring: null,
        hiringRoles: [],
        hiringSource: null,
        memorableQuote: null,
        techOldNew: null,
        teamSize: null,
        teamExternals: null,
        vendorsNote: null,
        technologyIds: [],
        vendorIds: [],
        initiatives: [],
    }

    return (
        <div className="space-y-6">
            <Link
                href="/internal/people?tab=mapa"
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
            >
                <ArrowLeft className="h-4 w-4" /> Mapa technologiczna
            </Link>

            <header>
                <h1 className="text-2xl font-bold">Rozmowa: {brief.contractor.fullName}</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    {[brief.contractor.currentPosition, brief.contractor.currentClient]
                        .filter(Boolean)
                        .join(' · ') || 'Brak danych o projekcie'}
                </p>
            </header>

            <PreInterviewBrief brief={brief} />

            <InterviewCardForm
                mode="create"
                isDraft
                contractorId={brief.contractor.id}
                contractorName={brief.contractor.fullName}
                initial={initial}
                clients={clients.map((c) => ({ id: c.id, name: c.name }))}
                areas={areas}
                technologies={technologies}
                vendors={vendors}
            />
        </div>
    )
}
