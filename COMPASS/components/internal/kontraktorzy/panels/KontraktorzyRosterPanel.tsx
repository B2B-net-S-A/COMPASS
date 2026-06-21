'use client'

// Phase 38 — Kontraktorzy element: the current contractor roster with commercials
// (Imię i Nazwisko / Klient / Rekruter / Delivery Lead / Data wejścia / Stawka przychodowa /
// Stawka kosztowa / Marża). Sourced from live placements + the 2024 archive.

import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import type { ContractorRosterItem } from '@/lib/types/contractor'
import { ContractorLink } from './shared'

interface Props {
    roster: ContractorRosterItem[]
}

const plnFmt = new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN', maximumFractionDigits: 0 })
const money = (v: number | null) => (v == null ? '—' : plnFmt.format(v))

export function KontraktorzyRosterPanel({ roster }: Props) {
    const [q, setQ] = useState('')

    const filtered = useMemo(() => roster.filter((r) =>
        !q
        || r.consultant_name.toLowerCase().includes(q.toLowerCase())
        || r.client_name.toLowerCase().includes(q.toLowerCase())
        || (r.delivery_lead ?? '').toLowerCase().includes(q.toLowerCase())
        || (r.recruiter ?? '').toLowerCase().includes(q.toLowerCase()),
    ), [roster, q])

    return (
        <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h3 className="text-sm font-semibold">Aktualni kontraktorzy ({roster.length})</h3>
                    <p className="text-xs text-muted-foreground">Konsultanci u klientów z bieżącymi stawkami (placementy + archiwum 2024).</p>
                </div>
                <Input placeholder="Szukaj (konsultant / klient / DL / rekruter)…" value={q} onChange={(e) => setQ(e.target.value)} className="w-72" />
            </div>
            <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                        <tr>
                            <th className="p-2 text-left">Imię i nazwisko</th>
                            <th className="p-2 text-left">Klient</th>
                            <th className="p-2 text-left">Rekruter</th>
                            <th className="p-2 text-left">Delivery Lead</th>
                            <th className="p-2 text-left">Data wejścia</th>
                            <th className="p-2 text-right">Stawka przychodowa</th>
                            <th className="p-2 text-right">Stawka kosztowa</th>
                            <th className="p-2 text-right">Marża (mies.)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map((r) => (
                            <tr key={`${r.source}-${r.id}`} className="border-t">
                                <td className="p-2 font-medium">
                                    {r.contractor_id ? <ContractorLink id={r.contractor_id} name={r.consultant_name} /> : r.consultant_name}
                                    {r.source === 'archive' && <Badge variant="secondary" className="ml-2">archiwum</Badge>}
                                </td>
                                <td className="p-2">{r.client_name}</td>
                                <td className="p-2">{r.recruiter ?? '—'}</td>
                                <td className="p-2">{r.delivery_lead ?? '—'}</td>
                                <td className="p-2 whitespace-nowrap">{r.start_date ?? '—'}</td>
                                <td className="p-2 text-right tabular-nums">{money(r.revenue_rate)}</td>
                                <td className="p-2 text-right tabular-nums">{money(r.cost_rate)}</td>
                                <td className="p-2 text-right tabular-nums font-medium">{money(r.monthly_margin)}</td>
                            </tr>
                        ))}
                        {filtered.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">Brak kontraktorów.</td></tr>}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
