// Phase 23 + 26 — Premie review panel.
//   admin    → sees ALL bonuses, can assign for anyone, cancel any active.
//   manager  → sees own team only, can assign for own reports, cancel own assigned.
//   finanse  → sees ALL bonuses, read-only report (no assign/cancel buttons).
import {
    listAllBonusesForFinance,
    listTeamBonuses,
    listEligibleEmployeesForBonus,
} from '@/lib/actions/internal-bonus'
import { BonusesAdminClient } from '@/components/internal/BonusesAdminClient'
import { requireInternalAdminAreaLayout } from '@/lib/auth/internal-guard'

export async function AdminBonusesPanel() {
    const ctx = await requireInternalAdminAreaLayout()

    // Manager/admin can assign; finanse cannot.
    const canAssign = ctx.isAdmin || ctx.isManager

    // Data + candidates fetched in parallel.
    const [bonuses, candidates] = await Promise.all([
        ctx.role === 'finanse' && !ctx.isAdmin
            ? listAllBonusesForFinance()
            : listTeamBonuses(),
        canAssign ? listEligibleEmployeesForBonus() : Promise.resolve([]),
    ])

    const viewerMode: 'admin' | 'manager' | 'finanse' =
        ctx.isAdmin ? 'admin' : ctx.isManager ? 'manager' : 'finanse'

    return (
        <BonusesAdminClient
            initialBonuses={bonuses}
            candidates={candidates}
            viewerMode={viewerMode}
            currentUserId={ctx.userId}
        />
    )
}
