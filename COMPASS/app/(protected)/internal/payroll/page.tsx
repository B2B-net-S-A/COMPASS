// Phase 27c — Payroll page (godziny × stawka + premie per miesiąc).
// Three tabs:
//   - mine (HR-zone — every viewer sees own summary)
//   - team (manager only — direct reports)
//   - all  (finanse + admin — full directory + CSV export)

import { requireInternalOrAdminLayout } from '@/lib/auth/internal-guard'
import { PayrollClient } from '@/components/internal/PayrollClient'

export const dynamic = 'force-dynamic'

export default async function PayrollPage({
    searchParams,
}: {
    searchParams: Promise<{ tab?: string; year?: string; month?: string }>
}) {
    const ctx = await requireInternalOrAdminLayout()
    const sp = await searchParams

    const now = new Date()
    const year = Number(sp.year) || now.getFullYear()
    const month = Number(sp.month) || now.getMonth() + 1
    const requestedTab = sp.tab as 'mine' | 'team' | 'all' | undefined

    const isManager = ctx.isManager
    const isAdminOrFinanse = ctx.isAdmin || ctx.role === 'finanse'

    // Resolve default tab based on role + requested.
    let tab: 'mine' | 'team' | 'all' = 'mine'
    if (requestedTab === 'team' && (isManager || ctx.isAdmin)) tab = 'team'
    else if (requestedTab === 'all' && isAdminOrFinanse) tab = 'all'
    else tab = 'mine'

    return (
        <div className="space-y-4 p-4 max-w-7xl mx-auto">
            <header className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <h1 className="text-2xl font-bold">Payroll</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Rozliczenie miesięczne: godziny × stawka + premie. Stawka zmienia się tylko od 1. dnia miesiąca.
                    </p>
                </div>
            </header>
            <PayrollClient
                initialTab={tab}
                initialYear={year}
                initialMonth={month}
                isManager={isManager}
                isAdminOrFinanse={isAdminOrFinanse}
                currentUserId={ctx.userId}
            />
        </div>
    )
}
