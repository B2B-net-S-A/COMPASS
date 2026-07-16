// Health snapshot portfolio (audyt 2026-07-16, P1.10).
//
// Wcześniej wykres "healthHistory" zliczał KAŻDĄ zmianę statusu w miesiącu
// (konsultant green→amber→green liczył się dwa razy jako green; słupek mógł
// przekroczyć liczbę osób). Kontrakt docelowy (§6.7 planu): każdy punkt czasu
// to OSTATNI znany status per konsultant na koniec okresu.
//
// Populacja punktu = konsultanci, którzy do końca danego okresu mieli
// jakikolwiek wpis historii (zmierzeni). Konsultanci nigdy nieocenieni nie
// zaniżają wykresu wiadrem "unknown" — ich liczbę pokazuje osobno dashboard.

export interface HealthHistoryRow {
    contractor_id: string
    new_status: string
    created_at: string
}

export interface HealthSnapshotBucket {
    period: string // YYYY-MM
    green: number
    amber: number
    red: number
    unknown: number
}

const STATUSES = ['green', 'amber', 'red', 'unknown'] as const
type KnownStatus = (typeof STATUSES)[number]

function isKnownStatus(status: string): status is KnownStatus {
    return (STATUSES as readonly string[]).includes(status)
}

/**
 * Snapshot na koniec każdego z ostatnich `monthsBack` miesięcy (rosnąco,
 * łącznie z bieżącym). `rows` mogą być w dowolnej kolejności.
 */
export function buildMonthlyHealthSnapshots(
    rows: HealthHistoryRow[],
    monthsBack: number,
    now: Date = new Date(),
): HealthSnapshotBucket[] {
    const periods: string[] = []
    for (let offset = monthsBack - 1; offset >= 0; offset--) {
        const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1))
        periods.push(date.toISOString().slice(0, 7))
    }

    const sorted = [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at))
    const lastStatus = new Map<string, KnownStatus>()
    const buckets: HealthSnapshotBucket[] = []
    let cursor = 0

    for (const period of periods) {
        // Skonsumuj wszystkie wpisy do końca okresu (porównanie YYYY-MM wystarcza).
        while (cursor < sorted.length && sorted[cursor].created_at.slice(0, 7) <= period) {
            const row = sorted[cursor]
            if (isKnownStatus(row.new_status)) {
                lastStatus.set(row.contractor_id, row.new_status)
            }
            cursor += 1
        }
        const bucket: HealthSnapshotBucket = { period, green: 0, amber: 0, red: 0, unknown: 0 }
        lastStatus.forEach((status) => {
            bucket[status] += 1
        })
        buckets.push(bucket)
    }

    return buckets
}
