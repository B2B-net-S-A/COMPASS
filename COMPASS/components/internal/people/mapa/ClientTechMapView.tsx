// Phase 46 (Etap 2) — karta klienta: zagregowana mapa technologiczna.
// Komponent prezentacyjny (server-safe). Dane liczy getClientTechMap →
// buildClientTechMap; TU nie ma żadnej logiki agregacji ani nazwisk konsultantów.
//
// Świeżość: pozycje starsze niż 6 miesięcy renderują się wyblakłe (opacity-60)
// z etykietą „do odświeżenia" — to sygnał do zaplanowania rozmowy, nie błąd.

import { Badge } from '@/components/ui/badge'
import { INITIATIVE_KIND_PL } from '@/lib/types/tech-map'
import type { ClientTechMap } from '@/lib/tech-map/aggregation'

const MONTHS_SHORT = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru']

const NOTE_KIND_PL: Record<ClientTechMap['notes'][number]['kind'], string> = {
    tech_old_new: 'Co stare, co nowe',
    vendors_note: 'Dostawcy',
    quote: 'Warte zapamiętania',
}

const SOURCE_PL: Record<string, string> = {
    widzial: 'Widział',
    slyszal: 'Słyszał',
    plotka: 'Plotka',
}

function Stale() {
    return (
        <Badge variant="neutral" size="sm">
            do odświeżenia
        </Badge>
    )
}

function SectionEmpty({ children }: { children: React.ReactNode }) {
    return <p className="text-sm text-muted-foreground">{children}</p>
}

export function ClientTechMapView({ map }: { map: ClientTechMap }) {
    return (
        <div className="space-y-6">
            {/* KPI */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Kpi label="Karty (sfinalizowane)" value={map.totalCards} />
                <Kpi label="Technologie" value={map.technologies.length} />
                <Kpi
                    label="Aktywne sygnały popytu"
                    value={map.demandSignals.filter((d) => !d.stale).length}
                    accent={map.demandSignals.some((d) => !d.stale) ? 'green' : undefined}
                />
                <Kpi label="Ostatnia rozmowa" value={map.lastInterviewDate ?? '—'} />
            </div>

            {/* Technologie */}
            <section className="space-y-3">
                <h2 className="text-lg font-semibold">Technologie ({map.technologies.length})</h2>
                {map.technologies.length === 0 ? (
                    <SectionEmpty>Brak danych — wypełnij technologie na karcie rozmowy.</SectionEmpty>
                ) : (
                    <div className="flex flex-wrap gap-2">
                        {map.technologies.map((t) => (
                            <div
                                key={t.id}
                                className={`rounded-lg border border-border px-3 py-2 ${t.stale ? 'opacity-60' : ''}`}
                            >
                                <div className="flex items-center gap-2">
                                    <span className="font-medium">{t.name}</span>
                                    <Badge variant="soft" size="sm">
                                        {t.mentions}×
                                    </Badge>
                                    {t.stale && <Stale />}
                                </div>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                    potwierdzone {t.lastConfirmed}
                                    {t.areas.length > 0 && ` · ${t.areas.join(', ')}`}
                                </p>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* Inicjatywy */}
            <section className="space-y-3">
                <h2 className="text-lg font-semibold">Inicjatywy / projekty ({map.initiatives.length})</h2>
                {map.initiatives.length === 0 ? (
                    <SectionEmpty>Brak danych — dodaj inicjatywy na karcie rozmowy.</SectionEmpty>
                ) : (
                    <ul className="divide-y divide-border rounded-lg border border-border">
                        {map.initiatives.map((i) => (
                            <li
                                key={`${i.name}-${i.kind}`}
                                className={`flex flex-wrap items-center gap-2 px-3 py-2 text-sm ${i.stale ? 'opacity-60' : ''}`}
                            >
                                <span className="font-medium">{i.name}</span>
                                <Badge variant="outline" size="sm">
                                    {INITIATIVE_KIND_PL[i.kind]}
                                </Badge>
                                {i.highPriority && (
                                    <Badge variant="warning" size="sm">
                                        wysoki priorytet
                                    </Badge>
                                )}
                                {i.stale && <Stale />}
                                <span className="ml-auto text-xs text-muted-foreground">
                                    {i.mentions}× · {i.lastConfirmed}
                                    {i.areas.length > 0 && ` · ${i.areas.join(', ')}`}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            {/* Dostawcy */}
            <section className="space-y-3">
                <h2 className="text-lg font-semibold">Inne firmy (dostawcy) ({map.vendors.length})</h2>
                {map.vendors.length === 0 ? (
                    <SectionEmpty>Brak danych — dodaj dostawców na karcie rozmowy.</SectionEmpty>
                ) : (
                    <div className="flex flex-wrap gap-2">
                        {map.vendors.map((v) => (
                            <div
                                key={v.id}
                                className={`rounded-lg border border-border px-3 py-2 ${v.stale ? 'opacity-60' : ''}`}
                            >
                                <div className="flex items-center gap-2">
                                    <span className="font-medium">{v.name}</span>
                                    <Badge variant="soft" size="sm">
                                        {v.mentions}×
                                    </Badge>
                                    {v.stale && <Stale />}
                                </div>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                    potwierdzone {v.lastConfirmed}
                                    {v.areas.length > 0 && ` · ${v.areas.join(', ')}`}
                                </p>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* Popyt */}
            <section className="space-y-3">
                <h2 className="text-lg font-semibold">Szukają ludzi ({map.demandSignals.length})</h2>
                {map.demandSignals.length === 0 ? (
                    <SectionEmpty>Brak zgłoszonych potrzeb rekrutacyjnych.</SectionEmpty>
                ) : (
                    <ul className="divide-y divide-border rounded-lg border border-border">
                        {map.demandSignals.map((d, idx) => (
                            <li
                                key={`${d.date}-${idx}`}
                                className={`flex flex-wrap items-center gap-2 px-3 py-2 text-sm ${d.stale ? 'opacity-60' : ''}`}
                            >
                                <span className="w-24 shrink-0 tabular-nums text-xs text-muted-foreground">
                                    {d.date}
                                </span>
                                <span className="font-medium">
                                    {d.roles.length > 0 ? d.roles.join(', ') : 'rola nieokreślona'}
                                </span>
                                {d.source && (
                                    <Badge variant="outline" size="sm">
                                        {SOURCE_PL[d.source] ?? d.source}
                                    </Badge>
                                )}
                                {d.areaName && (
                                    <span className="text-xs text-muted-foreground">{d.areaName}</span>
                                )}
                                {d.stale && <Stale />}
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            {/* Końce projektów */}
            <section className="space-y-3">
                <h2 className="text-lg font-semibold">Końce projektów ({map.projectEnds.length})</h2>
                {map.projectEnds.length === 0 ? (
                    <SectionEmpty>Nikt nie podał daty końca projektu.</SectionEmpty>
                ) : (
                    <ul className="divide-y divide-border rounded-lg border border-border">
                        {map.projectEnds.map((p, idx) => (
                            <li key={`${p.period}-${idx}`} className="flex items-center gap-3 px-3 py-2 text-sm">
                                <span className="w-28 shrink-0 font-medium tabular-nums">
                                    {MONTHS_SHORT[p.month - 1]} {p.year}
                                </span>
                                <span className="text-muted-foreground">
                                    {p.areaName ?? 'obszar nieokreślony'}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            {/* Pokrycie */}
            <section className="space-y-3">
                <h2 className="text-lg font-semibold">Pokrycie obszarów</h2>
                <p className="text-sm text-muted-foreground">
                    Które obszary mają dane i jak świeże. Brak karty = temat jeszcze nieporuszony.
                </p>
                <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                                <th className="px-3 py-2 font-medium">Obszar</th>
                                <th className="px-3 py-2 font-medium">Karty</th>
                                <th className="px-3 py-2 font-medium">Ostatnia rozmowa</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {map.coverage.map((c) => (
                                <tr key={c.areaId ?? 'none'} className={c.stale ? 'opacity-60' : ''}>
                                    <td className="px-3 py-2 font-medium">{c.areaName}</td>
                                    <td className="px-3 py-2 text-muted-foreground">{c.cards}</td>
                                    <td className="px-3 py-2">
                                        {c.missing ? (
                                            <span className="text-xs text-muted-foreground">— brak</span>
                                        ) : (
                                            <span className="text-xs text-foreground">
                                                {c.lastAny}
                                                {c.stale && ' · do odświeżenia'}
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {map.coverage.length === 0 && (
                                <tr>
                                    <td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">
                                        Brak zdefiniowanych obszarów. Dodasz je przy wypełnianiu karty rozmowy.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* Zespół + notatki */}
            {map.teamSizeLatest && (
                <section className="space-y-2">
                    <h2 className="text-lg font-semibold">Zespół</h2>
                    <p className="text-sm">
                        {map.teamSizeLatest.size ?? '—'} osób
                        {map.teamSizeLatest.externals !== null && `, w tym ${map.teamSizeLatest.externals} zewnętrznych`}
                        <span className="text-muted-foreground"> · stan na {map.teamSizeLatest.date}</span>
                    </p>
                </section>
            )}

            {map.notes.length > 0 && (
                <section className="space-y-3">
                    <h2 className="text-lg font-semibold">Notatki z rozmów</h2>
                    <ul className="space-y-2">
                        {map.notes.map((n, idx) => (
                            <li key={`${n.date}-${idx}`} className="rounded-lg border border-border px-3 py-2 text-sm">
                                <div className="flex items-center gap-2">
                                    <Badge variant="outline" size="sm">
                                        {NOTE_KIND_PL[n.kind]}
                                    </Badge>
                                    <span className="text-xs text-muted-foreground">{n.date}</span>
                                </div>
                                <p className="mt-1">{n.text}</p>
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </div>
    )
}

function Kpi({
    label,
    value,
    accent,
}: {
    label: string
    value: string | number
    accent?: 'green' | 'amber'
}) {
    const accentCls =
        accent === 'green' ? 'text-green-600' : accent === 'amber' ? 'text-amber-600' : 'text-foreground'
    return (
        <div className="rounded-lg border border-border bg-card p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className={`mt-1 text-2xl font-semibold ${accentCls}`}>{value}</p>
        </div>
    )
}
