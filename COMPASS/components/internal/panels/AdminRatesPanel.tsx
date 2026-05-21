// Phase 27i — "Stawki i Umowy" tab inside Administracja HR (finanse + admin).
// Lists HR-zone employees with contract type + rate + progression; per-employee dialog
// also manages contract documents (umowa + aneksy).

import { listUserRateDirectory } from '@/lib/actions/internal-rates'
import { RatesDirectoryClient } from '@/components/internal/RatesDirectoryClient'

export async function AdminRatesPanel() {
    const directory = await listUserRateDirectory()
    return (
        <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
                Typ umowy, stawka godzinowa i jej progresja na przyszłość, oraz umowy i aneksy (załączniki) per
                pracownik. Stawka wchodzi w życie tylko od 1. dnia przyszłego miesiąca lub później (dopisywanie).
            </p>
            <RatesDirectoryClient initialDirectory={directory} />
        </div>
    )
}
