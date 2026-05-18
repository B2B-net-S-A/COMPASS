import { ClipboardList, Receipt, Users, FileText, Gift, UserPlus } from 'lucide-react'
import { HubTabs, type HubTab } from '@/components/internal/HubTabs'
import { AdminLeaveRequestsPanel } from '@/components/internal/panels/AdminLeaveRequestsPanel'
import { LeaveOnBehalfPanel } from '@/components/internal/panels/LeaveOnBehalfPanel'
import { AdminTimesheetsPanel } from '@/components/internal/panels/AdminTimesheetsPanel'
import { AdminEmployeesPanel } from '@/components/internal/panels/AdminEmployeesPanel'
import { AdminInvoicesPanel } from '@/components/internal/panels/AdminInvoicesPanel'
import { AdminBonusesPanel } from '@/components/internal/panels/AdminBonusesPanel'
import { requireInternalAdminAreaLayout } from '@/lib/auth/internal-guard'

export const dynamic = 'force-dynamic'

const ALL_TABS: ReadonlyArray<HubTab> = [
    { id: 'leave-requests', label: 'Wnioski urlopowe', icon: ClipboardList },
    { id: 'leave-on-behalf', label: 'Wpisz urlop pracownika', icon: UserPlus },
    { id: 'timesheets', label: 'Timesheety', icon: Receipt },
    { id: 'invoices', label: 'Faktury', icon: FileText },
    { id: 'bonuses', label: 'Premie', icon: Gift },
    { id: 'employees', label: 'Pracownicy', icon: Users },
]

interface PageProps {
    searchParams?: {
        tab?: string
        year?: string
        month?: string
        scope?: string
    }
}

function parseIntSafe(value: string | undefined): number | undefined {
    if (!value) return undefined
    const n = Number(value)
    return Number.isFinite(n) ? n : undefined
}

export default async function InternalAdminHubPage({ searchParams }: PageProps) {
    const ctx = await requireInternalAdminAreaLayout()

    // Phase 20 + 22 + 25b: tabs visible per role.
    //   admin            → all tabs
    //   finanse          → invoices + bonuses (raport read-only)
    //   manager          → timesheets + invoices + bonuses + leave-on-behalf (zespół)
    const visibleTabs = ALL_TABS.filter((t) => {
        if (ctx.isAdmin) return true
        if (ctx.role === 'finanse') return t.id === 'invoices' || t.id === 'bonuses'
        if (ctx.isManager) {
            return t.id === 'timesheets'
                || t.id === 'invoices'
                || t.id === 'bonuses'
                || t.id === 'leave-on-behalf'
        }
        return false
    })

    const validTabIds = visibleTabs.map((t) => t.id)
    const defaultTab = ctx.isAdmin
        ? 'leave-requests'
        : ctx.role === 'finanse'
            ? 'invoices'
            : ctx.isManager
                ? 'timesheets'
                : (visibleTabs[0]?.id ?? 'bonuses')
    const tab = validTabIds.includes(searchParams?.tab ?? '')
        ? (searchParams!.tab as string)
        : defaultTab

    const year = parseIntSafe(searchParams?.year)
    const month = parseIntSafe(searchParams?.month)
    const scope = searchParams?.scope === 'team' ? 'team' : undefined

    // Tytuł sekcji per role
    const heading = ctx.isManager && !ctx.isAdmin
        ? 'Mój zespół'
        : ctx.role === 'finanse' && !ctx.isAdmin
            ? 'Faktury — akceptacja finansowa'
            : 'Administracja HR'
    const subheading = ctx.isManager && !ctx.isAdmin
        ? 'Akceptacja timesheetów i faktur (etap merytoryczny) Twoich podwładnych.'
        : ctx.role === 'finanse' && !ctx.isAdmin
            ? 'Etap 2 akceptacji — po akceptacji merytorycznej managera lub bezpośrednio jeśli pracownik nie ma managera.'
            : 'Akceptacja wniosków, kolejka timesheetów i lista pracowników wewnętrznych.'

    return (
        <div className="space-y-6">
            <header>
                <h1 className="text-2xl font-bold">{heading}</h1>
                <p className="text-sm text-muted-foreground mt-1">{subheading}</p>
            </header>

            <HubTabs basePath="/internal/admin" tabs={visibleTabs} active={tab} />

            {tab === 'leave-requests' && <AdminLeaveRequestsPanel />}
            {tab === 'leave-on-behalf' && <LeaveOnBehalfPanel />}
            {tab === 'timesheets' && <AdminTimesheetsPanel year={year} month={month} />}
            {tab === 'invoices' && <AdminInvoicesPanel scope={scope} />}
            {tab === 'bonuses' && <AdminBonusesPanel />}
            {tab === 'employees' && <AdminEmployeesPanel />}
        </div>
    )
}
