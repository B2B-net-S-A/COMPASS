/** Czysta logika banku pytań: import CSV, rozkłady i przykładowy zestaw. */

export interface BankOption { option_text: string; is_correct: boolean; explanation: string | null }
export interface BankQuestion {
    id?: string
    question_text: string
    topic_tag: string | null
    pool_status: 'draft' | 'approved'
    voided_at?: string | null
    void_reason?: string | null
    options: BankOption[]
}

export interface CsvImportResult { questions: BankQuestion[]; errors: string[] }

const LETTERS = ['a', 'b', 'c', 'd', 'e', 'f']

/** Parser CSV z cudzysłowami; separator wykrywany z nagłówka, bo Excel w PL zapisuje średniki. */
export function parseCsv(text: string): string[][] {
    const source = text.replace(/^﻿/, '')
    const header = source.split(/\r?\n/, 1)[0] ?? ''
    const separator = (header.match(/;/g)?.length ?? 0) >= (header.match(/,/g)?.length ?? 0) ? ';' : ','
    const rows: string[][] = []
    let row: string[] = [], cell = '', quoted = false
    for (let index = 0; index < source.length; index++) {
        const char = source[index]
        if (quoted) {
            if (char === '"' && source[index + 1] === '"') { cell += '"'; index++ }
            else if (char === '"') quoted = false
            else cell += char
        } else if (char === '"') quoted = true
        else if (char === separator) { row.push(cell); cell = '' }
        else if (char === '\n' || char === '\r') {
            if (char === '\r' && source[index + 1] === '\n') index++
            row.push(cell); cell = ''
            if (row.some(value => value.trim() !== '')) rows.push(row)
            row = []
        } else cell += char
    }
    row.push(cell)
    if (row.some(value => value.trim() !== '')) rows.push(row)
    return rows
}

/** Kolumny: pytanie, temat, odpowiedz_a..f, wyjasnienie_a..f, poprawna (litera). */
export function questionsFromCsv(text: string): CsvImportResult {
    const rows = parseCsv(text)
    if (rows.length < 2) return { questions: [], errors: ['Plik nie ma wierszy z pytaniami.'] }
    const header = rows[0].map(name => name.trim().toLowerCase())
    const column = (name: string) => header.indexOf(name)
    if (column('pytanie') < 0 || column('poprawna') < 0 || column('odpowiedz_a') < 0) {
        return { questions: [], errors: ['Wymagane kolumny: pytanie, poprawna, odpowiedz_a.'] }
    }
    const questions: BankQuestion[] = []
    const errors: string[] = []
    rows.slice(1).forEach((row, index) => {
        const line = index + 2
        const read = (name: string) => (column(name) >= 0 ? (row[column(name)] ?? '').trim() : '')
        const text = read('pytanie')
        const correct = read('poprawna').toLowerCase()
        const options = LETTERS.flatMap(letter => {
            const option = read(`odpowiedz_${letter}`)
            return option ? [{ letter, option_text: option, is_correct: letter === correct, explanation: read(`wyjasnienie_${letter}`) || null }] : []
        })
        if (!text) { errors.push(`Wiersz ${line}: brak treści pytania.`); return }
        if (options.length < 2) { errors.push(`Wiersz ${line}: potrzebne są co najmniej 2 odpowiedzi.`); return }
        if (!options.some(option => option.is_correct)) { errors.push(`Wiersz ${line}: kolumna „poprawna” musi wskazywać literę istniejącej odpowiedzi.`); return }
        questions.push({
            question_text: text, topic_tag: read('temat') || null, pool_status: 'approved',
            options: options.map(({ option_text, is_correct, explanation }) => ({ option_text, is_correct, explanation })),
        })
    })
    return { questions, errors }
}

export const isActive = (question: Pick<BankQuestion, 'pool_status' | 'voided_at'>) => question.pool_status === 'approved' && !question.voided_at

export type QuestionState = 'draft' | 'approved' | 'voided'
export const questionState = (question: Pick<BankQuestion, 'pool_status' | 'voided_at'>): QuestionState => question.voided_at ? 'voided' : question.pool_status

export function topicDistribution(questions: readonly BankQuestion[]): { topic: string; count: number }[] {
    const counts = new Map<string, number>()
    for (const question of questions.filter(isActive)) {
        const topic = question.topic_tag ?? 'Bez tematu'
        counts.set(topic, (counts.get(topic) ?? 0) + 1)
    }
    return Array.from(counts, ([topic, count]) => ({ topic, count })).sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic, 'pl'))
}

/** Trudność wynika z odpowiedzi: bez odpowiedzi pytanie jest „bez danych”. */
export function difficultyBand(correctPercent: number | null | undefined): 'hard' | 'medium' | 'easy' | 'unknown' {
    if (correctPercent === null || correctPercent === undefined) return 'unknown'
    if (correctPercent < 50) return 'hard'
    return correctPercent <= 80 ? 'medium' : 'easy'
}

export function sampleSet<T extends BankQuestion>(questions: readonly T[], drawCount: number | null, random: () => number = Math.random): T[] {
    const pool = questions.filter(isActive)
    const count = Math.min(drawCount ?? pool.length, pool.length)
    const shuffled = [...pool]
    for (let index = shuffled.length - 1; index > 0; index--) {
        const swap = Math.floor(random() * (index + 1));
        [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]]
    }
    return shuffled.slice(0, count)
}
