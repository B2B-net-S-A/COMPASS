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

export const DB_ROLES = [
    'consultant',
    'admin',
    'internal',
    'finanse',
    'manager',
    'talent_community',
] as const
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

// Phase 20: Manager performs stage 1 (merit) approval. Admin can do both stages.
export function canManagerApproveInvoice(role: string | null | undefined): boolean {
    return isAdminLike(role) || isManager(role)
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

export function canEditNews(role: string | null | undefined): boolean {
    return isAdminLike(role) || isTalentCommunity(role)
}

export function canManageCompliance(role: string | null | undefined): boolean {
    return isAdminLike(role) || isTalentCommunity(role)
}

// Phase 20: timesheet approval — admin (everyone) or manager (own team only).
// Scope check (manager → own team) is enforced at app + RLS layer with manager_id.
export function canApproveTimesheets(role: string | null | undefined): boolean {
    return isAdminLike(role) || isManager(role)
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
