import { describe, expect, it } from 'vitest'
import { filterBenchSeedCandidates, type BenchSeedDeparture } from '../bench-seed'

const dep = (over: Partial<BenchSeedDeparture>): BenchSeedDeparture => ({
    id: 'd1',
    contractor_id: null,
    consultant_name: 'Jan Testowy',
    client_name: 'ACME',
    position: 'Java Dev',
    departure_date: '2026-07-01',
    last_notice_day: null,
    who_resigned: 'konsultant',
    ...over,
})

const CUTOFF = '2026-04-17'

describe('filterBenchSeedCandidates', () => {
    it('internalizacja NIE seeduje benchu (konwersja, nie odejście)', () => {
        const out = filterBenchSeedCandidates(
            [dep({ who_resigned: 'internalizacja' }), dep({ id: 'd2', who_resigned: 'Internalizacja' })],
            new Set(),
            CUTOFF,
        )
        expect(out).toEqual([])
    })

    it('zejście już na benchu (w tym dismissed) nie jest re-seedowane', () => {
        const out = filterBenchSeedCandidates([dep({ id: 'seeded' })], new Set(['seeded']), CUTOFF)
        expect(out).toEqual([])
    })

    it('zejście starsze niż cutoff odpada; bez daty i przyszłe wchodzą', () => {
        const out = filterBenchSeedCandidates(
            [
                dep({ id: 'old', departure_date: '2026-01-05' }),
                dep({ id: 'undated', departure_date: null }),
                dep({ id: 'future', departure_date: '2026-09-01' }),
            ],
            new Set(),
            CUTOFF,
        )
        expect(out.map((d) => d.id)).toEqual(['undated', 'future'])
    })

    it('who_resigned NULL kwalifikuje się (brak danych ≠ internalizacja)', () => {
        const out = filterBenchSeedCandidates([dep({ who_resigned: null })], new Set(), CUTOFF)
        expect(out).toHaveLength(1)
    })
})
