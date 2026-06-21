'use server'

// People Ops — zunifikowany moduł people-ops (plan: docs/people-ops-unify-plan.md).
// Increment 1: north-star KPI dla Pulpitu, liczone BEZPOŚREDNIO z tabel źródła prawdy
// (legacy onboarding_progress / exit_interviews + contractor_*_interviews / placements /
// client_departures), z pominięciem read-modelu Fazy 37 — krytyka wykazała ryzyko driftu
// mirrora (SECURITY DEFINER + swallow errors, bez reconcile).
//
// Korekty z adwersarialnej krytyki (na żywych danych prod 2026-06-21):
//   - "zrobione" liczone WYŁĄCZNIE po submitted_at/completed_at + status, NIGDY przez person_id
//     (NULL person_id ≠ anonim — w prodzie jest scheduled exit z user_id NULL i is_anonymous=FALSE).
//   - emp-exit-due liczony po termination_date (intencja) ORAZ scheduled_for (fallback), bo
//     termination_date jest dziś NULL u 100% pracowników → UI pokazuje oba i sygnalizuje brak.
//   - ctr-exit: "internalizacja" (konwersja kontraktor→pracownik) wyłączona z odejść i liczona
//     osobno; departures vs interviews to DWIE niezależne liczby (brak FK), nie ratio.
//   - empty-state ≠ error-state: zwracamy latestActivityMonth, by 0/0 dało się odróżnić od „brak danych".

import { createLifecycleAdminClient } from '@/lib/supabase/lifecycle-client'
import { requireTalentCommunityOrAdminAction } from '@/lib/auth/internal-guard'
import { logger } from '@/lib/logger'

export interface DueDone {
    due: number
    done: number
}

export interface PeopleOpsMonthlySummary {
    year: number
    month: number // 1-12
    onboarding: {
        employee: DueDone
        contractor: { due: number; done: number; cancelled: number }
    }
    exit: {
        // dueByTermination = intencja (profiles.termination_date); dueByScheduled = fallback (exit_interviews.scheduled_for)
        employee: { dueByTermination: number; dueByScheduled: number; done: number }
        // departures (raw) − conversions (internalizacja) = realne odejścia; done = złożone wywiady (niezależnie)
        contractor: { departures: number; conversions: number; done: number }
    }
    cases: { open: number; unassigned: number } // bieżące sprawy: rodziny inbox_% + contractor_%, status NOT closed/resolved
    hasAnyData: boolean
    latestActivityMonth: { year: number; month: number } | null
    attention: {
        offboardingWithoutTerminationDate: number
        departuresWithoutDate: number
        hrProfilesWithoutHiredAt: number
        activeOnboardingsInTable: number // reconcile: vs employment_status (dziś wszyscy 'active')
        scheduledExitsInTable: number
    }
}

const HR_ZONE_ROLES = ['admin', 'internal', 'finanse', 'manager', 'talent_community'] as const
const OPEN_STATUSES = ['open', 'in_progress', 'waiting_user'] as const

function pad2(n: number): string {
    return String(n).padStart(2, '0')
}

function monthBounds(year: number, month: number): { start: string; end: string } {
    const start = `${year}-${pad2(month)}-01`
    const ny = month === 12 ? year + 1 : year
    const nm = month === 12 ? 1 : month + 1
    const end = `${ny}-${pad2(nm)}-01`
    return { start, end }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readCount(qb: any): Promise<number> {
    const { count, error } = await qb
    if (error) throw new Error(error.message)
    return count ?? 0
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function maxDate(db: any, table: string, col: string): Promise<string | null> {
    const { data, error } = await db
        .from(table)
        .select(col)
        .not(col, 'is', null)
        .order(col, { ascending: false })
        .limit(1)
    if (error) throw new Error(error.message)
    return data?.[0]?.[col] ?? null
}

function monthFromDateString(d: string | null): { year: number; month: number } | null {
    if (!d) return null
    const parsed = new Date(d)
    if (Number.isNaN(parsed.getTime())) return null
    return { year: parsed.getUTCFullYear(), month: parsed.getUTCMonth() + 1 }
}

/**
 * North-star KPI dla danego miesiąca. Obie populacje (pracownicy wewnętrzni + kontraktorzy).
 * Guard: admin lub Talent Community Manager. Liczy service-rolem (po guardzie) dla spójnych
 * liczb niezależnie od RLS wołającego.
 */
export async function getPeopleOpsMonthlySummary(
    year: number,
    month: number,
): Promise<PeopleOpsMonthlySummary> {
    await requireTalentCommunityOrAdminAction()
    const db = createLifecycleAdminClient()
    const { start, end } = monthBounds(year, month)

    try {
        const inWindow = (qb: ReturnType<typeof db.from>, col: string) =>
            qb.gte(col, start).lt(col, end)

        const [
            empOnbDue,
            empOnbDone,
            ctrOnbDue,
            ctrOnbCancelled,
            ctrOnbDone,
            empExitDueTerm,
            empExitDueSched,
            empExitDone,
            ctrDepartures,
            ctrConversions,
            ctrExitDone,
            offboardingNoTerm,
            departuresNoDate,
            hrNoHiredAt,
            activeOnboardings,
            scheduledExits,
            categories,
            latestPlacement,
            latestDeparture,
            latestOnbDone,
            latestExitDone,
        ] = await Promise.all([
            // --- ONBOARDING ---
            readCount(inWindow(db.from('profiles').select('id', { count: 'exact', head: true }), 'hired_at')),
            readCount(inWindow(db.from('onboarding_progress').select('id', { count: 'exact', head: true }), 'completed_at')),
            readCount(inWindow(db.from('placements').select('id', { count: 'exact', head: true }), 'start_date').neq('status', 'cancelled')),
            readCount(inWindow(db.from('placements').select('id', { count: 'exact', head: true }), 'start_date').eq('status', 'cancelled')),
            readCount(inWindow(db.from('contractor_onboarding_interviews').select('id', { count: 'exact', head: true }), 'submitted_at')),
            // --- EXIT ---
            readCount(inWindow(db.from('profiles').select('id', { count: 'exact', head: true }), 'termination_date')),
            readCount(inWindow(db.from('exit_interviews').select('id', { count: 'exact', head: true }), 'scheduled_for')),
            readCount(inWindow(db.from('exit_interviews').select('id', { count: 'exact', head: true }), 'submitted_at').in('status', ['submitted', 'reviewed', 'archived'])),
            readCount(inWindow(db.from('client_departures').select('id', { count: 'exact', head: true }), 'departure_date')),
            readCount(inWindow(db.from('client_departures').select('id', { count: 'exact', head: true }), 'departure_date').eq('who_resigned', 'internalizacja')),
            readCount(inWindow(db.from('contractor_exit_interviews').select('id', { count: 'exact', head: true }), 'submitted_at')),
            // --- ATTENTION / DATA QUALITY ---
            readCount(db.from('profiles').select('id', { count: 'exact', head: true }).eq('employment_status', 'offboarding').is('termination_date', null)),
            readCount(db.from('client_departures').select('id', { count: 'exact', head: true }).is('departure_date', null)),
            readCount(db.from('profiles').select('id', { count: 'exact', head: true }).is('hired_at', null).in('role', HR_ZONE_ROLES as unknown as string[]).neq('employment_status', 'exited')),
            readCount(db.from('onboarding_progress').select('id', { count: 'exact', head: true }).is('completed_at', null).is('cancelled_at', null)),
            readCount(db.from('exit_interviews').select('id', { count: 'exact', head: true }).eq('status', 'scheduled')),
            // --- KANBAN families ---
            db.from('support_categories').select('id,slug'),
            // --- latest activity (empty-vs-broken) ---
            maxDate(db, 'placements', 'start_date'),
            maxDate(db, 'client_departures', 'departure_date'),
            maxDate(db, 'onboarding_progress', 'completed_at'),
            maxDate(db, 'exit_interviews', 'submitted_at'),
        ])

        // Bieżące sprawy: rodziny inbox_% + contractor_%, status otwarty.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const caseCategoryIds: string[] = (categories.data ?? [])
            .filter((c: { slug: string }) => c.slug.startsWith('inbox_') || c.slug.startsWith('contractor_'))
            .map((c: { id: string }) => c.id)

        let casesOpen = 0
        let casesUnassigned = 0
        if (caseCategoryIds.length > 0) {
            ;[casesOpen, casesUnassigned] = await Promise.all([
                readCount(db.from('support_tickets').select('id', { count: 'exact', head: true }).in('category_id', caseCategoryIds).in('status', OPEN_STATUSES as unknown as string[])),
                readCount(db.from('support_tickets').select('id', { count: 'exact', head: true }).in('category_id', caseCategoryIds).in('status', OPEN_STATUSES as unknown as string[]).is('assignee_id', null)),
            ])
        }

        const hasAnyData =
            empOnbDue + empOnbDone + ctrOnbDue + ctrOnbDone + empExitDueTerm + empExitDueSched + empExitDone + ctrDepartures + ctrExitDone > 0

        const latestCandidates = [latestPlacement, latestDeparture, latestOnbDone, latestExitDone]
            .filter((d): d is string => !!d)
            .sort()
        const latestActivityMonth = monthFromDateString(latestCandidates.length > 0 ? latestCandidates[latestCandidates.length - 1] : null)

        return {
            year,
            month,
            onboarding: {
                employee: { due: empOnbDue, done: empOnbDone },
                contractor: { due: ctrOnbDue, done: ctrOnbDone, cancelled: ctrOnbCancelled },
            },
            exit: {
                employee: { dueByTermination: empExitDueTerm, dueByScheduled: empExitDueSched, done: empExitDone },
                contractor: { departures: ctrDepartures, conversions: ctrConversions, done: ctrExitDone },
            },
            cases: { open: casesOpen, unassigned: casesUnassigned },
            hasAnyData,
            latestActivityMonth,
            attention: {
                offboardingWithoutTerminationDate: offboardingNoTerm,
                departuresWithoutDate: departuresNoDate,
                hrProfilesWithoutHiredAt: hrNoHiredAt,
                activeOnboardingsInTable: activeOnboardings,
                scheduledExitsInTable: scheduledExits,
            },
        }
    } catch (err) {
        logger.error({ event: 'people_ops.monthly_summary_failed', error: err, year, month })
        throw err instanceof Error ? err : new Error('Nie udało się policzyć podsumowania People Ops.')
    }
}
