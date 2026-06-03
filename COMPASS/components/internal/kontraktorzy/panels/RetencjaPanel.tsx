'use client'

// Phase 35 — Retencja: keep contractors at the client. At-risk worklist + the roster under care
// + the full conversation log (day-to-day care). Merges the former Opieka + Retencja tabs.

import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { ConversationDialog } from '../ConversationDialog'
import {
    deriveAtRisk, CONVERSATION_CATEGORY_PL, CONVERSATION_STATUS_PL, CONVERSATION_STATUS_BADGE, CONTRACTOR_STATUS_PL,
    type ConversationListItem, type ContractorListItem,
} from '@/lib/types/contractor'
import { ContractorLink, selectCls, todayISO } from './shared'

interface Props {
    conversations: ConversationListItem[]
    contractors: ContractorListItem[]
    tcmProfiles: Array<{ id: string; fullName: string }>
    contractorsLite: Array<{ id: string; full_name: string }>
    onSaved: () => void
}

export function RetencjaPanel({ conversations, contractors, tcmProfiles, contractorsLite, onSaved }: Props) {
    const atRisk = useMemo(() => deriveAtRisk(conversations), [conversations])
    const today = todayISO()

    const [cSearch, setCSearch] = useState('')
    const [q, setQ] = useState('')
    const [fClient, setFClient] = useState('')
    const [fTcm, setFTcm] = useState('')
    const [fCat, setFCat] = useState('')
    const [fStatus, setFStatus] = useState('')

    const filteredContractors = useMemo(() => contractors.filter((c) =>
        !cSearch
        || c.full_name.toLowerCase().includes(cSearch.toLowerCase())
        || (c.current_client ?? '').toLowerCase().includes(cSearch.toLowerCase()),
    ), [contractors, cSearch])

    const filteredConvs = useMemo(() => conversations.filter((c) => {
        if (q && !(`${c.contractor_name} ${c.note ?? ''}`.toLowerCase().includes(q.toLowerCase()))) return false
        if (fClient && !(c.client_snapshot ?? '').toLowerCase().includes(fClient.toLowerCase())) return false
        if (fTcm && c.tcm_id !== fTcm) return false
        if (fCat && c.category !== fCat) return false
        if (fStatus && c.status !== fStatus) return false
        return true
    }), [conversations, q, fClient, fTcm, fCat, fStatus])

    return (
        <div className="space-y-6">
            {/* Zagrożeni (at-risk) */}
            <section className="space-y-2">
                <h3 className="text-sm font-semibold">Zagrożeni ({atRisk.length})</h3>
                <p className="text-xs text-muted-foreground">
                    Otwarta rozmowa o zejściu/przedłużeniu lub status pilne / potrzebny kontakt. Reaguj zanim złożą wypowiedzenie.
                </p>
                <div className="overflow-x-auto rounded-md border">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                            <tr>
                                <th className="p-2 text-left">Kontraktor</th>
                                <th className="p-2 text-left">Klient</th>
                                <th className="p-2 text-left">Opiekun</th>
                                <th className="p-2 text-center">Otwarte</th>
                                <th className="p-2 text-left">Ostatni sygnał</th>
                                <th className="p-2 text-left">Status</th>
                                <th className="p-2 text-left">Follow-up</th>
                                <th className="p-2"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {atRisk.map((r) => {
                                const overdue = r.earliest_follow_up != null && r.earliest_follow_up < today
                                return (
                                    <tr key={r.contractor_id} className="border-t align-top">
                                        <td className="p-2"><ContractorLink id={r.contractor_id} name={r.contractor_name} /></td>
                                        <td className="p-2">{r.client_snapshot ?? '—'}</td>
                                        <td className="p-2">{r.tcm_name ?? '—'}</td>
                                        <td className="p-2 text-center"><Badge>{r.open_count}</Badge></td>
                                        <td className="p-2">
                                            <div>{CONVERSATION_CATEGORY_PL[r.latest.category]}</div>
                                            <div className="text-xs text-muted-foreground">
                                                {r.latest.conversation_date}{r.latest.note ? ` — ${r.latest.note}` : ''}
                                            </div>
                                        </td>
                                        <td className="p-2"><span className={cn('inline-block rounded border px-2 py-0.5 text-xs', CONVERSATION_STATUS_BADGE[r.latest.status])}>{CONVERSATION_STATUS_PL[r.latest.status]}</span></td>
                                        <td className={cn('p-2 whitespace-nowrap', overdue && 'font-medium text-red-600')}>{r.earliest_follow_up ?? '—'}</td>
                                        <td className="p-2 text-right">
                                            <ConversationDialog contractors={contractorsLite} tcmProfiles={tcmProfiles} presetContractorId={r.contractor_id} onSaved={onSaved} triggerLabel="Rozmowa" triggerVariant="outline" />
                                        </td>
                                    </tr>
                                )
                            })}
                            {atRisk.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">Brak zagrożonych kontraktorów. 🎉</td></tr>}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* Roster */}
            <section className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">Kontraktorzy pod opieką ({contractors.length})</h3>
                    <Input placeholder="Szukaj kontraktora / klienta…" value={cSearch} onChange={(e) => setCSearch(e.target.value)} className="w-64" />
                </div>
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
                                    <td className="p-2">
                                        <ContractorLink id={c.id} name={c.full_name} />
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
            </section>

            {/* Log rozmów */}
            <section className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">Log rozmów ({conversations.length})</h3>
                    <ConversationDialog contractors={contractorsLite} tcmProfiles={tcmProfiles} onSaved={onSaved} />
                </div>
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
                                    <td className="p-2"><ContractorLink id={c.contractor_id} name={c.contractor_name} /></td>
                                    <td className="p-2">{c.client_snapshot ?? '—'}</td>
                                    <td className="p-2">{c.tcm_name ?? '—'}</td>
                                    <td className="p-2">{CONVERSATION_CATEGORY_PL[c.category]}</td>
                                    <td className="p-2"><span className={cn('inline-block rounded border px-2 py-0.5 text-xs', CONVERSATION_STATUS_BADGE[c.status])}>{CONVERSATION_STATUS_PL[c.status]}</span></td>
                                    <td className="p-2 max-w-md text-muted-foreground">{c.note ?? '—'}</td>
                                    <td className="p-2 text-right">
                                        <ConversationDialog contractors={contractorsLite} tcmProfiles={tcmProfiles} existing={c} onSaved={onSaved} triggerLabel="Edytuj" triggerVariant="ghost" />
                                    </td>
                                </tr>
                            ))}
                            {filteredConvs.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">Brak rozmów.</td></tr>}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    )
}
