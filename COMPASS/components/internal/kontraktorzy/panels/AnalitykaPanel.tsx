'use client'

// Phase 35 — Analityka: KPIs, per-stage counters, departure-reason trends + Excel import.

import { useMemo } from 'react'
import { ImportDialog } from '../ImportDialog'
import {
    deriveAtRisk, WHO_RESIGNED_PL,
    type ConversationListItem, type ContractorDashboard, type OnboardingQueueItem, type ExitQueueItem,
} from '@/lib/types/contractor'
import { Kpi, StatList } from './shared'

interface Props {
    dashboard: ContractorDashboard
    conversations: ConversationListItem[]
    onboardingQueue: OnboardingQueueItem[]
    exitQueue: ExitQueueItem[]
    onSaved: () => void
}

export function AnalitykaPanel({ dashboard, conversations, onboardingQueue, exitQueue, onSaved }: Props) {
    const atRiskCount = useMemo(() => deriveAtRisk(conversations).length, [conversations])

    return (
        <div className="space-y-6">
            {/* KPI */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Kpi label="Kontraktorzy" value={`${dashboard.contractorsActive}/${dashboard.contractorsTotal}`} hint="aktywni / wszyscy" />
                <Kpi label="Otwarte rozmowy" value={dashboard.openConversations} hint="pilne + potrzebny kontakt" accent={dashboard.openConversations > 0 ? 'amber' : undefined} />
                <Kpi label="Wejścia" value={dashboard.entriesTotal} hint="placementy + archiwum" accent="green" />
                <Kpi label="Zejścia" value={dashboard.departuresTotal} hint="zarejestrowane" accent="red" />
            </div>

            {/* Per-stage counters */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                <Kpi label="Onboarding" value={onboardingQueue.length} hint="w toku" />
                <Kpi label="Retencja — zagrożeni" value={atRiskCount} hint="at-risk" accent={atRiskCount > 0 ? 'red' : undefined} />
                <Kpi label="Offboarding" value={exitQueue.length} hint="exit interviews" />
            </div>

            {/* Trends */}
            <section className="grid gap-4 md:grid-cols-3">
                <StatList title="Powody zejść" rows={dashboard.departureReasons.map((r) => ({ label: WHO_RESIGNED_PL[r.who], value: r.count }))} />
                <StatList title="Zejścia per klient" rows={dashboard.departuresByClient.map((r) => ({ label: r.client, value: r.count }))} />
                <StatList title="Rozmowy per TCM" rows={dashboard.conversationsByTcm.map((r) => ({ label: r.tcm, value: r.count }))} />
            </section>

            {/* Import */}
            <section className="space-y-2">
                <h3 className="text-sm font-semibold">Import danych (Excel)</h3>
                <p className="text-xs text-muted-foreground">Idempotentny — ponowne wgranie tego samego pliku nie duplikuje wierszy.</p>
                <div className="grid gap-3 md:grid-cols-3">
                    <ImportCard title="Rozmowy z kontraktorami" desc="Log rozmów (Imię/Nazwisko/Sprawa/Notatka + status z koloru).">
                        <ImportDialog kind="rozmowy" onImported={onSaved} />
                    </ImportCard>
                    <ImportCard title="Wejścia do klientów" desc="Archiwum 2024 — kto wszedł do jakiego klienta i kiedy.">
                        <ImportDialog kind="wejscia" onImported={onSaved} />
                    </ImportCard>
                    <ImportCard title="Zejścia od klientów" desc="Zejścia — powód, przepięcie, replacement.">
                        <ImportDialog kind="zejscia" onImported={onSaved} />
                    </ImportCard>
                </div>
            </section>
        </div>
    )
}

function ImportCard({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
            <div>
                <h4 className="text-sm font-semibold">{title}</h4>
                <p className="mt-1 text-xs text-muted-foreground">{desc}</p>
            </div>
            <div className="mt-auto">{children}</div>
        </div>
    )
}
