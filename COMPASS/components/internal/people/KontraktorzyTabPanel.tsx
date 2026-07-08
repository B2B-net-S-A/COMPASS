import { listContractorRoster } from '@/lib/actions/contractors'
import { KontraktorzyRosterPanel } from '@/components/internal/kontraktorzy/panels/KontraktorzyRosterPanel'

// People Ops — zakładka Kontraktorzy: roster aktualnych kontraktorów (stawki/DL/marża).
// Sekcja "Rozmowy" (Zagrożeni + Logi rozmów) usunięta — log rozmów żyje w hubie
// Talent Community (/internal/kontraktorzy), tu pokazujemy tylko roster.
export async function KontraktorzyTabPanel() {
    const roster = await listContractorRoster()

    return (
        <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">Aktualni kontraktorzy</h2>
            <KontraktorzyRosterPanel roster={roster} />
        </section>
    )
}
