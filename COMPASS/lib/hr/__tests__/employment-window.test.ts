import { describe, expect, it } from 'vitest'

import {
    activeRoster,
    employedInMonth,
    excludeExited,
    filterEmployedInMonth,
    isActiveNow,
    isEmployedInMonth,
} from '@/lib/hr/employment-window'

const JULY = '2026-07-01'
const JUNE = '2026-06-01'

describe('isEmployedInMonth', () => {
    it('keeps an active employee with no termination date', () => {
        expect(
            isEmployedInMonth({ employment_status: 'active', termination_date: null }, JULY),
        ).toBe(true)
    })

    it('hides someone who left before the displayed month', () => {
        expect(
            isEmployedInMonth(
                { employment_status: 'exited', termination_date: '2026-06-30' },
                JULY,
            ),
        ).toBe(false)
    })

    it('still shows that person in the month they actually worked', () => {
        expect(
            isEmployedInMonth(
                { employment_status: 'exited', termination_date: '2026-06-30' },
                JUNE,
            ),
        ).toBe(true)
    })

    it('keeps an offboarding employee through their final month', () => {
        expect(
            isEmployedInMonth(
                { employment_status: 'offboarding', termination_date: '2026-07-27' },
                JULY,
            ),
        ).toBe(true)
    })

    it('drops that employee from the month after their last day', () => {
        expect(
            isEmployedInMonth(
                { employment_status: 'offboarding', termination_date: '2026-07-27' },
                '2026-08-01',
            ),
        ).toBe(false)
    })

    it('keeps someone whose last day is exactly the 1st of the month', () => {
        expect(
            isEmployedInMonth(
                { employment_status: 'offboarding', termination_date: '2026-07-01' },
                JULY,
            ),
        ).toBe(true)
    })

    it('keeps an offboarding employee whose last day is not settled yet', () => {
        // Offboarding starts before the termination date is always known. Until
        // someone records that date they are still employed, still on the team,
        // and their leaves still matter — so they stay on the grid.
        expect(
            isEmployedInMonth(
                { employment_status: 'offboarding', termination_date: null },
                JULY,
            ),
        ).toBe(true)
    })

    it('hides a legacy exited row that has no termination date', () => {
        expect(
            isEmployedInMonth({ employment_status: 'exited', termination_date: null }, JULY),
        ).toBe(false)
    })

    it('keeps a row with no employment data at all (defensive default)', () => {
        expect(isEmployedInMonth({}, JULY)).toBe(true)
    })
})

describe('filterEmployedInMonth', () => {
    it('removes only the people gone before the month started', () => {
        const roster = [
            { id: 'active', employment_status: 'active', termination_date: null },
            { id: 'leaving', employment_status: 'offboarding', termination_date: '2026-07-27' },
            { id: 'gone', employment_status: 'exited', termination_date: '2026-06-30' },
        ]

        expect(filterEmployedInMonth(roster, JULY).map((m) => m.id)).toEqual(['active', 'leaving'])
    })
})

describe('activeRoster — reguła „tu i teraz"', () => {
    const roster = [
        { id: 'active', employment_status: 'active', termination_date: null },
        { id: 'leaving', employment_status: 'offboarding', termination_date: '2026-07-27' },
        { id: 'gone', employment_status: 'exited', termination_date: '2026-06-30' },
    ]

    it('zostawia osoby w trakcie offboardingu — do ostatniego dnia pracują', () => {
        expect(activeRoster(roster).map((m) => m.id)).toEqual(['active', 'leaving'])
    })

    it('pomija offboarding tylko na wyraźne życzenie', () => {
        expect(activeRoster(roster, { excludeOffboarding: true }).map((m) => m.id)).toEqual(['active'])
    })

    it('ignoruje termination_date — data zejścia sama nie zdejmuje z listy', () => {
        // Wpisana z wyprzedzeniem data zejścia NIE może usunąć kogoś z dropdownów,
        // dopóki realnie pracuje; od tego jest dopiero archiwizacja.
        expect(isActiveNow({ employment_status: 'active', termination_date: '2020-01-01' })).toBe(true)
    })

    it('brak statusu nie wyklucza (świeży profil bez wypełnionego pola)', () => {
        expect(isActiveNow({})).toBe(true)
    })
})

describe('dwie reguły rozjeżdżają się tam, gdzie to boli', () => {
    it('kto odszedł 20-go, wypada z listy „tu i teraz", ale zostaje w rozliczeniu miesiąca', () => {
        const roster = [{ id: 'gone', employment_status: 'exited', termination_date: '2026-07-20' }]

        expect(activeRoster(roster)).toEqual([])
        expect(employedInMonth(roster, JULY).map((m) => m.id)).toEqual(['gone'])
        expect(employedInMonth(roster, '2026-08-01')).toEqual([])
    })

    it('employedInMonth to ta sama funkcja co historyczne filterEmployedInMonth', () => {
        expect(employedInMonth).toBe(filterEmployedInMonth)
    })
})

describe('excludeExited — ta sama reguła po stronie zapytania', () => {
    // Jedyna z pary funkcja, której `tsc` NIE weryfikuje: rzutowanie `as Q`
    // (obejście TS2589) przyjęłoby też implementację, która nic nie filtruje
    // albo gubi zwracany builder. Bez tego testu ciche zdjęcie `.neq(...)`
    // przywróciłoby zarchiwizowanych do 17 list — w tym do adresatów maili z cronów.
    function fakeQuery() {
        const calls: Array<[string, string]> = []
        const q = {
            calls,
            neq(column: 'employment_status', value: string) {
                calls.push([column, value])
                return q
            },
        }
        return q
    }

    it('nakłada neq na employment_status z wartością "exited"', () => {
        const q = fakeQuery()

        excludeExited(q)

        expect(q.calls).toEqual([['employment_status', 'exited']])
    })

    it('zwraca ten sam builder — inaczej wywołujący traciłby filtr przy .order()/.await', () => {
        const q = fakeQuery()

        expect(excludeExited(q)).toBe(q)
    })
})
