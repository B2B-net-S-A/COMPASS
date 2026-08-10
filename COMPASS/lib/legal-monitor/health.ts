// Phase 48 — Monitoring prawny: stan bannera + sortowanie skrzynki (czyste, bez I/O).
//
// Pipeline dopisuje jeden wiersz do `legal_monitor_runs` na KAŻDY przebieg (także
// pusty), więc brak świeżego wiersza jest jedynym sygnałem „monitoring nie
// odpowiada". Cała logika `now`/świąt jest wstrzykiwana, żeby dało się ją
// przetestować bez zegara i bazy.

import { addDays, eachDayOfInterval, format, parseISO } from 'date-fns'
import { isWorkingDay, type PublicHolidayDate } from '../hr/working-days'
import { warsawDate } from '../oof/oof-dates'
import {
    SEVERITY_RANK,
    type LegalMonitorItemRow,
    type LegalMonitorRunRow,
    type LegalMonitorSource,
    type LegalMonitorSourceHealth,
} from '../types/legal-monitor'

/** Świeży przebieg wg specyfikacji: ostatni `run_at` młodszy niż 26 h. */
export const STALE_AFTER_HOURS = 26

/**
 * Godzina (czas warszawski), od której uznajemy, że DZISIEJSZY przebieg powinien
 * już być. Cron chodzi ~7:30 (zimą 6:30), więc do 10:00 brak wpisu z dzisiaj to
 * normalka, nie awaria.
 */
export const EXPECTED_BY_HOUR_WARSAW = 10

const MS_PER_HOUR = 3_600_000

export type MonitorHealthState =
    /** Świeży przebieg, wszystkie źródła odpowiedziały. */
    | 'ok'
    /** Świeży przebieg, ale część źródeł padła. */
    | 'partial'
    /** Świeży przebieg zakończony niepowodzeniem. */
    | 'failed'
    /** Minął dzień roboczy bez przebiegu — monitoring nie odpowiada. */
    | 'stale'
    /** Nie ma jeszcze ani jednego przebiegu. */
    | 'never'

export type MonitorHealthTone = 'success' | 'warning' | 'danger'

export interface MonitorHealth {
    state: MonitorHealthState
    tone: MonitorHealthTone
    /** ISO ostatniego przebiegu; null gdy nigdy nie było. */
    lastRunAt: string | null
    /** Wiek ostatniego przebiegu w godzinach (zaokrąglony w dół); null gdy brak. */
    ageHours: number | null
    /** Dni robocze bez przebiegu (0 gdy monitoring nadąża). */
    missedWorkingDays: number
    /** Źródła ze statusem `fail` w ostatnim przebiegu. */
    failedSources: LegalMonitorSource[]
    itemsFound: number | null
    notes: string | null
}

export interface MonitorHealthInput {
    /** Najświeższy wiersz z `legal_monitor_runs` (null gdy tabela pusta). */
    lastRun: Pick<
        LegalMonitorRunRow,
        'run_at' | 'status' | 'items_found' | 'sources_checked' | 'notes'
    > | null
    now: Date
    holidays: ReadonlyArray<PublicHolidayDate>
}

function warsawHour(d: Date): number {
    const hh = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Warsaw',
        hour: '2-digit',
        hourCycle: 'h23',
    }).format(d)
    return Number.parseInt(hh, 10)
}

function failedSourcesOf(
    sources: Partial<Record<LegalMonitorSource, LegalMonitorSourceHealth>> | null | undefined,
): LegalMonitorSource[] {
    if (!sources || typeof sources !== 'object') return []
    return (Object.entries(sources) as Array<[LegalMonitorSource, LegalMonitorSourceHealth]>)
        .filter(([, health]) => health === 'fail')
        .map(([source]) => source)
}

/**
 * Ile dni roboczych minęło od ostatniego przebiegu BEZ nowego wpisu.
 *
 * Liczymy dni robocze ściśle PO dacie ostatniego przebiegu, do dzisiaj włącznie —
 * przy czym dzisiaj wlicza się dopiero po `EXPECTED_BY_HOUR_WARSAW`. Dzięki temu
 * przebieg z piątku nie alarmuje przez weekend ani w poniedziałek rano, a brak
 * wpisu w poniedziałek po 10:00 już tak. Święta z `public_holidays` nie liczą się
 * jako dni robocze (pipeline wtedy nie chodzi).
 */
export function missedWorkingDaysSince(
    lastRunAt: Date,
    now: Date,
    holidays: ReadonlyArray<PublicHolidayDate>,
): number {
    const lastISO = warsawDate(lastRunAt)
    const todayISO = warsawDate(now)
    if (todayISO <= lastISO) return 0

    const from = addDays(parseISO(lastISO), 1)
    const to = parseISO(todayISO)
    if (to < from) return 0

    const includeToday = warsawHour(now) >= EXPECTED_BY_HOUR_WARSAW
    return eachDayOfInterval({ start: from, end: to }).filter((day) => {
        const iso = format(day, 'yyyy-MM-dd')
        if (iso === todayISO && !includeToday) return false
        return isWorkingDay(day, holidays)
    }).length
}

/**
 * Stan monitoringu do bannera. Kolejność decyzji: brak przebiegu → zaległość →
 * status ostatniego przebiegu. Zaległość wygrywa nad `partial`, bo „nie chodzi
 * wcale" jest większym problemem niż „jedno źródło padło".
 */
export function computeMonitorHealth({ lastRun, now, holidays }: MonitorHealthInput): MonitorHealth {
    if (!lastRun) {
        return {
            state: 'never',
            tone: 'warning',
            lastRunAt: null,
            ageHours: null,
            missedWorkingDays: 0,
            failedSources: [],
            itemsFound: null,
            notes: null,
        }
    }

    const runAt = new Date(lastRun.run_at)
    const ageHours = Math.max(0, Math.floor((now.getTime() - runAt.getTime()) / MS_PER_HOUR))
    const missedWorkingDays = missedWorkingDaysSince(runAt, now, holidays)
    const failedSources = failedSourcesOf(lastRun.sources_checked)
    const base = {
        lastRunAt: lastRun.run_at,
        ageHours,
        missedWorkingDays,
        failedSources,
        itemsFound: lastRun.items_found,
        notes: lastRun.notes,
    }

    // Zaległość wymaga OBU warunków: przekroczonego progu 26 h i realnie
    // pominiętego dnia roboczego. Sam próg alarmowałby po każdym długim weekendzie.
    if (ageHours > STALE_AFTER_HOURS && missedWorkingDays >= 1) {
        return { ...base, state: 'stale', tone: 'danger' }
    }

    if (lastRun.status === 'failed') return { ...base, state: 'failed', tone: 'danger' }
    if (lastRun.status === 'partial') return { ...base, state: 'partial', tone: 'warning' }
    return { ...base, state: 'ok', tone: 'success' }
}

/**
 * Kolejność skrzynki ze specyfikacji: najpierw pilność (red → yellow → green),
 * potem najświeższe wg daty dokumentu, a gdy jej brak — wg daty dopisania.
 * `id` jako ostatni tie-break, żeby kolejność była deterministyczna.
 */
export function sortItemsForReview<
    T extends Pick<LegalMonitorItemRow, 'id' | 'severity' | 'published_at' | 'created_at'>,
>(items: ReadonlyArray<T>): T[] {
    return [...items].sort((a, b) => {
        const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
        if (bySeverity !== 0) return bySeverity
        const dateA = a.published_at ?? a.created_at.slice(0, 10)
        const dateB = b.published_at ?? b.created_at.slice(0, 10)
        if (dateA !== dateB) return dateA < dateB ? 1 : -1
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    })
}
