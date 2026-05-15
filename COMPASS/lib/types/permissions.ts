// ─── Types and constants for role permissions ────────────────────────────────
// This file must NOT have 'use server' — it's shared between client and server.
//
// Phase 16 (2026-05-07): simplified to 2 roles (admin, consultant) + legacy
// "internal" enum value retained as Konsultant biurowy (HR-only zone).
// Phase 19a (2026-05-14): added 'finanse' for invoice-review-only access.
// Phase 20 (2026-05-16): added 'manager' (team-scoped HR) + 'talent_community'
//   (tickets+news+compliance+own HR). Wspólne sekcje dla wszystkich HR-zone
//   ról: Inkubator, Aktualności, Support Center, strefa wewnętrzna.
//   Konsultant IT widzi platform features (home/learning/league/incubator/news/support).
//
// Role mapping (Compass docelowo, Phase 20):
//   - admin            → Super Admin (wszystko)
//   - consultant       → Konsultant IT (platform features, BEZ strefy wewnętrznej)
//   - internal         → Konsultant wewnętrzny (HR Hub + wspólne)
//   - finanse          → Finanse (HR Hub + akceptacja faktur etap 2 + wspólne)
//   - manager          → Manager (HR Hub + akceptacja zespołu + wspólne)
//   - talent_community → Talent Community Manager (HR Hub + tickets/news/compliance + wspólne)

export type PermissionRole = 'admin' | 'consultant' | 'internal' | 'finanse' | 'manager' | 'talent_community'

export type PermissionFeature =
    | 'home'
    | 'learning'
    | 'league'
    | 'support'
    | 'news'
    | 'incubator'
    | 'notifications'
    | 'dashboard'
    | 'projects'
    | 'messages'
    | 'documents'
    | 'loyalty'
    | 'settings'

export type PermissionValue = 'true' | 'false' | 'full' | 'readonly'

export type PermissionsMap = Record<PermissionRole, Record<PermissionFeature, PermissionValue>>

const ALL_PANELS_TRUE = {
    home: 'true' as const,
    learning: 'true' as const,
    league: 'true' as const,
    support: 'true' as const,
    news: 'true' as const,
    incubator: 'true' as const,
    notifications: 'true' as const,
}

// Globalny gate dla modułów które są w repo, ale jeszcze niewypuszczone do
// użytkowników (admin też nie widzi w nav). Po launch wystarczy usunąć
// feature z tego setu — kod i routes już istnieją.
export const COMING_SOON_FEATURES: ReadonlySet<PermissionFeature> = new Set<PermissionFeature>([
    'learning',
    'league',
])

export function isFeatureComingSoon(feature: PermissionFeature | null | undefined): boolean {
    if (!feature) return false
    return COMING_SOON_FEATURES.has(feature)
}

export const DEFAULT_PERMISSIONS: PermissionsMap = {
    admin: {
        ...ALL_PANELS_TRUE,
        dashboard: 'full',
        projects: 'full',
        messages: 'full',
        documents: 'full',
        loyalty: 'full',
        settings: 'full',
    },
    consultant: {
        ...ALL_PANELS_TRUE,
        dashboard: 'true',
        projects: 'full',
        messages: 'true',
        documents: 'true',
        loyalty: 'true',
        settings: 'false',
    },
    // Phase 20: HR-zone permissions baseline (Konsultant wewnętrzny / Manager / Finanse / TCM).
    // Wspólne dla wszystkich: Inkubator + Aktualności + Support Center widoczne.
    // Platform features (home/learning/league) UKRYTE — middleware redirectuje na /internal.
    internal: {
        home: 'false',
        learning: 'false',
        league: 'false',
        // Phase 20: wspólne sekcje (user requirement)
        support: 'true',
        news: 'true',
        incubator: 'true',
        notifications: 'true', // HR powiadomienia (urlopy, timesheety)
        dashboard: 'false',
        projects: 'false',
        loyalty: 'false',
        messages: 'true',      // może komunikować się z admin/HR
        documents: 'true',
        settings: 'full',
    },
    // Phase 19a + 20 — Finanse: HR Hub + akceptacja faktur etap 2 + wspólne sekcje.
    finanse: {
        home: 'false',
        learning: 'false',
        league: 'false',
        support: 'true',
        news: 'true',
        incubator: 'true',
        notifications: 'true',
        dashboard: 'false',
        projects: 'false',
        loyalty: 'false',
        messages: 'true',
        documents: 'true',
        settings: 'full',
    },
    // Phase 20 — Manager: HR Hub + akceptacja zespołu + wspólne sekcje.
    manager: {
        home: 'false',
        learning: 'false',
        league: 'false',
        support: 'true',
        news: 'true',
        incubator: 'true',
        notifications: 'true',
        dashboard: 'false',
        projects: 'false',
        loyalty: 'false',
        messages: 'true',
        documents: 'true',
        settings: 'full',
    },
    // Phase 20 — Talent Community Manager: HR Hub + tickets + news composer + compliance + wspólne sekcje.
    talent_community: {
        home: 'false',
        learning: 'false',
        league: 'false',
        support: 'true',
        news: 'true',
        incubator: 'true',
        notifications: 'true',
        dashboard: 'false',
        projects: 'false',
        loyalty: 'false',
        messages: 'true',
        documents: 'true',
        settings: 'full',
    },
}
