'use client'

// Phase 35/36 — "Sprawy otwarte" (Open issues): the daily contractor worklist —
// open conversations + department tasks. (administracja@ inbox now has its own sidebar link.)

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { ZadaniaPanel } from './ZadaniaPanel'
import {
    CONVERSATION_CATEGORY_PL, CONVERSATION_STATUS_PL, CONVERSATION_STATUS_BADGE, isOpenConversation,
    type ConversationListItem, type ContractorTaskListItem,
} from '@/lib/types/contractor'
import { ContractorLink, todayISO } from './shared'

interface Props {
    conversations: ConversationListItem[]
    tasks: ContractorTaskListItem[]
    tcmProfiles: Array<{ id: string; fullName: string }>
    contractorsLite: Array<{ id: string; full_name: string }>
    onSaved: () => void
}

const statusRank = (s: ConversationListItem['status']): number =>
    s === 'pilne' ? 0 : s === 'potrzebny_kontakt' ? 1 : 2

export function SprawyOtwartePanel({ conversations, tasks, tcmProfiles, contractorsLite, onSaved }: Props) {
    const today = todayISO()

    const openConvs = useMemo(() => conversations
        .filter((c) => isOpenConversation(c, today))
        .sort((a, b) =>
            statusRank(a.status) - statusRank(b.status)
            || (a.follow_up_date ?? a.conversation_date).localeCompare(b.follow_up_date ?? b.conversation_date),
        ), [conversations, today])

    return (
        <div className="space-y-6">
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
                                        <td className={cn('p-2 whitespace-nowrap', overdue && 'font-medium text-destructive')}>{c.follow_up_date ?? '—'}</td>
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
