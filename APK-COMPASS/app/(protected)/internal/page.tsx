import { CalendarCheck, Calendar, ClipboardList, Receipt } from 'lucide-react'
import { HubTabs, type HubTab } from '@/components/internal/HubTabs'
import { AttendancePanel } from '@/components/internal/panels/AttendancePanel'
import { CalendarPanel } from '@/components/internal/panels/CalendarPanel'
import { LeavePanel } from '@/components/internal/panels/LeavePanel'
import { TimesheetPanel } from '@/components/internal/panels/TimesheetPanel'
// Smart Work Clock (Phase 17) UI disabled — to re-enable, restore Clock icon + ClockPanel import + tab + render below.
// import { Clock } from 'lucide-react'
// import { ClockPanel } from '@/components/internal/panels/ClockPanel'

export const dynamic = 'force-dynamic'

const TABS: ReadonlyArray<HubTab> = [
    { id: 'attendance', label: 'Obecność', icon: CalendarCheck },
    { id: 'calendar', label: 'Kalendarz', icon: Calendar },
    { id: 'leave', label: 'Urlopy', icon: ClipboardList },
    { id: 'timesheet', label: 'Timesheet', icon: Receipt },
    // { id: 'clock', label: 'Zegar', icon: Clock },
]

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

            <HubTabs basePath="/internal" tabs={TABS} active={tab} />

            {tab === 'attendance' && <AttendancePanel year={year} month={month} />}
            {tab === 'calendar' && (
                <CalendarPanel year={year} month={month} filter={filter} />
            )}
            {tab === 'leave' && <LeavePanel />}
            {tab === 'timesheet' && <TimesheetPanel year={year} month={month} />}
            {/* {tab === 'clock' && <ClockPanel year={year} month={month} />} */}
        </div>
    )
}
