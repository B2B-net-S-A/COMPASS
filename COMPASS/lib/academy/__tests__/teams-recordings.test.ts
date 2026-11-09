// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { academyGraphRecordingsEnabled, importTeamsRecording, listTeamsRecordingParts } from '../teams-recordings'
import type { GraphLike } from '@/lib/graph/client'

const target = { sessionId: 'session', organizerId: 'org/1', onlineMeetingId: 'meet' }
const on = { ACADEMY_GRAPH_RECORDINGS_ENABLED: 'true' }
function fakeGraph(routes: Record<string, unknown[]>) {
    const calls: string[] = []
    const graph = { api: (path: string) => { calls.push(path); return { get: async () => ({ value: routes[path.split('/').pop()!] ?? [] }) } } } as unknown as GraphLike
    return { graph, calls }
}
const store = () => ({ savePart: vi.fn(async () => {}), saveTranscript: vi.fn(async () => {}) })
const part = (id: string, createdDateTime: string) => ({ id, createdDateTime, recordingContentUrl: `https://graph.test/${id}` })

describe('academyGraphRecordingsEnabled', () => {
    it('is off by default and only an exact value turns it on', () => {
        expect(academyGraphRecordingsEnabled({})).toBe(false)
        for (const value of ['1', 'TRUE', 'yes', '']) expect(academyGraphRecordingsEnabled({ ACADEMY_GRAPH_RECORDINGS_ENABLED: value })).toBe(false)
        expect(academyGraphRecordingsEnabled(on)).toBe(true)
    })
})

describe('importTeamsRecording', () => {
    it('does nothing at all when the switch is off', async () => {
        const { graph, calls } = fakeGraph({ recordings: [part('a', '2026-01-01T10:00:00Z')] })
        const sink = store()
        await expect(importTeamsRecording({ target, graph, store: sink, env: {} })).resolves.toEqual({ status: 'disabled' })
        expect(calls).toEqual([])
        expect(sink.savePart).not.toHaveBeenCalled()
    })
    it('imports several parts in creation order and the transcript separately', async () => {
        const { graph } = fakeGraph({ recordings: [part('b', '2026-01-01T11:30:00Z'), part('a', '2026-01-01T10:00:00Z')], transcripts: [{ id: 't', transcriptContentUrl: 'https://graph.test/t' }] })
        const sink = store()
        await expect(importTeamsRecording({ target, graph, store: sink, env: on })).resolves.toEqual({ status: 'imported', parts: 2, transcripts: 1 })
        const saved = sink.savePart.mock.calls as unknown as [{ partId: string; partNumber: number; totalParts: number }][]
        expect(saved.map(([call]) => [call.partId, call.partNumber, call.totalParts])).toEqual([['a', 1, 2], ['b', 2, 2]])
        expect(sink.saveTranscript).toHaveBeenCalledTimes(1)
    })
    it('reports a meeting without a recording and does not look for a transcript', async () => {
        const { graph, calls } = fakeGraph({})
        await expect(importTeamsRecording({ target, graph, store: store(), env: on })).resolves.toEqual({ status: 'no_recording' })
        expect(calls).toHaveLength(1)
    })
    it('skips malformed entries and encodes identifiers in the path', async () => {
        const { graph, calls } = fakeGraph({ recordings: [{ id: 'x' }, part('a', '2026-01-01T10:00:00Z')] })
        await expect(listTeamsRecordingParts(graph, target)).resolves.toHaveLength(1)
        expect(calls[0]).toBe('/users/org%2F1/onlineMeetings/meet/recordings')
    })
    it('propagates a Graph failure so the job is retried', async () => {
        const graph = { api: () => ({ get: async () => { throw new Error('403') } }) } as unknown as GraphLike
        await expect(importTeamsRecording({ target, graph, store: store(), env: on })).rejects.toThrow('403')
    })
})
