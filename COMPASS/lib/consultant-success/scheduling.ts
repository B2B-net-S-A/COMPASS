export const CONSULTANT_SUCCESS_TIME_ZONE = 'Europe/Warsaw'

export const DEFAULT_CATCH_UP_DAYS = 14
export const DEFAULT_PLANNING_HORIZON_DAYS = 90
export const DEFAULT_MAX_DELIVERY_ATTEMPTS = 5
export const TCM_DELIVERY_CHANNELS = ['in_app', 'email', 'push'] as const

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const DAY_MS = 86_400_000

export interface MilestoneDefinition {
    key: string
    /** Relative to the entity due date. `-3` means three days before it. */
    offsetDays: number
}

export interface DueMilestone extends MilestoneDefinition {
    triggerDate: string
}

export interface RetryDecision {
    status: 'retry' | 'dead'
    availableAt: string | null
}

export const CHECK_IN_MILESTONES: readonly MilestoneDefinition[] = [
    { key: 'pre3', offsetDays: -3 },
    { key: 'due', offsetDays: 0 },
    { key: 'overdue2', offsetDays: 2 },
    { key: 'overdue7', offsetDays: 7 },
]

export const TASK_MILESTONES: readonly MilestoneDefinition[] = [
    { key: 'due', offsetDays: 0 },
    { key: 'overdue2', offsetDays: 2 },
    { key: 'overdue7', offsetDays: 7 },
]

export const HEALTH_REVIEW_MILESTONES: readonly MilestoneDefinition[] = [
    { key: 'pre3', offsetDays: -3 },
    { key: 'due', offsetDays: 0 },
]

export const SURVEY_MILESTONES: readonly MilestoneDefinition[] = [
    { key: 'reminder3', offsetDays: 3 },
    { key: 'reminder7', offsetDays: 7 },
    { key: 'expiry14', offsetDays: 14 },
]

export const RETRY_DELAYS_MS = [
    5 * 60_000,
    30 * 60_000,
    2 * 60 * 60_000,
    12 * 60 * 60_000,
] as const

function parseIsoDate(value: string): Date {
    if (!ISO_DATE_RE.test(value)) {
        throw new Error(`Invalid ISO date: ${value}`)
    }
    const parsed = new Date(`${value}T00:00:00.000Z`)
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
        throw new Error(`Invalid ISO date: ${value}`)
    }
    return parsed
}

export function addCalendarDays(isoDate: string, days: number): string {
    const date = parseIsoDate(isoDate)
    date.setUTCDate(date.getUTCDate() + days)
    return date.toISOString().slice(0, 10)
}

export function calendarDayDiff(fromIsoDate: string, toIsoDate: string): number {
    return Math.round((parseIsoDate(toIsoDate).getTime() - parseIsoDate(fromIsoDate).getTime()) / DAY_MS)
}

/** A stable `YYYY-MM-DD` business date in the requested IANA time zone. */
export function localDate(now: Date, timeZone = CONSULTANT_SUCCESS_TIME_ZONE): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(now)
    const get = (type: Intl.DateTimeFormatPartTypes) =>
        parts.find((part) => part.type === type)?.value
    const year = get('year')
    const month = get('month')
    const day = get('day')
    if (!year || !month || !day) throw new Error(`Unable to resolve local date for ${timeZone}`)
    return `${year}-${month}-${day}`
}

export function localHour(now: Date, timeZone = CONSULTANT_SUCCESS_TIME_ZONE): number {
    const hour = new Intl.DateTimeFormat('en-GB', {
        timeZone,
        hour: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(now).find((part) => part.type === 'hour')?.value
    if (hour === undefined) throw new Error(`Unable to resolve local hour for ${timeZone}`)
    return Number(hour)
}

/** Converts an unambiguous local business time (for example 09:00) to UTC. */
export function localBusinessTimeToUtc(
    isoDate: string,
    hour: number,
    minute = 0,
    timeZone = CONSULTANT_SUCCESS_TIME_ZONE,
): Date {
    parseIsoDate(isoDate)
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw new Error('hour must be 0..23')
    if (!Number.isInteger(minute) || minute < 0 || minute > 59) throw new Error('minute must be 0..59')
    const [year, month, day] = isoDate.split('-').map(Number)
    const desiredAsUtc = Date.UTC(year, month - 1, day, hour, minute)
    let candidate = new Date(desiredAsUtc)

    // Two passes account for an offset change between the initial UTC guess
    // and the desired local instant (DST boundary days).
    for (let pass = 0; pass < 2; pass += 1) {
        const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
        }).formatToParts(candidate)
        const value = (type: Intl.DateTimeFormatPartTypes) =>
            Number(parts.find((part) => part.type === type)?.value)
        const representedAsUtc = Date.UTC(
            value('year'),
            value('month') - 1,
            value('day'),
            value('hour'),
            value('minute'),
        )
        candidate = new Date(candidate.getTime() + desiredAsUtc - representedAsUtc)
    }
    return candidate
}

/** Supports both normal and overnight quiet-hour windows. */
export function isQuietHours(
    now: Date,
    options: { timeZone?: string; startHour?: number; endHour?: number } = {},
): boolean {
    const timeZone = options.timeZone ?? CONSULTANT_SUCCESS_TIME_ZONE
    const startHour = options.startHour ?? 18
    const endHour = options.endHour ?? 8
    const hour = localHour(now, timeZone)
    if (startHour === endHour) return true
    if (startHour < endHour) return hour >= startHour && hour < endHour
    return hour >= startHour || hour < endHour
}

/**
 * Returns the first five-minute boundary outside quiet hours. Iterating UTC
 * instants keeps this DST-safe without introducing another date dependency.
 */
export function deferPastQuietHours(
    now: Date,
    options: { timeZone?: string; startHour?: number; endHour?: number } = {},
): Date {
    if (!isQuietHours(now, options)) return new Date(now)
    const candidate = new Date(now)
    candidate.setUTCSeconds(0, 0)
    const remainder = candidate.getUTCMinutes() % 5
    candidate.setUTCMinutes(candidate.getUTCMinutes() + (remainder === 0 ? 5 : 5 - remainder))
    for (let i = 0; i < 24 * 12 + 2; i += 1) {
        if (!isQuietHours(candidate, options)) return candidate
        candidate.setUTCMinutes(candidate.getUTCMinutes() + 5)
    }
    throw new Error('Unable to leave quiet hours within 24 hours')
}

/**
 * Selects milestones whose trigger date is due now or was missed inside the
 * catch-up window. Future milestones are deliberately not enqueued.
 */
export function dueMilestones(
    dueDate: string,
    today: string,
    definitions: readonly MilestoneDefinition[],
    catchUpDays = DEFAULT_CATCH_UP_DAYS,
): DueMilestone[] {
    parseIsoDate(dueDate)
    parseIsoDate(today)
    const earliest = addCalendarDays(today, -Math.max(0, catchUpDays))
    return definitions.flatMap((definition) => {
        const triggerDate = addCalendarDays(dueDate, definition.offsetDays)
        if (triggerDate < earliest || triggerDate > today) return []
        return [{ ...definition, triggerDate }]
    })
}

/**
 * Returns only the most advanced milestone reached so a catch-up run never
 * sends `due`, `overdue2`, and `overdue7` at once. Daily runs still emit every
 * stage over time because each stage has a separate dedupe key.
 */
export function latestReachedMilestone(
    dueDate: string,
    today: string,
    definitions: readonly MilestoneDefinition[],
): DueMilestone | null {
    parseIsoDate(dueDate)
    parseIsoDate(today)
    const reached = definitions
        .map((definition) => ({
            ...definition,
            triggerDate: addCalendarDays(dueDate, definition.offsetDays),
        }))
        .filter((milestone) => milestone.triggerDate <= today)
        .sort((a, b) => a.offsetDays - b.offsetDays)
    return reached.at(-1) ?? null
}

/** Finds the latest missed occurrence without creating an unbounded backlog. */
export function latestRecurrenceOnOrBefore(options: {
    firstDueDate: string
    intervalDays: number
    today: string
}): string {
    const intervalDays = Math.trunc(options.intervalDays)
    if (intervalDays < 1 || intervalDays > 366) {
        throw new Error('intervalDays must be between 1 and 366')
    }
    let cursor = options.firstDueDate
    let guard = 0
    while (addCalendarDays(cursor, intervalDays) <= options.today && guard < 10_000) {
        cursor = addCalendarDays(cursor, intervalDays)
        guard += 1
    }
    if (guard >= 10_000) throw new Error('Recurrence advance limit exceeded')
    return cursor
}

/** Generates bounded recurrence dates, including missed dates for catch-up. */
export function recurrenceDates(options: {
    firstDueDate: string
    intervalDays: number
    today: string
    catchUpDays?: number
    horizonDays?: number
    maxOccurrences?: number
}): string[] {
    const intervalDays = Math.trunc(options.intervalDays)
    if (intervalDays < 1 || intervalDays > 366) {
        throw new Error('intervalDays must be between 1 and 366')
    }
    const catchUpDays = options.catchUpDays ?? DEFAULT_CATCH_UP_DAYS
    const horizonDays = options.horizonDays ?? DEFAULT_PLANNING_HORIZON_DAYS
    const maxOccurrences = options.maxOccurrences ?? 24
    const earliest = addCalendarDays(options.today, -Math.max(0, catchUpDays))
    const latest = addCalendarDays(options.today, Math.max(0, horizonDays))
    const dates: string[] = []
    let cursor = options.firstDueDate

    // Advance very old schedules without materialising an unbounded backlog.
    let guard = 0
    while (cursor < earliest && guard < 10_000) {
        cursor = addCalendarDays(cursor, intervalDays)
        guard += 1
    }
    if (guard >= 10_000) throw new Error('Recurrence advance limit exceeded')

    while (cursor <= latest && dates.length < maxOccurrences) {
        dates.push(cursor)
        cursor = addCalendarDays(cursor, intervalDays)
    }
    return dates
}

/** `completedAttempts` includes the send attempt that just failed. */
export function retryDecision(
    completedAttempts: number,
    now: Date,
    maxAttempts = DEFAULT_MAX_DELIVERY_ATTEMPTS,
): RetryDecision {
    if (completedAttempts >= maxAttempts) return { status: 'dead', availableAt: null }
    const delayIndex = Math.max(0, Math.min(completedAttempts - 1, RETRY_DELAYS_MS.length - 1))
    return {
        status: 'retry',
        availableAt: new Date(now.getTime() + RETRY_DELAYS_MS[delayIndex]).toISOString(),
    }
}

export function parseBooleanEnv(value: string | undefined, fallback = false): boolean {
    if (value === undefined) return fallback
    return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

export function isLowPulseResponse(scores: {
    satisfactionScore: number
    engagementScore: number
    recommendationScore: number
}): boolean {
    return scores.satisfactionScore <= 4
        || scores.engagementScore <= 2
        || scores.recommendationScore <= 4
}

export function clientFeedbackRiskMilestone(riskLevel: string): 'risk_high' | 'risk_critical' | null {
    if (riskLevel === 'critical') return 'risk_critical'
    if (riskLevel === 'high') return 'risk_high'
    return null
}

export function deliveryDedupeKey(parts: Array<string | number | null | undefined>): string {
    return parts.filter((part) => part !== null && part !== undefined && String(part) !== '').join(':')
}
