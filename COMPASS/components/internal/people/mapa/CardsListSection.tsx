'use client'

// Phase 46 — lista kart wywiadów z filtrami (klient / prowadzący / data / szukaj).
// Filtrowanie client-side po pobranym zestawie (jak ClientsAdminClient) —
// wolumen kart jest mały, a filtry działają natychmiast.

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
    INTERVIEW_CARD_STATUS_BADGE,
    INTERVIEW_CARD_STATUS_PL,
    type CardListItem,
} from '@/lib/types/tech-map'

const selectCls = 'flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm'

export function CardsListSection({ cards }: { cards: CardListItem[] }) {
    const [search, setSearch] = useState('')
    const [clientId, setClientId] = useState('')
    const [tcmId, setTcmId] = useState('')
    const [dateFrom, setDateFrom] = useState('')
    const [dateTo, setDateTo] = useState('')

    const clients = useMemo(() => {
        const m = new Map<string, string>()
        for (const c of cards) m.set(c.clientId, c.clientName)
        return Array.from(m, ([id, name]) => ({ id, name })).sort((a, b) =>
            a.name.localeCompare(b.name, 'pl'),
        )
    }, [cards])

    const tcms = useMemo(() => {
        const m = new Map<string, string>()
        for (const c of cards) if (c.tcmId && c.tcmName) m.set(c.tcmId, c.tcmName)
        return Array.from(m, ([id, name]) => ({ id, name })).sort((a, b) =>
            a.name.localeCompare(b.name, 'pl'),
        )
    }, [cards])

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase()
        return cards.filter((c) => {
            if (clientId && c.clientId !== clientId) return false
            if (tcmId && c.tcmId !== tcmId) return false
            if (dateFrom && c.interviewDate < dateFrom) return false
            if (dateTo && c.interviewDate > dateTo) return false
            if (q && !c.contractorName.toLowerCase().includes(q)) return false
            return true
        })
    }, [cards, search, clientId, tcmId, dateFrom, dateTo])

    return (
        <section className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
                <Input
                    className="w-56"
                    placeholder="Szukaj konsultanta…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
                <select className={selectCls} value={clientId} onChange={(e) => setClientId(e.target.value)}>
                    <option value="">Wszyscy klienci</option>
                    {clients.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                </select>
                <select className={selectCls} value={tcmId} onChange={(e) => setTcmId(e.target.value)}>
                    <option value="">Wszyscy prowadzący</option>
                    {tcms.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                </select>
                <Input
                    type="date"
                    className="w-40"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    aria-label="Data od"
                />
                <Input
                    type="date"
                    className="w-40"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    aria-label="Data do"
                />
                <span className="ml-auto text-xs text-muted-foreground">
                    {filtered.length} / {cards.length} kart
                </span>
            </div>

            <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                            <th className="px-3 py-2 font-medium">Data</th>
                            <th className="px-3 py-2 font-medium">Konsultant</th>
                            <th className="px-3 py-2 font-medium">Klient</th>
                            <th className="px-3 py-2 font-medium">Obszar</th>
                            <th className="px-3 py-2 font-medium">Blok</th>
                            <th className="px-3 py-2 font-medium">Status</th>
                            <th className="px-3 py-2 font-medium">Prowadzący</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {filtered.map((c) => (
                            <tr key={c.id} className="hover:bg-muted/40">
                                <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                                    <Link
                                        href={`/internal/people/mapa/karta/${c.id}`}
                                        className="text-primary hover:underline"
                                    >
                                        {c.interviewDate}
                                    </Link>
                                </td>
                                <td className="px-3 py-2">{c.contractorName}</td>
                                <td className="px-3 py-2">
                                    <Link
                                        href={`/internal/people/mapa/klienci/${c.clientId}`}
                                        className="hover:text-primary hover:underline"
                                    >
                                        {c.clientName}
                                    </Link>
                                </td>
                                <td className="px-3 py-2 text-muted-foreground">{c.areaName ?? '—'}</td>
                                <td className="px-3 py-2 font-semibold">{c.block}</td>
                                <td className="px-3 py-2">
                                    {c.isDraft ? (
                                        <Badge variant="warning" size="sm">Wersja robocza</Badge>
                                    ) : c.status ? (
                                        <span
                                            className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${INTERVIEW_CARD_STATUS_BADGE[c.status]}`}
                                        >
                                            {INTERVIEW_CARD_STATUS_PL[c.status]}
                                        </span>
                                    ) : (
                                        '—'
                                    )}
                                </td>
                                <td className="px-3 py-2 text-muted-foreground">{c.tcmName ?? '—'}</td>
                            </tr>
                        ))}
                        {filtered.length === 0 && (
                            <tr>
                                <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                                    {cards.length === 0
                                        ? 'Brak kart — zacznij od przycisku „Nowa rozmowa".'
                                        : 'Brak kart pasujących do filtrów.'}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </section>
    )
}
