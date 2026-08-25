import { describe, it, expect } from 'vitest'
import { LEAVE_ATTENDANCE_STATUSES, blocksTimesheetHours } from '../leave-attendance-statuses'

describe('blocksTimesheetHours', () => {
    it('blokuje KAŻDY status, który wniosek urlopowy potrafi zapisać do attendance', () => {
        // To jest sedno naprawy: zapis (syncAttendanceFromLeave) wstawia dowolny z tych
        // statusów, a odczyt blokował tylko pięć z nich. Test pilnuje, żeby obie strony
        // nie rozjechały się ponownie przy dodawaniu nowego typu urlopu.
        for (const status of LEAVE_ATTENDANCE_STATUSES) {
            expect(blocksTimesheetHours(status)).toBe(true)
        }
    })

    it('łapie typy, które wcześniej przechodziły bokiem', () => {
        // Te trzy realnie występowały w attendance_records na produkcji (2026-08-25)
        // i nie blokowały logowania godzin.
        expect(blocksTimesheetHours('childcare')).toBe(true)
        expect(blocksTimesheetHours('on_demand')).toBe(true)
        expect(blocksTimesheetHours('occasional')).toBe(true)
    })

    it('NIE blokuje dni pracy — delegacja to dzień roboczy', () => {
        expect(blocksTimesheetHours('active')).toBe(false)
        expect(blocksTimesheetHours('business_trip')).toBe(false)
    })

    it('brak wiersza attendance nie blokuje (dni płatne z puli go nie mają)', () => {
        expect(blocksTimesheetHours(null)).toBe(false)
        expect(blocksTimesheetHours(undefined)).toBe(false)
        expect(blocksTimesheetHours('')).toBe(false)
    })
})
