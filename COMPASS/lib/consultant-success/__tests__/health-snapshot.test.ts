import { describe, expect, it } from 'vitest'
import { buildMonthlyHealthSnapshots, type HealthHistoryRow } from '../health-snapshot'

const row = (contractor: string, status: string, at: string): HealthHistoryRow => ({
    contractor_id: contractor,
    new_status: status,
    created_at: at,
})

const NOW = new Date('2026-07-16T12:00:00Z')

describe('buildMonthlyHealthSnapshots', () => {
    it('green→amber→green w jednym miesiącu = 1 green na koniec (nie 2× green)', () => {
        const rows = [
            row('c1', 'green', '2026-07-01T10:00:00Z'),
            row('c1', 'amber', '2026-07-05T10:00:00Z'),
            row('c1', 'green', '2026-07-10T10:00:00Z'),
        ]
        const [july] = buildMonthlyHealthSnapshots(rows, 1, NOW)
        expect(july).toEqual({ period: '2026-07', green: 1, amber: 0, red: 0, unknown: 0 })
    })

    it('suma słupka nigdy nie przekracza liczby konsultantów', () => {
        const rows = [
            row('c1', 'green', '2026-07-01T10:00:00Z'),
            row('c1', 'red', '2026-07-02T10:00:00Z'),
            row('c2', 'amber', '2026-07-03T10:00:00Z'),
            row('c2', 'green', '2026-07-04T10:00:00Z'),
        ]
        const [july] = buildMonthlyHealthSnapshots(rows, 1, NOW)
        expect(july.green + july.amber + july.red + july.unknown).toBe(2)
        expect(july).toMatchObject({ red: 1, green: 1 })
    })

    it('status przenosi się na kolejne miesiące (carry-forward)', () => {
        const rows = [row('c1', 'amber', '2026-05-15T10:00:00Z')]
        const buckets = buildMonthlyHealthSnapshots(rows, 3, NOW) // maj, cze, lip
        expect(buckets.map((b) => b.period)).toEqual(['2026-05', '2026-06', '2026-07'])
        for (const bucket of buckets) {
            expect(bucket.amber).toBe(1)
        }
    })

    it('konsultant bez żadnego wpisu do końca okresu nie jest liczony', () => {
        const rows = [row('c1', 'green', '2026-07-01T10:00:00Z')]
        const buckets = buildMonthlyHealthSnapshots(rows, 2, NOW) // cze, lip
        expect(buckets[0]).toEqual({ period: '2026-06', green: 0, amber: 0, red: 0, unknown: 0 })
        expect(buckets[1].green).toBe(1)
    })

    it('nieznane statusy spoza słownika są ignorowane, unknown jest liczony', () => {
        const rows = [
            row('c1', 'unknown', '2026-07-01T10:00:00Z'),
            row('c2', 'weird_status', '2026-07-01T10:00:00Z'),
        ]
        const [july] = buildMonthlyHealthSnapshots(rows, 1, NOW)
        expect(july.unknown).toBe(1)
        expect(july.green + july.amber + july.red + july.unknown).toBe(1)
    })

    it('kolejność wejściowa wierszy nie ma znaczenia', () => {
        const rows = [
            row('c1', 'green', '2026-07-10T10:00:00Z'),
            row('c1', 'red', '2026-07-01T10:00:00Z'),
        ]
        const [july] = buildMonthlyHealthSnapshots(rows, 1, NOW)
        expect(july).toMatchObject({ green: 1, red: 0 })
    })
})
