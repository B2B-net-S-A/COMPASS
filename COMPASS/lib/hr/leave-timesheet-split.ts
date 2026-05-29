// Phase 30b — split a vacation leave into days that should appear in the timesheet
// as PAID (billable) hours vs days that BLOCK the timesheet (hidden, no hours).
//
// Reguła (decyzja Artura, 2026-05-29):
//   - B2B/zlecenie z pulą płatnych urlopów: dni z puli (paid_days) pokazują się
//     w timesheet jak normalny dzień roboczy (auto-wpis 8h, billable). Dopiero po
//     wyczerpaniu puli nadwyżkowe dni (unpaid_days) są blokowane jak zawsze.
//   - UoP / non-contractor / non-vacation: WSZYSTKIE dni robocze blokują timesheet
//     (zachowanie sprzed Phase 30b — etatowiec nie rozlicza godzin za urlop).
//
// Helper jest czysty (bez I/O) — używany przez syncAttendanceFromLeave (server),
// getTimesheetBlockedDates (editor/preview) i backfill, żeby logika podziału była
// jednym źródłem prawdy.

import { parseISO, format } from 'date-fns'
import { workingDaysBetween, type PublicHolidayDate } from './working-days'
import { VACATION_POOL_TYPES } from './leave-balance'

/** Source tag dla auto-wpisanych godzin płatnego urlopu (rozszerza CHECK na timesheet_entries.source). */
export const PAID_LEAVE_ENTRY_SOURCE = 'leave_paid'
/** Opis auto-wpisu — wliczany do sumy/billingu, ale czytelnie oznaczony jako urlop. */
export const PAID_LEAVE_ENTRY_DESCRIPTION = 'Urlop płatny (z puli)'
/** Standardowy dzień = 8h (spójne z STANDARD_DAILY_HOURS_MAX i quick-fill). */
export const STANDARD_PAID_LEAVE_HOURS = 8

const CONTRACTOR_EMPLOYMENT_TYPES = ['b2b', 'zlecenie'] as const

const EPSILON = 1e-9

export interface PaidLeaveDay {
    /** yyyy-MM-dd */
    date: string
    /** 8 dla pełnego dnia, 4 dla połówki. */
    hours: number
}

export interface LeaveTimesheetSplit {
    /** Dni robocze, które mają trafić do timesheet jako godziny (płatny urlop z puli). */
    paidDays: PaidLeaveDay[]
    /** Dni robocze, które blokują timesheet (ukryte, bez godzin). */
    blockedDays: string[]
}

/**
 * Czy dany urlop podlega regule "płatny urlop z puli → godziny w timesheet".
 * Tylko kontraktorzy (B2B/zlecenie) na typach z puli wypoczynkowej (vacation/on_demand).
 */
export function isContractorPaidVacation(
    employmentType: string | null,
    leaveType: string,
): boolean {
    return (
        (CONTRACTOR_EMPLOYMENT_TYPES as readonly string[]).includes(employmentType ?? '')
        && (VACATION_POOL_TYPES as readonly string[]).includes(leaveType)
    )
}

/**
 * Podziel dni robocze urlopu na płatne (auto-wpis godzin) i blokujące timesheet.
 *
 * `paidDays` (liczba dni z puli, np. z leave_requests.paid_days) wybiera
 * chronologicznie PIERWSZE dni robocze jako płatne. Reszta jest blokowana.
 * Połówka dnia (0.5) → 4h. Fractional split (np. paid=3.5 z 5 dni) → 3×8h + 1×4h,
 * reszta blocked.
 */
export function splitLeaveWorkingDays(args: {
    startDate: string
    endDate: string
    halfDay: 'morning' | 'afternoon' | null
    leaveType: string
    paidDays: number
    employmentType: string | null
    holidays: ReadonlyArray<PublicHolidayDate>
}): LeaveTimesheetSplit {
    const workdays = workingDaysBetween(
        parseISO(args.startDate),
        parseISO(args.endDate),
        args.holidays,
    ).map((d) => format(d, 'yyyy-MM-dd'))

    if (workdays.length === 0) return { paidDays: [], blockedDays: [] }

    // UoP / non-contractor / non-pool leave: wszystko blokuje (zachowanie historyczne).
    if (!isContractorPaidVacation(args.employmentType, args.leaveType) || args.paidDays <= 0) {
        return { paidDays: [], blockedDays: workdays }
    }

    const halfDayHours = STANDARD_PAID_LEAVE_HOURS / 2

    // Połówka dnia (single working day): cały dzień płatny (4h) albo cały blocked.
    if (args.halfDay && workdays.length === 1) {
        return args.paidDays >= 0.5 - EPSILON
            ? { paidDays: [{ date: workdays[0], hours: halfDayHours }], blockedDays: [] }
            : { paidDays: [], blockedDays: workdays }
    }

    const fullPaid = Math.floor(args.paidDays + EPSILON)
    const hasHalfPaid = args.paidDays - fullPaid >= 0.5 - EPSILON

    const paidDays: PaidLeaveDay[] = []
    const blockedDays: string[] = []
    workdays.forEach((date, i) => {
        if (i < fullPaid) {
            paidDays.push({ date, hours: STANDARD_PAID_LEAVE_HOURS })
        } else if (i === fullPaid && hasHalfPaid) {
            paidDays.push({ date, hours: halfDayHours })
        } else {
            blockedDays.push(date)
        }
    })

    return { paidDays, blockedDays }
}
