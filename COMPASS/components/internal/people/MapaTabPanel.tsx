// Phase 46 — zakładka „Mapa technologiczna" w hubie People Ops.
// Etap 1: lista kart + start rozmowy + słowniki (admin).
// Etap 2: mapy klientów (agregaty) + przydziały bloków na bieżący kwartał.

import { listContractors } from '@/lib/actions/contractors'
import {
    getAlertRecipientsConfig,
    listCards,
    listClientsWithCards,
    listTechnologies,
    listVendors,
} from '@/lib/actions/tech-map'
import { CardsListSection } from '@/components/internal/people/mapa/CardsListSection'
import { ClientsWithCardsSection } from '@/components/internal/people/mapa/ClientsWithCardsSection'
import { DictionaryAdminSection } from '@/components/internal/people/mapa/DictionaryAdminSection'
import { NewInterviewPicker } from '@/components/internal/people/mapa/NewInterviewPicker'
import { AlertRecipientsSection } from '@/components/internal/people/mapa/AlertRecipientsSection'

export async function MapaTabPanel({ isAdmin }: { isAdmin: boolean }) {
    const [cards, contractors, clientsWithCards, technologies, vendors, alertConfig] =
        await Promise.all([
            listCards(),
            listContractors(),
            listClientsWithCards(),
            isAdmin ? listTechnologies() : Promise.resolve([]),
            isAdmin ? listVendors() : Promise.resolve([]),
            isAdmin ? getAlertRecipientsConfig() : Promise.resolve(null),
        ])

    return (
        <div className="space-y-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground max-w-2xl">
                    Karty rozmów (technologie, projekt, poszukiwane kompetencje, zadowolenie) budują mapę
                    technologiczną klientów. Zacznij od „Nowa rozmowa” — zobaczysz to, co już wiemy.
                </p>
                <NewInterviewPicker
                    contractors={contractors.map((c) => ({
                        id: c.id,
                        fullName: c.full_name,
                        currentClient: c.current_client,
                        status: c.status,
                    }))}
                />
            </div>

            <ClientsWithCardsSection clients={clientsWithCards} />

            <CardsListSection cards={cards} />

            {isAdmin && alertConfig && (
                <AlertRecipientsSection config={alertConfig.config} candidates={alertConfig.candidates} />
            )}

            {isAdmin && <DictionaryAdminSection technologies={technologies} vendors={vendors} />}
        </div>
    )
}
