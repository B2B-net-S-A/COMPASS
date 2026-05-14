import { ClipboardList, Receipt, Users, AlertTriangle, FileText } from 'lucide-react'
import { HubTabs, type HubTab } from '@/components/internal/HubTabs'
import { AdminLeaveRequestsPanel } from '@/components/internal/panels/AdminLeaveRequestsPanel'
import { AdminTimesheetsPanel } from '@/components/internal/panels/AdminTimesheetsPanel'
import { AdminEmployeesPanel } from '@/components/internal/panels/AdminEmployeesPanel'
import { AdminClockReviewPanel } from '@/components/internal/panels/AdminClockReviewPanel'
import { AdminInvoicesPanel } from '@/components/internal/panels/AdminInvoicesPanel'

export const dynamic = 'force-dynamic'

const TABS: ReadonlyArray<HubTab> = [
    { id: 'leave-requests', label: 'Wnioski urlopowe', icon: ClipboardList },
    { id: 'timesheets', label: 'Timesheety', icon: Receipt },
    { id: 'invoices', label: 'Faktury', icon: FileText },
    { id: 'clock-review', label: 'Korekty zegara', icon: AlertTriangle },
    { id: 'employees', label: 'Pracownicy', icon: Users },
]

const VALID_TAB_IDS = TABS.map((t) => t.id)

interface PageProps {
    searchParams?: {
        tab?: string
        year?: string
        month?: string
    }
}

function parseIntSafe(value: string | undefined): number | undefined {
    if (!value) return undefined
    const n = Number(value)
    return Number.isFinite(n) ? n : undefined
}

export default async function InternalAdminHubPage({ searchParams }: PageProps) {
    const tab = VALID_TAB_IDS.includes(searchParams?.tab ?? '')
        ? (searchParams!.tab as string)
        : 'leave-requests'

    const year = parseIntSafe(searchParams?.year)
    const month = parseIntSafe(searchParams?.month)

    return (
        <div className="space-y-6">
            <header>
                <h1 className="text-2xl font-bold">Administracja HR</h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Akceptacja wniosków, kolejka timesheetów i lista pracowników wewnętrznych.
                </p>
            </header>

            <HubTabs basePath="/internal/admin" tabs={TABS} active={tab} />

            {tab === 'leave-requests' && <AdminLeaveRequestsPanel />}
            {tab === 'timesheets' && <AdminTimesheetsPanel year={year} month={month} />}
            {tab === 'invoices' && <AdminInvoicesPanel />}
            {tab === 'clock-review' && <AdminClockReviewPanel year={year} month={month} />}
            {tab === 'employees' && <AdminEmployeesPanel />}
        </div>
    )
}
