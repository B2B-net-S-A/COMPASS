'use client'

// Phase 33/34/35 — Kontraktorzy: Talent Community workspace, organised by the contractor journey.
// Tabs: Sprawy otwarte → Onboarding → Retencja → Offboarding → Analityka.
// Thin orchestrator: data loaded server-side (page.tsx), rendered by per-stage panels.

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ContractorDialog } from './ContractorDialog'
import { SprawyOtwartePanel } from './panels/SprawyOtwartePanel'
import { OnboardingPanel } from './panels/OnboardingPanel'
import { RetencjaPanel } from './panels/RetencjaPanel'
import { OffboardingPanel } from './panels/OffboardingPanel'
import { AnalitykaPanel } from './panels/AnalitykaPanel'
import { todayISO } from './panels/shared'
import {
    isOpenConversation,
    type ConversationListItem, type ContractorListItem, type ContractorDashboard, type ClientDepartureRow,
    type EntryListItem, type OnboardingQueueItem, type ExitQueueItem, type ContractorTaskListItem,
} from '@/lib/types/contractor'

// Tab values — kept in sync with the sidebar deep-links (/internal/kontraktorzy?tab=…).
const KONTRAKTOR_TABS = ['sprawy', 'onboarding', 'retencja', 'offboarding', 'analityka']

interface Props {
    dashboard: ContractorDashboard
    conversations: ConversationListItem[]
    contractors: ContractorListItem[]
    entries: EntryListItem[]
    departures: ClientDepartureRow[]
    tcmProfiles: Array<{ id: string; fullName: string }>
    contractorsLite: Array<{ id: string; full_name: string }>
    onboardingQueue: OnboardingQueueItem[]
    exitQueue: ExitQueueItem[]
    tasks: ContractorTaskListItem[]
}

export function KontraktorzyHub({
    dashboard, conversations, contractors, entries, departures, tcmProfiles, contractorsLite,
    onboardingQueue, exitQueue, tasks,
}: Props) {
    const router = useRouter()
    const searchParams = useSearchParams()
    const refresh = () => router.refresh()
    // Open the tab requested by the sidebar deep-link (?tab=…), default "Sprawy otwarte".
    const paramTab = searchParams.get('tab')
    const [tab, setTab] = useState(() => (paramTab && KONTRAKTOR_TABS.includes(paramTab) ? paramTab : 'sprawy'))
    useEffect(() => {
        if (paramTab && KONTRAKTOR_TABS.includes(paramTab)) setTab(paramTab)
    }, [paramTab])

    // "Sprawy otwarte" now scopes to contractor work only (inbox has its own sidebar link):
    // open conversations + not-done department tasks. Shares isOpenConversation with the panel.
    const today = todayISO()
    const openIssuesCount = conversations.filter((c) => isOpenConversation(c, today)).length
        + tasks.filter((t) => t.status !== 'done').length

    return (
        <div className="space-y-6">
            <header className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold">Talent Community — Kontraktorzy</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Opieka nad konsultantami u klientów wg ścieżki: onboarding → retencja → offboarding.
                    </p>
                </div>
                {/* Phase 36 — header keeps only the primary "add contractor" action (hidden on
                    Analityka). Conversation/task add live contextually in Retencja / Zadania. */}
                {tab !== 'analityka' && (
                    <div className="flex flex-wrap gap-2">
                        <ContractorDialog tcmProfiles={tcmProfiles} onSaved={refresh} />
                    </div>
                )}
            </header>

            <Tabs value={tab} onValueChange={setTab}>
                <TabsList className="flex flex-wrap">
                    <TabsTrigger value="sprawy">Sprawy otwarte ({openIssuesCount})</TabsTrigger>
                    <TabsTrigger value="onboarding">Onboarding ({onboardingQueue.length})</TabsTrigger>
                    <TabsTrigger value="retencja">Retencja ({contractors.length})</TabsTrigger>
                    <TabsTrigger value="offboarding">Offboarding ({exitQueue.length})</TabsTrigger>
                    <TabsTrigger value="analityka">Analityka</TabsTrigger>
                </TabsList>

                <TabsContent value="sprawy">
                    <SprawyOtwartePanel
                        conversations={conversations}
                        tasks={tasks}
                        tcmProfiles={tcmProfiles}
                        contractorsLite={contractorsLite}
                        onSaved={refresh}
                    />
                </TabsContent>
                <TabsContent value="onboarding">
                    <OnboardingPanel onboardingQueue={onboardingQueue} entries={entries} />
                </TabsContent>
                <TabsContent value="retencja">
                    <RetencjaPanel
                        conversations={conversations}
                        contractors={contractors}
                        tcmProfiles={tcmProfiles}
                        contractorsLite={contractorsLite}
                        onSaved={refresh}
                    />
                </TabsContent>
                <TabsContent value="offboarding">
                    <OffboardingPanel exitQueue={exitQueue} departures={departures} />
                </TabsContent>
                <TabsContent value="analityka">
                    <AnalitykaPanel
                        dashboard={dashboard}
                        conversations={conversations}
                        onboardingQueue={onboardingQueue}
                        exitQueue={exitQueue}
                        onSaved={refresh}
                    />
                </TabsContent>
            </Tabs>
        </div>
    )
}
