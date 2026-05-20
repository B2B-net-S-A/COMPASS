// Phase 27c/27h — Admin/Finanse "Stawki i Umowy" directory.
// Lists all HR-zone users with contract type + current hourly rate + rate mode (fixed/progressive).
// Provides ManageRateDialog per row (contract type, fixed/progressive rate schedule, copy progression).

import { redirect } from 'next/navigation'
import { requireInternalOrAdminLayout } from '@/lib/auth/internal-guard'
import { listUserRateDirectory } from '@/lib/actions/internal-rates'
import { RatesDirectoryClient } from '@/components/internal/RatesDirectoryClient'

export const dynamic = 'force-dynamic'

export default async function RatesAdminPage() {
    const ctx = await requireInternalOrAdminLayout()
    if (!ctx.isAdmin && ctx.role !== 'finanse') {
        redirect('/internal')
    }

    const directory = await listUserRateDirectory()

    return (
        <div className="space-y-4 p-4 max-w-6xl mx-auto">
            <header>
                <h1 className="text-2xl font-bold">Stawki i Umowy</h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Typ umowy, stawka godzinowa i jej progresja na przyszłość. Stawka wchodzi w życie tylko od 1.
                    dnia przyszłego miesiąca lub później (dopisywanie). Każda zmiana wysyła powiadomienie do
                    pracownika i broadcast do innych finanse/admin.
                </p>
            </header>
            <RatesDirectoryClient initialDirectory={directory} />
        </div>
    )
}
