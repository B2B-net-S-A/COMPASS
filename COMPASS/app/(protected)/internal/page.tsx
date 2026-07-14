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
import { DB_ROLES } from '@/lib/types/role'
import type { CalendarStatusFilter } from '@/components/internal/VacationCalendar'
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
    searchParams?: Promise<{
        tab?: string
        year?: string
        month?: string
        // Calendar filters. `filter` is the legacy (≤Phase 35) role param, still
        // honored so old bookmarks keep working; `role`/`status` supersede it.
        filter?: string
        role?: string
        status?: string
    }>
}

function parseInt(value: string | undefined): number | undefined {
    if (!value) return undefined
    const n = Number(value)
    return Number.isFinite(n) ? n : undefined
}

function parseRole(role: string | undefined, legacy: string | undefined): string {
    const candidate = role ?? legacy ?? 'all'
    return candidate === 'all' || (DB_ROLES as readonly string[]).includes(candidate)
        ? candidate
        : 'all'
}

function parseStatus(value: string | undefined): CalendarStatusFilter {
    return value === 'ooo' || value === 'remote' ? value : 'all'
}

export default async function InternalHubPage(props: PageProps) {
    const searchParams = await props.searchParams;
    const tab = VALID_TAB_IDS.includes(searchParams?.tab ?? '')
        ? (searchParams!.tab as string)
        : 'attendance'

    const year = parseInt(searchParams?.year)
    const month = parseInt(searchParams?.month)
    const role = parseRole(searchParams?.role, searchParams?.filter)
    const status = parseStatus(searchParams?.status)

    return (
        <div className="space-y-6">
            <header>
                <h1 className="text-2xl font-bold">Strefa wewnętrzna</h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Twoja obecność, urlopy, timesheety i widok zespołu — w jednym miejscu.
                </p>
            </header>

            {/* Phase 25d — show active leaves with substitutes (company-wide, all HR-zone roles) */}
            <ActiveLeavesBanner />

            <HubTabs basePath="/internal" tabs={TABS} active={tab} />

            {tab === 'attendance' && <AttendancePanel year={year} month={month} />}
            {tab === 'calendar' && (
                <CalendarPanel year={year} month={month} role={role} status={status} />
            )}
            {tab === 'leave' && <LeavePanel />}
            {tab === 'timesheet' && <TimesheetPanel year={year} month={month} />}
            {tab === 'invoices' && isInvoicesEnabled() && <InvoicesPanel />}
            {tab === 'bonuses' && <MyBonusesPanel />}
            {/* {tab === 'clock' && <ClockPanel year={year} month={month} />} */}
        </div>
    )
}
