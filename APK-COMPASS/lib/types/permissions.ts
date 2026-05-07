// ─── Types and constants for role permissions ────────────────────────────────
// This file must NOT have 'use server' — it's shared between client and server.
//
// Phase 16 (2026-05-07): simplified to 2 roles (admin, consultant). The legacy
// recruiter/delivery_lead/finance "centrala" sub-roles, the role_permissions
// table, and the admin permission-matrix UI were removed together with the
// centrala module. Permissions are now derived purely from DEFAULT_PERMISSIONS.

export type PermissionRole = 'admin' | 'consultant'

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
}
