import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

interface CleanupAsset { id: string; course_id: string; storage_path: string; cleanup_token: string }
interface CleanupReport { eligible: number; bytes: number; failed: number; purged: number }
export interface MaterialRetentionPolicy { execute: boolean; uploadHours: number; rejectedDays: number }

export function academyMaterialRetentionPolicy(env = process.env): MaterialRetentionPolicy {
    const integer = (value: string | undefined, fallback: number, minimum: number, maximum: number) => {
        if (value === undefined || value === '') return fallback
        if (!/^\d+$/.test(value)) throw new Error('invalid_retention_policy')
        const result = Number(value)
        if (!Number.isSafeInteger(result) || result < minimum || result > maximum) throw new Error('invalid_retention_policy')
        return result
    }
    if (env.ACADEMY_MATERIAL_CLEANUP_ENABLED && !['true', 'false'].includes(env.ACADEMY_MATERIAL_CLEANUP_ENABLED)) throw new Error('invalid_retention_policy')
    return {
        execute: env.ACADEMY_MATERIAL_CLEANUP_ENABLED === 'true',
        uploadHours: integer(env.ACADEMY_UPLOAD_RETENTION_HOURS, 48, 48, 8760),
        rejectedDays: integer(env.ACADEMY_REJECTED_RETENTION_DAYS, 30, 30, 3650),
    }
}

/** Defaults to inventory; never deletes published or historical references. */
export async function runAcademyMaterialCleanup(client: SupabaseClient, policy = academyMaterialRetentionPolicy()) {
    const args = { p_upload_hours: policy.uploadHours, p_rejected_days: policy.rejectedDays }
    const report = await client.rpc('academy_material_cleanup_report', args)
    if (report.error || !report.data) throw new Error('material_cleanup_report_failed')
    const result = { mode: policy.execute ? 'execute' : 'report', ...report.data as CleanupReport, deleted: 0, retry: 0 }
    if (!policy.execute) return result
    // One job per request bounds external I/O.
    const claim = await client.rpc('academy_claim_material_cleanup', args)
    if (claim.error) throw new Error('material_cleanup_claim_failed')
    const asset = (claim.data as CleanupAsset[] | null)?.[0]
    if (!asset) return result
    const finish = async (error: string | null) => {
        const ack = await client.rpc('academy_finish_material_cleanup', { p_asset_id: asset.id, p_token: asset.cleanup_token, p_error: error })
        if (ack.error || ack.data !== true) throw new Error('material_cleanup_ack_failed')
    }
    try {
        const prefix = asset.course_id + '/' + asset.id + '/'
        const filename = asset.storage_path.slice(prefix.length)
        if (['.', '..'].includes(filename) || !asset.storage_path.startsWith(prefix) || !/^[a-zA-Z0-9._-]{1,180}$/.test(filename)) throw new Error('material_cleanup_path_invalid')
        const removed = await client.storage.from('academy-materials').remove([asset.storage_path])
        if (removed.error) throw new Error('material_cleanup_storage_failed')
        // DB verifies Storage metadata is absent before releasing quota.
        await finish(null)
        result.deleted = 1
    } catch {
        await finish('storage_delete_failed')
        result.retry = 1
    }
    return result
}
