import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import type { ActionResult } from '@/lib/types/learning'
import { logger } from '@/lib/logger'
import { academyActionError, academyDatabaseError } from './errors'

export interface AcademyAccess {
    userId: string
    isAdmin: boolean
    canTeach: boolean
    rolloutMode?: 'closed' | 'pilot' | 'open'
    isPilot?: boolean
}

/** Session-bound client. New academy tables are typed at domain boundaries until
 * the generated database schema is refreshed after the additive migration. */
export function academyClient(): SupabaseClient {
    return createClient() as unknown as SupabaseClient
}

export async function requireAcademyContext(options: { trainer?: boolean; admin?: boolean } = {}) {
    const client = academyClient()
    const { data: { user }, error: authError } = await client.auth.getUser()
    if (authError || !user) throw new Error('Zaloguj się, aby korzystać z Akademii.')
    const { data: profile, error } = await client.from('profiles')
        .select('role, is_external, employment_status').eq('id', user.id).single()
    if (error || !profile || profile.is_external || profile.employment_status === 'exited'
        || !['consultant', 'admin'].includes(profile.role)) {
        throw new Error('Nie masz dostępu do Akademii.')
    }
    const { data: rollout, error: rolloutError } = await client.rpc('academy_rollout_access')
    if (rolloutError) throw new Error('Nie udało się sprawdzić dostępności Akademii. Spróbuj ponownie.')
    if (rollout?.allowed !== true) throw new Error('Akademia nie jest jeszcze dostępna dla Twojego konta. Dostęp do pilota nadaje administrator.')
    const isAdmin = profile.role === 'admin'
    let canTeach = isAdmin
    if (!isAdmin) {
        const { data: grant, error: grantError } = await client.from('academy_user_capabilities')
            .select('can_train, revoked_at').eq('user_id', user.id).maybeSingle()
        if (grantError) throw new Error('Nie udało się sprawdzić uprawnień Akademii. Spróbuj ponownie.')
        canTeach = grant?.can_train === true && !grant.revoked_at
    }
    if (options.admin && !isAdmin) throw new Error('Ta operacja wymaga uprawnień administratora.')
    if (options.trainer && !canTeach) throw new Error('Tworzenie szkoleń jest dostępne dla uprawnionych trenerów.')
    return { client, access: { userId: user.id, isAdmin, canTeach, rolloutMode: rollout.mode, isPilot: rollout.isPilot === true } satisfies AcademyAccess }
}

export async function academyAction<T>(event: string, action: () => Promise<T>): Promise<ActionResult<T>> {
    try {
        return { success: true, data: await action() }
    } catch (error) {
        logger.error({ event: `academy.${event}.failed`, error })
        return { success: false, error: academyActionError(error) }
    }
}

export function assertDatabaseResult(error: { message: string; code?: string } | null): asserts error is null {
    if (error) throw new Error(academyDatabaseError(error))
}
