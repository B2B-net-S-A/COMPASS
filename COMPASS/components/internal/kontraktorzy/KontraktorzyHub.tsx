'use client'

// Phase 34 — Kontraktorzy: Talent Community workspace, organised by the contractor journey.
// Tabs: Pulpit → Onboarding → Opieka → Retencja → Exit & analiza zejść → Zadania.
// Thin orchestrator: data is loaded server-side (page.tsx) and rendered by per-stage panels.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ContractorDialog } from './ContractorDialog'
import { ConversationDialog } from './ConversationDialog'
import { TaskDialog } from './TaskDialog'
import { PulpitPanel } from './panels/PulpitPanel'
import { OnboardingPanel } from './panels/OnboardingPanel'
import { OpiekaPanel } from './panels/OpiekaPanel'
import { RetencjaPanel } from './panels/RetencjaPanel'
import { ExitPanel } from './panels/ExitPanel'
import { ZadaniaPanel } from './panels/ZadaniaPanel'
import type {
    ConversationListItem, ContractorListItem, ContractorDashboard, ClientDepartureRow,
    EntryListItem, OnboardingQueueItem, ExitQueueItem, ContractorTaskListItem,
} from '@/lib/types/contractor'
import type { InboxSummary } from '@/lib/types/support'

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
    inboxSummary: InboxSummary | null
}

export function KontraktorzyHub({
    dashboard, conversations, contractors, entries, departures, tcmProfiles, contractorsLite,
    onboardingQueue, exitQueue, tasks, inboxSummary,
}: Props) {
    const router = useRouter()
    const refresh = () => router.refresh()
    const [tab, setTab] = useState('pulpit')

    return (
        <div className="space-y-6">
            <header className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold">Talent Community — Kontraktorzy</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Opieka nad konsultantami u klientów wg ścieżki: onboarding → opieka → retencja → exit.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <ContractorDialog tcmProfiles={tcmProfiles} onSaved={refresh} />
                    <ConversationDialog contractors={contractorsLite} tcmProfiles={tcmProfiles} onSaved={refresh} />
                    <TaskDialog tcmProfiles={tcmProfiles} contractors={contractorsLite} onSaved={refresh} triggerVariant="secondary" />
                </div>
            </header>

            <Tabs value={tab} onValueChange={setTab}>
                <TabsList className="flex flex-wrap">
                    <TabsTrigger value="pulpit">Pulpit</TabsTrigger>
                    <TabsTrigger value="onboarding">Onboarding ({onboardingQueue.length})</TabsTrigger>
                    <TabsTrigger value="opieka">Opieka ({contractors.length})</TabsTrigger>
                    <TabsTrigger value="retencja">Retencja</TabsTrigger>
                    <TabsTrigger value="exit">Exit &amp; analiza zejść</TabsTrigger>
                    <TabsTrigger value="zadania">Zadania ({tasks.length})</TabsTrigger>
                </TabsList>

                <TabsContent value="pulpit">
                    <PulpitPanel
                        dashboard={dashboard}
                        conversations={conversations}
                        onboardingQueue={onboardingQueue}
                        exitQueue={exitQueue}
                        inboxSummary={inboxSummary}
                        onGoTo={setTab}
                        onSaved={refresh}
                    />
                </TabsContent>
                <TabsContent value="onboarding">
                    <OnboardingPanel onboardingQueue={onboardingQueue} entries={entries} />
                </TabsContent>
                <TabsContent value="opieka">
                    <OpiekaPanel
                        conversations={conversations}
                        contractors={contractors}
                        tcmProfiles={tcmProfiles}
                        contractorsLite={contractorsLite}
                        onSaved={refresh}
                    />
                </TabsContent>
                <TabsContent value="retencja">
                    <RetencjaPanel
                        conversations={conversations}
                        tcmProfiles={tcmProfiles}
                        contractorsLite={contractorsLite}
                        onSaved={refresh}
                    />
                </TabsContent>
                <TabsContent value="exit">
                    <ExitPanel exitQueue={exitQueue} departures={departures} dashboard={dashboard} />
                </TabsContent>
                <TabsContent value="zadania">
                    <ZadaniaPanel tasks={tasks} tcmProfiles={tcmProfiles} contractorsLite={contractorsLite} onSaved={refresh} />
                </TabsContent>
            </Tabs>
        </div>
    )
}
