import type { CardSalesStatus } from '@/lib/types/tech-map'

/**
 * Stan obsługi sygnału „klient szuka ludzi" po stronie sprzedaży.
 *
 * Status odsyła ATLAS (POST /api/internal/sales-signals/status). Bez tego TCM
 * nie wiedział, czy ktokolwiek przejął zgłoszenie (audyt integracji 14.09).
 * Brak wiersza = sprzedaż jeszcze się nie odniosła, a nie „odrzucone".
 */
export function SalesSignalStatusBadge({ status }: { status: CardSalesStatus | null }) {
    if (!status) {
        return (
            <p className="inline-flex rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm text-amber-800">
                Czeka na sprzedaż
            </p>
        )
    }

    const who = [status.handledByName ?? status.handledByEmail, status.handledAt.slice(0, 10)]
        .filter(Boolean)
        .join(', ')

    if (status.status === 'converted') {
        return (
            <p className="inline-flex rounded-md border border-green-500 bg-green-50 px-3 py-1.5 text-sm text-green-800">
                Przejęte przez sprzedaż
                {status.dealTitle ? ` — szansa „${status.dealTitle}”` : ''}
                {who ? ` (${who})` : ''}
            </p>
        )
    }

    return (
        <p className="inline-flex rounded-md border border-border bg-muted px-3 py-1.5 text-sm text-muted-foreground">
            Odrzucone przez sprzedaż{status.reason ? `: ${status.reason}` : ''}
            {who ? ` (${who})` : ''}
        </p>
    )
}
