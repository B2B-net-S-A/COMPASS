// Phase 11: centralized Role type and guards.
//
// DbRole — values that profiles.role can hold in the user_role enum.
// After Phase 16 (PR #27, 2026-05-07) the canonical roles are 2 + 'internal'
// added by Phase 11a. Super-admin elevation now grants 'admin' directly,
// so there are NO legacy aliases ('centrala', 'administrator', 'trainer'
// were dropped from the enum).
//
// Phase 19a (2026-05-14): added 'finanse' for accounting/finance role —
// reviews invoices submitted by internal employees. NIE zatwierdza
// timesheets (admin only). NIE widzi platform features.
//
// Phase 20 (2026-05-16): added 'manager' and 'talent_community' for
// team-scoped HR approval (Manager) and Talent Community Manager
// (tickets + news + compliance + own HR).

import type { Database } from '@/lib/supabase/database.types'

// Audyt 2026-08-25: `DbRole` jest teraz brany WPROST z wygenerowanego enuma
// `user_role`, a lista poniżej sprawdzana przez `satisfies`. Wcześniej była to
// ręczna kopia — rola dodana do enuma i zregenerowane typy nie dawały żadnego
// sygnału, a to właśnie pominięcie roli w liście wyłączyło kiedyś sekcję HR na
// telefonie (komentarz przy HR_ZONE_ROLES). Po regeneracji typów: nowa wartość
// w enumie automatycznie wchodzi do `DbRole`, więc mapy `Record<DbRole, …>`
// (np. etykiety ról) przestają się kompilować, dopóki nie dopiszesz jej tutaj.
export type DbRole = Database['public']['Enums']['user_role']

export const DB_ROLES = [
    'consultant',
    'admin',
    'internal',
    'finanse',
    'manager',
    'talent_community',
] as const satisfies readonly DbRole[]

// Currently identical to DbRole (no app-only aliases). Kept as separate name
// to leave room for future read-only display roles.
export type AppRole = DbRole

/**
 * Role strefy HR — mają dostęp do /internal i wspólnych sekcji.
 * Konsultant IT jest poza: widzi platformę, nie widzi HR.
 *
 * Audyt 2026-08 (C7): ta lista była przepisywana ręcznie w komponentach
 * nawigacji i w MobileMenu wypadły z niej `manager` i `talent_community` —
 * dwie z pięciu ról nie widziały na telefonie własnej sekcji. Jedno źródło
 * usuwa całą klasę takich pominięć.
 */
export const HR_ZONE_ROLES: readonly DbRole[] = [
    'admin',
    'internal',
    'finanse',
    'manager',
    'talent_community',
] as const

export function isHrZoneRole(role: string | null | undefined): boolean {
    return HR_ZONE_ROLES.includes(role as DbRole)
}

export function isAdminLike(role: string | null | undefined): boolean {
    return role === 'admin'
}

export function isInternalEmployee(role: string | null | undefined): boolean {
    return role === 'internal'
}

// Phase 19a: dedicated finance role.
export function isFinance(role: string | null | undefined): boolean {
    return role === 'finanse'
}

// Phase 20: dedicated manager role.
export function isManager(role: string | null | undefined): boolean {
    return role === 'manager'
}

// Phase 20: dedicated Talent Community Manager role.
export function isTalentCommunity(role: string | null | undefined): boolean {
    return role === 'talent_community'
}

// Phase 19a: who can finally approve/reject invoices (stage 2). Admin always wins.
// Phase 20: alias = canFinanceFinalApprove (kept name for backwards compat).
export function canReviewInvoices(role: string | null | undefined): boolean {
    return isAdminLike(role) || isFinance(role)
}

// Phase 20 + 20e: stage 1 approval allowed for anyone who CAN be a team manager.
// admin/manager/finanse — w praktyce każdy HR-zone z direct reports.
// Talent_community/internal teoretycznie też mogą być managerem zespołu (przez
// manager_id link), ale wykluczamy z UI flow — gate przechodzi przez direct
// reports check w samej akcji.
export function canManagerApproveInvoice(role: string | null | undefined): boolean {
    return isAdminLike(role) || isManager(role) || isFinance(role)
}

// Phase 11 + 19d + 20: HR-zone access (timesheet, faktura, work clock, calendar).
// Everyone EXCEPT Konsultant IT.
export function canAccessInternalZone(role: string | null | undefined): boolean {
    return (
        isAdminLike(role) ||
        isInternalEmployee(role) ||
        isFinance(role) ||
        isManager(role) ||
        isTalentCommunity(role)
    )
}

// Phase 20: TCM = admin's right hand for content + tickets + compliance.
export function canManageInbox(role: string | null | undefined): boolean {
    return isAdminLike(role) || isTalentCommunity(role)
}

// Phase 22: TCM = owner of lifecycle module (onboarding + exit interview).
// Same role set as inbox management — kept as separate alias for clarity.
export function canManageLifecycle(role: string | null | undefined): boolean {
    return isAdminLike(role) || isTalentCommunity(role)
}

export function canEditNews(role: string | null | undefined): boolean {
    return isAdminLike(role) || isTalentCommunity(role)
}

export function canManageCompliance(role: string | null | undefined): boolean {
    return isAdminLike(role) || isTalentCommunity(role)
}

// Phase 20 + 20e: timesheet approval — admin (everyone) or manager/finanse (own team only).
// Scope check (own team) is enforced at app + RLS layer with manager_id.
export function canApproveTimesheets(role: string | null | undefined): boolean {
    return isAdminLike(role) || isManager(role) || isFinance(role)
}

// Phase 20 (Manager): can submit their own invoice (treated as office worker).
export function canSubmitOwnInvoice(role: string | null | undefined): boolean {
    return (
        isAdminLike(role) ||
        isInternalEmployee(role) ||
        isFinance(role) ||
        isManager(role) ||
        isTalentCommunity(role)
    )
}

// Phase 22 — kto może proponować premię? Admin (każdemu), manager (swojemu zespołowi).
// Team scope (target.manager_id = ctx.userId) sprawdzane w action body + RLS.
export function canProposeBonus(role: string | null | undefined): boolean {
    return isAdminLike(role) || isManager(role)
}

// Phase 22 — kto widzi globalny raport premii (read-only)? Admin + finanse.
// Manager widzi tylko swój zespół (przez RLS). Recipient widzi swoje.
export function canReadAllBonuses(role: string | null | undefined): boolean {
    return isAdminLike(role) || isFinance(role)
}

// UI labelki dla 6 ról Compass (post Phase 20):
//   admin            → Super Admin (wszystko + własny HR)
//   consultant       → Konsultant IT (platform: learning/league/incubator/news/support)
//   internal         → Konsultant wewnętrzny (HR Hub: timesheet+faktura)
//   finanse          → Finanse (HR Hub + akceptacja faktur — etap 2)
//   manager          → Manager (HR zespołu + własny HR + akceptacja faktur etap 1)
//   talent_community → Talent Community Manager (tickets + news + compliance + własny HR)
export function roleLabelPl(role: string | null | undefined): string {
    switch (role) {
        case 'admin':
            return 'Super Admin'
        case 'consultant':
            return 'Konsultant IT'
        case 'internal':
            return 'Konsultant wewnętrzny'
        case 'finanse':
            return 'Finanse'
        case 'manager':
            return 'Manager'
        case 'talent_community':
            return 'Talent Community Manager'
        default:
            return 'Nieznana'
    }
}
