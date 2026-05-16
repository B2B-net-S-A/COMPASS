// Phase 23 — Premie review panel.
//   admin    → sees ALL bonuses, can add for anyone, cancel any pending.
//   manager  → sees own team only, can add for own reports, cancel own proposed pending.
//   finanse  → sees ALL bonuses, read-only report (no add/cancel buttons).
import {
    listAllBonusesForFinance,
    listTeamBonuses,
    listProposableRecipients,
} from '@/lib/actions/internal-bonus'
import { BonusesAdminClient } from '@/components/internal/BonusesAdminClient'
import { requireInternalAdminAreaLayout } from '@/lib/auth/internal-guard'

export async function AdminBonusesPanel() {
    const ctx = await requireInternalAdminAreaLayout()

    // Manager/admin can propose; finanse cannot.
    const canPropose = ctx.isAdmin || ctx.isManager

    // Data + recipients fetched in parallel.
    const [bonuses, recipients] = await Promise.all([
        ctx.role === 'finanse' && !ctx.isAdmin
            ? listAllBonusesForFinance()
            : listTeamBonuses(),
        canPropose ? listProposableRecipients() : Promise.resolve([]),
    ])

    const viewerMode: 'admin' | 'manager' | 'finanse' =
        ctx.isAdmin ? 'admin' : ctx.isManager ? 'manager' : 'finanse'

    return (
        <BonusesAdminClient
            initialBonuses={bonuses}
            recipients={recipients}
            viewerMode={viewerMode}
            currentUserId={ctx.userId}
        />
    )
}
