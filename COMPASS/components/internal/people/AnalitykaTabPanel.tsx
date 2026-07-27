import { getContractorDashboard, getDepartureAnalytics } from '@/lib/actions/contractors'
import { getTicketTypeAnalytics } from '@/lib/actions/zgloszenia-analytics'
import { Kpi, StatList } from '@/components/internal/kontraktorzy/panels/shared'
import type { DeparturePeriod } from '@/lib/contractors/departure-analytics'
import { DepartureAnalyticsSection } from './DepartureAnalyticsSection'

// People Ops — zakładka Analityka: typy zgłoszeń (zunifikowany support_tickets) + zejścia
// konsultantów w ujęciu czasowym. Reuse getContractorDashboard / getTicketTypeAnalytics,
// zejścia liczy dedykowane getDepartureAnalytics (trend 12 mies. + filtry).
interface Props {
    period?: DeparturePeriod
    client?: string
    recruiter?: string
}

export async function AnalitykaTabPanel({ period, client, recruiter }: Props) {
    const [dashboard, tickets, departures] = await Promise.all([
        getContractorDashboard(),
        getTicketTypeAnalytics(),
        getDepartureAnalytics({ period, client, recruiter }),
    ])

    const toRows = (rows: Array<{ label: string; count: number }>) =>
        rows.map((r) => ({ label: r.label, value: r.count }))

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Kpi label="Kontraktorzy" value={`${dashboard.contractorsActive}/${dashboard.contractorsTotal}`} hint="aktywni / wszyscy" />
                <Kpi label="Zejścia" value={departures.totalAllTime} hint="zarejestrowane (cała baza)" accent="red" />
                <Kpi label="Zgłoszenia" value={tickets.total} hint="wszystkie typy" />
                <Kpi label="Otwarte zgłoszenia" value={tickets.open} hint="nierozwiązane" accent={tickets.open > 0 ? 'amber' : undefined} />
            </div>

            <section className="space-y-2">
                <h2 className="text-sm font-semibold text-foreground">Zgłoszenia / problemy</h2>
                <div className="grid gap-4 md:grid-cols-3">
                    <StatList title="Typy zgłoszeń" rows={toRows(tickets.byCategory)} />
                    <StatList title="Per status" rows={toRows(tickets.byStatus)} />
                    <StatList title="Per priorytet" rows={toRows(tickets.byPriority)} />
                </div>
            </section>

            <DepartureAnalyticsSection analytics={departures} />

            <section className="space-y-2">
                <h2 className="text-sm font-semibold text-foreground">Opieka nad kontraktorami</h2>
                <div className="grid gap-4 md:grid-cols-3">
                    <StatList title="Rozmowy per TCM" rows={dashboard.conversationsByTcm.map((r) => ({ label: r.tcm, value: r.count }))} />
                </div>
            </section>
        </div>
    )
}
