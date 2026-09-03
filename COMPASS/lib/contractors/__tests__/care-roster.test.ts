import { describe, expect, it } from 'vitest'
import {
    resolveCareSituations,
    type CareBenchRow,
    type CareDepartureRow,
    type CareEntryRow,
} from '@/lib/contractors/care-roster'

const entry = (o: Partial<CareEntryRow> & { contractor_id: string | null }): CareEntryRow => ({
    client_name: 'Nordea',
    position: 'Java Developer',
    start_date: '2026-01-10',
    ...o,
})

const departure = (o: Partial<CareDepartureRow> & { contractor_id: string | null }): CareDepartureRow => ({
    departure_date: '2026-02-01',
    ...o,
})

const bench = (o: Partial<CareBenchRow> & { contractor_id: string | null }): CareBenchRow => ({
    client_name: 'BNP Paribas',
    role: 'QA',
    departure_date: '2026-03-01',
    status: 'w_rekrutacji',
    ...o,
})

const resolve = (input: {
    entries?: CareEntryRow[]
    departures?: CareDepartureRow[]
    bench?: CareBenchRow[]
}) => resolveCareSituations({
    entries: input.entries ?? [],
    departures: input.departures ?? [],
    bench: input.bench ?? [],
})

describe('resolveCareSituations — kto jest u klienta', () => {
    it('wejście bez zejścia = pracuje u klienta', () => {
        const out = resolve({ entries: [entry({ contractor_id: 'c1' })] })
        expect(out.get('c1')).toMatchObject({
            situation: 'u_klienta',
            clientName: 'Nordea',
            position: 'Java Developer',
            sinceDate: '2026-01-10',
            benchStatus: null,
        })
    })

    it('zejście po wejściu zdejmuje z listy', () => {
        const out = resolve({
            entries: [entry({ contractor_id: 'c1', start_date: '2026-01-10' })],
            departures: [departure({ contractor_id: 'c1', departure_date: '2026-02-01' })],
        })
        expect(out.has('c1')).toBe(false)
    })

    it('powrót do klienta po odejściu wraca na listę', () => {
        const out = resolve({
            entries: [
                entry({ contractor_id: 'c1', start_date: '2026-01-10', client_name: 'Alior' }),
                entry({ contractor_id: 'c1', start_date: '2026-06-01', client_name: 'PKO BP' }),
            ],
            departures: [departure({ contractor_id: 'c1', departure_date: '2026-03-01' })],
        })
        expect(out.get('c1')).toMatchObject({ situation: 'u_klienta', clientName: 'PKO BP', sinceDate: '2026-06-01' })
    })

    it('zejście tego samego dnia co wejście zdejmuje z listy', () => {
        // Bez ostrej nierówności „wrócił i tego samego dnia odszedł" zostawałby
        // na liście — dzień zejścia nie jest starszy niż dzień wejścia.
        const out = resolve({
            entries: [entry({ contractor_id: 'c1', start_date: '2026-05-01' })],
            departures: [departure({ contractor_id: 'c1', departure_date: '2026-05-01' })],
        })
        expect(out.has('c1')).toBe(false)
    })

    it('bierze najpóźniejsze wejście, niezależnie od kolejności wierszy', () => {
        const out = resolve({
            entries: [
                entry({ contractor_id: 'c1', start_date: '2026-06-01', client_name: 'PKO BP' }),
                entry({ contractor_id: 'c1', start_date: '2026-01-10', client_name: 'Alior' }),
            ],
        })
        expect(out.get('c1')).toMatchObject({ clientName: 'PKO BP', sinceDate: '2026-06-01' })
    })
})

describe('resolveCareSituations — wejścia bez daty', () => {
    it('wejście bez daty i bez zejścia trafia na listę', () => {
        const out = resolve({ entries: [entry({ contractor_id: 'c1', start_date: null })] })
        expect(out.get('c1')).toMatchObject({ situation: 'u_klienta', sinceDate: null })
    })

    it('wejście bez daty NIE cofa odnotowanego zejścia', () => {
        // Import bez daty startu nie może przywracać do pracy kogoś, kto odszedł.
        const out = resolve({
            entries: [entry({ contractor_id: 'c1', start_date: null })],
            departures: [departure({ contractor_id: 'c1', departure_date: '2026-02-01' })],
        })
        expect(out.has('c1')).toBe(false)
    })

    it('datowane wejście wygrywa z niedatowanym przy wyborze ostatniego', () => {
        const out = resolve({
            entries: [
                entry({ contractor_id: 'c1', start_date: null, client_name: 'Bez daty' }),
                entry({ contractor_id: 'c1', start_date: '2026-04-01', client_name: 'Nordea' }),
            ],
        })
        expect(out.get('c1')).toMatchObject({ clientName: 'Nordea', sinceDate: '2026-04-01' })
    })
})

describe('resolveCareSituations — bench', () => {
    it('niezdjęty wpis benchowy trafia na listę jako bench', () => {
        const out = resolve({ bench: [bench({ contractor_id: 'c2' })] })
        expect(out.get('c2')).toMatchObject({
            situation: 'bench',
            clientName: 'BNP Paribas',
            position: 'QA',
            sinceDate: '2026-03-01',
            benchStatus: 'w_rekrutacji',
        })
    })

    it('praca u klienta wygrywa ze starym wpisem benchowym', () => {
        const out = resolve({
            entries: [entry({ contractor_id: 'c1', client_name: 'Nordea' })],
            bench: [bench({ contractor_id: 'c1' })],
        })
        expect(out.get('c1')).toMatchObject({ situation: 'u_klienta', clientName: 'Nordea', benchStatus: null })
        expect(out.size).toBe(1)
    })

    it('osoba po zejściu, ale z wpisem benchowym, zostaje na liście jako bench', () => {
        const out = resolve({
            entries: [entry({ contractor_id: 'c1', start_date: '2026-01-10' })],
            departures: [departure({ contractor_id: 'c1', departure_date: '2026-02-01' })],
            bench: [bench({ contractor_id: 'c1', status: 'przepiety' })],
        })
        expect(out.get('c1')).toMatchObject({ situation: 'bench', benchStatus: 'przepiety' })
    })

    it('kilka wpisów benchowych daje jeden wiersz', () => {
        const out = resolve({
            bench: [
                bench({ contractor_id: 'c2', status: 'w_rekrutacji' }),
                bench({ contractor_id: 'c2', status: 'zakonczenie_umowy' }),
            ],
        })
        expect(out.size).toBe(1)
        expect(out.get('c2')?.situation).toBe('bench')
    })
})

describe('resolveCareSituations — wiersze bez powiązania', () => {
    it('pomija wiersze bez contractor_id', () => {
        const out = resolve({
            entries: [entry({ contractor_id: null })],
            bench: [bench({ contractor_id: null })],
        })
        expect(out.size).toBe(0)
    })

    it('zejście bez contractor_id nie zdejmuje nikogo z listy', () => {
        const out = resolve({
            entries: [entry({ contractor_id: 'c1' })],
            departures: [departure({ contractor_id: null, departure_date: '2027-01-01' })],
        })
        expect(out.get('c1')?.situation).toBe('u_klienta')
    })

    it('puste wejście daje pustą listę', () => {
        expect(resolve({}).size).toBe(0)
    })
})
