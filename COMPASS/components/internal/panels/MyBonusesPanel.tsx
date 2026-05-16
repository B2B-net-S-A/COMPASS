// Phase 23 — Pracownik widzi swoje premie.
//   Pending → "Do uwzględnienia" z buttonem "Linkuj z fakturą"
//   Paid    → "Wypłacone" (historia z linkiem do faktury)
//   Cancel  → "Anulowane" z powodem
import { listMyBonuses, listMyInvoicesForBonusLinking } from '@/lib/actions/internal-bonus'
import { MyBonusesClient } from '@/components/internal/MyBonusesClient'

export async function MyBonusesPanel() {
    const [bonuses, invoices] = await Promise.all([
        listMyBonuses(),
        listMyInvoicesForBonusLinking(),
    ])

    return <MyBonusesClient initialBonuses={bonuses} myInvoices={invoices} />
}
