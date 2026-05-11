'use server'

import { createClient } from '@/lib/supabase/server'
import type { DbRole } from '@/lib/types/role'

// Phase 18.6: ujednolicony profile fetch dla server actions / API routes.
// Wcześniej był rozproszony — 24+ `from('profiles').select('role').eq('id',user.id).single()`
// w lib/actions/. Większość plików (loyalty.ts 15×, communicator.ts 9×, profile.ts 8×)
// duplikowała ten sam pattern, każda z minimalnymi wariacjami.
//
// Tu jednolity helper:
//   - getCurrentUserProfile() → minimalny shape { id, email, role } albo null
//   - requireAuth() → throw jeśli nie zalogowany
//   - requireRole('admin') / requireAnyRole('admin','internal') → throw jeśli wrong role
//
// Cache: w obrębie jednego request (React `cache`) — DRY across multiple actions
// w tym samym request. Multi-request caching odroczone do P1.2.2 — wymaga
// strategii inwalidacji (tag-based) razem z migracją z revalidatePath na
// revalidateTag.

// React `cache` jest dostępny tylko w RSC env (Next.js App Router). W vitest
// happy-dom env (i czystym React 18 stable export) jest undefined. Fallback
// do identity function — bez per-request dedupe, ale getCurrentUserProfile
// wciąż działa correctly (po prostu N×fetch zamiast 1).
import * as React from 'react'
const cache: <T extends (...args: never[]) => unknown>(fn: T) => T =
    (React as { cache?: typeof cache }).cache ?? ((fn) => fn)

export interface SessionProfile {
    id: string
    email: string | null
    role: DbRole
}

// Internal: not cached deduplication. Use `getCurrentUserProfile` zamiast.
async function _fetchProfile(): Promise<SessionProfile | null> {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()

    return {
        id: user.id,
        email: user.email ?? null,
        role: (profile?.role as DbRole | undefined) ?? 'consultant',
    }
}

// React `cache` deduplikuje wywołania w obrębie jednego renderu/request.
// Wiele server actions wywoływanych w jednym request page bez kosztu N×fetch.
export const getCurrentUserProfile = cache(_fetchProfile)

/**
 * Throws if user not authenticated. Returns SessionProfile dla zalogowanego.
 */
export async function requireAuth(): Promise<SessionProfile> {
    const profile = await getCurrentUserProfile()
    if (!profile) {
        throw new Error('Nie jesteś zalogowany.')
    }
    return profile
}

/**
 * Throws if user not authenticated OR role doesn't match. Use for admin-only
 * actions (zamiast manual `if (profile.role !== 'admin') throw`).
 *
 * @example
 *   const profile = await requireRole('admin')
 *   // now safe to do admin ops
 */
export async function requireRole(role: DbRole): Promise<SessionProfile> {
    const profile = await requireAuth()
    if (profile.role !== role) {
        throw new Error(`Brak uprawnień. Wymagana rola: ${role}.`)
    }
    return profile
}

/**
 * Throws if user not authenticated OR role doesn't match any of the allowed.
 * Use for actions dostępne dla wielu ról (np. admin OR internal).
 *
 * @example
 *   const profile = await requireAnyRole('admin', 'internal')
 */
export async function requireAnyRole(...allowed: DbRole[]): Promise<SessionProfile> {
    const profile = await requireAuth()
    if (!allowed.includes(profile.role)) {
        throw new Error(`Brak uprawnień. Wymagana rola: ${allowed.join(' lub ')}.`)
    }
    return profile
}

/**
 * Non-throwing version: returns null if not authenticated or wrong role.
 * Use w UI server components gdzie chcesz render fallback zamiast throw.
 */
export async function tryGetRole(): Promise<DbRole | null> {
    const profile = await getCurrentUserProfile()
    return profile?.role ?? null
}
