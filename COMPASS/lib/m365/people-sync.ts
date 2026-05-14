// PR4 — Microsoft Graph People API → Compass profile sync.
//
// On SSO callback and weekly cron we pull jobTitle / department /
// mobilePhone / manager.mail from Graph and write them to the Compass
// `profiles` row. This means HR doesn't have to manually fill org-chart
// fields — Azure AD is the source of truth, Compass mirrors it.
//
// Photo sync is intentionally NOT implemented in v1: requires Supabase
// Storage upload + public-URL fetch + RLS coordination. avatar_url stays
// whatever Supabase/Compass already set it to. Photo will come in a
// follow-up PR if HR actually wants it.
//
// Requires Application permission `User.Read.All` (Microsoft Graph)
// granted to the Compass Azure App (admin consent).

import { createServiceClient } from '@/lib/supabase/admin'
import { extractGraphErrorInfo, getGraphClient } from '@/lib/graph/client'
import { logger } from '@/lib/logger'

export interface SyncProfileResult {
    success: boolean
    /** Set when sync ran and produced field updates. */
    fields?: Partial<{
        manager_email: string
        department: string
        job_title: string
        phone: string
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

    // 3. Build updates (only set fields that Graph returned)
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

    // 4. UPDATE profile (always stamp m365_synced_at so the weekly cron
    // can use it as a bookmark even when Graph returned zero fields)
    const admin = createServiceClient()
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
