// Phase 27i — "Klienci" tab inside Administracja HR (finanse + admin).
// Moved from the standalone /internal/admin/clients page.

import { listClients } from '@/lib/actions/internal-clients'
import { ClientsAdminClient } from '@/components/internal/ClientsAdminClient'

export async function AdminClientsPanel() {
    const clients = await listClients()
    return (
        <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
                Lista klientów dostępna w dropdownie przy przypisywaniu premii (Sales / Delivery Lead / Rekruter).
                Nieaktywni klienci znikają z dropdownu, ale zostają w historii premii.
            </p>
            <ClientsAdminClient initialClients={clients} />
        </div>
    )
}
