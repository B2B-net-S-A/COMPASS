import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import type { ActionResult } from '@/lib/types/learning'
import { logger } from '@/lib/logger'
import { isAcademyRole } from '@/lib/types/role'
import { isAcademyOnlyUser } from '@/lib/auth/academy-only'
import { academyActionError, academyDatabaseError } from './errors'
import { isMissingDatabaseObject } from './migration-contract'

export interface AcademyAccess {
    userId: string
    isAdmin: boolean
    canManageAcademy: boolean
    canTeach: boolean
    /** Ustalane tylko na żądanie (`reviewer` albo `reviewState`). Inaczej undefined, czyli brak prawa. */
    canReview?: boolean
    isManager?: boolean
    rolloutMode?: 'closed' | 'pilot' | 'open'
    isPilot?: boolean
}

/** Session-bound client. New academy tables are typed at domain boundaries until
 * the generated database schema is refreshed after the additive migration. */
export function academyClient(): SupabaseClient {
    return createClient() as unknown as SupabaseClient
}

/** TCM recenzuje dopiero po migracji B3.10: bez niej funkcji nie ma i zachowanie zostaje stare. */
async function tcmMayReview(client: SupabaseClient): Promise<boolean> {
    const { data, error } = await client.rpc('academy_is_reviewer')
    if (error && !isMissingDatabaseObject(error)) logger.error({ event: 'academy.reviewer_probe.failed', error })
    return !error && data === true
}

export async function requireAcademyContext(options: { trainer?: boolean; admin?: boolean; editor?: boolean; reviewer?: boolean; reviewState?: boolean } = {}) {
    const client = academyClient()
    const { data: { user }, error: authError } = await client.auth.getUser()
    if (authError || !user) throw new Error('Zaloguj się, aby korzystać z Akademii.')
    const { data: profile, error } = await client.from('profiles')
        .select('role, is_external, employment_status').eq('id', user.id).single()
    if (error || !profile || profile.is_external || profile.employment_status === 'exited'
        || !isAcademyRole(profile.role)) {
        throw new Error('Nie masz dostępu do Akademii.')
    }
    const { data: rollout, error: rolloutError } = await client.rpc('academy_rollout_access')
    if (rolloutError) throw new Error('Nie udało się sprawdzić dostępności Akademii. Spróbuj ponownie.')
    if (rollout?.allowed !== true) throw new Error('Akademia nie jest jeszcze dostępna dla Twojego konta. Dostęp do pilota nadaje administrator.')
    // Konto nauki jest tylko uczestnikiem, nawet gdyby jego wiersz profilu mówił co innego.
    const learnerOnly = isAcademyOnlyUser(user)
    const isAdmin = !learnerOnly && profile.role === 'admin'
    const canManageAcademy = isAdmin || (!learnerOnly && profile.role === 'talent_community')
    let canTeach = canManageAcademy
    if (!canManageAcademy && !learnerOnly) {
        const { data: grant, error: grantError } = await client.from('academy_user_capabilities')
            .select('can_train, revoked_at').eq('user_id', user.id).maybeSingle()
        if (grantError) throw new Error('Nie udało się sprawdzić uprawnień Akademii. Spróbuj ponownie.')
        canTeach = grant?.can_train === true && !grant.revoked_at
    }
    const wantsReview = options.reviewer === true || options.reviewState === true
    const canReview = wantsReview ? isAdmin || (canManageAcademy && await tcmMayReview(client)) : undefined
    if (options.admin && !isAdmin) throw new Error('Ta operacja wymaga uprawnień administratora.')
    if (options.reviewer && !canReview) throw new Error('Ta operacja wymaga uprawnień recenzenta Akademii.')
    if (options.editor && !canManageAcademy) throw new Error('Ta operacja wymaga uprawnień obsługi Akademii.')
    if (options.trainer && !canTeach) throw new Error('Tworzenie szkoleń jest dostępne dla uprawnionych trenerów.')
    const access: AcademyAccess = { userId: user.id, isAdmin, canManageAcademy, canTeach, canReview, isManager: !learnerOnly && profile.role === 'manager', rolloutMode: rollout.mode, isPilot: rollout.isPilot === true }
    return { client, access }
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
