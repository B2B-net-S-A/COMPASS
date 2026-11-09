import { describe, expect, it } from 'vitest'
import { liveTrainingDateSentence } from '../twin-course'

describe('liveTrainingDateSentence (baner M09)', () => {
    it('podaje dzień szkolenia na żywo jak w makiecie', () => {
        expect(liveTrainingDateSentence(['2026-11-25T09:00:00+00:00'])).toBe('Szkolenie na żywo odbyło się 25.11.2026.')
    })

    it('liczy dzień w strefie Europe/Warsaw, nie w UTC', () => {
        // 23:30 UTC 24.11 to już 25.11 w Warszawie.
        expect(liveTrainingDateSentence(['2026-11-24T23:30:00Z'])).toBe('Szkolenie na żywo odbyło się 25.11.2026.')
    })

    it('kilka spotkań tego samego dnia daje jedną datę', () => {
        expect(liveTrainingDateSentence(['2026-11-25T13:00:00Z', '2026-11-25T09:00:00Z'])).toBe('Szkolenie na żywo odbyło się 25.11.2026.')
    })

    it('spotkania w różne dni dają zakres od pierwszego do ostatniego, niezależnie od kolejności', () => {
        expect(liveTrainingDateSentence(['2026-12-02T09:00:00Z', '2026-11-25T09:00:00Z', '2026-11-27T09:00:00Z']))
            .toBe('Szkolenie na żywo odbyło się od 25.11.2026 do 02.12.2026.')
    })

    it('bez sesji albo z nieczytelną datą nie podaje daty', () => {
        expect(liveTrainingDateSentence([])).toBeNull()
        expect(liveTrainingDateSentence(['nie-data'])).toBeNull()
        expect(liveTrainingDateSentence(['nie-data', '2026-11-25T09:00:00Z'])).toBe('Szkolenie na żywo odbyło się 25.11.2026.')
    })
})
