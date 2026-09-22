import { describe, expect, it } from 'vitest'
import { evaluateAcademyOperations, operationsSnapshotSchema, type OperationsSnapshot } from '../operations-health'
const now = '2026-09-22T15:00:00Z'
const before = (minutes: number) => new Date(Date.parse(now) - minutes * 60_000).toISOString()
function snapshot(): OperationsSnapshot {
    return { checkedAt: now, workers: [{ kind: 'materials', lastFinishedAt: before(1), ok: true }, { kind: 'sync', lastFinishedAt: before(1), ok: true }], materials: { pending: 0, failed: 0, oldestDueAt: null }, integrations: { pending: 0, failed: 0, oldestDueAt: null }, storage: { reservedBytes: 0, authorsNearQuota: 0 } }
}
const scanner = { available: true, databaseUpdatedAt: before(60) }
describe('Academy operations health', () => {
    it('reports only a fresh successful empty queue as healthy', () => expect(evaluateAcademyOperations(snapshot(), scanner).status).toBe('healthy'))
    it('fails missing or stale heartbeats even when queues are empty', () => {
        for (const at of [null, before(16)]) {
            const data = snapshot(); data.workers[0].lastFinishedAt = at
            expect(evaluateAcademyOperations(data, scanner).status).toBe('unhealthy')
        }
    })
    it('does not mask a recent failed job by its freshness', () => {
        const data = snapshot(); data.workers[1].ok = false
        expect(evaluateAcademyOperations(data, scanner).alerts[0].code).toBe('sync_worker_unhealthy')
    })
    it('warns during a short maintenance delay without declaring healthy', () => {
        const data = snapshot(); data.workers[0].lastFinishedAt = before(8)
        expect(evaluateAcademyOperations(data, scanner).status).toBe('degraded')
    })
    it('alerts on exhausted jobs and overdue pending operations', () => {
        const data = snapshot(); data.integrations.failed = 1; data.materials.oldestDueAt = before(31)
        expect(evaluateAcademyOperations(data, scanner).alerts.map(a => a.code)).toEqual(['materials_overdue', 'integrations_exhausted'])
    })
    it('does not mistake future scheduled attendance for overdue work', () => {
        const data = snapshot(); data.integrations.pending = 3
        expect(evaluateAcademyOperations(data, scanner).status).toBe('healthy')
    })
    it('warns when readiness is unavailable or signatures reach 24h', () => {
        expect(evaluateAcademyOperations(snapshot(), { available: false, databaseUpdatedAt: null }).alerts[0].code).toBe('scanner_unavailable')
        expect(evaluateAcademyOperations(snapshot(), { available: true, databaseUpdatedAt: before(1440) }).alerts[0].code).toBe('scanner_signatures_aging')
    })
    it('reports aggregate storage pressure without identities or file paths', () => {
        const data = snapshot(); data.storage.authorsNearQuota = 2
        expect(evaluateAcademyOperations(data, scanner).alerts[0]).toMatchObject({ code: 'author_storage_near_quota', owner: 'Administrator Akademii' })
    })
    it('rejects duplicate workers, malformed counts and timestamps', () => {
        const data = snapshot(); data.workers[1].kind = 'materials'
        expect(operationsSnapshotSchema.safeParse(data).success).toBe(false)
        expect(operationsSnapshotSchema.safeParse({ ...snapshot(), checkedAt: 'bad' }).success).toBe(false)
        expect(operationsSnapshotSchema.safeParse({ ...snapshot(), storage: { reservedBytes: -1, authorsNearQuota: 0 } }).success).toBe(false)
    })
})
