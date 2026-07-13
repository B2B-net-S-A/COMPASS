'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/admin'
import { requireInternalOrAdminAction } from '@/lib/auth/internal-guard'
import { logAudit } from '@/lib/actions/audit'
import {
    WORK_MONITORING_TERMS_VERSION,
    type ClockConsentState,
} from '@/lib/clock/constants'
import { captureRequestMetadata, recomputeActiveSeconds } from './_shared'

/** Async getter for 'use client' components that can't import the const directly. */
export async function getWorkMonitoringTermsVersion(): Promise<string> {
    return WORK_MONITORING_TERMS_VERSION
}

export async function getMyConsentState(): Promise<ClockConsentState> {
    const ctx = await requireInternalOrAdminAction()
    const supabase = createClient()
    const { data, error } = await supabase
        .from('work_clock_consents')
        .select('terms_version, accepted_at, revoked_at')
        .eq('user_id', ctx.userId)
        .maybeSingle<{ terms_version: string; accepted_at: string; revoked_at: string | null }>()
    if (error) throw new Error(`Błąd pobierania zgody: ${error.message}`)
    if (!data) return { hasConsent: false, termsVersion: null, acceptedAt: null, revokedAt: null }
    return {
        hasConsent: data.revoked_at == null && data.terms_version === WORK_MONITORING_TERMS_VERSION,
        termsVersion: data.terms_version,
        acceptedAt: data.accepted_at,
        revokedAt: data.revoked_at,
    }
}

export async function acceptMonitoringConsent(termsVersion: string): Promise<void> {
    const ctx = await requireInternalOrAdminAction()
    if (termsVersion !== WORK_MONITORING_TERMS_VERSION) {
        throw new Error(
            `Nieprawidłowa wersja regulaminu (oczekiwano ${WORK_MONITORING_TERMS_VERSION}).`,
        )
    }
    const { ip, ua } = await captureRequestMetadata()
    const supabase = createClient()
    const { error } = await supabase.from('work_clock_consents').upsert(
        {
            user_id: ctx.userId,
            accepted_at: new Date().toISOString(),
            accepted_ip: ip,
            accepted_ua: ua,
            terms_version: termsVersion,
            revoked_at: null,
            revoked_reason: null,
        },
        { onConflict: 'user_id' },
    )
    if (error) throw new Error(`Błąd zapisu zgody: ${error.message}`)
    await logAudit(ctx.userId, 'WORK_CLOCK_CONSENT_ACCEPTED', { terms_version: termsVersion, ip })
}

export async function revokeMonitoringConsent(reason?: string): Promise<void> {
    const ctx = await requireInternalOrAdminAction()
    const supabase = createClient()
    const { error } = await supabase
        .from('work_clock_consents')
        .update({
            revoked_at: new Date().toISOString(),
            revoked_reason: reason?.trim() || null,
        })
        .eq('user_id', ctx.userId)
    if (error) throw new Error(`Błąd cofnięcia zgody: ${error.message}`)

    const admin = createServiceClient()
    const { data: liveSession } = await admin
        .from('work_clock_sessions')
        .select('id')
        .eq('user_id', ctx.userId)
        .is('ended_at', null)
        .maybeSingle<{ id: string }>()
    if (liveSession) {
        const recomp = await recomputeActiveSeconds(admin, liveSession.id)
        await admin
            .from('work_clock_sessions')
            .update({
                ended_at: new Date().toISOString(),
                closed_reason: 'admin_close',
                active_seconds: recomp.activeSeconds,
                idle_seconds: recomp.idleSeconds,
            })
            .eq('id', liveSession.id)
    }
    await logAudit(ctx.userId, 'WORK_CLOCK_CONSENT_REVOKED', { reason: reason?.trim() ?? null })
}
