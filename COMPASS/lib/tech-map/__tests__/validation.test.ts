import { describe, expect, it } from 'vitest'

import { CARD_TITLE_MAX, type CardInput } from '@/lib/types/tech-map'
import { validateCardBase, validateCardForFinalize } from '@/lib/tech-map/validation'

const TODAY = '2026-08-03'

const card = (over: Partial<CardInput> = {}): CardInput => ({
    contractorId: 'c-1',
    clientId: 'k-1',
    clientAreaId: null,
    title: null,
    interviewDate: '2026-08-01',
    status: 'ok',
    satisfaction: 4,
    satisfactionComment: null,
    projectEndMonth: 12,
    projectEndYear: 2026,
    projectEndUnknown: false,
    hiring: false,
    hiringRoles: [],
    hiringSource: null,
    memorableQuote: null,
    techOldNew: null,
    teamSize: null,
    teamExternals: null,
    vendorsNote: null,
    technologyIds: [],
    vendorIds: [],
    initiatives: [],
    ...over,
})

describe('validateCardBase', () => {
    it('kompletna karta przechodzi bez błędów', () => {
        expect(validateCardBase(card())).toEqual([])
    })

    it('brak konsultanta, klienta i daty zgłasza trzy błędy', () => {
        const errors = validateCardBase(
            card({ contractorId: '', clientId: '', interviewDate: '' }),
        )
        expect(errors).toHaveLength(3)
    })

    it('team_size dokładnie 80 znaków przechodzi', () => {
        expect(validateCardBase(card({ teamSize: 'x'.repeat(80) }))).toEqual([])
    })

    it('team_size powyżej 80 znaków zgłasza błąd', () => {
        const errors = validateCardBase(card({ teamSize: 'x'.repeat(81) }))
        expect(errors.some((e) => e.includes('Wielkość zespołu'))).toBe(true)
    })

    it('team_size z nadmiarowymi spacjami mieści się po trim (80 znaków treści)', () => {
        expect(validateCardBase(card({ teamSize: `  ${'x'.repeat(80)}  ` }))).toEqual([])
    })

    it('tytuł jest opcjonalny — brak i pusty przechodzą', () => {
        expect(validateCardBase(card({ title: null }))).toEqual([])
        expect(validateCardBase(card({ title: '   ' }))).toEqual([])
    })

    it('tytuł dokładnie 120 znaków przechodzi', () => {
        expect(validateCardBase(card({ title: 'x'.repeat(CARD_TITLE_MAX) }))).toEqual([])
    })

    it('tytuł powyżej 120 znaków zgłasza błąd (limit z CHECK-a w DB)', () => {
        const errors = validateCardBase(card({ title: 'x'.repeat(CARD_TITLE_MAX + 1) }))
        expect(errors.some((e) => e.includes('Tytuł rozmowy'))).toBe(true)
    })
})

describe('validateCardForFinalize', () => {
    it('pełna karta OK przechodzi', () => {
        expect(validateCardForFinalize(card(), TODAY)).toEqual([])
    })

    it('brak statusu blokuje finalizację', () => {
        const errors = validateCardForFinalize(card({ status: null }), TODAY)
        expect(errors.some((e) => e.includes('Status rozmowy'))).toBe(true)
    })

    it('data rozmowy w przyszłości blokuje finalizację', () => {
        const errors = validateCardForFinalize(card({ interviewDate: '2026-08-04' }), TODAY)
        expect(errors.some((e) => e.includes('przyszłości'))).toBe(true)
    })

    it('odmowa nie wymaga końca projektu ani odpowiedzi o rekrutacji', () => {
        const errors = validateCardForFinalize(
            card({
                status: 'odmowa',
                projectEndMonth: null,
                projectEndYear: null,
                projectEndUnknown: false,
                hiring: null,
                satisfaction: null,
            }),
            TODAY,
        )
        expect(errors).toEqual([])
    })

    it('brak_czasu również luzuje wymagania bloku A', () => {
        const errors = validateCardForFinalize(
            card({
                status: 'brak_czasu',
                projectEndMonth: null,
                projectEndYear: null,
                hiring: null,
                satisfaction: null,
            }),
            TODAY,
        )
        expect(errors).toEqual([])
    })

    it('OK bez końca projektu i bez „nie wie" zgłasza błąd', () => {
        const errors = validateCardForFinalize(
            card({ projectEndMonth: null, projectEndYear: null, projectEndUnknown: false }),
            TODAY,
        )
        expect(errors.some((e) => e.includes('Koniec projektu'))).toBe(true)
    })

    it('OK z „nie wie" zamiast daty przechodzi', () => {
        const errors = validateCardForFinalize(
            card({ projectEndMonth: null, projectEndYear: null, projectEndUnknown: true }),
            TODAY,
        )
        expect(errors).toEqual([])
    })

    it('jednocześnie data i „nie wie" to konflikt', () => {
        const errors = validateCardForFinalize(card({ projectEndUnknown: true }), TODAY)
        expect(errors.some((e) => e.includes('wybierz jedno'))).toBe(true)
    })

    it('niechetny wymaga bloku A jak OK', () => {
        const errors = validateCardForFinalize(
            card({ status: 'niechetny', hiring: null }),
            TODAY,
        )
        expect(errors.some((e) => e.includes('szukają ludzi'))).toBe(true)
    })

    it('szukają ludzi = TAK wymaga roli i źródła', () => {
        const errors = validateCardForFinalize(
            card({ hiring: true, hiringRoles: [], hiringSource: null }),
            TODAY,
        )
        expect(errors.some((e) => e.includes('rolę'))).toBe(true)
        expect(errors.some((e) => e.includes('źródło'))).toBe(true)
    })

    it('szukają ludzi = TAK z rolą i źródłem przechodzi', () => {
        const errors = validateCardForFinalize(
            card({ hiring: true, hiringRoles: ['Java Developer'], hiringSource: 'widzial' }),
            TODAY,
        )
        expect(errors).toEqual([])
    })

    it('role złożone z samych spacji nie liczą się', () => {
        const errors = validateCardForFinalize(
            card({ hiring: true, hiringRoles: ['   '], hiringSource: 'plotka' }),
            TODAY,
        )
        expect(errors.some((e) => e.includes('rolę'))).toBe(true)
    })

    it('satysfakcja 3 bez komentarza zgłasza błąd', () => {
        const errors = validateCardForFinalize(
            card({ satisfaction: 3, satisfactionComment: '  ' }),
            TODAY,
        )
        expect(errors.some((e) => e.includes('komentarz'))).toBe(true)
    })

    it('satysfakcja 3 z komentarzem przechodzi', () => {
        const errors = validateCardForFinalize(
            card({ satisfaction: 3, satisfactionComment: 'Zmęczony projektem.' }),
            TODAY,
        )
        expect(errors).toEqual([])
    })

    it('niska satysfakcja wymaga komentarza także przy odmowie (invariant pola)', () => {
        const errors = validateCardForFinalize(
            card({ status: 'odmowa', satisfaction: 2, satisfactionComment: null }),
            TODAY,
        )
        expect(errors.some((e) => e.includes('komentarz'))).toBe(true)
    })

    it('satysfakcja 4 nie wymaga komentarza', () => {
        const errors = validateCardForFinalize(card({ satisfaction: 4 }), TODAY)
        expect(errors).toEqual([])
    })

    it('za długi team_size blokuje też finalizację (reguła bazowa)', () => {
        const errors = validateCardForFinalize(card({ teamSize: 'x'.repeat(81) }), TODAY)
        expect(errors.some((e) => e.includes('Wielkość zespołu'))).toBe(true)
    })
})
