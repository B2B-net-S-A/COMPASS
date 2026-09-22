import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getAcademyMaterialCleanupQueue, getAcademyMaterialQueue, getAcademyMaterialStatus, listAcademyLessonUploads, listAcademyRunMaterials, retryAcademyMaterialCleanup, retryAcademyMaterialScan } from '../academy-materials'
import { academyFixture, COURSE, RUN, USER, id } from './academy-fixtures'
import type { MockSupabase, MockSupabaseConfig, Row } from '@/test/mocks/supabase'

let client: MockSupabase
const now = Date.parse('2026-09-22T12:00:00Z')
const oldLease = new Date(now - 16 * 60_000).toISOString()
const recentLease = new Date(now - 14 * 60_000).toISOString()
vi.mock('@/lib/supabase/server', () => ({ createClient: () => client }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))

function asset(n: number, patch: Row = {}): Row {
    return { id: id(n), filename: `material-${n}.pdf`, course_id: COURSE, run_id: null, status: 'quarantined',
        scan_attempts: 1, scan_started_at: null, scan_next_attempt_at: null, scan_error: null,
        purged_at: null, cleanup_token: null, cleanup_attempts: 0, cleanup_claimed_at: null, cleanup_error: null,
        created_at: new Date(now - (10000 - n) * 60_000).toISOString(), ...patch }
}
function setup(rows: Row[] = [], config: MockSupabaseConfig = {}, admin = true) {
    client = academyFixture({ ...config, tables: { profiles: [{ id: USER, role: admin ? 'admin' : 'consultant', is_external: false, employment_status: 'active' }], course_materials: rows, ...config.tables } })
    const from = client.from.getMockImplementation()!
    client.from.mockImplementation((table: string) => {
        const query = from(table)
        if (table === 'course_materials') {
            // The shared fixture only parses eq/ilike OR expressions. Model this
            // nullable discard predicate locally, preserving all other filters.
            query.or = (expression: string) => {
                expect(expression).toBe('scan_error.is.null,scan_error.neq.discarded_by_author')
                return query.in('id', rows.filter(row => row.scan_error !== 'discarded_by_author').map(row => row.id))
            }
        }
        return query
    })
}
beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(now)
    vi.stubEnv('ACADEMY_CLAMAV_HOST', '')
    vi.stubEnv('ACADEMY_MATERIAL_CLEANUP_ENABLED', '')
    vi.stubEnv('ACADEMY_UPLOAD_RETENTION_HOURS', '')
    vi.stubEnv('ACADEMY_REJECTED_RETENTION_DAYS', '')
    setup()
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })

describe('administrator scan queue', () => {
    it('returns safe MP4 guidance for author status and both upload lists without raw diagnostics', async () => {
        const lesson = id(901)
        setup([asset(301, { status: 'rejected', lesson_id: lesson, scan_error: 'fragmented_mp4_unsupported' }),
            asset(302, { status: 'rejected', run_id: RUN, scan_error: 'unsupported_mp4_codec' })])
        const direct = await getAcademyMaterialStatus(id(301))
        expect(direct.success && direct.data.error).toContain('Segmentowane nagrania')
        const lessons = await listAcademyLessonUploads(lesson), runs = await listAcademyRunMaterials(RUN)
        expect(lessons.success && lessons.data[0].error).toContain('Segmentowane nagrania')
        expect(runs.success && runs.data[0].error).toContain('AAC-LC')
        expect(JSON.stringify([direct, lessons, runs])).not.toContain('scan_error')
        expect(JSON.stringify([direct, lessons, runs])).not.toContain('fragmented_mp4_unsupported')
    })
    it('returns later pages beyond 100 rows with the full filtered count', async () => {
        setup(Array.from({ length: 123 }, (_, index) => asset(index + 100)))
        const result = await getAcademyMaterialQueue({ page: 5 })
        expect(result).toMatchObject({ success: true, data: { page: 5, pageSize: 25, filter: 'pending', total: 123, scannerConfigured: false } })
        expect(result.success && result.data.items).toHaveLength(23)
        expect(result.success && result.data.items[0].id).toBe(id(200))
        expect(result.success && result.data.items.at(-1)?.id).toBe(id(222))
    })
    it('keeps exhausted scans discoverable despite old rejections and respects active leases', async () => {
        setup([...Array.from({ length: 105 }, (_, n) => asset(n + 100, { status: 'rejected' })),
            asset(301, { scan_attempts: 5 }), asset(302, { scan_attempts: 5, status: 'scanning', scan_started_at: oldLease, run_id: RUN }),
            asset(303, { scan_attempts: 5, status: 'scanning', scan_started_at: recentLease }), asset(304, { scan_attempts: 4 })])
        const result = await getAcademyMaterialQueue({ filter: 'failed' })
        expect(result).toMatchObject({ success: true, data: { total: 3, items: [
            { id: id(301), canRetry: true }, { id: id(302), canRetry: true, runId: RUN }, { id: id(303), canRetry: false },
        ] } })
    })
    it('separates pending/rejected items and excludes ready, purged, cleanup-owned and discarded assets', async () => {
        setup([asset(101), asset(102, { status: 'rejected' }), asset(103, { status: 'ready' }),
            asset(104, { purged_at: oldLease }), asset(105, { cleanup_token: id(800) }), asset(106, { scan_error: 'discarded_by_author' })])
        for (const [filter, ids] of [['pending', [id(101)]], ['rejected', [id(102)]], ['all', [id(101), id(102)]]] as const) {
            const result = await getAcademyMaterialQueue({ filter })
            expect(result.success && result.data.items.map(item => item.id)).toEqual(ids)
        }
        vi.stubEnv('ACADEMY_CLAMAV_HOST', 'clamav.test')
        expect(await getAcademyMaterialQueue()).toMatchObject({ success: true, data: { scannerConfigured: true } })
    })
})

describe('administrator cleanup queue', () => {
    it('paginates independently and retains cleanup jobs discarded later by the author', async () => {
        setup([...Array.from({ length: 104 }, (_, n) => asset(n + 100, { cleanup_token: id(800), cleanup_claimed_at: oldLease })),
            asset(204, { cleanup_token: id(800), cleanup_claimed_at: oldLease, cleanup_attempts: 5, cleanup_error: 'storage_delete_failed', scan_error: 'discarded_by_author' }),
            asset(205), asset(206, { cleanup_token: id(800), purged_at: oldLease })])
        const result = await getAcademyMaterialCleanupQueue({ page: 5 })
        expect(result).toMatchObject({ success: true, data: { mode: 'report', uploadHours: 48, rejectedDays: 30, total: 105, pageSize: 25, page: 5 } })
        expect(result.success && result.data.items).toHaveLength(5)
        expect(result.success && result.data.items.at(-1)).toMatchObject({ id: id(204), canRetry: true, failed: true })
    })
    it('filters exhausted cleanup attempts and disables retry until its lease expires', async () => {
        setup([asset(101, { cleanup_token: id(800), cleanup_attempts: 4, cleanup_claimed_at: oldLease }),
            asset(102, { cleanup_token: id(800), cleanup_attempts: 5, cleanup_claimed_at: oldLease }),
            asset(103, { cleanup_token: id(800), cleanup_attempts: 5, cleanup_claimed_at: recentLease })])
        vi.stubEnv('ACADEMY_MATERIAL_CLEANUP_ENABLED', 'true')
        vi.stubEnv('ACADEMY_REJECTED_RETENTION_DAYS', '60')
        expect(await getAcademyMaterialCleanupQueue({ filter: 'failed' })).toMatchObject({ success: true, data: {
            mode: 'execute', rejectedDays: 60, total: 2, items: [{ id: id(102), canRetry: true }, { id: id(103), canRetry: false }],
        } })
    })
})

describe.each([
    { name: 'scan', get: getAcademyMaterialQueue, retry: retryAcademyMaterialScan, rpc: 'academy_admin_retry_material' },
    { name: 'cleanup', get: getAcademyMaterialCleanupQueue, retry: retryAcademyMaterialCleanup, rpc: 'academy_retry_material_cleanup' },
])('$name queue safety', ({ get, retry, rpc }) => {
    it('requires administrator access for reading and retrying', async () => {
        setup([asset(101)], {}, false)
        expect((await get()).success).toBe(false)
        expect((await retry(id(101))).success).toBe(false)
        expect(client.from).not.toHaveBeenCalledWith('course_materials')
        expect(client.rpc).not.toHaveBeenCalledWith(rpc, expect.anything())
        setup([], { user: null })
        expect((await get()).success).toBe(false)
    })
    it('rejects invalid page/filter input before querying materials', async () => {
        for (const page of [0, -1, 1.5, 100001, NaN]) expect((await get({ page })).success).toBe(false)
        // Verify the runtime boundary even when a caller bypasses TypeScript.
        expect((await get({ filter: 'invalid' as 'all' })).success).toBe(false)
        expect(client.from).not.toHaveBeenCalledWith('course_materials')
    })
    it('reports query failures rather than a false empty success', async () => {
        const from = client.from.getMockImplementation()!
        client.from.mockImplementation((table: string) => { if (table === 'course_materials') throw new Error('read failed'); return from(table) })
        expect((await get()).success).toBe(false)
        expect(client.from).toHaveBeenCalledWith('course_materials')
    })
    it('validates the retry ID and sends only the scoped asset RPC', async () => {
        setup([], { rpcs: { [rpc]: () => null } })
        expect((await retry('invalid')).success).toBe(false)
        expect(client.rpc).not.toHaveBeenCalledWith(rpc, expect.anything())
        expect(await retry(id(101))).toEqual({ success: true, data: undefined })
        expect(client.rpc).toHaveBeenCalledWith(rpc, { p_asset_id: id(101) })
    })
})
