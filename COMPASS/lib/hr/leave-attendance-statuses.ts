// Audyt 2026-08 — jedna lista statusów urlopowych w attendance_records.
//
// PROBLEM, KTÓRY TO ZAMYKA. Zapis i odczyt miały dwie różne listy:
//   • zapis (syncAttendanceFromLeave) wstawiał `status = leave_type`, czyli
//     dowolną z 16 wartości typu urlopu;
//   • odczyt (checkAttendanceAllowsWork / quickFillMonth / approver-flow) blokował
//     wpisywanie godzin tylko dla 5 z nich.
// Skutek: dzień z urlopem opieki (`childcare`), na żądanie (`on_demand`),
// okolicznościowym (`occasional`), macierzyńskim, ojcowskim, wychowawczym,
// za oddanie krwi, szkoleniowym i „innym" NIE blokował logowania godzin —
// pracownik mógł mieć w tym samym dniu urlop i 8 rozliczonych godzin.
// Na produkcji (2026-08-25) w attendance_records były już 2 dni `childcare`
// i 1 `on_demand` — czyli luka była realna, nie hipotetyczna.
//
// DLACZEGO NIE `status <> 'active'`: CHECK na attendance_records dopuszcza też
// `business_trip` (delegacja), która jest DNIEM PRACY i godziny logować wolno.
// Lista poniżej to dokładnie te statusy, które wstawia wniosek urlopowy.

/**
 * Statusy `attendance_records` pochodzące z wniosku urlopowego.
 *
 * Używane w DWÓCH rolach i muszą pozostać tą samą listą:
 *   1. sprzątanie attendance po wniosku (`syncAttendanceFromLeave`),
 *   2. blokada logowania godzin na dany dzień (timesheet).
 *
 * UWAGA: dni PŁATNE z puli (Faza 30b, B2B/zlecenie) świadomie NIE dostają wiersza
 * w attendance_records — mają wyglądać jak normalny dzień pracy. Blokada oparta
 * o obecność wiersza jest więc zgodna z tą regułą bez dodatkowych wyjątków.
 */
export const LEAVE_ATTENDANCE_STATUSES = [
    'vacation', 'on_demand', 'occasional', 'childcare', 'care_leave', 'force_majeure',
    'sick_leave', 'maternity', 'paternity', 'parental_leave', 'childrearing',
    'unpaid_leave', 'blood_donation', 'training', 'holiday_in_lieu', 'other',
] as const

export type LeaveAttendanceStatus = (typeof LEAVE_ATTENDANCE_STATUSES)[number]

/** Czy dzień o tym statusie attendance blokuje logowanie godzin do timesheetu. */
export function blocksTimesheetHours(status: string | null | undefined): boolean {
    if (!status) return false
    return (LEAVE_ATTENDANCE_STATUSES as readonly string[]).includes(status)
}
