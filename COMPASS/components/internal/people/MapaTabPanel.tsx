// Phase 46 — zakładka „Mapa technologiczna" w hubie People Ops.
// Lista kart wywiadów + start nowej rozmowy; dla admina dodatkowo zarządzanie
// słownikami. Karta klienta (agregaty) dochodzi w Etapie 2.

import { listContractors } from '@/lib/actions/contractors'
import { listCards, listTechnologies, listVendors } from '@/lib/actions/tech-map'
import { CardsListSection } from '@/components/internal/people/mapa/CardsListSection'
import { DictionaryAdminSection } from '@/components/internal/people/mapa/DictionaryAdminSection'
import { NewInterviewPicker } from '@/components/internal/people/mapa/NewInterviewPicker'

export async function MapaTabPanel({ isAdmin }: { isAdmin: boolean }) {
    const [cards, contractors, technologies, vendors] = await Promise.all([
        listCards(),
        listContractors(),
        isAdmin ? listTechnologies() : Promise.resolve([]),
        isAdmin ? listVendors() : Promise.resolve([]),
    ])

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground max-w-2xl">
                    Karty rozmów wg skryptu (blok A + rotacyjny B/C/D) budują mapę technologiczną
                    klientów. Zacznij od „Nowa rozmowa" — zobaczysz przydzielony blok i to, co już wiemy.
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

            <CardsListSection cards={cards} />

            {isAdmin && <DictionaryAdminSection technologies={technologies} vendors={vendors} />}
        </div>
    )
}
