'use client'

// Phase 38 — Talent Community / Kontraktorzy: the contractor lifecycle as five sidebar elements.
// This hub renders four of them as tabs (Rozmowy → Onboarding → Exit → Kontraktorzy); the fifth,
// Analityka, is its own route (/internal/analityka). Tab values stay in sync with the sidebar
// deep-links (/internal/kontraktorzy?tab=…). Data is loaded server-side (page.tsx).

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ContractorDialog } from './ContractorDialog'
import { RozmowyPanel } from './panels/RozmowyPanel'
import { OnboardingEntriesPanel } from './panels/OnboardingEntriesPanel'
import { ExitPanel } from './panels/ExitPanel'
import { KontraktorzyRosterPanel } from './panels/KontraktorzyRosterPanel'
import type {
    ConversationListItem, OnboardingEntryItem, ExitDepartureItem, ContractorRosterItem,
} from '@/lib/types/contractor'

const KONTRAKTOR_TABS = ['rozmowy', 'onboarding', 'exit', 'kontraktorzy']

interface Props {
    conversations: ConversationListItem[]
    onboardingEntries: OnboardingEntryItem[]
    departures: ExitDepartureItem[]
    roster: ContractorRosterItem[]
    tcmProfiles: Array<{ id: string; fullName: string }>
    contractorsLite: Array<{ id: string; full_name: string }>
}

export function KontraktorzyHub({ conversations, onboardingEntries, departures, roster, tcmProfiles, contractorsLite }: Props) {
    const router = useRouter()
    const searchParams = useSearchParams()
    const refresh = () => router.refresh()
    const paramTab = searchParams.get('tab')
    const [tab, setTab] = useState(() => (paramTab && KONTRAKTOR_TABS.includes(paramTab) ? paramTab : 'rozmowy'))
    useEffect(() => {
        if (paramTab && KONTRAKTOR_TABS.includes(paramTab)) setTab(paramTab)
    }, [paramTab])

    return (
        <div className="space-y-6">
            <header className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold">Talent Community — Kontraktorzy</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Opieka nad konsultantami u klientów wg ścieżki: rozmowy → onboarding → exit, plus roster ze stawkami.
                    </p>
                </div>
                <ContractorDialog tcmProfiles={tcmProfiles} onSaved={refresh} />
            </header>

            <Tabs value={tab} onValueChange={setTab}>
                <TabsList className="flex flex-wrap">
                    <TabsTrigger value="rozmowy">Rozmowy ({conversations.length})</TabsTrigger>
                    <TabsTrigger value="onboarding">Onboarding ({onboardingEntries.length})</TabsTrigger>
                    <TabsTrigger value="exit">Exit ({departures.length})</TabsTrigger>
                    <TabsTrigger value="kontraktorzy">Kontraktorzy ({roster.length})</TabsTrigger>
                </TabsList>

                <TabsContent value="rozmowy">
                    <RozmowyPanel
                        conversations={conversations}
                        tcmProfiles={tcmProfiles}
                        contractorsLite={contractorsLite}
                        onSaved={refresh}
                    />
                </TabsContent>
                <TabsContent value="onboarding">
                    <OnboardingEntriesPanel entries={onboardingEntries} onSaved={refresh} />
                </TabsContent>
                <TabsContent value="exit">
                    <ExitPanel departures={departures} onSaved={refresh} />
                </TabsContent>
                <TabsContent value="kontraktorzy">
                    <KontraktorzyRosterPanel roster={roster} />
                </TabsContent>
            </Tabs>
        </div>
    )
}
