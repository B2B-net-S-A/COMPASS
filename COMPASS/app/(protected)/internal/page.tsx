import { CalendarCheck, Calendar, ClipboardList, Receipt, FileText, Gift } from 'lucide-react'
import { HubTabs, type HubTab } from '@/components/internal/HubTabs'
import { ActiveLeavesBanner } from '@/components/internal/ActiveLeavesBanner'
import { AttendancePanel } from '@/components/internal/panels/AttendancePanel'
import { CalendarPanel } from '@/components/internal/panels/CalendarPanel'
import { LeavePanel } from '@/components/internal/panels/LeavePanel'
import { TimesheetPanel } from '@/components/internal/panels/TimesheetPanel'
import { InvoicesPanel } from '@/components/internal/panels/InvoicesPanel'
import { MyBonusesPanel } from '@/components/internal/panels/MyBonusesPanel'
import { isInvoicesEnabled } from '@/lib/feature-flags'
// Smart Work Clock (Phase 17) UI disabled — to re-enable, restore Clock icon + ClockPanel import + tab + render below.
// import { Clock } from 'lucide-react'
// import { ClockPanel } from '@/components/internal/panels/ClockPanel'

export const dynamic = 'force-dynamic'

// Phase 26: 'invoices' tab is feature-flagged. When NEXT_PUBLIC_INVOICES_ENABLED!=='true', it's filtered out.
const ALL_TABS: ReadonlyArray<HubTab> = [
    { id: 'attendance', label: 'Obecność', icon: CalendarCheck },
    { id: 'calendar', label: 'Kalendarz', icon: Calendar },
    { id: 'leave', label: 'Urlopy', icon: ClipboardList },
    { id: 'timesheet', label: 'Timesheet', icon: Receipt },
    { id: 'invoices', label: 'Faktury', icon: FileText },
    { id: 'bonuses', label: 'Premie', icon: Gift },
    // { id: 'clock', label: 'Zegar', icon: Clock },
]

const TABS: ReadonlyArray<HubTab> = ALL_TABS.filter(
    (t) => t.id !== 'invoices' || isInvoicesEnabled(),
)

const VALID_TAB_IDS = TABS.map((t) => t.id)

interface PageProps {
    searchParams?: {
        tab?: string
        year?: string
        month?: string
        filter?: string
    }
}

function parseInt(value: string | undefined): number | undefined {
    if (!value) return undefined
    const n = Number(value)
    return Number.isFinite(n) ? n : undefined
}

export default async function InternalHubPage({ searchParams }: PageProps) {
    const tab = VALID_TAB_IDS.includes(searchParams?.tab ?? '')
        ? (searchParams!.tab as string)
        : 'attendance'

    const year = parseInt(searchParams?.year)
    const month = parseInt(searchParams?.month)
    const filter = (searchParams?.filter ?? 'all') as 'all' | 'internal' | 'admin'

    return (
        <div className="space-y-6">
            <header>
                <h1 className="text-2xl font-bold">Strefa wewnętrzna</h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Twoja obecność, urlopy, timesheety i widok zespołu — w jednym miejscu.
                </p>
            </header>

            {/* Phase 25d — show active leaves with substitutes (scope: own team / manager) */}
            <ActiveLeavesBanner />

            <HubTabs basePath="/internal" tabs={TABS} active={tab} />

            {tab === 'attendance' && <AttendancePanel year={year} month={month} />}
            {tab === 'calendar' && (
                <CalendarPanel year={year} month={month} filter={filter} />
            )}
            {tab === 'leave' && <LeavePanel />}
            {tab === 'timesheet' && <TimesheetPanel year={year} month={month} />}
            {tab === 'invoices' && isInvoicesEnabled() && <InvoicesPanel />}
            {tab === 'bonuses' && <MyBonusesPanel />}
            {/* {tab === 'clock' && <ClockPanel year={year} month={month} />} */}
        </div>
    )
}
