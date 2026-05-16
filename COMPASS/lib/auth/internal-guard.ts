// Phase 11: server-side guards for /internal/* routes and HR server actions.
// Phase 19a (2026-05-14): added `requireInvoiceReviewerAction/Layout` for admin OR finanse.
// Phase 20 (2026-05-16): added manager + talent_community guards + extended InternalAuthContext.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
    canAccessInternalZone,
    canManageInbox,
    canManageLifecycle,
    canManagerApproveInvoice,
    canProposeBonus,
    canReadAllBonuses,
    canReviewInvoices,
    isAdminLike,
    isManager,
    isTalentCommunity,
    type AppRole,
} from '@/lib/types/role'

export interface InternalAuthContext {
    userId: string
    email: string
    role: AppRole
    isAdmin: boolean
    // Phase 20: role-specific flags (computed once, cached on ctx)
    isManager: boolean
    isTalentCommunity: boolean
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

function buildCtx(base: { userId: string; email: string; role: AppRole }): InternalAuthContext {
    return {
        ...base,
        isAdmin: isAdminLike(base.role),
        isManager: isManager(base.role),
        isTalentCommunity: isTalentCommunity(base.role),
    }
}

/**
 * Server-side guard for /internal/* layout. Redirects unauthorized users.
 * Use in: app/(protected)/internal/layout.tsx
 *
 * Phase 20: now allows admin, internal, finanse, manager, talent_community.
 * Konsultant IT → /home.
 */
export async function requireInternalOrAdminLayout(): Promise<InternalAuthContext> {
    const ctx = await loadAuthContext()
    if (!ctx) redirect('/login')

    if (!canAccessInternalZone(ctx.role)) {
        redirect('/home')
    }

    return buildCtx(ctx)
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

    return buildCtx(ctx)
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

/**
 * Phase 20 + 20e — Timesheet approver guard.
 * Allowed: admin (everyone), manager (own team), finanse (own team via manager_id link).
 * Team scope (target.manager_id = ctx.userId) enforced separately in action body.
 */
export async function requireTimesheetApproverAction(): Promise<InternalAuthContext> {
    const ctx = await requireInternalOrAdminAction()
    if (!ctx.isAdmin && !ctx.isManager && ctx.role !== 'finanse') {
        throw new Error('Wymagane uprawnienia: administrator, manager lub finanse.')
    }
    return ctx
}

/**
 * Phase 20 + 20e — Manager invoice approver guard — stage 1 (merit).
 * Allowed: admin (everyone), manager (own team), finanse (own team via manager_id link).
 * Team scope enforced separately in action body.
 */
export async function requireManagerInvoiceApproverAction(): Promise<InternalAuthContext> {
    const ctx = await requireInternalOrAdminAction()
    if (!canManagerApproveInvoice(ctx.role)) {
        throw new Error('Wymagane uprawnienia: administrator, manager lub finanse.')
    }
    return ctx
}

/**
 * Phase 19a — Invoice reviewer guard (admin OR finanse) — stage 2 (final).
 * Server-action variant: throws on unauthorized.
 */
export async function requireInvoiceReviewerAction(): Promise<InternalAuthContext> {
    const ctx = await requireInternalOrAdminAction()
    if (!canReviewInvoices(ctx.role)) {
        throw new Error('Wymagane uprawnienia: administrator lub finanse.')
    }
    return ctx
}

/**
 * Phase 19a — Invoice reviewer guard (admin OR finanse).
 * Layout variant: redirects unauthorized to /internal.
 */
export async function requireInvoiceReviewerLayout(): Promise<InternalAuthContext> {
    const ctx = await requireInternalOrAdminLayout()
    if (!canReviewInvoices(ctx.role)) redirect('/internal')
    return ctx
}

/**
 * Phase 20 — Talent Community Manager / admin guard for inbox + compliance + news composer.
 * Action variant.
 */
export async function requireTalentCommunityOrAdminAction(): Promise<InternalAuthContext> {
    const ctx = await loadAuthContext()
    if (!ctx) throw new Error('Unauthorized')
    if (!canManageInbox(ctx.role)) {
        throw new Error('Wymagane uprawnienia: administrator lub Talent Community Manager.')
    }
    return buildCtx(ctx)
}

/**
 * Phase 20 — Talent Community Manager / admin layout guard.
 */
export async function requireTalentCommunityOrAdminLayout(): Promise<InternalAuthContext> {
    const ctx = await loadAuthContext()
    if (!ctx) redirect('/login')
    if (!canManageInbox(ctx.role)) {
        redirect('/internal')
    }
    return buildCtx(ctx)
}

/**
 * Phase 20 + 20e — Internal Admin Area layout guard.
 * Dopuszcza: admin (wszystko), finanse (invoice review + own team), manager (team scope).
 * NIE dopuszcza: konsultant IT, konsultant wewnętrzny, talent_community.
 * Talent Community Manager ma osobny obszar pod /admin/inbox + /admin/compliance.
 */
export async function requireInternalAdminAreaLayout(): Promise<InternalAuthContext> {
    const ctx = await requireInternalOrAdminLayout()
    if (!ctx.isAdmin && ctx.role !== 'finanse' && !ctx.isManager) {
        redirect('/internal')
    }
    return ctx
}

/**
 * Phase 22 — Lifecycle module guard (admin OR talent_community).
 * Required for: template CRUD, scheduling onboarding/exit, reviewing exit interviews.
 * Server-action variant: throws on unauthorized.
 */
export async function requireLifecycleManagerAction(): Promise<InternalAuthContext> {
    const ctx = await loadAuthContext()
    if (!ctx) throw new Error('Unauthorized')
    if (!canManageLifecycle(ctx.role)) {
        throw new Error('Wymagane uprawnienia: administrator lub Talent Community Manager.')
    }
    return buildCtx(ctx)
}

/**
 * Phase 22 — Lifecycle module layout guard.
 * Allowed: admin, talent_community, manager (read-only for team), or employee with active
 * own onboarding/exit interview (page-level check in the layout).
 */
export async function requireLifecycleHubLayout(): Promise<InternalAuthContext> {
    const ctx = await loadAuthContext()
    if (!ctx) redirect('/login')
    // Access logic delegated to layout — we just enforce auth + HR-zone here.
    // Konsultant IT without active lifecycle redirects to /home.
    if (!canAccessInternalZone(ctx.role) && !canManageLifecycle(ctx.role)) {
        redirect('/home')
    }
    return buildCtx(ctx)
}

/**
 * Phase 23 — Bonus proposer guard.
 * Allowed: admin (anyone), manager (own team only — team scope enforced in action body + RLS).
 */
export async function requireBonusProposerAction(): Promise<InternalAuthContext> {
    const ctx = await requireInternalOrAdminAction()
    if (!canProposeBonus(ctx.role)) {
        throw new Error('Wymagane uprawnienia: administrator lub manager.')
    }
    return ctx
}

/**
 * Phase 23 — Bonus read-all guard (global report).
 * Allowed: admin, finanse (read-only). Manager sees own team via RLS, not this guard.
 */
export async function requireBonusReadAllAction(): Promise<InternalAuthContext> {
    const ctx = await requireInternalOrAdminAction()
    if (!canReadAllBonuses(ctx.role)) {
        throw new Error('Wymagane uprawnienia: administrator lub finanse.')
    }
    return ctx
}
