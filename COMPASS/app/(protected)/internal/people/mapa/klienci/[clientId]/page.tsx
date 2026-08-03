// Phase 46 (Etap 2) — karta klienta: zagregowana mapa technologiczna.
// Nazwiska konsultantów NIE pojawiają się w tym widoku (agregat je pomija) —
// widać je wyłącznie na pojedynczej karcie rozmowy.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getClientTechMap } from '@/lib/actions/tech-map'
import { ClientTechMapView } from '@/components/internal/people/mapa/ClientTechMapView'
import type { ClientTechMapResult } from '@/lib/actions/tech-map'

export const dynamic = 'force-dynamic'

export default async function KartaKlientaPage({ params }: { params: { clientId: string } }) {
    let result: ClientTechMapResult
    try {
        result = await getClientTechMap(params.clientId)
    } catch {
        notFound()
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
                <h1 className="text-2xl font-bold">{result.client.name}</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Mapa technologiczna z {result.map.totalCards}{' '}
                    {result.map.totalCards === 1 ? 'karty' : 'kart'} rozmów. Dane starsze niż 6 miesięcy
                    są wyblakłe — warto je odświeżyć.
                </p>
            </header>

            <ClientTechMapView map={result.map} />
        </div>
    )
}
