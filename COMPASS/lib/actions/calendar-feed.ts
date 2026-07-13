'use server'

import { revalidatePath } from 'next/cache'
import { createCalendarFeedToken, hashCalendarFeedToken } from '@/lib/calendar/feed-token'
import { createServiceClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

const CALENDAR_FEED_ROLES = new Set([
    'internal',
    'admin',
    'finanse',
    'manager',
    'talent_community',
])

type CalendarProfile = {
    id: string
    role: string | null
    employment_status: string
    is_external: boolean
}

async function requireEligibleCalendarUser(): Promise<CalendarProfile> {
    const session = createClient()
    const { data: { user } } = await session.auth.getUser()
    if (!user) throw new Error('Nie jesteś zalogowany.')

    const admin = createServiceClient()
    const { data, error } = await admin
        .from('profiles')
        .select('id, role, employment_status, is_external')
        .eq('id', user.id)
        .single()

    const profile = data as CalendarProfile | null
    if (
        error
        || !profile
        || profile.is_external
        || !['active', 'onboarding'].includes(profile.employment_status)
        || !profile.role
        || !CALENDAR_FEED_ROLES.has(profile.role)
    ) {
        throw new Error('Kalendarz jest niedostępny dla tego konta.')
    }

    return profile
}

export async function getCalendarFeedStatus(): Promise<{
    eligible: boolean
    active: boolean
    rotatedAt: string | null
}> {
    try {
        const profile = await requireEligibleCalendarUser()
        const admin = createServiceClient()
        const { data } = await admin
            .from('calendar_feed_tokens')
            .select('rotated_at, revoked_at')
            .eq('user_id', profile.id)
            .maybeSingle()

        return {
            eligible: true,
            active: Boolean(data && !data.revoked_at),
            rotatedAt: data?.rotated_at ?? null,
        }
    } catch {
        return { eligible: false, active: false, rotatedAt: null }
    }
}

export async function createOrRotateCalendarFeedToken(): Promise<{
    token: string
    url: string
}> {
    const profile = await requireEligibleCalendarUser()
    const token = createCalendarFeedToken()
    const tokenHash = hashCalendarFeedToken(token)
    const now = new Date().toISOString()
    const admin = createServiceClient()

    const { error } = await admin
        .from('calendar_feed_tokens')
        .upsert({
            user_id: profile.id,
            token_hash: tokenHash,
            rotated_at: now,
            revoked_at: null,
            last_used_at: null,
        }, { onConflict: 'user_id' })

    if (error) throw new Error('Nie udało się utworzyć linku kalendarza.')

    const appUrl = (
        process.env.NEXT_PUBLIC_APP_URL
        || process.env.NEXT_PUBLIC_SITE_URL
        || 'http://localhost:10000'
    ).replace(/\/$/, '')

    revalidatePath('/settings')
    return {
        token,
        url: `${appUrl}/api/internal/calendar.ics?token=${encodeURIComponent(token)}`,
    }
}

export async function revokeCalendarFeedToken(): Promise<{ success: true }> {
    const profile = await requireEligibleCalendarUser()
    const admin = createServiceClient()
    const { error } = await admin
        .from('calendar_feed_tokens')
        .update({ revoked_at: new Date().toISOString() })
        .eq('user_id', profile.id)
        .is('revoked_at', null)

    if (error) throw new Error('Nie udało się unieważnić linku kalendarza.')
    revalidatePath('/settings')
    return { success: true }
}
