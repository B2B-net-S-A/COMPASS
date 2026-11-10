import { describe, expect, it } from 'vitest'
import { pickTrainerRun, trainerMaterialState, trainerSteps, type TrainerMaterialRow } from '../teaching-steps'

const file = (over: Partial<TrainerMaterialRow>): TrainerMaterialRow => ({ id: 'a', filename: 'n.mp4', mime_type: 'video/mp4', status: 'ready', review_status: 'pending_review', review_note: null, ...over })

describe('trainerMaterialState', () => {
    it('opisuje drogę pliku do biblioteki', () => {
        expect(trainerMaterialState(file({ status: 'scanning' })).key).toBe('scanning')
        expect(trainerMaterialState(file({ status: 'rejected', error: 'Wykryto zagrożenie' }))).toMatchObject({ key: 'blocked', note: 'Wykryto zagrożenie' })
        expect(trainerMaterialState(file({})).key).toBe('waiting')
        expect(trainerMaterialState(file({ review_status: 'published' })).key).toBe('library')
        expect(trainerMaterialState(file({ review_status: 'rejected', review_note: 'Słychać uczestników' }))).toMatchObject({ key: 'rejected', note: 'Słychać uczestników' })
        expect(trainerMaterialState(file({ review_status: 'withdrawn' })).key).toBe('withdrawn')
    })
})

describe('trainerSteps', () => {
    const base = { description: 'Opis', sessionCount: 1, materials: [] as TrainerMaterialRow[], quizQuestions: 0 }

    it('bez plików nie ma czego wysłać, test jest opcjonalny', () => {
        expect(trainerSteps(base)).toMatchObject({ description: true, date: true, recording: false, test: false, canSend: false, inLibrary: 0 })
        expect(trainerSteps({ ...base, description: '   ', sessionCount: 0 })).toMatchObject({ description: false, date: false })
    })

    it('nagranie czekające na akceptację włącza wysyłkę; skanowane jeszcze nie', () => {
        expect(trainerSteps({ ...base, materials: [file({ status: 'scanning' })] })).toMatchObject({ recording: false, canSend: false })
        expect(trainerSteps({ ...base, materials: [file({})] })).toMatchObject({ recording: true, canSend: true })
        expect(trainerSteps({ ...base, materials: [file({ mime_type: 'application/pdf' })] })).toMatchObject({ recording: false, canSend: true })
    })

    it('odrzucone nagranie nie zalicza kroku, opublikowane liczy się do biblioteki', () => {
        expect(trainerSteps({ ...base, materials: [file({ review_status: 'rejected' })] })).toMatchObject({ recording: false, canSend: false })
        expect(trainerSteps({ ...base, materials: [file({ review_status: 'published' })], quizQuestions: 3 })).toMatchObject({ recording: true, canSend: false, inLibrary: 1, test: true })
    })
})

describe('pickTrainerRun', () => {
    const now = Date.parse('2026-11-10T12:00:00Z')
    const run = (id: string, starts: string[], status = 'published', sessionStatus = 'scheduled') => ({ id, status, sessions: starts.map(startsAt => ({ startsAt, status: sessionStatus })) })

    it('wybiera ostatnią edycję, która już się odbyła', () => {
        expect(pickTrainerRun([run('stara', ['2026-10-01T10:00:00Z']), run('ostatnia', ['2026-11-07T10:00:00Z']), run('przyszla', ['2026-12-01T10:00:00Z'])], now)?.id).toBe('ostatnia')
    })

    it('bez odbytej bierze najbliższą przyszłą, pomija odwołane', () => {
        expect(pickTrainerRun([run('daleka', ['2027-01-01T10:00:00Z']), run('bliska', ['2026-11-20T10:00:00Z']), run('odwolana', ['2026-11-01T10:00:00Z'], 'cancelled')], now)?.id).toBe('bliska')
        expect(pickTrainerRun([run('sesja-odwolana', ['2026-11-01T10:00:00Z'], 'published', 'cancelled')], now)?.id).toBe('sesja-odwolana')
        expect(pickTrainerRun([], now)).toBeNull()
    })
})
