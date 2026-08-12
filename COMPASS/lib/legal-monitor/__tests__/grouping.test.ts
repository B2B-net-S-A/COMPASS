import { describe, it, expect } from 'vitest'
import {
    dayGroupLabel,
    exactDayLabel,
    groupItemsByReceivedDay,
    receivedDayISO,
} from '../grouping'
import type { LegalMonitorItemRow } from '../../types/legal-monitor'

type Item = Pick<LegalMonitorItemRow, 'id' | 'severity' | 'published_at' | 'created_at'>

function item(overrides: Partial<Item> & Pick<Item, 'id' | 'created_at'>): Item {
    return {
        severity: 'green',
        published_at: null,
        ...overrides,
    }
}

describe('receivedDayISO', () => {
    it('liczy dzień w Warszawie, nie w UTC', () => {
        // 22:30 UTC = 00:30 następnego dnia w Warszawie (lato, UTC+2).
        expect(receivedDayISO('2026-08-11T22:30:00Z')).toBe('2026-08-12')
        expect(receivedDayISO('2026-08-12T05:30:00Z')).toBe('2026-08-12')
    })

    it('nie wywala się na nieparsowalnej dacie', () => {
        expect(receivedDayISO('nie-data')).toBe('nie-data')
        expect(receivedDayISO('')).toBe('')
    })
})

describe('dayGroupLabel', () => {
    const today = '2026-08-12'

    it('nazywa trzy ostatnie dni słownie', () => {
        expect(dayGroupLabel('2026-08-12', today)).toBe('Dzisiaj')
        expect(dayGroupLabel('2026-08-11', today)).toBe('Wczoraj')
        expect(dayGroupLabel('2026-08-10', today)).toBe('Przedwczoraj')
    })

    it('starsze dni pokazuje z dniem tygodnia i miesiącem w dopełniaczu', () => {
        // 2026-08-10 to poniedziałek. „sierpnia”, nie „sierpień” — patrz nota o MMMM/LLLL.
        expect(dayGroupLabel('2026-08-10', '2026-08-14')).toBe('Poniedziałek, 10 sierpnia 2026')
    })

    it('datę z przyszłości pokazuje wprost, nie jako dzisiaj', () => {
        expect(dayGroupLabel('2026-08-13', today)).toBe('Czwartek, 13 sierpnia 2026')
    })

    it('nieparsowalny dzień oznacza jako „Bez daty”', () => {
        expect(dayGroupLabel('nie-data', today)).toBe('Bez daty')
        expect(exactDayLabel('nie-data')).toBeNull()
    })
})

describe('groupItemsByReceivedDay', () => {
    const today = '2026-08-12'

    it('układa dni od najnowszego i liczy wpisy w każdym', () => {
        const groups = groupItemsByReceivedDay(
            [
                item({ id: 'a', created_at: '2026-08-10T05:30:00Z' }),
                item({ id: 'b', created_at: '2026-08-12T05:31:00Z' }),
                item({ id: 'c', created_at: '2026-08-11T05:30:00Z' }),
                item({ id: 'd', created_at: '2026-08-12T05:30:00Z' }),
            ],
            today,
        )
        expect(groups.map((g) => [g.dayISO, g.label, g.items.length])).toEqual([
            ['2026-08-12', 'Dzisiaj', 2],
            ['2026-08-11', 'Wczoraj', 1],
            ['2026-08-10', 'Przedwczoraj', 1],
        ])
    })

    it('w obrębie dnia zostawia kolejność skrzynki: pilność, potem świeższy dokument', () => {
        const groups = groupItemsByReceivedDay(
            [
                item({
                    id: 'zielony-nowszy',
                    severity: 'green',
                    published_at: '2026-08-11',
                    created_at: '2026-08-12T05:30:00Z',
                }),
                item({
                    id: 'czerwony-stary',
                    severity: 'red',
                    published_at: '2024-11-19',
                    created_at: '2026-08-12T05:30:00Z',
                }),
                item({
                    id: 'zolty',
                    severity: 'yellow',
                    published_at: '2026-08-01',
                    created_at: '2026-08-12T05:30:00Z',
                }),
            ],
            today,
        )
        expect(groups).toHaveLength(1)
        expect(groups[0].items.map((i) => i.id)).toEqual([
            'czerwony-stary',
            'zolty',
            'zielony-nowszy',
        ])
    })

    it('dokładną datę dokłada tylko do etykiet względnych', () => {
        const groups = groupItemsByReceivedDay(
            [
                item({ id: 'dzis', created_at: '2026-08-12T05:30:00Z' }),
                item({ id: 'stary', created_at: '2026-08-03T05:30:00Z' }),
            ],
            today,
        )
        expect(groups[0].exactLabel).toBe('12 sierpnia 2026')
        expect(groups[1].exactLabel).toBeNull()
    })

    it('grupuje po dniu warszawskim — wpis z 00:30 należy do nowego dnia', () => {
        const groups = groupItemsByReceivedDay(
            [
                item({ id: 'przed-polnoca', created_at: '2026-08-11T21:00:00Z' }),
                item({ id: 'po-polnocy', created_at: '2026-08-11T22:30:00Z' }),
            ],
            today,
        )
        expect(groups.map((g) => [g.dayISO, g.items.map((i) => i.id)])).toEqual([
            ['2026-08-12', ['po-polnocy']],
            ['2026-08-11', ['przed-polnoca']],
        ])
    })

    it('zwraca pustą listę grup dla pustej skrzynki', () => {
        expect(groupItemsByReceivedDay([], today)).toEqual([])
    })
})
