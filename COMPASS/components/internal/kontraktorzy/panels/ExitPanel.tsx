'use client'

// Phase 34 — Exit & analiza zejść: exit-interview queue + departures + departure-reason trends.

import { Badge } from '@/components/ui/badge'
import {
    INTERVIEW_STATUS_PL, WHO_RESIGNED_PL,
    type ClientDepartureRow, type ContractorDashboard, type ExitQueueItem,
} from '@/lib/types/contractor'
import { ContractorLink, StatList } from './shared'

interface Props {
    exitQueue: ExitQueueItem[]
    departures: ClientDepartureRow[]
    dashboard: ContractorDashboard
}

export function ExitPanel({ exitQueue, departures, dashboard }: Props) {
    return (
        <div className="space-y-6">
            <section className="space-y-2">
                <h3 className="text-sm font-semibold">Exit interviews — kolejka ({exitQueue.length})</h3>
                <div className="overflow-x-auto rounded-md border">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                            <tr>
                                <th className="p-2 text-left">Kontraktor</th>
                                <th className="p-2 text-left">Klient</th>
                                <th className="p-2 text-left">Status</th>
                                <th className="p-2 text-left">Zaplanowany</th>
                                <th className="p-2 text-left">Powód (formalny)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {exitQueue.map((x) => (
                                <tr key={x.interview_id} className="border-t">
                                    <td className="p-2"><ContractorLink id={x.contractor_id} name={x.contractor_name} /></td>
                                    <td className="p-2">{x.client_snapshot ?? '—'}</td>
                                    <td className="p-2"><Badge variant={x.status === 'submitted' ? 'default' : 'secondary'}>{INTERVIEW_STATUS_PL[x.status]}</Badge></td>
                                    <td className="p-2">{x.scheduled_for ?? '—'}</td>
                                    <td className="p-2 text-muted-foreground">{x.formal_reason ?? '—'}</td>
                                </tr>
                            ))}
                            {exitQueue.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Brak zaplanowanych exit interviews.</td></tr>}
                        </tbody>
                    </table>
                </div>
            </section>

            <section className="grid gap-4 md:grid-cols-2">
                <StatList title="Powody zejść" rows={dashboard.departureReasons.map((r) => ({ label: WHO_RESIGNED_PL[r.who], value: r.count }))} />
                <StatList title="Zejścia per klient" rows={dashboard.departuresByClient.map((r) => ({ label: r.client, value: r.count }))} />
            </section>

            <section className="space-y-2">
                <h3 className="text-sm font-semibold">Zejścia ({departures.length})</h3>
                <div className="overflow-x-auto rounded-md border">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                            <tr>
                                <th className="p-2 text-left">Konsultant</th>
                                <th className="p-2 text-left">Klient</th>
                                <th className="p-2 text-left">Data zejścia</th>
                                <th className="p-2 text-left">Kto zrezygnował</th>
                                <th className="p-2 text-center">Przepięcie</th>
                                <th className="p-2 text-center">Replacement</th>
                            </tr>
                        </thead>
                        <tbody>
                            {departures.map((d) => (
                                <tr key={d.id} className="border-t">
                                    <td className="p-2 font-medium">{d.consultant_name}</td>
                                    <td className="p-2">{d.client_name}</td>
                                    <td className="p-2">{d.departure_date ?? '—'}</td>
                                    <td className="p-2">{d.who_resigned ? WHO_RESIGNED_PL[d.who_resigned] : '—'}</td>
                                    <td className="p-2 text-center">{d.transferred ? '✓' : '—'}</td>
                                    <td className="p-2 text-center">{d.replacement ? '✓' : '—'}</td>
                                </tr>
                            ))}
                            {departures.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Brak zejść.</td></tr>}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    )
}
