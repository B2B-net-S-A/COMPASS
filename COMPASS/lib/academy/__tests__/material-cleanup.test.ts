import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { academyMaterialRetentionPolicy, runAcademyMaterialCleanup } from '../material-cleanup'
vi.mock('server-only', () => ({}))

function fixture(options: { failDelete?: boolean; failAck?: boolean; path?: string } = {}) {
    const remove = vi.fn(async () => ({ error: options.failDelete ? { message: 'private failure' } : null }))
    const from = vi.fn(() => ({ remove }))
    const rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => {
        if (name === 'academy_material_cleanup_report') return { data: { eligible: 1, bytes: 100, failed: 0, purged: 0 }, error: null }
        if (name === 'academy_claim_material_cleanup') return { data: [{ id: 'asset', course_id: 'course', storage_path: options.path ?? 'course/asset/file.pdf', cleanup_token: 'lease' }], error: null }
        if (name === 'academy_finish_material_cleanup') return { data: !(options.failAck && args?.p_error === null), error: null }
        throw new Error('Unexpected RPC')
    })
    return { client: { rpc, storage: { from } } as unknown as SupabaseClient, rpc, from, remove }
}
const execute = { execute: true, uploadHours: 48, rejectedDays: 30 }
describe('material retention execution boundary', () => {
    it('defaults to a report with no mutations or Storage calls', async () => {
        const f = fixture()
        expect(academyMaterialRetentionPolicy({ NODE_ENV: 'test' })).toEqual({ ...execute, execute: false })
        const result = await runAcademyMaterialCleanup(f.client, { ...execute, execute: false })
        expect(result).toMatchObject({ mode: 'report', deleted: 0, eligible: 1 })
        expect(f.rpc).toHaveBeenCalledTimes(1)
        expect(f.from).not.toHaveBeenCalled()
    })
    it.each([{ ACADEMY_UPLOAD_RETENTION_HOURS: '1' }, { ACADEMY_REJECTED_RETENTION_DAYS: '29' }, { ACADEMY_MATERIAL_CLEANUP_ENABLED: 'yes' }])('rejects unsafe or ambiguous policy %o', fields => {
        expect(() => academyMaterialRetentionPolicy({ NODE_ENV: 'test', ...fields })).toThrow('invalid_retention_policy')
    })
    it('deletes only the claimed academy path and acknowledges the same lease', async () => {
        const f = fixture()
        expect(await runAcademyMaterialCleanup(f.client, execute)).toMatchObject({ deleted: 1, retry: 0 })
        expect(f.from).toHaveBeenCalledWith('academy-materials')
        expect(f.remove).toHaveBeenCalledWith(['course/asset/file.pdf'])
        expect(f.rpc).toHaveBeenLastCalledWith('academy_finish_material_cleanup', { p_asset_id: 'asset', p_token: 'lease', p_error: null })
    })
    it.each([{ failDelete: true }, { failAck: true }, { path: 'invoices/sensitive.pdf' }, { path: 'course/asset/../../other.pdf' }])('does not claim successful cleanup on failure: %o', async options => {
        const f = fixture(options)
        expect(await runAcademyMaterialCleanup(f.client, execute)).toMatchObject({ deleted: 0, retry: 1 })
        expect(f.rpc).toHaveBeenLastCalledWith('academy_finish_material_cleanup', { p_asset_id: 'asset', p_token: 'lease', p_error: 'storage_delete_failed' })
        if (options.path) expect(f.remove).not.toHaveBeenCalled()
    })
})
