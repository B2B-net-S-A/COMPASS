// PR4 — Microsoft Graph People API → Compass profile sync.
//
// On SSO callback and weekly cron we pull jobTitle / department /
// mobilePhone / manager.mail / photo from Graph and write them to the
// Compass `profiles` row. This means HR doesn't have to manually fill
// org-chart fields or upload avatars — Azure AD is the source of truth,
// Compass mirrors it.
//
// Photo sync (PR4 v2): GET /users/{email}/photo metadata + /photo/$value
// binary, upload to Supabase Storage bucket `avatars` under m365/{userId}.jpg,
// stamp avatar_url with a content-hash query string for cache busting.
// 404 on /photo = user hasn't uploaded one in Azure (normal) — skip.
//
// Requires Application permission `User.Read.All` (Microsoft Graph)
// granted to the Compass Azure App (admin consent). The same permission
// covers `/photo/$value` per Microsoft docs — no extra consent needed.

import { createHash } from 'crypto'

import { createServiceClient } from '@/lib/supabase/admin'
import { extractGraphErrorInfo, getGraphClient, type GraphLike } from '@/lib/graph/client'
import { logger } from '@/lib/logger'

export type AvatarSource = 'manual' | 'm365'

export interface SyncProfileResult {
    success: boolean
    /** Set when sync ran and produced field updates. */
    fields?: Partial<{
        manager_email: string
        department: string
        job_title: string
        phone: string
        avatar_url: string
        avatar_source: AvatarSource
    }>
    /** True when we skipped (missing credentials, missing email). */
    skipped?: boolean
    error?: string
}

interface GraphUser {
    jobTitle?: string | null
    department?: string | null
    mobilePhone?: string | null
    businessPhones?: string[] | null
}

interface GraphManager {
    mail?: string | null
}

interface GraphPhotoMetadata {
    '@odata.mediaContentType'?: string | null
    width?: number | null
    height?: number | null
}

// Tenant photo limit per Microsoft docs is 4MB; we add a defensive ceiling
// so a runaway response can't blow up storage or memory.
const MAX_PHOTO_BYTES = 4 * 1024 * 1024

/**
 * Fetch Graph user attributes + manager and write them back to profiles.
 *
 * Designed to be called fire-and-forget from SSO callback (no blocking),
 * but also synchronously from the weekly resync cron (where we want to
 * know per-user success).
 *
 * `userId` is the Compass/Supabase auth.users.id. `userEmail` is the
 * Microsoft user principal name (same as the Compass profile email for
 * @b2bnetwork.pl users — that's how SSO matches them).
 */
export async function syncProfileFromGraph(
    userId: string,
    userEmail: string,
): Promise<SyncProfileResult> {
    if (!process.env.AZURE_TENANT_ID || !process.env.AZURE_CLIENT_ID || !process.env.AZURE_CLIENT_SECRET) {
        return { success: true, skipped: true }
    }
    if (!userEmail) {
        return { success: false, error: 'missing_user_email' }
    }

    let client
    try {
        client = await getGraphClient()
    } catch (err) {
        return {
            success: false,
            error: err instanceof Error ? err.message : 'graph_client_setup_failed',
        }
    }

    // 0. Snapshot avatar_source so we can decide later whether the photo
    // sync is allowed to overwrite avatar_url (manual uploads are honored).
    // Lookup is best-effort: if it fails we treat the source as unknown
    // (= allow m365 overwrite). Race with a concurrent manual upload is
    // acceptable — admin can re-upload anytime; sync only runs hourly at
    // worst (per-SSO or weekly cron).
    const admin = createServiceClient()
    const avatarSource = await readAvatarSource(admin, userId)

    // 1. Fetch user core fields
    let user: GraphUser
    try {
        user = (await client
            .api(`/users/${encodeURIComponent(userEmail)}`)
            .select('jobTitle,department,mobilePhone,businessPhones')
            .get()) as GraphUser
    } catch (err) {
        const { statusCode } = extractGraphErrorInfo(err)
        if (statusCode === 404) {
            // External / guest accounts may not exist in the tenant. That's
            // a config issue (someone joined via a different domain), not
            // an outage — log info and bail without escalating to Sentry.
            //
            // Audyt 2026-08: wychodziliśmy stąd BEZ stempla `m365_synced_at`, więc
            // takie konto zostawało na zawsze w koszyku „nigdy nie synchronizowane"
            // crona `m365-profile-resync` i zjadało slot z limitu MAX_PER_RUN przy
            // każdym tygodniowym przebiegu. Stempel przesuwa je do koszyka
            // „przeterminowane", czyli ponowimy za STALE_DAYS zamiast co przebieg.
            // Konto spoza tenanta to stan konfiguracji, nie chwilowa awaria.
            await admin
                .from('profiles')
                .update({ m365_synced_at: new Date().toISOString() })
                .eq('id', userId)
            logger.info({
                event: 'm365.people.user_not_found',
                userId,
            })
            return { success: false, error: 'user_not_found_in_tenant' }
        }
        const message = err instanceof Error ? err.message : 'unknown_graph_error'
        logger.warn({ event: 'm365.people.user_fetch_failed', error: message, userId })
        return { success: false, error: message }
    }

    // 2. Fetch manager (404 = brak managera, treat as null)
    let manager: GraphManager | null = null
    try {
        manager = (await client
            .api(`/users/${encodeURIComponent(userEmail)}/manager`)
            .select('mail')
            .get()) as GraphManager
    } catch (err) {
        const { statusCode } = extractGraphErrorInfo(err)
        if (statusCode === 404) {
            // No manager set in Azure — normal for CEO/founder, ignore.
            manager = null
        } else {
            // Don't fail the whole sync — log and continue without manager.
            const message = err instanceof Error ? err.message : 'unknown_graph_error'
            logger.warn({ event: 'm365.people.manager_fetch_failed', error: message, userId })
        }
    }

    // 3. Fetch + upload profile photo (best-effort; never fails the sync).
    // Skips entirely when the existing avatar was uploaded manually — we
    // don't clobber HR/user choices with an Azure photo.
    const avatarUrl = avatarSource === 'manual'
        ? undefined
        : await syncPhotoFromGraph(client, userId, userEmail)
    if (avatarSource === 'manual') {
        logger.info({ event: 'm365.people.photo_skipped_manual_avatar', userId })
    }

    // 4. Build updates (only set fields that Graph returned)
    const fields: NonNullable<SyncProfileResult['fields']> = {}
    if (typeof user.jobTitle === 'string' && user.jobTitle.trim()) {
        fields.job_title = user.jobTitle.trim()
    }
    if (typeof user.department === 'string' && user.department.trim()) {
        fields.department = user.department.trim()
    }
    const phone = pickFirstPhone(user.mobilePhone, user.businessPhones)
    if (phone) {
        fields.phone = phone
    }
    if (manager && typeof manager.mail === 'string' && manager.mail.trim()) {
        fields.manager_email = manager.mail.trim().toLowerCase()
    }
    if (avatarUrl) {
        fields.avatar_url = avatarUrl
        // Stamp source so future syncs know this avatar came from m365 and
        // a subsequent manual upload (via uploadAvatar) will mark it 'manual'.
        fields.avatar_source = 'm365'
    }

    // 5. UPDATE profile (always stamp m365_synced_at so the weekly cron
    // can use it as a bookmark even when Graph returned zero fields)
    const { error } = await admin
        .from('profiles')
        .update({
            ...fields,
            m365_synced_at: new Date().toISOString(),
        })
        .eq('id', userId)

    if (error) {
        logger.error({ event: 'm365.people.db_update_failed', error, userId })
        return { success: false, error: error.message, fields }
    }

    logger.info({
        event: 'm365.people.synced',
        userId,
        fieldsCount: Object.keys(fields).length,
    })
    return { success: true, fields }
}

function pickFirstPhone(mobile: string | null | undefined, business: string[] | null | undefined): string | undefined {
    if (mobile && mobile.trim()) return mobile.trim()
    if (business && business.length > 0 && business[0]?.trim()) return business[0].trim()
    return undefined
}

/**
 * Download the user's Azure AD photo and upload it to Supabase Storage.
 *
 * Returns a public URL with a content-hash query string so browsers refresh
 * the cached avatar when bytes actually change. Returns undefined on any
 * failure — photo is a nice-to-have, not a sync blocker.
 *
 * Storage layout: bucket `avatars`, path `m365/{userId}.{ext}` with upsert.
 * The `m365/` prefix keeps Graph-sourced avatars separate from user-uploaded
 * ones in `profiles/{userId}-{timestamp}.{ext}` (see lib/actions/files.ts).
 */
async function syncPhotoFromGraph(
    client: GraphLike,
    userId: string,
    userEmail: string,
): Promise<string | undefined> {
    let metadata: GraphPhotoMetadata
    try {
        metadata = (await client
            .api(`/users/${encodeURIComponent(userEmail)}/photo`)
            .get()) as GraphPhotoMetadata
    } catch (err) {
        const { statusCode } = extractGraphErrorInfo(err)
        if (statusCode === 404) {
            // No photo uploaded in Azure — common for new users, ignore.
            return undefined
        }
        const message = err instanceof Error ? err.message : 'unknown_graph_error'
        logger.warn({ event: 'm365.people.photo_metadata_failed', error: message, userId })
        return undefined
    }

    const mediaType = typeof metadata['@odata.mediaContentType'] === 'string'
        ? metadata['@odata.mediaContentType']
        : 'image/jpeg'

    let buffer: Buffer
    try {
        const raw = await client
            .api(`/users/${encodeURIComponent(userEmail)}/photo/$value`)
            .responseType('arraybuffer')
            .get()
        const coerced = toBuffer(raw)
        if (!coerced) {
            logger.warn({ event: 'm365.people.photo_unexpected_response', userId })
            return undefined
        }
        buffer = coerced
    } catch (err) {
        const { statusCode } = extractGraphErrorInfo(err)
        if (statusCode === 404) return undefined
        const message = err instanceof Error ? err.message : 'unknown_graph_error'
        logger.warn({ event: 'm365.people.photo_download_failed', error: message, userId })
        return undefined
    }

    if (buffer.byteLength === 0 || buffer.byteLength > MAX_PHOTO_BYTES) {
        logger.warn({
            event: 'm365.people.photo_size_invalid',
            userId,
            bytes: buffer.byteLength,
        })
        return undefined
    }

    const hashPrefix = createHash('sha256').update(buffer).digest('hex').slice(0, 12)
    // Single path per user — overwriting in place avoids old-file leak as
    // photos change. Extension is fixed (.jpg) because Supabase serves the
    // file using the contentType we set on upload, not the URL suffix.
    const path = `m365/${userId}.jpg`
    const admin = createServiceClient()

    const { error: uploadError } = await admin.storage
        .from('avatars')
        .upload(path, buffer, {
            contentType: mediaType,
            upsert: true,
        })
    if (uploadError) {
        logger.warn({
            event: 'm365.people.photo_upload_failed',
            error: uploadError.message,
            userId,
        })
        return undefined
    }

    const { data: { publicUrl } } = admin.storage.from('avatars').getPublicUrl(path)
    // Cache-bust via content hash — same bytes → same URL → browser cache hit.
    return `${publicUrl}?v=${hashPrefix}`
}

/**
 * Lookup current avatar_source for a profile. Returns undefined when the
 * row doesn't exist or the column hasn't been backfilled yet — caller
 * treats undefined as "no manual override, m365 may write".
 */
async function readAvatarSource(
    admin: ReturnType<typeof createServiceClient>,
    userId: string,
): Promise<AvatarSource | undefined> {
    const { data, error } = await admin
        .from('profiles')
        .select('avatar_source')
        .eq('id', userId)
        .maybeSingle()
    if (error) {
        logger.warn({ event: 'm365.people.avatar_source_lookup_failed', error: error.message, userId })
        return undefined
    }
    const value = data?.avatar_source
    if (value === 'manual' || value === 'm365') return value
    return undefined
}

function toBuffer(value: unknown): Buffer | undefined {
    if (value instanceof ArrayBuffer) {
        return Buffer.from(new Uint8Array(value))
    }
    if (ArrayBuffer.isView(value)) {
        return Buffer.from(value.buffer, value.byteOffset, value.byteLength)
    }
    return undefined
}
