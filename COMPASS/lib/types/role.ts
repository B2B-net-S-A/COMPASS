// Phase 11: centralized Role type and guards.
//
// DbRole — values that profiles.role can hold in the user_role enum.
// After Phase 16 (PR #27, 2026-05-07) the canonical roles are 2 + 'internal'
// added by Phase 11a. Super-admin elevation now grants 'admin' directly,
// so there are NO legacy aliases ('centrala', 'administrator', 'trainer'
// were dropped from the enum).

export const DB_ROLES = ['consultant', 'admin', 'internal'] as const
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

export function canAccessInternalZone(role: string | null | undefined): boolean {
    return isAdminLike(role) || isInternalEmployee(role)
}

// UI labelki dla 3 ról Compass (post-refactor 2026-05-11):
//   admin       → Super Admin (wszystko)
//   consultant  → Konsultant IT (platform: learning/league/incubator/news/support)
//   internal    → Konsultant biurowy (TYLKO /internal/* HR Hub)
export function roleLabelPl(role: string | null | undefined): string {
    switch (role) {
        case 'admin':
            return 'Super Admin'
        case 'consultant':
            return 'Konsultant IT'
        case 'internal':
            return 'Konsultant biurowy'
        default:
            return 'Nieznana'
    }
}
