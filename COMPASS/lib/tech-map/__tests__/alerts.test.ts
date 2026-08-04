import { describe, expect, it } from 'vitest'

import {
    parseRecipientCsv,
    projectEndDeadline,
    selectProjectEndAlerts,
    type ProjectEndCard,
} from '@/lib/tech-map/alert-selection'

const TODAY = '2026-08-04'

const card = (over: Partial<ProjectEndCard> = {}): ProjectEndCard => ({
    id: 'c1',
    contractor_id: 'k1',
    interview_date: '2026-08-01',
    project_end_month: null,
    project_end_year: null,
    project_end_alerted_at: null,
    ...over,
})

describe('parseRecipientCsv', () => {
    const A = '11111111-1111-4111-8111-111111111111'
    const B = '22222222-2222-4222-8222-222222222222'

    it('parsuje listę UUID, trymuje i deduplikuje', () => {
        expect(parseRecipientCsv(` ${A}, ${B} ,${A}`)).toEqual([A, B])
    })

    it('odsiewa nie-UUID i puste tokeny', () => {
        expect(parseRecipientCsv(`${A},,not-a-uuid,`)).toEqual([A])
    })

    it('null/pusty → pusta lista', () => {
        expect(parseRecipientCsv(null)).toEqual([])
        expect(parseRecipientCsv('')).toEqual([])
        expect(parseRecipientCsv('   ')).toEqual([])
    })
})

describe('projectEndDeadline', () => {
    it('zwraca ostatni dzień miesiąca', () => {
        expect(projectEndDeadline(2026, 2)).toBe('2026-02-28')
        expect(projectEndDeadline(2028, 2)).toBe('2028-02-29') // rok przestępny
        expect(projectEndDeadline(2026, 12)).toBe('2026-12-31')
        expect(projectEndDeadline(2026, 9)).toBe('2026-09-30')
    })
})

describe('selectProjectEndAlerts', () => {
    it('alarmuje o deadline w oknie 60 dni', () => {
        const alerts = selectProjectEndAlerts(
            [card({ project_end_month: 9, project_end_year: 2026 })], // 2026-09-30, ~57 dni
            TODAY,
            60,
        )
        expect(alerts).toEqual([{ cardId: 'c1', contractorId: 'k1', deadline: '2026-09-30' }])
    })

    it('pomija deadline poza oknem (za daleko)', () => {
        const alerts = selectProjectEndAlerts(
            [card({ project_end_month: 12, project_end_year: 2026 })], // 2026-12-31, >60 dni
            TODAY,
            60,
        )
        expect(alerts).toEqual([])
    })

    it('pomija deadline z przeszłości', () => {
        const alerts = selectProjectEndAlerts(
            [card({ project_end_month: 7, project_end_year: 2026 })], // 2026-07-31, minął
            TODAY,
            60,
        )
        expect(alerts).toEqual([])
    })

    it('pomija już zaalarmowane (dedup)', () => {
        const alerts = selectProjectEndAlerts(
            [
                card({
                    project_end_month: 9,
                    project_end_year: 2026,
                    project_end_alerted_at: '2026-08-01T10:00:00Z',
                }),
            ],
            TODAY,
            60,
        )
        expect(alerts).toEqual([])
    })

    it('pomija karty bez daty końca', () => {
        expect(selectProjectEndAlerts([card()], TODAY, 60)).toEqual([])
    })

    it('bierze TYLKO najnowszą kartę per kontraktor', () => {
        // Starsza karta ma deadline w oknie, nowsza — poza. Liczy się nowsza → brak alertu.
        const alerts = selectProjectEndAlerts(
            [
                card({ id: 'old', interview_date: '2026-05-01', project_end_month: 9, project_end_year: 2026 }),
                card({ id: 'new', interview_date: '2026-08-01', project_end_month: 12, project_end_year: 2026 }),
            ],
            TODAY,
            60,
        )
        expect(alerts).toEqual([])
    })

    it('nowsza karta w oknie wygrywa nad starszą poza oknem', () => {
        const alerts = selectProjectEndAlerts(
            [
                card({ id: 'old', interview_date: '2026-05-01', project_end_month: 12, project_end_year: 2026 }),
                card({ id: 'new', interview_date: '2026-08-01', project_end_month: 9, project_end_year: 2026 }),
            ],
            TODAY,
            60,
        )
        expect(alerts.map((a) => a.cardId)).toEqual(['new'])
    })

    it('różni kontraktorzy są niezależni', () => {
        const alerts = selectProjectEndAlerts(
            [
                card({ id: 'a', contractor_id: 'k1', project_end_month: 9, project_end_year: 2026 }),
                card({ id: 'b', contractor_id: 'k2', project_end_month: 9, project_end_year: 2026 }),
            ],
            TODAY,
            60,
        )
        expect(alerts.map((a) => a.contractorId).sort()).toEqual(['k1', 'k2'])
    })
})
