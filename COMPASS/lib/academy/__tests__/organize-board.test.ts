import { describe, expect, it } from 'vitest'
import { boardStage, buildTodo, sortBoard, warsawIso, type BoardMaterial, type BoardRun } from '../organize-board'

const now = Date.parse('2026-11-10T12:00:00Z')
const day = 86_400_000
const at = (offsetDays: number) => new Date(now + offsetDays * day).toISOString()
const run = (id: string, over: Partial<BoardRun> = {}, startOffset = 7): BoardRun => ({ id, courseId: 'c' + id, courseSlug: id, courseTitle: 'Kurs ' + id, title: id, status: 'published', confirmedCount: 3, sessions: [{ startsAt: at(startOffset), endsAt: at(startOffset + 0.05), status: 'scheduled' }], ...over })
const video = (runId: string, over: Partial<BoardMaterial> = {}): BoardMaterial => ({ id: 'v' + runId, runId, filename: 'n.mp4', mimeType: 'video/mp4', status: 'ready', reviewStatus: 'pending_review', uploadedBy: 'trener', ...over })

describe('boardStage', () => {
    it('szkic, zapisy otwarte, czeka na nagranie', () => {
        expect(boardStage(run('a', { status: 'draft' }), [], now)).toBe('draft')
        expect(boardStage(run('a', { status: 'cancelled' }), [], now)).toBe('cancelled')
        expect(boardStage(run('a'), [], now)).toBe('open')
        expect(boardStage(run('a', {}, -1), [], now)).toBe('waiting_recording')
        expect(boardStage(run('a', { sessions: [] }), [], now)).toBe('open')
    })

    it('nagranie po skanie czeka na akceptację; zatwierdzone jest w bibliotece', () => {
        expect(boardStage(run('a', {}, -1), [video('a', { status: 'scanning' })], now)).toBe('waiting_recording')
        expect(boardStage(run('a', {}, -1), [video('a')], now)).toBe('to_approve')
        expect(boardStage(run('a', {}, -1), [video('a', { reviewStatus: 'published' })], now)).toBe('in_library')
        expect(boardStage(run('a', {}, -1), [video('a', { reviewStatus: 'published' }), video('a', { id: 'v2' })], now)).toBe('to_approve')
        expect(boardStage(run('a', {}, -1), [video('a', { mimeType: 'application/pdf' })], now)).toBe('waiting_recording')
        expect(boardStage(run('a', {}, -1), [video('b')], now)).toBe('waiting_recording')
    })
})

describe('buildTodo', () => {
    it('nagrania do zatwierdzenia, potem zapowiedzi, potem przypomnienia', () => {
        const runs = [run('przypomnij', {}, -3), run('swieze', {}, -1), run('szkic', { status: 'draft' }), run('nagranie', {}, -1)]
        const todo = buildTodo(runs, [video('nagranie')], {}, 'ja', now)
        expect(todo.map(item => [item.kind, item.runId])).toEqual([['approve_recording', 'nagranie'], ['publish_announcement', 'szkic'], ['remind_trainer', 'przypomnij']])
    })

    it('własne nagranie oznacza do zatwierdzenia przez inną osobę', () => {
        expect(buildTodo([run('a', {}, -1)], [video('a', { uploadedBy: 'ja' })], {}, 'ja', now)[0].ownUpload).toBe(true)
        expect(buildTodo([run('a', {}, -1)], [video('a')], {}, 'ja', now)[0].ownUpload).toBe(false)
    })

    it('wysłane przez trenera idą pierwsze, od najstarszej prośby', () => {
        const runs = [run('bez', {}, -1), run('pozna', {}, -1), run('wczesna', {}, -1)]
        const materials = [video('bez'), video('pozna'), video('wczesna')]
        const todo = buildTodo(runs, materials, { pozna: '2026-11-09T10:00:00Z', wczesna: '2026-11-08T10:00:00Z' }, 'ja', now)
        expect(todo.map(item => item.runId)).toEqual(['wczesna', 'pozna', 'bez'])
    })
})

describe('sortBoard', () => {
    it('do akceptacji na górze, odwołane na dole', () => {
        const sorted = sortBoard([run('odwolane', { status: 'cancelled' }), run('otwarte'), run('akceptacja', {}, -1)], [video('akceptacja')], now)
        expect(sorted.map(item => [item.id, item.stage])).toEqual([['akceptacja', 'to_approve'], ['otwarte', 'open'], ['odwolane', 'cancelled']])
    })
})

describe('warsawIso', () => {
    it('zimą +01:00, latem +02:00', () => {
        expect(warsawIso('2026-11-18T14:00')).toBe('2026-11-18T14:00:00+01:00')
        expect(warsawIso('2027-06-10T09:30')).toBe('2027-06-10T09:30:00+02:00')
        expect(Date.parse(warsawIso('2026-11-18T14:00'))).toBe(Date.parse('2026-11-18T13:00:00Z'))
    })
})
