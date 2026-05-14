import { listInvoicesForReview } from '@/lib/actions/internal-invoice'
import { InvoicesReviewPanel } from '@/components/internal/InvoicesReviewPanel'

export async function AdminInvoicesPanel() {
    // Phase 19: server-side fetch — guards (admin OR finanse) inside listInvoicesForReview.
    const invoices = await listInvoicesForReview({ status: 'all' })
    return <InvoicesReviewPanel initialInvoices={invoices} />
}
