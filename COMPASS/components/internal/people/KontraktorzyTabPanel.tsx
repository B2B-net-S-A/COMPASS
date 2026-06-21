import { listContractorRoster, listConversations, listTcmProfiles, listContractors } from '@/lib/actions/contractors'
import { KontraktorzyRosterPanel } from '@/components/internal/kontraktorzy/panels/KontraktorzyRosterPanel'
import { RozmowySection } from './ContractorSections'

// People Ops — zakładka Kontraktorzy: roster (stawki/DL/marża) + log rozmów.
// Reuse KontraktorzyRosterPanel (bez onSaved) + RozmowyPanel (przez klientowy wrapper).
export async function KontraktorzyTabPanel() {
    const [roster, conversations, tcmProfiles, contractors] = await Promise.all([
        listContractorRoster(),
        listConversations({ limit: 800 }),
        listTcmProfiles(),
        listContractors(),
    ])
    const contractorsLite = contractors.map((c) => ({ id: c.id, full_name: c.full_name }))

    return (
        <div className="space-y-8">
            <section className="space-y-3">
                <h2 className="text-lg font-semibold text-foreground">Aktualni kontraktorzy</h2>
                <KontraktorzyRosterPanel roster={roster} />
            </section>

            <section className="space-y-3">
                <h2 className="text-lg font-semibold text-foreground">Rozmowy</h2>
                <RozmowySection conversations={conversations} tcmProfiles={tcmProfiles} contractorsLite={contractorsLite} />
            </section>
        </div>
    )
}
