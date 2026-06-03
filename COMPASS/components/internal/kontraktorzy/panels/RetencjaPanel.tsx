'use client'

// Phase 34 — Retencja: proactive at-risk worklist derived from the conversation log (no schema change).

import { useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { ConversationDialog } from '../ConversationDialog'
import {
    deriveAtRisk, CONVERSATION_CATEGORY_PL, CONVERSATION_STATUS_PL, CONVERSATION_STATUS_BADGE,
    type ConversationListItem,
} from '@/lib/types/contractor'
import { ContractorLink, todayISO } from './shared'

interface Props {
    conversations: ConversationListItem[]
    tcmProfiles: Array<{ id: string; fullName: string }>
    contractorsLite: Array<{ id: string; full_name: string }>
    onSaved: () => void
}

export function RetencjaPanel({ conversations, tcmProfiles, contractorsLite, onSaved }: Props) {
    const atRisk = useMemo(() => deriveAtRisk(conversations), [conversations])
    const today = todayISO()

    return (
        <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
                Kontraktorzy z otwartą rozmową o zejściu/przedłużeniu lub oznaczeni jako pilne / potrzebny kontakt.
                Reaguj zanim złożą wypowiedzenie.
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
                            const overdue = r.earliest_follow_up && r.earliest_follow_up < today
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
        </div>
    )
}
