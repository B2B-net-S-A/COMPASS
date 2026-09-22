import type { AcademyRunDTO } from '@/lib/types/academy-sessions'

export const ACADEMY_CALENDAR_ZONE = 'Europe/Warsaw'
export function calendarDay(iso: string): string {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: ACADEMY_CALENDAR_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(iso))
    const value = (type: string) => parts.find((part) => part.type === type)?.value
    return `${value('year')}-${value('month')}-${value('day')}`
}
export function shiftCalendarMonth(month: string, offset: number): string {
    const [year, number] = month.split('-').map(Number)
    return new Date(Date.UTC(year, number - 1 + offset, 1)).toISOString().slice(0, 7)
}
export function calendarMonthDays(month: string): string[] {
    const first = new Date(`${month}-01T12:00:00Z`)
    const mondayOffset = (first.getUTCDay() + 6) % 7
    const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
    return Array.from({ length: Math.ceil((mondayOffset + days) / 7) * 7 }, (_, index) => {
        const date = new Date(first)
        date.setUTCDate(1 - mondayOffset + index)
        return date.toISOString().slice(0, 10)
    })
}
export function calendarSessions(runs: AcademyRunDTO[], month: string, mine: boolean) {
    return runs.flatMap((run) => run.sessions.map((session) => ({ run, session, day: calendarDay(session.startsAt) })))
        .filter(({ run, session, day }) => run.status !== 'cancelled' && session.status !== 'cancelled' && day.startsWith(month))
        .filter(({ run }) => !mine || run.myRegistration?.status === 'confirmed' || run.myRegistration?.status === 'waitlisted')
        .sort((a, b) => Date.parse(a.session.startsAt) - Date.parse(b.session.startsAt) || a.session.id.localeCompare(b.session.id))
}
