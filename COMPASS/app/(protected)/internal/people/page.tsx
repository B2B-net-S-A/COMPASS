import { LayoutDashboard, UserPlus, LogOut, Users, Inbox, BarChart3, FileText } from 'lucide-react'
import { HubTabs, type HubTab } from '@/components/internal/HubTabs'
import { requireTalentCommunityOrAdminLayout } from '@/lib/auth/internal-guard'
import { PulpitPanel } from '@/components/internal/people/PulpitPanel'
import { OnboardingTabPanel } from '@/components/internal/people/OnboardingTabPanel'
import { ExitTabPanel } from '@/components/internal/people/ExitTabPanel'
import { KontraktorzyTabPanel } from '@/components/internal/people/KontraktorzyTabPanel'
import { SprawyTabPanel } from '@/components/internal/people/SprawyTabPanel'
import { AnalitykaTabPanel } from '@/components/internal/people/AnalitykaTabPanel'
import { SzablonyTabPanel } from '@/components/internal/people/SzablonyTabPanel'

export const dynamic = 'force-dynamic'

const TABS: ReadonlyArray<HubTab> = [
    { id: 'pulpit', label: 'Pulpit', icon: LayoutDashboard },
    { id: 'onboarding', label: 'Onboarding', icon: UserPlus },
    { id: 'exit', label: 'Exit', icon: LogOut },
    { id: 'kontraktorzy', label: 'Kontraktorzy', icon: Users },
    { id: 'sprawy', label: 'Sprawy', icon: Inbox },
    { id: 'analityka', label: 'Analityka', icon: BarChart3 },
    { id: 'szablony', label: 'Szablony', icon: FileText },
]

const VALID_TAB_IDS = TABS.map((t) => t.id)

interface PageProps {
    searchParams?: {
        tab?: string
        year?: string
        month?: string
    }
}

export default async function PeopleOpsPage({ searchParams }: PageProps) {
    await requireTalentCommunityOrAdminLayout()

    const tab = VALID_TAB_IDS.includes(searchParams?.tab ?? '') ? (searchParams!.tab as string) : 'pulpit'

    const now = new Date()
    const year = clampInt(searchParams?.year, now.getFullYear(), 2020, 2100)
    const month = clampInt(searchParams?.month, now.getMonth() + 1, 1, 12)

    return (
        <div className="space-y-6">
            <header>
                <h1 className="text-2xl font-bold text-foreground">People Ops</h1>
                <p className="text-sm text-muted-foreground">
                    Onboarding · Exit · Sprawy — pracownicy wewnętrzni i kontraktorzy w jednym miejscu.
                </p>
            </header>

            <HubTabs basePath="/internal/people" tabs={TABS} active={tab} />

            {tab === 'pulpit' && <PulpitPanel year={year} month={month} />}
            {tab === 'onboarding' && <OnboardingTabPanel />}
            {tab === 'exit' && <ExitTabPanel />}
            {tab === 'kontraktorzy' && <KontraktorzyTabPanel />}
            {tab === 'sprawy' && <SprawyTabPanel />}
            {tab === 'analityka' && <AnalitykaTabPanel />}
            {tab === 'szablony' && <SzablonyTabPanel />}
        </div>
    )
}

function clampInt(raw: string | undefined, fallback: number, min: number, max: number): number {
    const n = Number.parseInt(raw ?? '', 10)
    if (Number.isNaN(n) || n < min || n > max) return fallback
    return n
}
