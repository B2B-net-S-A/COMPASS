// ─── Types and constants for role permissions ────────────────────────────────
// This file must NOT have 'use server' — it's shared between client and server.
//
// Phase 16 (2026-05-07): simplified to 2 roles (admin, consultant) + legacy
// "internal" enum value retained as Konsultant biurowy (HR-only zone).
// The role_permissions table and admin permission-matrix UI były usunięte —
// permissions są derived from DEFAULT_PERMISSIONS.
//
// Role mapping (Compass docelowo):
//   - admin       → Super Admin (wszystko)
//   - consultant  → Konsultant IT (platform: home/learning/league/incubator/news/support)
//   - internal    → Konsultant biurowy (TYLKO /internal/* HR Hub, bez platform features)

export type PermissionRole = 'admin' | 'consultant' | 'internal'

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
    // Konsultant biurowy — HR-only zone. Wszystkie platform features OFF.
    // Sidebar `filterByPermission` (Sidebar.tsx) automatycznie ukryje grupy
    // Growth + Community. Middleware (middleware.ts) blokuje /home + platform paths.
    internal: {
        home: 'false',
        learning: 'false',
        league: 'false',
        support: 'false',
        news: 'false',
        incubator: 'false',
        notifications: 'true', // HR powiadomienia (urlopy, timesheety)
        dashboard: 'false',
        projects: 'false',
        loyalty: 'false',
        messages: 'true',      // może komunikować się z admin/HR
        documents: 'true',
        settings: 'full',
    },
}
