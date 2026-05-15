// Phase 19 + 20: invoice review panel.
//   admin   → sees ALL invoices, can do both stages (manager + finanse).
//   finanse → sees ALL invoices, can do stage 2 (final approve).
//   manager → sees only own team's invoices, can do stage 1 (merit approve).
import {
    listInvoicesForReview,
    listInvoicesForManagerReview,
} from '@/lib/actions/internal-invoice'
import { InvoicesReviewPanel } from '@/components/internal/InvoicesReviewPanel'
import { requireInternalAdminAreaLayout } from '@/lib/auth/internal-guard'

interface Props {
    scope?: 'team' | undefined
}

export async function AdminInvoicesPanel({ scope }: Props = {}) {
    const ctx = await requireInternalAdminAreaLayout()

    // Phase 20: manager always sees team scope (their own); admin/finanse see all unless filtered.
    const teamScopeForManager = ctx.isManager && !ctx.isAdmin

    const invoices = teamScopeForManager || scope === 'team'
        ? await listInvoicesForManagerReview({ status: 'all' })
        : await listInvoicesForReview({ status: 'all' })

    // Reviewer mode determines which actions are shown.
    const reviewerMode: 'admin' | 'manager' | 'finanse' =
        ctx.isAdmin ? 'admin' : ctx.isManager ? 'manager' : 'finanse'

    return <InvoicesReviewPanel initialInvoices={invoices} reviewerMode={reviewerMode} />
}
