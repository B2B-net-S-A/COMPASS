import type { AcademyRunDTO } from '@/lib/types/academy-sessions'

export interface CatalogNextRun { runId: string; title: string; startsAt: string; timeZone: string; full: boolean }

export function getCatalogNextRuns(runs: AcademyRunDTO[], now: string): Record<string, CatalogNextRun> {
    const result: Record<string, CatalogNextRun> = {}
    for (const run of runs) {
        if (run.status !== 'published') continue
        // Registration closes when the first session starts, including mixed programmes.
        const first = run.sessions.filter((session) => session.status !== 'cancelled')
            .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))[0]
        if (!first || Date.parse(first.startsAt) <= Date.parse(now)) continue
        if (result[run.courseId] && Date.parse(result[run.courseId].startsAt) <= Date.parse(first.startsAt)) continue
        result[run.courseId] = { runId: run.id, title: run.title, startsAt: first.startsAt, timeZone: first.timeZone, full: run.confirmedCount >= run.capacity }
    }
    return result
}
