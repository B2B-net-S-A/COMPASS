// Phase 46c — sekcja KPI mapy technologicznej w zakładce Analityka.
// Komponent prezentacyjny (server-safe). Dane liczy getTechMapKpi → buildTechMapKpi.

import { Kpi, StatList } from '@/components/internal/kontraktorzy/panels/shared'
import type { TechMapKpiResult } from '@/lib/actions/tech-map'

export function TechMapKpiSection({ kpi }: { kpi: TechMapKpiResult }) {
    return (
        <section className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Mapa technologiczna</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Kpi
                    label="Karty (7 dni)"
                    value={kpi.cardsLast7dTotal}
                    hint={`${kpi.totalFinalized} sfinalizowanych łącznie`}
                />
                <Kpi
                    label="Pokrycie obszarów <90 dni"
                    value={kpi.areaCoverage.pct === null ? '—' : `${kpi.areaCoverage.pct}%`}
                    hint={`${kpi.areaCoverage.fresh}/${kpi.areaCoverage.total} obszarów`}
                    accent={kpi.areaCoverage.pct !== null && kpi.areaCoverage.pct < 50 ? 'amber' : undefined}
                />
                <Kpi
                    label="Aktywne sygnały popytu"
                    value={kpi.activeDemandSignals}
                    hint="szukają ludzi, <90 dni"
                    accent={kpi.activeDemandSignals > 0 ? 'green' : undefined}
                />
                <Kpi
                    label="Końce projektów ≤90 dni"
                    value={kpi.projectEndsWithin90}
                    hint="do zaplanowania"
                    accent={kpi.projectEndsWithin90 > 0 ? 'amber' : undefined}
                />
            </div>
            {kpi.cardsLast7dByTcm.length > 0 && (
                <div className="grid gap-4 md:grid-cols-3">
                    <StatList
                        title="Karty w ostatnich 7 dniach per prowadzący"
                        rows={kpi.cardsLast7dByTcm.map((t) => ({ label: t.tcmName, value: t.count }))}
                    />
                </div>
            )}
        </section>
    )
}
