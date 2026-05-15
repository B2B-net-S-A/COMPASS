import { listMyInvoices, listEligiblePeriods } from '@/lib/actions/internal-invoice'
import { InvoicesUserPanel } from '@/components/internal/InvoicesUserPanel'

export async function InvoicesPanel() {
    const [invoices, eligiblePeriods] = await Promise.all([
        listMyInvoices(),
        listEligiblePeriods(12),
    ])

    return <InvoicesUserPanel initialInvoices={invoices} eligiblePeriods={eligiblePeriods} />
}
