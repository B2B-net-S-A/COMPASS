import { describe, expect, it } from 'vitest'

import { resolveCareSituations, type CareBenchRow, type CareDepartureRow, type CareEntryRow } from '@/lib/contractors/care-roster'
import {
    ONBOARDING_PROGRAM_CADENCE_DAYS,
    POST_PROGRAM_CADENCE_DAYS,
    planOnboardingProgram,
    type ProgramSettingRow,
} from '../onboarding-program'
import { addCalendarDays } from '../scheduling'

const TODAY = '2026-09-03'
const daysAgo = (days: number) => addCalendarDays(TODAY, -days)

function entry(contractorId: string, startDate: string | null): CareEntryRow {
    return { contractor_id: contractorId, client_name: 'Nordea', position: 'Java Developer', start_date: startDate }
}

function departure(contractorId: string, departureDate: string): CareDepartureRow {
    return { contractor_id: contractorId, departure_date: departureDate }
}

function bench(contractorId: string, departureDate: string): CareBenchRow {
    return { contractor_id: contractorId, client_name: 'Nordea', role: 'Java Developer', departure_date: departureDate, status: 'w_rekrutacji' }
}

function setting(overrides: Partial<ProgramSettingRow> & { contractor_id: string }): ProgramSettingRow {
    return {
        monitoring_status: 'inactive',
        check_in_cadence_days: 30,
        next_check_in_on: null,
        onboarding_program_started_on: null,
        onboarding_program_ends_on: null,
        onboarding_program_completed_at: null,
        ...overrides,
    }
}

function planFor(input: {
    entries?: CareEntryRow[]
    departures?: CareDepartureRow[]
    bench?: CareBenchRow[]
    settings?: ProgramSettingRow[]
}) {
    return planOnboardingProgram({
        situations: resolveCareSituations({
            entries: input.entries ?? [],
            departures: input.departures ?? [],
            // Program dotyczy wejścia do klienta — plan nigdy nie dostaje ławki.
            bench: [],
        }),
        settings: input.settings ?? [],
        today: TODAY,
    })
}

describe('planOnboardingProgram — zapis do programu', () => {
    it('zapisuje osobę świeżo po wejściu do klienta: pierwszy telefon w 14. dniu, koniec w 90.', () => {
        const plan = planFor({ entries: [entry('c1', '2026-08-31')] })

        expect(plan.enrollments).toEqual([{
            contractorId: 'c1',
            startedOn: '2026-08-31',
            endsOn: '2026-11-29',
            nextCheckInOn: '2026-09-14',
            monitoringStatus: 'active',
        }])
    })

    it('przy zapisie wstecznym stawia pierwszy telefon na DZIŚ, nie na przekroczony termin', () => {
        const startedOn = daysAgo(40)

        const plan = planFor({ entries: [entry('c1', startedOn)] })

        expect(plan.enrollments[0].nextCheckInOn).toBe(TODAY)
        expect(plan.enrollments[0].endsOn).toBe(addCalendarDays(startedOn, 90))
    })

    it('nie zapisuje drugi raz tego samego wejścia — ręczne wstrzymanie zostaje wstrzymane', () => {
        const startedOn = daysAgo(20)

        const plan = planFor({
            entries: [entry('c1', startedOn)],
            settings: [setting({
                contractor_id: 'c1',
                monitoring_status: 'paused',
                onboarding_program_started_on: startedOn,
                onboarding_program_ends_on: addCalendarDays(startedOn, 90),
            })],
        })

        expect(plan.enrollments).toEqual([])
        // Nadal liczy się do kohorty — „zero zapisów" ma znaczyć „nikt nowy",
        // a nie „nikogo nie ma".
        expect(plan.candidatesScanned).toBe(1)
    })

    it('otwiera nowy cykl po przepięciu do innego klienta', () => {
        const poprzednieWejscie = daysAgo(200)
        const noweWejscie = daysAgo(5)

        const plan = planFor({
            entries: [entry('c1', poprzednieWejscie), entry('c1', noweWejscie)],
            departures: [departure('c1', daysAgo(10))],
            settings: [setting({
                contractor_id: 'c1',
                onboarding_program_started_on: poprzednieWejscie,
                onboarding_program_ends_on: addCalendarDays(poprzednieWejscie, 90),
                onboarding_program_completed_at: '2026-03-01T00:00:00.000Z',
            })],
        })

        expect(plan.enrollments).toEqual([{
            contractorId: 'c1',
            startedOn: noweWejscie,
            endsOn: addCalendarDays(noweWejscie, 90),
            nextCheckInOn: addCalendarDays(noweWejscie, ONBOARDING_PROGRAM_CADENCE_DAYS),
            monitoringStatus: 'active',
        }])
    })

    it('nie wznawia monitoringu wstrzymanego ręcznie — nawet przy nowym kliencie', () => {
        const noweWejscie = daysAgo(5)

        const plan = planFor({
            entries: [entry('c1', noweWejscie)],
            settings: [setting({
                contractor_id: 'c1',
                monitoring_status: 'paused',
                onboarding_program_started_on: daysAgo(300),
                onboarding_program_ends_on: daysAgo(210),
                onboarding_program_completed_at: '2026-02-01T00:00:00.000Z',
            })],
        })

        // Okno programu ustawiamy mimo wszystko: gdy TCM odwiesi kontakt, rytm
        // ma być gotowy. Czego nie robimy, to wznowienia wysyłki za człowieka.
        expect(plan.enrollments).toHaveLength(1)
        expect(plan.enrollments[0].monitoringStatus).toBe('paused')
        expect(plan.enrollments[0].startedOn).toBe(noweWejscie)
    })

    it('wychodzi ze stanu domyślnego importu (`inactive`) na `active`', () => {
        const plan = planFor({
            entries: [entry('c1', daysAgo(5))],
            settings: [setting({ contractor_id: 'c1', monitoring_status: 'inactive' })],
        })

        expect(plan.enrollments[0].monitoringStatus).toBe('active')
    })

    it('pomija wejście starsze niż okno programu', () => {
        expect(planFor({ entries: [entry('c1', daysAgo(90))] }).enrollments).toEqual([])
        expect(planFor({ entries: [entry('c1', daysAgo(91))] }).candidatesScanned).toBe(0)
        expect(planFor({ entries: [entry('c1', daysAgo(89))] }).enrollments).toHaveLength(1)
    })

    it('pomija start zaplanowany w przyszłości', () => {
        const plan = planFor({ entries: [entry('c1', addCalendarDays(TODAY, 7))] })

        expect(plan.enrollments).toEqual([])
        expect(plan.candidatesScanned).toBe(0)
    })

    it('pomija osobę, która zeszła z projektu', () => {
        const plan = planFor({
            entries: [entry('c1', daysAgo(30))],
            departures: [departure('c1', daysAgo(2))],
        })

        expect(plan.enrollments).toEqual([])
    })

    it('pomija osobę na ławce — program dotyczy wejścia do klienta', () => {
        const plan = planOnboardingProgram({
            situations: resolveCareSituations({ entries: [], departures: [], bench: [bench('c1', daysAgo(10))] }),
            settings: [],
            today: TODAY,
        })

        expect(plan.enrollments).toEqual([])
    })

    it('pomija wejście bez daty — nie ma od czego liczyć rytmu', () => {
        expect(planFor({ entries: [entry('c1', null)] }).enrollments).toEqual([])
    })
})

describe('planOnboardingProgram — absolutorium po 90 dniach', () => {
    it('zwalnia rytm do 30 dni i wyznacza termin 30 dni po końcu programu', () => {
        const plan = planFor({
            settings: [setting({
                contractor_id: 'c1',
                monitoring_status: 'active',
                check_in_cadence_days: 14,
                next_check_in_on: '2026-08-20',
                onboarding_program_started_on: '2026-06-04',
                onboarding_program_ends_on: '2026-09-02',
            })],
        })

        expect(plan.graduations).toEqual([{ contractorId: 'c1', nextCheckInOn: '2026-10-02' }])
        expect(addCalendarDays('2026-09-02', POST_PROGRAM_CADENCE_DAYS)).toBe('2026-10-02')
    })

    it('nie cofa terminu ustalonego przy zamknięciu ostatniej rozmowy', () => {
        const plan = planFor({
            settings: [setting({
                contractor_id: 'c1',
                monitoring_status: 'active',
                check_in_cadence_days: 14,
                next_check_in_on: '2026-11-15',
                onboarding_program_started_on: '2026-06-04',
                onboarding_program_ends_on: '2026-09-02',
            })],
        })

        expect(plan.graduations[0].nextCheckInOn).toBe('2026-11-15')
    })

    it('nie domyka programu drugi raz — kadencja ustawiona ręcznie po programie zostaje', () => {
        const plan = planFor({
            settings: [setting({
                contractor_id: 'c1',
                monitoring_status: 'active',
                check_in_cadence_days: 7,
                onboarding_program_started_on: '2026-06-04',
                onboarding_program_ends_on: '2026-09-02',
                onboarding_program_completed_at: '2026-09-03T04:10:00.000Z',
            })],
        })

        expect(plan.graduations).toEqual([])
    })

    it('nie domyka programu, który jeszcze trwa — także w ostatnim jego dniu', () => {
        const plan = planFor({
            settings: [setting({
                contractor_id: 'c1',
                monitoring_status: 'active',
                check_in_cadence_days: 14,
                onboarding_program_started_on: daysAgo(60),
                onboarding_program_ends_on: TODAY,
            })],
        })

        expect(plan.graduations).toEqual([])
    })
})
