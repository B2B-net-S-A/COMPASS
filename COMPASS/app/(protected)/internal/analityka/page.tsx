// Phase 37 — unified Analityka hub: contractor departures + ticket/problem types (merged tickets).

import { requireTalentCommunityOrAdminLayout } from '@/lib/auth/internal-guard'
import { getContractorDashboard } from '@/lib/actions/contractors'
import { getTicketTypeAnalytics } from '@/lib/actions/zgloszenia-analytics'
import { WHO_RESIGNED_PL } from '@/lib/types/contractor'
import { Kpi, StatList } from '@/components/internal/kontraktorzy/panels/shared'

export const dynamic = 'force-dynamic'

export default async function AnalitykaPage() {
    await requireTalentCommunityOrAdminLayout()

    const [dashboard, tickets] = await Promise.all([
        getContractorDashboard(),
        getTicketTypeAnalytics(),
    ])

    const toRows = (rows: Array<{ label: string; count: number }>) => rows.map((r) => ({ label: r.label, value: r.count }))

    return (
        <div className="space-y-6">
            <header>
                <h1 className="text-2xl font-bold">Analityka</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Powody zejść konsultantów oraz typy zgłoszeń/problemów, które spływają.
                </p>
            </header>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Kpi label="Kontraktorzy" value={`${dashboard.contractorsActive}/${dashboard.contractorsTotal}`} hint="aktywni / wszyscy" />
                <Kpi label="Zejścia" value={dashboard.departuresTotal} hint="zarejestrowane" accent="red" />
                <Kpi label="Zgłoszenia" value={tickets.total} hint="wszystkie typy" />
                <Kpi label="Otwarte zgłoszenia" value={tickets.open} hint="nierozwiązane" accent={tickets.open > 0 ? 'amber' : undefined} />
            </div>

            <section className="space-y-2">
                <h2 className="text-sm font-semibold">Zgłoszenia / problemy</h2>
                <div className="grid gap-4 md:grid-cols-3">
                    <StatList title="Typy zgłoszeń" rows={toRows(tickets.byCategory)} />
                    <StatList title="Per status" rows={toRows(tickets.byStatus)} />
                    <StatList title="Per priorytet" rows={toRows(tickets.byPriority)} />
                </div>
            </section>

            <section className="space-y-2">
                <h2 className="text-sm font-semibold">Zejścia konsultantów</h2>
                <div className="grid gap-4 md:grid-cols-3">
                    <StatList title="Powody zejść" rows={dashboard.departureReasons.map((r) => ({ label: WHO_RESIGNED_PL[r.who], value: r.count }))} />
                    <StatList title="Zejścia per klient" rows={dashboard.departuresByClient.map((r) => ({ label: r.client, value: r.count }))} />
                    <StatList title="Rozmowy per TCM" rows={dashboard.conversationsByTcm.map((r) => ({ label: r.tcm, value: r.count }))} />
                </div>
            </section>
        </div>
    )
}
