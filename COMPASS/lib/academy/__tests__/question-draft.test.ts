import { describe, expect, it, vi } from 'vitest'
import { aiDraftsEnabled, excerptAppearsInSource, generateQuestionDrafts, parseDrafts } from '../question-draft'

const options = [{ option_text: 'SLA', is_correct: true, explanation: 'Licznik per sprawa' }, { option_text: 'Zadanie w tle', is_correct: false }]
const good = { question_text: 'Scenariusz?', topic_tag: 'SLA', source_excerpt: 'Termin pilnujemy na przypisaniu', options }

describe('przełącznik', () => {
    it.each([[undefined], ['false'], ['1'], ['TRUE'], ['']])('wartość %s nie włącza generowania', value => expect(aiDraftsEnabled({ ACADEMY_AI_DRAFTS_ENABLED: value } as unknown as NodeJS.ProcessEnv)).toBe(false))
    it('włącza tylko true', () => expect(aiDraftsEnabled({ ACADEMY_AI_DRAFTS_ENABLED: 'true' } as unknown as NodeJS.ProcessEnv)).toBe(true))
})

describe('walidacja odpowiedzi modelu', () => {
    it('odrzuca szkic bez jednej poprawnej odpowiedzi, a resztę zostawia', () => {
        const parsed = parseDrafts({ questions: [good, { ...good, options: options.map(o => ({ ...o, is_correct: true })) }, { question_text: 'x' }] })
        expect(parsed.drafts).toHaveLength(1)
        expect(parsed.rejected).toBe(2)
    })
    it.each([[null], ['tekst'], [{}], [{ questions: 'x' }]])('zły kształt %j to brak szkiców', raw => expect(parseDrafts(raw)).toEqual({ drafts: [], rejected: 0 }))
})

describe('fragment źródłowy', () => {
    it('ignoruje wielkość liter i białe znaki', () => expect(excerptAppearsInSource('termin  pilnujemy', 'Termin pilnujemy\nna przypisaniu')).toBe(true))
    it('odrzuca fragment spoza materiału', () => expect(excerptAppearsInSource('zmyślony cytat', 'Termin pilnujemy')).toBe(false))
})

describe('generowanie', () => {
    const input = { sourceLabel: 'Moduł 3', material: 'Termin pilnujemy na przypisaniu: SLA daje cel.', count: 2 }

    it('przepuszcza tylko pytania z fragmentem z materiału i dokłada ocenę krytyka', async () => {
        const chat = vi.fn().mockResolvedValueOnce({ questions: [good, { ...good, source_excerpt: 'wymyślone' }] }).mockResolvedValueOnce({ critiques: [{ level: 'zastosowanie', clarity: 'dobra', risk: 'dwie prawdopodobne' }] })
        const result = await generateQuestionDrafts(chat, input)
        expect(result.rejected).toBe(1)
        expect(result.drafts).toHaveLength(1)
        expect(result.drafts[0]).toMatchObject({ source_label: 'Moduł 3', critique: { level: 'zastosowanie' } })
    })

    it('bez pytań nie woła krytyka', async () => {
        const chat = vi.fn().mockResolvedValueOnce({ questions: [] })
        expect(await generateQuestionDrafts(chat, input)).toEqual({ drafts: [], rejected: 0 })
        expect(chat).toHaveBeenCalledTimes(1)
    })

    it('niepoprawna odpowiedź krytyka nie gubi szkicu', async () => {
        const chat = vi.fn().mockResolvedValueOnce({ questions: [good] }).mockResolvedValueOnce({ critiques: 'x' })
        expect((await generateQuestionDrafts(chat, input)).drafts[0].critique.level).toBe('brak oceny')
    })
})
