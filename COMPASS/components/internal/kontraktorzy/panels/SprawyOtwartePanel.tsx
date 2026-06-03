'use client'

// Phase 35 — "Sprawy otwarte" (Open issues): the daily worklist —
// administracja@ inbox tickets + open contractor conversations + department tasks.

import { useMemo } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { TicketStatusBadge } from '@/components/support/TicketStatusBadge'
import { InboxPriorityBadge } from '@/components/inbox/InboxPriorityBadge'
import { ZadaniaPanel } from './ZadaniaPanel'
import {
    CONVERSATION_CATEGORY_PL, CONVERSATION_STATUS_PL, CONVERSATION_STATUS_BADGE,
    type ConversationListItem, type ContractorTaskListItem,
} from '@/lib/types/contractor'
import type { OpenInboxTicketLite } from '@/lib/types/support'
import { ContractorLink, todayISO } from './shared'

interface Props {
    openInboxTickets: OpenInboxTicketLite[]
    conversations: ConversationListItem[]
    tasks: ContractorTaskListItem[]
    tcmProfiles: Array<{ id: string; fullName: string }>
    contractorsLite: Array<{ id: string; full_name: string }>
    onSaved: () => void
}

const statusRank = (s: ConversationListItem['status']): number =>
    s === 'pilne' ? 0 : s === 'potrzebny_kontakt' ? 1 : 2

export function SprawyOtwartePanel({ openInboxTickets, conversations, tasks, tcmProfiles, contractorsLite, onSaved }: Props) {
    const today = todayISO()
    const nowIso = useMemo(() => new Date().toISOString(), [])

    const openConvs = useMemo(() => conversations
        .filter((c) =>
            c.status === 'pilne'
            || c.status === 'potrzebny_kontakt'
            || (c.follow_up_date != null && c.follow_up_date <= today && c.status !== 'rozwiazane'),
        )
        .sort((a, b) =>
            statusRank(a.status) - statusRank(b.status)
            || (a.follow_up_date ?? a.conversation_date).localeCompare(b.follow_up_date ?? b.conversation_date),
        ), [conversations, today])

    return (
        <div className="space-y-6">
            {/* Skrzynka administracja@ */}
            <section className="space-y-2">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Skrzynka administracja@ ({openInboxTickets.length})</h3>
                    <Link href="/admin/inbox" className="text-sm text-primary hover:underline">Otwórz tablicę →</Link>
                </div>
                <div className="overflow-x-auto rounded-md border">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                            <tr>
                                <th className="p-2 text-left">Temat</th>
                                <th className="p-2 text-left">Kategoria</th>
                                <th className="p-2 text-left">Priorytet</th>
                                <th className="p-2 text-left">Status</th>
                                <th className="p-2 text-left">Odpowiedzialna</th>
                                <th className="p-2 text-left">Termin SLA</th>
                            </tr>
                        </thead>
                        <tbody>
                            {openInboxTickets.map((t) => {
                                const overdue = t.due_date != null && t.due_date < nowIso
                                return (
                                    <tr key={t.id} className="border-t">
                                        <td className="p-2"><Link href={`/admin/inbox/${t.id}`} className="font-medium hover:text-primary hover:underline">{t.subject}</Link></td>
                                        <td className="p-2 text-muted-foreground">{t.category_name_pl}</td>
                                        <td className="p-2"><InboxPriorityBadge priority={t.priority_level} /></td>
                                        <td className="p-2"><TicketStatusBadge status={t.status} /></td>
                                        <td className="p-2">{t.assignee_name ?? <span className="text-amber-600">nieprzypisane</span>}</td>
                                        <td className={cn('p-2 whitespace-nowrap', overdue && 'font-medium text-red-600')}>{t.due_date ? new Date(t.due_date).toLocaleDateString('pl-PL') : '—'}</td>
                                    </tr>
                                )
                            })}
                            {openInboxTickets.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Brak otwartych zgłoszeń w skrzynce.</td></tr>}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* Otwarte rozmowy */}
            <section className="space-y-2">
                <h3 className="text-sm font-semibold">Otwarte rozmowy ({openConvs.length})</h3>
                <p className="text-xs text-muted-foreground">Pilne / potrzebny kontakt lub follow-up po terminie.</p>
                <div className="overflow-x-auto rounded-md border">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                            <tr>
                                <th className="p-2 text-left">Kontraktor</th>
                                <th className="p-2 text-left">Klient</th>
                                <th className="p-2 text-left">Sprawa</th>
                                <th className="p-2 text-left">Status</th>
                                <th className="p-2 text-left">Follow-up</th>
                                <th className="p-2 text-left">Notatka</th>
                            </tr>
                        </thead>
                        <tbody>
                            {openConvs.map((c) => {
                                const overdue = c.follow_up_date != null && c.follow_up_date < today
                                return (
                                    <tr key={c.id} className="border-t align-top">
                                        <td className="p-2"><ContractorLink id={c.contractor_id} name={c.contractor_name} /></td>
                                        <td className="p-2">{c.client_snapshot ?? '—'}</td>
                                        <td className="p-2">{CONVERSATION_CATEGORY_PL[c.category]}</td>
                                        <td className="p-2"><span className={cn('inline-block rounded border px-2 py-0.5 text-xs', CONVERSATION_STATUS_BADGE[c.status])}>{CONVERSATION_STATUS_PL[c.status]}</span></td>
                                        <td className={cn('p-2 whitespace-nowrap', overdue && 'font-medium text-red-600')}>{c.follow_up_date ?? '—'}</td>
                                        <td className="p-2 max-w-md text-muted-foreground">{c.note ?? '—'}</td>
                                    </tr>
                                )
                            })}
                            {openConvs.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Brak otwartych rozmów.</td></tr>}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* Zadania */}
            <section className="space-y-2">
                <h3 className="text-sm font-semibold">Zadania działu</h3>
                <ZadaniaPanel tasks={tasks} tcmProfiles={tcmProfiles} contractorsLite={contractorsLite} onSaved={onSaved} />
            </section>
        </div>
    )
}
