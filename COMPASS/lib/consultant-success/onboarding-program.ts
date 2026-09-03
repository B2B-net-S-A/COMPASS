// ─── Program telefonów po wejściu do klienta ─────────────────────────────────
// „Po onboardingu TCM dzwoni do konsultanta co dwa tygodnie przez pierwsze
// trzy miesiące" — zapis do programu i wyjście z niego, bez ręcznego klikania
// po kartotekach.
//
// Cała mechanika rozmów już istnieje (planner materializuje check-iny wg
// `check_in_cadence_days`, dispatcher przypomina opiekunowi). Brakowało dwóch
// rzeczy: KTO ma być objęty rytmem co 14 dni i KIEDY ten rytm ma się skończyć.
// Ten moduł odpowiada wyłącznie na te dwa pytania — nie planuje ani nie wysyła.
//
// KTO JEST NA LIŚCIE liczymy `resolveCareSituations`, tą samą regułą, na której
// stoi ekran opieki TCM (People Ops → Opieka). Druga, własna reguła „kto jest
// u klienta" rozjechałaby się z tamtą przy pierwszej poprawce — a rozjazd
// objawiłby się jako telefony do ludzi, których na liście opieki nie ma.
// `bench: []` jest świadome: program dotyczy wejścia DO KLIENTA, a nie czekania
// na projekt.

import 'server-only'

import { logSystemAudit } from '@/lib/audit/system-log'
import {
    resolveCareSituations,
    type CareBenchRow,
    type CareDepartureRow,
    type CareEntryRow,
    type CareSituationInfo,
} from '@/lib/contractors/care-roster'
import { requireRows, type RowsResponse } from '@/lib/supabase/select-in-chunks'
import { addCalendarDays, calendarDayDiff, localDate } from './scheduling'
import type { SuccessAdminClient } from './types'

/** Ile dni po wejściu do klienta trwa zaostrzony rytm. */
export const ONBOARDING_PROGRAM_DAYS = 90
/** Rytm w trakcie programu — „co dwa tygodnie". */
export const ONBOARDING_PROGRAM_CADENCE_DAYS = 14
/** Rytm po programie: opieka trwa, tylko rzadziej. */
export const POST_PROGRAM_CADENCE_DAYS = 30

export interface ProgramSettingRow {
    contractor_id: string
    monitoring_status: 'inactive' | 'active' | 'paused'
    check_in_cadence_days: number
    next_check_in_on: string | null
    onboarding_program_started_on: string | null
    onboarding_program_ends_on: string | null
    onboarding_program_completed_at: string | null
}

export interface ProgramEnrollment {
    contractorId: string
    /** Data wejścia do klienta — zarazem klucz idempotencji zapisu. */
    startedOn: string
    endsOn: string
    nextCheckInOn: string
}

export interface ProgramGraduation {
    contractorId: string
    nextCheckInOn: string
}

export interface OnboardingProgramPlan {
    enrollments: ProgramEnrollment[]
    graduations: ProgramGraduation[]
    /** Ilu konsultantów mieści się dziś w oknie 90 dni — z zapisanymi włącznie. */
    candidatesScanned: number
}

export interface OnboardingProgramStats {
    programCandidates: number
    programEnrolled: number
    programGraduated: number
}

/**
 * Czysta decyzja: kogo zapisać do programu, komu go domknąć.
 *
 * Zapis jest idempotentny po `onboarding_program_started_on`: dopóki data
 * wejścia się nie zmieniła, drugi przebieg nic nie robi. To nie jest
 * optymalizacja — bez tego cron co dobę cofałby ręczne wstrzymanie monitoringu
 * i przestawiałby kadencję ustawioną przez TCM. Przepięcie do NOWEGO klienta
 * zmienia datę wejścia, więc otwiera nowy cykl telefonów. Tak ma być.
 */
export function planOnboardingProgram(input: {
    situations: Map<string, CareSituationInfo>
    settings: readonly ProgramSettingRow[]
    today: string
}): OnboardingProgramPlan {
    const byContractor = new Map(input.settings.map((setting) => [setting.contractor_id, setting]))
    const enrollments: ProgramEnrollment[] = []
    let candidatesScanned = 0

    for (const [contractorId, situation] of input.situations) {
        if (situation.situation !== 'u_klienta') continue
        const startedOn = situation.sinceDate
        if (!startedOn) continue

        // Wejście z przyszłą datą (start zaplanowany) czeka na swój dzień;
        // wejście starsze niż okno programu nie ma już czego dogonić.
        const daysSinceStart = calendarDayDiff(startedOn, input.today)
        if (daysSinceStart < 0 || daysSinceStart >= ONBOARDING_PROGRAM_DAYS) continue
        candidatesScanned += 1

        if (byContractor.get(contractorId)?.onboarding_program_started_on === startedOn) continue

        // Pierwszy telefon nigdy nie ma daty wstecznej. Przy zapisie osób, które
        // weszły do klienta przed wdrożeniem, `start + 14` wypada w przeszłości —
        // planner potraktowałby to jako termin przekroczony i od razu wysłał
        // monit „po terminie" za rozmowę, której nikt nie miał kiedy odbyć.
        const firstCall = addCalendarDays(startedOn, ONBOARDING_PROGRAM_CADENCE_DAYS)
        enrollments.push({
            contractorId,
            startedOn,
            endsOn: addCalendarDays(startedOn, ONBOARDING_PROGRAM_DAYS),
            nextCheckInOn: firstCall > input.today ? firstCall : input.today,
        })
    }

    // Absolutorium: rytm zwalnia do 30 dni, opieka trwa dalej. Stempel
    // `completed_at` jest po to, żeby kolejny przebieg nie nadpisywał kadencji,
    // którą TCM mógł po programie ustawić ręcznie.
    const graduations: ProgramGraduation[] = []
    for (const setting of input.settings) {
        const endsOn = setting.onboarding_program_ends_on
        if (!endsOn || setting.onboarding_program_completed_at) continue
        if (endsOn >= input.today) continue

        // Data zapisana przy zamknięciu ostatniej rozmowy wygrywa, jeśli jest
        // późniejsza — inaczej absolutorium cofałoby ustalony już termin.
        const resumeOn = addCalendarDays(endsOn, POST_PROGRAM_CADENCE_DAYS)
        const scheduled = setting.next_check_in_on
        graduations.push({
            contractorId: setting.contractor_id,
            nextCheckInOn: scheduled && scheduled > resumeOn ? scheduled : resumeOn,
        })
    }

    return { enrollments, graduations, candidatesScanned }
}

/**
 * Wykonuje decyzję na bazie. Wołane z plannera PRZED materializacją check-inów,
 * żeby świeżo zapisana osoba dostała pierwszy termin w tym samym przebiegu.
 */
export async function syncOnboardingProgram(options: {
    admin: SuccessAdminClient
    now: Date
    shadowMode: boolean
}): Promise<OnboardingProgramStats> {
    const { admin, now, shadowMode } = options
    const today = localDate(now)

    const [entriesRes, departuresRes, settingsRes] = await Promise.all([
        admin.from('client_entries')
            .select('contractor_id, client_name, position, start_date')
            .not('contractor_id', 'is', null),
        admin.from('client_departures')
            .select('contractor_id, departure_date')
            .not('contractor_id', 'is', null),
        admin.from('contractor_success_settings')
            .select('contractor_id, monitoring_status, check_in_cadence_days, next_check_in_on, onboarding_program_started_on, onboarding_program_ends_on, onboarding_program_completed_at'),
    ])

    // TREŚĆ — cicha pustka w którymkolwiek źródle znaczy „nikogo nie zapisujemy"
    // i wygląda dokładnie jak spokojny przebieg. Awaria ma być głośna.
    const situations = resolveCareSituations({
        entries: requireRows<CareEntryRow>('client_entries', entriesRes as RowsResponse<CareEntryRow>),
        departures: requireRows<CareDepartureRow>('client_departures', departuresRes as RowsResponse<CareDepartureRow>),
        bench: [] as CareBenchRow[],
    })
    const settings = requireRows<ProgramSettingRow>(
        'contractor_success_settings',
        settingsRes as RowsResponse<ProgramSettingRow>,
    )

    const plan = planOnboardingProgram({ situations, settings, today })
    const stats: OnboardingProgramStats = {
        programCandidates: plan.candidatesScanned,
        programEnrolled: plan.enrollments.length,
        programGraduated: plan.graduations.length,
    }
    if (shadowMode) return stats
    if (plan.enrollments.length === 0 && plan.graduations.length === 0) return stats

    const nowIso = now.toISOString()

    if (plan.enrollments.length > 0) {
        // `upsert` nadpisuje wyłącznie kolumny podane w ładunku, więc zdrowie,
        // ankiety i historia zostają nietknięte. Kadencję resetujemy świadomie:
        // to moment wejścia do NOWEGO klienta, więc rytm liczy się od nowa.
        // `*_by` na null, bo autorem jest automat — para „kiedy/kto" musi
        // pozostać spójna, a podstawienie poprzedniej osoby byłoby nieprawdą.
        const { error } = await admin.from('contractor_success_settings').upsert(
            plan.enrollments.map((enrollment) => ({
                contractor_id: enrollment.contractorId,
                monitoring_status: 'active',
                check_in_cadence_days: ONBOARDING_PROGRAM_CADENCE_DAYS,
                next_check_in_on: enrollment.nextCheckInOn,
                onboarding_program_started_on: enrollment.startedOn,
                onboarding_program_ends_on: enrollment.endsOn,
                onboarding_program_completed_at: null,
                monitoring_started_at: nowIso,
                monitoring_started_by: null,
                monitoring_paused_at: null,
                monitoring_paused_by: null,
                updated_by: null,
                updated_at: nowIso,
            })),
            { onConflict: 'contractor_id' },
        )
        if (error) throw new Error(`onboarding_program_enroll_failed:${error.message}`)
    }

    if (plan.graduations.length > 0) {
        const { error } = await admin.from('contractor_success_settings').upsert(
            plan.graduations.map((graduation) => ({
                contractor_id: graduation.contractorId,
                check_in_cadence_days: POST_PROGRAM_CADENCE_DAYS,
                next_check_in_on: graduation.nextCheckInOn,
                onboarding_program_completed_at: nowIso,
                updated_by: null,
                updated_at: nowIso,
            })),
            { onConflict: 'contractor_id' },
        )
        if (error) throw new Error(`onboarding_program_graduate_failed:${error.message}`)
    }

    // Jeden wpis na przebieg, nie na osobę: przy zapisie kohorty startowej
    // (~80 osób) audyt per konsultant utopiłby dziennik, a diagnostyczna jest
    // i tak liczba. `logSystemAudit`, bo piszemy bez sesji użytkownika.
    await logSystemAudit(null, 'CONSULTANT_SUCCESS_ONBOARDING_PROGRAM_SYNCED', {
        today,
        enrolled: stats.programEnrolled,
        graduated: stats.programGraduated,
        candidates: stats.programCandidates,
    })

    return stats
}
