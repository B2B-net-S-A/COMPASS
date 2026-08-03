// Phase 46 — edycja/kontynuacja karty (draft → finalizacja; sfinalizowana
// karta pozostaje edytowalna dla autora/admina z pełną walidacją).

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { listActiveClients } from '@/lib/actions/internal-clients'
import {
    getCardDetail,
    getPreInterviewBrief,
    listClientAreas,
    listTechnologies,
    listVendors,
} from '@/lib/actions/tech-map'
import type { CardDetail, CardInput, PreInterviewBrief as Brief } from '@/lib/types/tech-map'
import { InterviewCardForm } from '@/components/internal/people/mapa/InterviewCardForm'
import { PreInterviewBrief } from '@/components/internal/people/mapa/PreInterviewBrief'

export const dynamic = 'force-dynamic'

export default async function KartaPage({ params }: { params: { cardId: string } }) {
    let detail: CardDetail
    try {
        detail = await getCardDetail(params.cardId)
    } catch {
        notFound()
    }

    let brief: Brief | null = null
    try {
        brief = await getPreInterviewBrief(detail.card.contractor_id)
    } catch {
        brief = null
    }

    const [clients, areas, technologies, vendors] = await Promise.all([
        listActiveClients(),
        listClientAreas(),
        listTechnologies(),
        listVendors(),
    ])

    const card = detail.card
    const initial: CardInput = {
        contractorId: card.contractor_id,
        clientId: card.client_id,
        clientAreaId: card.client_area_id,
        interviewDate: card.interview_date,
        block: card.block,
        status: card.status,
        satisfaction: card.satisfaction,
        satisfactionComment: card.satisfaction_comment,
        projectEndMonth: card.project_end_month,
        projectEndYear: card.project_end_year,
        projectEndUnknown: card.project_end_unknown,
        hiring: card.hiring,
        hiringRoles: card.hiring_roles,
        hiringSource: card.hiring_source,
        memorableQuote: card.memorable_quote,
        techOldNew: card.tech_old_new,
        teamSize: card.team_size,
        teamExternals: card.team_externals,
        vendorsNote: card.vendors_note,
        technologyIds: detail.technologies.map((t) => t.id),
        vendorIds: detail.vendors.map((v) => v.id),
        initiatives: detail.initiatives.map((i) => ({
            name: i.name,
            kind: i.kind,
            priority: i.priority,
        })),
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
                <h1 className="text-2xl font-bold">
                    Karta: {detail.contractorName}
                    {card.is_draft && <span className="ml-2 text-base font-normal text-amber-600">(wersja robocza)</span>}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    {detail.clientName}
                    {detail.areaName && ` · ${detail.areaName}`}
                    {detail.tcmName && ` · prowadzący: ${detail.tcmName}`}
                </p>
            </header>

            {brief && <PreInterviewBrief brief={brief} />}

            <InterviewCardForm
                mode="edit"
                cardId={card.id}
                isDraft={card.is_draft}
                contractorId={card.contractor_id}
                contractorName={detail.contractorName}
                initial={initial}
                clients={clients.map((c) => ({ id: c.id, name: c.name }))}
                areas={areas}
                technologies={technologies}
                vendors={vendors}
            />
        </div>
    )
}
