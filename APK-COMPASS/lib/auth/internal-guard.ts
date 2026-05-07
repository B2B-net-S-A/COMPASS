// Phase 11: server-side guards for /internal/* routes and HR server actions.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { canAccessInternalZone, isAdminLike, type AppRole } from '@/lib/types/role'

export interface InternalAuthContext {
    userId: string
    email: string
    role: AppRole
    isAdmin: boolean
}

async function loadAuthContext(): Promise<{ userId: string; email: string; role: AppRole } | null> {
    const supabase = createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user || !user.email) return null

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single<{ role: string | null }>()

    const role = (profile?.role ?? 'consultant') as AppRole
    return { userId: user.id, email: user.email, role }
}

/**
 * Server-side guard for /internal/* layout. Redirects unauthorized users.
 * Use in: app/(protected)/internal/layout.tsx
 */
export async function requireInternalOrAdminLayout(): Promise<InternalAuthContext> {
    const ctx = await loadAuthContext()
    if (!ctx) redirect('/login')

    if (!canAccessInternalZone(ctx.role)) {
        redirect('/home')
    }

    return { ...ctx, isAdmin: isAdminLike(ctx.role) }
}

/**
 * Server-action variant: throws instead of redirecting so the caller can
 * surface the error to the client (toast / form error).
 */
export async function requireInternalOrAdminAction(): Promise<InternalAuthContext> {
    const ctx = await loadAuthContext()
    if (!ctx) throw new Error('Unauthorized')

    if (!canAccessInternalZone(ctx.role)) {
        throw new Error('Wymagane uprawnienia: pracownik wewnętrzny lub administrator.')
    }

    return { ...ctx, isAdmin: isAdminLike(ctx.role) }
}

/**
 * Admin-only sub-zone guard. For /internal/admin/* layout and admin actions
 * (approve leave, approve timesheet, edit other users' attendance).
 */
export async function requireAdminAction(): Promise<InternalAuthContext> {
    const ctx = await requireInternalOrAdminAction()
    if (!ctx.isAdmin) throw new Error('Wymagane uprawnienia administratora.')
    return ctx
}

/**
 * Admin-only layout guard. Redirects internal employees back to /internal.
 */
export async function requireAdminLayout(): Promise<InternalAuthContext> {
    const ctx = await requireInternalOrAdminLayout()
    if (!ctx.isAdmin) redirect('/internal')
    return ctx
}
