// Phase 46 (Etap 2) — wejście do kart klientów: klienci, o których coś już wiemy.

import Link from 'next/link'
import { Building2 } from 'lucide-react'

export function ClientsWithCardsSection({
    clients,
}: {
    clients: Array<{ id: string; name: string; cards: number; lastInterviewDate: string }>
}) {
    return (
        <section className="space-y-3">
            <div>
                <h2 className="text-lg font-semibold">Mapy klientów ({clients.length})</h2>
                <p className="text-sm text-muted-foreground">
                    Zagregowana wiedza z kart — technologie, inicjatywy, dostawcy, popyt i pokrycie
                    obszarów. Bez nazwisk konsultantów.
                </p>
            </div>
            {clients.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                    Żaden klient nie ma jeszcze sfinalizowanej karty. Mapa pojawi się po pierwszej
                    zakończonej rozmowie.
                </p>
            ) : (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {clients.map((c) => (
                        <Link
                            key={c.id}
                            href={`/internal/people/mapa/klienci/${c.id}`}
                            className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 transition-colors hover:border-primary hover:bg-muted/40"
                        >
                            <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                            <span className="min-w-0 flex-1">
                                <span className="block truncate font-medium">{c.name}</span>
                                <span className="block text-xs text-muted-foreground">
                                    {c.cards} {c.cards === 1 ? 'karta' : 'kart'} · ostatnia {c.lastInterviewDate}
                                </span>
                            </span>
                        </Link>
                    ))}
                </div>
            )}
        </section>
    )
}
