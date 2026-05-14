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

export const DB_ROLES = ['consultant', 'admin', 'internal', 'finanse'] as const
export type DbRole = (typeof DB_ROLES)[number]

// Currently identical to DbRole (no app-only aliases). Kept as separate name
// to leave room for future read-only display roles.
export type AppRole = DbRole

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

// Phase 19a: who can approve/reject invoices. Admin always wins as super-role.
export function canReviewInvoices(role: string | null | undefined): boolean {
    return isAdminLike(role) || isFinance(role)
}

export function canAccessInternalZone(role: string | null | undefined): boolean {
    return isAdminLike(role) || isInternalEmployee(role) || isFinance(role)
}

// UI labelki dla 4 ról Compass (post-refactor 2026-05-14, Phase 19a):
//   admin       → Super Admin (wszystko)
//   consultant  → Konsultant IT (platform: learning/league/incubator/news/support)
//   internal    → Konsultant biurowy (TYLKO /internal/* HR Hub)
//   finanse     → Finanse (TYLKO /internal/admin?tab=invoices — review faktur)
export function roleLabelPl(role: string | null | undefined): string {
    switch (role) {
        case 'admin':
            return 'Super Admin'
        case 'consultant':
            return 'Konsultant IT'
        case 'internal':
            return 'Konsultant biurowy'
        case 'finanse':
            return 'Finanse'
        default:
            return 'Nieznana'
    }
}
