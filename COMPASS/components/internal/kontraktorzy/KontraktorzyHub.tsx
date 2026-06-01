'use client'

// Phase 33 — Kontraktorzy: TCM hub. Tabs: log rozmów, kontraktorzy, wejścia, zejścia,
// statystyki, import. Client-side filtering over server-loaded data (TCM-only, hundreds of rows).

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { ConversationDialog } from './ConversationDialog'
import { ContractorDialog } from './ContractorDialog'
import { ImportDialog } from './ImportDialog'
import {
    CONVERSATION_CATEGORY_PL, CONVERSATION_STATUS_PL, CONVERSATION_STATUS_BADGE,
    CONTRACTOR_STATUS_PL, WHO_RESIGNED_PL,
    type ConversationListItem, type ContractorListItem, type ContractorDashboard,
    type ClientDepartureRow, type EntryListItem,
} from '@/lib/types/contractor'

const selectCls = 'flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm'
const pln = (n: number | null): string => (n != null ? `${Number(n).toLocaleString('pl-PL')} zł` : '—')

interface Props {
    dashboard: ContractorDashboard
    conversations: ConversationListItem[]
    contractors: ContractorListItem[]
    entries: EntryListItem[]
    departures: ClientDepartureRow[]
    tcmProfiles: Array<{ id: string; fullName: string }>
    contractorsLite: Array<{ id: string; full_name: string }>
}

export function KontraktorzyHub({ dashboard, conversations, contractors, entries, departures, tcmProfiles, contractorsLite }: Props) {
    const router = useRouter()
    const refresh = () => router.refresh()

    // Conversation log filters
    const [q, setQ] = useState('')
    const [fClient, setFClient] = useState('')
    const [fTcm, setFTcm] = useState('')
    const [fCat, setFCat] = useState('')
    const [fStatus, setFStatus] = useState('')

    const filteredConvs = useMemo(() => conversations.filter((c) => {
        if (q && !(`${c.contractor_name} ${c.note ?? ''}`.toLowerCase().includes(q.toLowerCase()))) return false
        if (fClient && !(c.client_snapshot ?? '').toLowerCase().includes(fClient.toLowerCase())) return false
        if (fTcm && c.tcm_id !== fTcm) return false
        if (fCat && c.category !== fCat) return false
        if (fStatus && c.status !== fStatus) return false
        return true
    }), [conversations, q, fClient, fTcm, fCat, fStatus])

    const [cSearch, setCSearch] = useState('')
    const filteredContractors = useMemo(() => contractors.filter((c) =>
        !cSearch || c.full_name.toLowerCase().includes(cSearch.toLowerCase()) || (c.current_client ?? '').toLowerCase().includes(cSearch.toLowerCase()),
    ), [contractors, cSearch])

    return (
        <div className="space-y-6">
            <header className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold">Kontraktorzy</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Opieka Talent Community nad konsultantami u klientów — log rozmów, wywiady, wejścia i zejścia.
                    </p>
                </div>
                <div className="flex gap-2">
                    <ContractorDialog tcmProfiles={tcmProfiles} onSaved={refresh} />
                    <ConversationDialog contractors={contractorsLite} tcmProfiles={tcmProfiles} onSaved={refresh} />
                </div>
            </header>

            {/* KPI strip */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Kpi label="Kontraktorzy" value={`${dashboard.contractorsActive}/${dashboard.contractorsTotal}`} hint="aktywni / wszyscy" />
                <Kpi label="Otwarte rozmowy" value={dashboard.openConversations} hint="pilne + potrzebny kontakt" accent={dashboard.openConversations > 0 ? 'amber' : undefined} />
                <Kpi label="Wejścia" value={dashboard.entriesTotal} hint={pln(dashboard.marginGained) + ' marży'} accent="green" />
                <Kpi label="Zejścia" value={dashboard.departuresTotal} hint={pln(dashboard.marginLost) + ' straty'} accent="red" />
            </div>

            <Tabs defaultValue="rozmowy">
                <TabsList className="flex flex-wrap">
                    <TabsTrigger value="rozmowy">Rozmowy ({conversations.length})</TabsTrigger>
                    <TabsTrigger value="kontraktorzy">Kontraktorzy ({contractors.length})</TabsTrigger>
                    <TabsTrigger value="wejscia">Wejścia ({entries.length})</TabsTrigger>
                    <TabsTrigger value="zejscia">Zejścia ({departures.length})</TabsTrigger>
                    <TabsTrigger value="statystyki">Statystyki</TabsTrigger>
                    <TabsTrigger value="import">Import</TabsTrigger>
                </TabsList>

                {/* ── Rozmowy ── */}
                <TabsContent value="rozmowy" className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                        <Input placeholder="Szukaj (nazwisko / notatka)…" value={q} onChange={(e) => setQ(e.target.value)} className="w-56" />
                        <Input placeholder="Klient" value={fClient} onChange={(e) => setFClient(e.target.value)} className="w-36" />
                        <select className={selectCls} value={fTcm} onChange={(e) => setFTcm(e.target.value)}>
                            <option value="">Wszyscy TCM</option>
                            {tcmProfiles.map((t) => <option key={t.id} value={t.id}>{t.fullName}</option>)}
                        </select>
                        <select className={selectCls} value={fCat} onChange={(e) => setFCat(e.target.value)}>
                            <option value="">Wszystkie sprawy</option>
                            {Object.entries(CONVERSATION_CATEGORY_PL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                        <select className={selectCls} value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
                            <option value="">Wszystkie statusy</option>
                            {Object.entries(CONVERSATION_STATUS_PL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                    </div>
                    <div className="overflow-x-auto rounded-md border">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/50">
                                <tr>
                                    <th className="p-2 text-left">Data</th>
                                    <th className="p-2 text-left">Kontraktor</th>
                                    <th className="p-2 text-left">Klient</th>
                                    <th className="p-2 text-left">TCM</th>
                                    <th className="p-2 text-left">Sprawa</th>
                                    <th className="p-2 text-left">Status</th>
                                    <th className="p-2 text-left">Notatka</th>
                                    <th className="p-2"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredConvs.map((c) => (
                                    <tr key={c.id} className="border-t align-top">
                                        <td className="p-2 whitespace-nowrap">{c.conversation_date}</td>
                                        <td className="p-2 font-medium">
                                            <Link href={`/internal/kontraktorzy/${c.contractor_id}`} className="hover:text-primary hover:underline">{c.contractor_name}</Link>
                                        </td>
                                        <td className="p-2">{c.client_snapshot ?? '—'}</td>
                                        <td className="p-2">{c.tcm_name ?? '—'}</td>
                                        <td className="p-2">{CONVERSATION_CATEGORY_PL[c.category]}</td>
                                        <td className="p-2"><span className={cn('inline-block rounded border px-2 py-0.5 text-xs', CONVERSATION_STATUS_BADGE[c.status])}>{CONVERSATION_STATUS_PL[c.status]}</span></td>
                                        <td className="p-2 max-w-md text-muted-foreground">{c.note ?? '—'}</td>
                                        <td className="p-2 text-right">
                                            <ConversationDialog contractors={contractorsLite} tcmProfiles={tcmProfiles} existing={c} onSaved={refresh} triggerLabel="Edytuj" triggerVariant="ghost" />
                                        </td>
                                    </tr>
                                ))}
                                {filteredConvs.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">Brak rozmów.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </TabsContent>

                {/* ── Kontraktorzy ── */}
                <TabsContent value="kontraktorzy" className="space-y-3">
                    <Input placeholder="Szukaj kontraktora / klienta…" value={cSearch} onChange={(e) => setCSearch(e.target.value)} className="w-72" />
                    <div className="overflow-x-auto rounded-md border">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/50">
                                <tr>
                                    <th className="p-2 text-left">Kontraktor</th>
                                    <th className="p-2 text-left">Klient</th>
                                    <th className="p-2 text-left">Stanowisko</th>
                                    <th className="p-2 text-left">Opiekun</th>
                                    <th className="p-2 text-left">Status</th>
                                    <th className="p-2 text-center">Otwarte</th>
                                    <th className="p-2 text-left">Ost. kontakt</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredContractors.map((c) => (
                                    <tr key={c.id} className="border-t">
                                        <td className="p-2 font-medium">
                                            <Link href={`/internal/kontraktorzy/${c.id}`} className="hover:text-primary hover:underline">{c.full_name}</Link>
                                            {c.phone && <span className="ml-2 text-xs text-muted-foreground">{c.phone}</span>}
                                        </td>
                                        <td className="p-2">{c.current_client ?? '—'}</td>
                                        <td className="p-2">{c.current_position ?? '—'}</td>
                                        <td className="p-2">{c.owner_tcm_name ?? '—'}</td>
                                        <td className="p-2"><Badge variant="outline">{CONTRACTOR_STATUS_PL[c.status]}</Badge></td>
                                        <td className="p-2 text-center">{c.open_conversations > 0 ? <Badge>{c.open_conversations}</Badge> : '—'}</td>
                                        <td className="p-2 text-muted-foreground">{c.last_conversation_date ?? '—'}</td>
                                    </tr>
                                ))}
                                {filteredContractors.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Brak kontraktorów.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </TabsContent>

                {/* ── Wejścia ── */}
                <TabsContent value="wejscia">
                    <div className="overflow-x-auto rounded-md border">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/50">
                                <tr>
                                    <th className="p-2 text-left">Konsultant</th>
                                    <th className="p-2 text-left">Klient</th>
                                    <th className="p-2 text-left">Stanowisko</th>
                                    <th className="p-2 text-left">Rekruter</th>
                                    <th className="p-2 text-left">Start</th>
                                    <th className="p-2 text-right">Marża/mc</th>
                                    <th className="p-2 text-left">Źródło</th>
                                </tr>
                            </thead>
                            <tbody>
                                {entries.map((e) => (
                                    <tr key={`${e.source}-${e.id}`} className="border-t">
                                        <td className="p-2 font-medium">{e.consultant_name}</td>
                                        <td className="p-2">{e.client_name}</td>
                                        <td className="p-2">{e.position ?? '—'}</td>
                                        <td className="p-2">{e.recruiter ?? '—'}</td>
                                        <td className="p-2">{e.start_date ?? '—'}</td>
                                        <td className="p-2 text-right">{pln(e.monthly_margin)}</td>
                                        <td className="p-2"><Badge variant={e.source === 'placement' ? 'default' : 'secondary'}>{e.source === 'placement' ? 'placement' : 'archiwum 2024'}</Badge></td>
                                    </tr>
                                ))}
                                {entries.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Brak wejść. Zaimportuj plik (zakładka Import).</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </TabsContent>

                {/* ── Zejścia ── */}
                <TabsContent value="zejscia">
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
                                    <th className="p-2 text-right">Strata/mc</th>
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
                                        <td className="p-2 text-right">{pln(d.monthly_margin)}</td>
                                    </tr>
                                ))}
                                {departures.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Brak zejść.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </TabsContent>

                {/* ── Statystyki ── */}
                <TabsContent value="statystyki" className="grid gap-4 md:grid-cols-3">
                    <StatList title="Powody zejść" rows={dashboard.departureReasons.map((r) => ({ label: WHO_RESIGNED_PL[r.who], value: r.count }))} />
                    <StatList title="Rozmowy per TCM" rows={dashboard.conversationsByTcm.map((r) => ({ label: r.tcm, value: r.count }))} />
                    <StatList title="Zejścia per klient" rows={dashboard.departuresByClient.map((r) => ({ label: r.client, value: r.count }))} />
                </TabsContent>

                {/* ── Import ── */}
                <TabsContent value="import" className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                        Wgraj historyczne pliki Excel. Import jest idempotentny — ponowne wgranie tego samego pliku nie zduplikuje wierszy.
                    </p>
                    <div className="grid gap-3 md:grid-cols-3">
                        <ImportCard title="Rozmowy z kontraktorami" desc="Log rozmów telefonicznych (Imię/Nazwisko/Sprawa/Notatka + status z koloru).">
                            <ImportDialog kind="rozmowy" onImported={refresh} />
                        </ImportCard>
                        <ImportCard title="Wejścia do klientów" desc="Archiwum 2024 — kto wszedł do jakiego klienta, marża.">
                            <ImportDialog kind="wejscia" onImported={refresh} />
                        </ImportCard>
                        <ImportCard title="Zejścia od klientów" desc="Zejścia — powód, przepięcie, replacement, strata.">
                            <ImportDialog kind="zejscia" onImported={refresh} />
                        </ImportCard>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    )
}

function Kpi({ label, value, hint, accent }: { label: string; value: string | number; hint?: string; accent?: 'amber' | 'green' | 'red' }) {
    const accentCls = accent === 'amber' ? 'text-amber-600' : accent === 'green' ? 'text-emerald-600' : accent === 'red' ? 'text-red-600' : 'text-foreground'
    return (
        <div className="rounded-lg border bg-card p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
            <div className={cn('mt-1 text-2xl font-bold', accentCls)}>{value}</div>
            {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
        </div>
    )
}

function StatList({ title, rows }: { title: string; rows: Array<{ label: string; value: number }> }) {
    return (
        <div className="rounded-lg border bg-card p-4">
            <h3 className="mb-3 text-sm font-semibold">{title}</h3>
            {rows.length === 0 ? <p className="text-sm text-muted-foreground">Brak danych.</p> : (
                <ul className="space-y-1.5">
                    {rows.map((r, i) => (
                        <li key={i} className="flex items-center justify-between text-sm">
                            <span className="truncate pr-2">{r.label}</span>
                            <span className="font-semibold tabular-nums">{r.value}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )
}

function ImportCard({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
            <div>
                <h3 className="text-sm font-semibold">{title}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{desc}</p>
            </div>
            <div className="mt-auto">{children}</div>
        </div>
    )
}
