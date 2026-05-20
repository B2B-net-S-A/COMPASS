// Phase 27c — Admin/Finanse rates directory.
// Lists all HR-zone users with their current hourly rate (or null).
// Provides ChangeRateDialog per row (set rate effective from 1st of future month).

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
                <h1 className="text-2xl font-bold">Stawki godzinowe pracowników</h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Stawka zmienia się tylko od 1. dnia przyszłego miesiąca lub później. Każda zmiana wysyła
                    powiadomienie do pracownika i broadcast do innych finanse/admin.
                </p>
            </header>
            <RatesDirectoryClient initialDirectory={directory} />
        </div>
    )
}
