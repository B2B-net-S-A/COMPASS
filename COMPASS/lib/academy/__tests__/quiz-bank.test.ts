import { describe, expect, it } from 'vitest'
import { difficultyBand, isActive, parseCsv, questionState, questionsFromCsv, sampleSet, topicDistribution, type BankQuestion } from '../quiz-bank'

const question = (over: Partial<BankQuestion> = {}): BankQuestion => ({ question_text: 'P', topic_tag: 'A', pool_status: 'approved', options: [{ option_text: 'x', is_correct: true, explanation: null }, { option_text: 'y', is_correct: false, explanation: null }], ...over })

describe('parser CSV', () => {
    it('wykrywa średnik z eksportu Excela w PL', () => expect(parseCsv('a;b\n1;2')).toEqual([['a', 'b'], ['1', '2']]))
    it('wykrywa przecinek', () => expect(parseCsv('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']]))
    it('obsługuje cudzysłowy, separator i nową linię w polu', () => expect(parseCsv('a;b\n"x;y";"l1\nl2"')).toEqual([['a', 'b'], ['x;y', 'l1\nl2']]))
    it('zdejmuje podwojony cudzysłów i BOM', () => expect(parseCsv('﻿a;b\n"x""y";2')).toEqual([['a', 'b'], ['x"y', '2']]))
    it('pomija puste wiersze i CRLF', () => expect(parseCsv('a;b\r\n\r\n1;2\r\n')).toEqual([['a', 'b'], ['1', '2']]))
})

describe('import pytań', () => {
    const header = 'pytanie;temat;odpowiedz_a;odpowiedz_b;wyjasnienie_a;poprawna'
    it('tworzy zatwierdzone pytanie z tematem i wyjaśnieniem', () => {
        const { questions, errors } = questionsFromCsv(`${header}\nTreść;Reguły;Tak;Nie;Bo tak;a`)
        expect(errors).toEqual([])
        expect(questions).toEqual([{ question_text: 'Treść', topic_tag: 'Reguły', pool_status: 'approved', options: [{ option_text: 'Tak', is_correct: true, explanation: 'Bo tak' }, { option_text: 'Nie', is_correct: false, explanation: null }] }])
    })
    it('wskazuje wiersz bez treści, z jedną odpowiedzią i ze złą literą, a dobre zostawia', () => {
        const { questions, errors } = questionsFromCsv(`${header}\n;T;A;B;;a\nJedna;T;A;;;a\nZła;T;A;B;;f\nDobra;T;A;B;;B`)
        expect(errors).toEqual([expect.stringContaining('Wiersz 2'), expect.stringContaining('Wiersz 3'), expect.stringContaining('Wiersz 4')])
        expect(questions).toHaveLength(1)
        expect(questions[0].options[1].is_correct).toBe(true)
    })
    it('odrzuca plik bez wymaganych kolumn i pusty', () => {
        expect(questionsFromCsv('a;b\n1;2').errors[0]).toContain('Wymagane kolumny')
        expect(questionsFromCsv('').errors[0]).toContain('nie ma wierszy')
    })
})

describe('stan i rozkład puli', () => {
    it('szkic i unieważnione są poza losowaniem', () => {
        expect(isActive(question({ pool_status: 'draft' }))).toBe(false)
        expect(isActive(question({ voided_at: '2026-11-09' }))).toBe(false)
        expect(questionState(question({ voided_at: '2026-11-09' }))).toBe('voided')
    })
    it('liczy tematy tylko aktywnych pytań, malejąco', () => {
        expect(topicDistribution([question({ topic_tag: 'B' }), question({ topic_tag: 'B' }), question({ topic_tag: null }), question({ pool_status: 'draft', topic_tag: 'C' })])).toEqual([{ topic: 'B', count: 2 }, { topic: 'Bez tematu', count: 1 }])
    })
    it.each([[null, 'unknown'], [undefined, 'unknown'], [0, 'hard'], [49, 'hard'], [50, 'medium'], [80, 'medium'], [81, 'easy']])('trafność %s to %s', (value, band) => expect(difficultyBand(value)).toBe(band))
})

describe('przykładowy zestaw', () => {
    const pool = Array.from({ length: 6 }, (_, index) => question({ question_text: String(index) }))
    it('losuje wskazaną liczbę bez powtórzeń', () => {
        const set = sampleSet(pool, 4)
        expect(set).toHaveLength(4)
        expect(new Set(set.map(item => item.question_text)).size).toBe(4)
    })
    it('nie przekracza puli i pomija nieaktywne', () => {
        expect(sampleSet([...pool, question({ pool_status: 'draft' })], 50)).toHaveLength(6)
        expect(sampleSet(pool, null)).toHaveLength(6)
    })
    it('jest powtarzalny przy tym samym źródle losowości', () => {
        expect(sampleSet(pool, 3, () => 0.25)).toEqual(sampleSet(pool, 3, () => 0.25))
    })
})
