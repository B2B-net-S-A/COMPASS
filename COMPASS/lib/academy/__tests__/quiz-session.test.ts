import { describe, expect, it } from 'vitest'
import { answeredPercent, formatRemaining, mergeSavedAnswers, parseStoredAnswers, quizBlockerMessage, quizPageCount, quizPageItems } from '../quiz-session'

const question = (id: string, selected: string | null = null) => ({ question_id: id, selected_option_id: selected, options: [{ id: `${id}-a` }, { id: `${id}-b` }] })

describe('licznik czasu', () => {
    it.each([[0, '00:00'], [-5, '00:00'], [59.9, '00:59'], [60, '01:00'], [1200, '20:00'], [6000, '100:00']])('%s s to %s', (seconds, label) => {
        expect(formatRemaining(seconds)).toBe(label)
    })
})

describe('podział na strony', () => {
    it('do 10 pytań zostaje jedna strona', () => {
        expect(quizPageCount(10)).toBe(1)
        expect(quizPageItems(Array.from({ length: 10 }, (_, index) => index), 3)).toHaveLength(10)
    })

    it('większy zestaw dzieli się na strony po 10', () => {
        expect(quizPageCount(11)).toBe(2)
        expect(quizPageCount(20)).toBe(2)
        expect(quizPageCount(21)).toBe(3)
        const items = Array.from({ length: 25 }, (_, index) => index)
        expect(quizPageItems(items, 3)).toEqual([20, 21, 22, 23, 24])
        expect(quizPageItems(items, 0)).toEqual(items.slice(0, 10))
    })
})

describe('pasek postępu', () => {
    it('nie dzieli przez zero i nie przekracza 100', () => {
        expect(answeredPercent(0, 0)).toBe(0)
        expect(answeredPercent(5, 10)).toBe(50)
        expect(answeredPercent(11, 10)).toBe(100)
    })
})

describe('odpowiedzi zapamiętane na urządzeniu', () => {
    it('łączy zapis z serwera z nowszym lokalnym', () => {
        expect(mergeSavedAnswers([question('q1', 'q1-a'), question('q2')], { q1: 'q1-b', q2: 'q2-a' })).toEqual({ q1: 'q1-b', q2: 'q2-a' })
    })

    it('odrzuca opcję spoza zestawu i pytanie spoza próby', () => {
        expect(mergeSavedAnswers([question('q1', 'q1-a')], { q1: 'obca', q9: 'q9-a' })).toEqual({ q1: 'q1-a' })
    })

    it.each([[null], [''], ['nie json'], ['[1,2]'], ['null']])('uszkodzony zapis %s to brak odpowiedzi', raw => {
        expect(parseStoredAnswers(raw)).toEqual({})
    })

    it('zostawia tylko wartości tekstowe', () => {
        expect(parseStoredAnswers('{"a":"b","c":1}')).toEqual({ a: 'b' })
    })
})

describe('powód blokady startu', () => {
    it('brak blokady to brak komunikatu', () => expect(quizBlockerMessage(null)).toBeNull())
    it('nieznany kod nie pokazuje nazwy technicznej', () => expect(quizBlockerMessage('cos_nowego')).toBe('Test nie jest teraz dostępny.'))
    it('mówi, kiedy otworzy się test edycji', () => expect(quizBlockerMessage('quiz_opens_after_sessions')).toContain('po zakończeniu'))
})
