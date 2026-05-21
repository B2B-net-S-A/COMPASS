import { ClipboardList, Receipt, Users, FileText, Gift, UserPlus, Coins, Briefcase, FileSpreadsheet } from 'lucide-react'
import { HubTabs, type HubTab } from '@/components/internal/HubTabs'
import { AdminLeaveRequestsPanel } from '@/components/internal/panels/AdminLeaveRequestsPanel'
import { LeaveOnBehalfPanel } from '@/components/internal/panels/LeaveOnBehalfPanel'
import { AdminTimesheetsPanel } from '@/components/internal/panels/AdminTimesheetsPanel'
import { AdminEmployeesPanel } from '@/components/internal/panels/AdminEmployeesPanel'
import { AdminInvoicesPanel } from '@/components/internal/panels/AdminInvoicesPanel'
import { AdminBonusesPanel } from '@/components/internal/panels/AdminBonusesPanel'
import { AdminRatesPanel } from '@/components/internal/panels/AdminRatesPanel'
import { AdminClientsPanel } from '@/components/internal/panels/AdminClientsPanel'
import { PlacementsAdminPanel } from '@/components/internal/panels/PlacementsAdminPanel'
import { requireInternalAdminAreaLayout } from '@/lib/auth/internal-guard'
import { isInvoicesEnabled } from '@/lib/feature-flags'

export const dynamic = 'force-dynamic'

// Phase 26: 'invoices' tab is feature-flagged.
const ALL_TABS_RAW: ReadonlyArray<HubTab> = [
    { id: 'leave-requests', label: 'Wnioski urlopowe', icon: ClipboardList },
    { id: 'leave-on-behalf', label: 'Wpisz urlop pracownika', icon: UserPlus },
    { id: 'timesheets', label: 'Timesheety', icon: Receipt },
    { id: 'invoices', label: 'Faktury', icon: FileText },
    { id: 'bonuses', label: 'Premie', icon: Gift },
    { id: 'placements', label: 'Placementy', icon: FileSpreadsheet },
    { id: 'rates', label: 'Stawki i Umowy', icon: Coins },
    { id: 'clients', label: 'Klienci', icon: Briefcase },
    { id: 'employees', label: 'Pracownicy', icon: Users },
]

const ALL_TABS: ReadonlyArray<HubTab> = ALL_TABS_RAW.filter(
    (t) => t.id !== 'invoices' || isInvoicesEnabled(),
)

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

    // Phase 20 + 22 + 25b + 26: tabs visible per role.
    //   admin            → all tabs
    //   finanse          → invoices + bonuses (raport read-only; gdy invoices off → only bonuses)
    //   manager          → timesheets + invoices + bonuses + leave-on-behalf (zespół; invoices gated)
    const visibleTabs = ALL_TABS.filter((t) => {
        if (ctx.isAdmin) return true
        if (ctx.role === 'finanse')
            return t.id === 'invoices' || t.id === 'bonuses' || t.id === 'rates' || t.id === 'clients'
        if (ctx.isManager) {
            return t.id === 'timesheets'
                || t.id === 'invoices'
                || t.id === 'bonuses'
                || t.id === 'placements'
                || t.id === 'leave-on-behalf'
        }
        return false
    })

    const validTabIds = visibleTabs.map((t) => t.id)
    const invoicesUiOn = isInvoicesEnabled()
    const defaultTab = ctx.isAdmin
        ? 'leave-requests'
        : ctx.role === 'finanse'
            ? (invoicesUiOn ? 'invoices' : 'bonuses')
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
        ? (invoicesUiOn
            ? 'Akceptacja timesheetów i faktur (etap merytoryczny) Twoich podwładnych.'
            : 'Akceptacja timesheetów Twoich podwładnych i przypisywanie premii.')
        : ctx.role === 'finanse' && !ctx.isAdmin
            ? (invoicesUiOn
                ? 'Etap 2 akceptacji — po akceptacji merytorycznej managera lub bezpośrednio jeśli pracownik nie ma managera.'
                : 'Raport premii (read-only).')
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
            {tab === 'invoices' && invoicesUiOn && <AdminInvoicesPanel scope={scope} />}
            {tab === 'bonuses' && <AdminBonusesPanel />}
            {tab === 'placements' && <PlacementsAdminPanel />}
            {tab === 'rates' && <AdminRatesPanel />}
            {tab === 'clients' && <AdminClientsPanel />}
            {tab === 'employees' && <AdminEmployeesPanel />}
        </div>
    )
}
