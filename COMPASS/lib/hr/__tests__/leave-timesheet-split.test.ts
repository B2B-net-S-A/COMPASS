import { describe, expect, it } from 'vitest'
import {
    splitLeaveWorkingDays,
    isContractorPaidVacation,
    PAID_LEAVE_ENTRY_SOURCE,
    PAID_LEAVE_ENTRY_DESCRIPTION,
} from '../leave-timesheet-split'

const HOLIDAYS = [{ date: '2026-05-01', name_pl: 'Święto Pracy' }]

function base(over: Partial<Parameters<typeof splitLeaveWorkingDays>[0]> = {}) {
    return splitLeaveWorkingDays({
        startDate: '2026-05-04',
        endDate: '2026-05-08',
        halfDay: null,
        leaveType: 'vacation',
        paidDays: 0,
        employmentType: 'b2b',
        holidays: HOLIDAYS,
        ...over,
    })
}

describe('isContractorPaidVacation', () => {
    it('true for b2b/zlecenie + pool vacation type', () => {
        expect(isContractorPaidVacation('b2b', 'vacation')).toBe(true)
        expect(isContractorPaidVacation('zlecenie', 'on_demand')).toBe(true)
    })
    it('false for uop / non-pool / null', () => {
        expect(isContractorPaidVacation('uop', 'vacation')).toBe(false)
        expect(isContractorPaidVacation('b2b', 'sick_leave')).toBe(false)
        expect(isContractorPaidVacation(null, 'vacation')).toBe(false)
    })
})

describe('splitLeaveWorkingDays — B2B/zlecenie z pulą', () => {
    it('cała pula starcza → wszystkie dni płatne, nic nie blokuje', () => {
        const r = base({ startDate: '2026-05-04', endDate: '2026-05-05', paidDays: 2 })
        expect(r.paidDays).toEqual([
            { date: '2026-05-04', hours: 8 },
            { date: '2026-05-05', hours: 8 },
        ])
        expect(r.blockedDays).toEqual([])
    })

    it('częściowa pula → pierwsze N płatne, reszta blocked', () => {
        const r = base({ paidDays: 2 }) // 04-08 = 5 wd
        expect(r.paidDays.map((p) => p.date)).toEqual(['2026-05-04', '2026-05-05'])
        expect(r.paidDays.every((p) => p.hours === 8)).toBe(true)
        expect(r.blockedDays).toEqual(['2026-05-06', '2026-05-07', '2026-05-08'])
    })

    it('pula wyczerpana (paidDays=0) → wszystko blocked', () => {
        const r = base({ paidDays: 0 })
        expect(r.paidDays).toEqual([])
        expect(r.blockedDays).toHaveLength(5)
    })

    it('zlecenie działa jak b2b', () => {
        const r = base({ employmentType: 'zlecenie', startDate: '2026-05-04', endDate: '2026-05-05', paidDays: 2 })
        expect(r.paidDays).toHaveLength(2)
        expect(r.blockedDays).toEqual([])
    })

    it('fractional split (3.5 z 5) → 3×8h + 1×4h, reszta blocked', () => {
        const r = base({ paidDays: 3.5 })
        expect(r.paidDays).toEqual([
            { date: '2026-05-04', hours: 8 },
            { date: '2026-05-05', hours: 8 },
            { date: '2026-05-06', hours: 8 },
            { date: '2026-05-07', hours: 4 },
        ])
        expect(r.blockedDays).toEqual(['2026-05-08'])
    })

    it('półdniówka płatna → 4h', () => {
        const r = base({ startDate: '2026-05-04', endDate: '2026-05-04', halfDay: 'morning', paidDays: 0.5 })
        expect(r.paidDays).toEqual([{ date: '2026-05-04', hours: 4 }])
        expect(r.blockedDays).toEqual([])
    })

    it('półdniówka bez puli → blocked', () => {
        const r = base({ startDate: '2026-05-04', endDate: '2026-05-04', halfDay: 'morning', paidDays: 0 })
        expect(r.paidDays).toEqual([])
        expect(r.blockedDays).toEqual(['2026-05-04'])
    })

    it('weekendy i święta wykluczone z dni roboczych', () => {
        // 2026-04-30 (Thu), 05-01 (Fri holiday), 05-02/03 (weekend), 05-04 (Mon) → 2 wd
        const r = base({ startDate: '2026-04-30', endDate: '2026-05-04', paidDays: 2 })
        expect(r.paidDays.map((p) => p.date)).toEqual(['2026-04-30', '2026-05-04'])
        expect(r.blockedDays).toEqual([])
    })

    it('zakres tylko weekendowy → pusto', () => {
        const r = base({ startDate: '2026-05-02', endDate: '2026-05-03', paidDays: 2 })
        expect(r.paidDays).toEqual([])
        expect(r.blockedDays).toEqual([])
    })
})

describe('splitLeaveWorkingDays — poza zakresem reguły (wszystko blocked)', () => {
    it('UoP vacation (nawet z paidDays) → wszystko blocked', () => {
        const r = base({ employmentType: 'uop', paidDays: 5 })
        expect(r.paidDays).toEqual([])
        expect(r.blockedDays).toHaveLength(5)
    })

    it('B2B sick_leave (non-pool typ) → wszystko blocked', () => {
        const r = base({ leaveType: 'sick_leave', paidDays: 5 })
        expect(r.paidDays).toEqual([])
        expect(r.blockedDays).toHaveLength(5)
    })

    it('employment_type null → wszystko blocked', () => {
        const r = base({ employmentType: null, paidDays: 5 })
        expect(r.paidDays).toEqual([])
        expect(r.blockedDays).toHaveLength(5)
    })
})

describe('constants', () => {
    it('source tag = leave_paid', () => {
        expect(PAID_LEAVE_ENTRY_SOURCE).toBe('leave_paid')
    })

    // Decyzja Artura (2026-06-03): płatny dzień z puli na TS = normalny dzień
    // roboczy. Opis musi być identyczny z DEFAULT_QUICK_FILL_DESCRIPTION
    // ('Praca standardowa'), żeby na PDF nie zdradzać że to urlop — pochodzenie
    // z puli COMPASS śledzi wyłącznie przez source='leave_paid'.
    it('opis auto-wpisu = "Praca standardowa" (wygląda jak normalny dzień pracy)', () => {
        expect(PAID_LEAVE_ENTRY_DESCRIPTION).toBe('Praca standardowa')
    })
})
