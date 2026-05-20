// Phase 27d — Clients admin (predefined bonus dropdown). Admin + finanse only.

import { redirect } from 'next/navigation'
import { requireInternalOrAdminLayout } from '@/lib/auth/internal-guard'
import { listClients } from '@/lib/actions/internal-clients'
import { ClientsAdminClient } from '@/components/internal/ClientsAdminClient'

export const dynamic = 'force-dynamic'

export default async function ClientsAdminPage() {
    const ctx = await requireInternalOrAdminLayout()
    if (!ctx.isAdmin && ctx.role !== 'finanse') {
        redirect('/internal')
    }

    const clients = await listClients()

    return (
        <div className="space-y-4 p-4 max-w-3xl mx-auto">
            <header>
                <h1 className="text-2xl font-bold">Klienci</h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Lista klientów dostępna w dropdownie przy przypisywaniu premii (Sales / Delivery Lead / Rekruter).
                    Nieaktywni klienci znikają z dropdownu, ale zostają w historii premii.
                </p>
            </header>
            <ClientsAdminClient initialClients={clients} />
        </div>
    )
}
