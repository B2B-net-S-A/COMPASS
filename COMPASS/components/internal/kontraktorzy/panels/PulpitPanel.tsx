'use client'

// Phase 34 — Pulpit: KPI overview + "wymaga uwagi dziś" (at-risk / follow-up / onboarding / exit)
// + administracja@ inbox summary + the (de-emphasised) Excel import.

import { useMemo } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { ImportDialog } from '../ImportDialog'
import {
    deriveAtRisk,
    type ConversationListItem, type ContractorDashboard, type OnboardingQueueItem, type ExitQueueItem,
} from '@/lib/types/contractor'
import type { InboxSummary } from '@/lib/types/support'
import { Kpi, todayISO } from './shared'

interface Props {
    dashboard: ContractorDashboard
    conversations: ConversationListItem[]
    onboardingQueue: OnboardingQueueItem[]
    exitQueue: ExitQueueItem[]
    inboxSummary: InboxSummary | null
    onGoTo: (tab: string) => void
    onSaved: () => void
}

export function PulpitPanel({ dashboard, conversations, onboardingQueue, exitQueue, inboxSummary, onGoTo, onSaved }: Props) {
    const today = todayISO()
    const atRiskCount = useMemo(() => deriveAtRisk(conversations).length, [conversations])
    const followUpDue = useMemo(
        () => conversations.filter((c) => c.follow_up_date && c.follow_up_date <= today && c.status !== 'rozwiazane').length,
        [conversations, today],
    )

    return (
        <div className="space-y-6">
            {/* KPI strip */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Kpi label="Kontraktorzy" value={`${dashboard.contractorsActive}/${dashboard.contractorsTotal}`} hint="aktywni / wszyscy" />
                <Kpi label="Otwarte rozmowy" value={dashboard.openConversations} hint="pilne + potrzebny kontakt" accent={dashboard.openConversations > 0 ? 'amber' : undefined} />
                <Kpi label="Wejścia" value={dashboard.entriesTotal} hint="placementy + archiwum" accent="green" />
                <Kpi label="Zejścia" value={dashboard.departuresTotal} hint="zarejestrowane" accent="red" />
            </div>

            {/* Wymaga uwagi dziś */}
            <section className="space-y-3">
                <h3 className="text-sm font-semibold">Wymaga uwagi dziś</h3>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <ActionCard label="Retencja" value={atRiskCount} hint="zagrożeni" accent={atRiskCount > 0 ? 'red' : undefined} onClick={() => onGoTo('retencja')} />
                    <ActionCard label="Follow-up" value={followUpDue} hint="termin minął / dziś" accent={followUpDue > 0 ? 'amber' : undefined} onClick={() => onGoTo('opieka')} />
                    <ActionCard label="Onboarding" value={onboardingQueue.length} hint="do obsługi" onClick={() => onGoTo('onboarding')} />
                    <ActionCard label="Exit interviews" value={exitQueue.length} hint="zaplanowane / do review" onClick={() => onGoTo('exit')} />
                </div>
            </section>

            {/* Skrzynka administracja@ */}
            <section className="space-y-3">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Skrzynka administracja@</h3>
                    <Link href="/admin/inbox" className="text-sm text-primary hover:underline">Otwórz skrzynkę →</Link>
                </div>
                {inboxSummary ? (
                    <div className="grid grid-cols-3 gap-3">
                        <Kpi label="Otwarte" value={inboxSummary.open} />
                        <Kpi label="Przeterminowane" value={inboxSummary.overdue} hint="po SLA" accent={inboxSummary.overdue > 0 ? 'red' : undefined} />
                        <Kpi label="Nieprzypisane" value={inboxSummary.unassigned} accent={inboxSummary.unassigned > 0 ? 'amber' : undefined} />
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground">Podgląd skrzynki niedostępny (wymaga uprawnień handlera inboxu).</p>
                )}
            </section>

            {/* Import (de-emphasised) */}
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

function ActionCard({ label, value, hint, accent, onClick }: { label: string; value: number; hint?: string; accent?: 'amber' | 'red'; onClick: () => void }) {
    const accentCls = accent === 'red' ? 'text-red-600' : accent === 'amber' ? 'text-amber-600' : 'text-foreground'
    return (
        <button onClick={onClick} className="rounded-lg border bg-card p-4 text-left transition hover:bg-accent">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
            <div className={cn('mt-1 text-2xl font-bold', accentCls)}>{value}</div>
            {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
        </button>
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
