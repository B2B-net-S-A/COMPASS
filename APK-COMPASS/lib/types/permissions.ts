// ─── Types and constants for role permissions ────────────────────────────────
// This file must NOT have 'use server' — it's shared between client and server.

export type PermissionRole = 'recruiter' | 'delivery_lead' | 'finance' | 'consultant'

// Phase 0 (2026-05-04): added new platform panels (home, learning, league, support, news, incubator, notifications).
// Legacy keys (candidates, service_hub, development, import, referrals, rates) retained until Phase 1 cleanup
// to keep `/admin/{candidates,rates,import,referrals}/...` pages compilable while the new IA rolls out.
export type PermissionFeature =
    // New platform panels
    | 'home'
    | 'learning'
    | 'league'
    | 'support'
    | 'news'
    | 'incubator'
    | 'notifications'
    // Utility (kept)
    | 'dashboard'
    | 'projects'
    | 'messages'
    | 'documents'
    | 'loyalty'
    | 'ai_assistant'
    | 'settings'
    // Legacy (Phase 1 cleanup target)
    | 'candidates'
    | 'service_hub'
    | 'development'
    | 'import'
    | 'referrals'
    | 'rates'

export type PermissionValue = 'true' | 'false' | 'portfolio' | 'full' | 'readonly'

export type PermissionsMap = Record<PermissionRole, Record<PermissionFeature, PermissionValue>>

export interface PermissionUpdate {
    role: PermissionRole
    feature: PermissionFeature
    value: PermissionValue
}

const NEW_PANEL_DEFAULTS = {
    home: 'true' as const,
    learning: 'true' as const,
    league: 'true' as const,
    support: 'true' as const,
    news: 'true' as const,
    incubator: 'true' as const,
    notifications: 'true' as const,
}

export const DEFAULT_PERMISSIONS: PermissionsMap = {
    recruiter: {
        ...NEW_PANEL_DEFAULTS,
        dashboard: 'true', projects: 'portfolio', candidates: 'portfolio',
        service_hub: 'true', messages: 'true', documents: 'true',
        loyalty: 'true', development: 'true', import: 'false',
        referrals: 'true', ai_assistant: 'portfolio', settings: 'false',
        rates: 'true',
    },
    delivery_lead: {
        ...NEW_PANEL_DEFAULTS,
        dashboard: 'true', projects: 'portfolio', candidates: 'portfolio',
        service_hub: 'true', messages: 'true', documents: 'true',
        loyalty: 'true', development: 'true', import: 'false',
        referrals: 'true', ai_assistant: 'portfolio', settings: 'false',
        rates: 'true',
    },
    finance: {
        ...NEW_PANEL_DEFAULTS,
        dashboard: 'true', projects: 'full', candidates: 'readonly',
        service_hub: 'true', messages: 'true', documents: 'true',
        loyalty: 'true', development: 'true', import: 'false',
        referrals: 'true', ai_assistant: 'portfolio', settings: 'false',
        rates: 'true',
    },
    consultant: {
        ...NEW_PANEL_DEFAULTS,
        dashboard: 'true', projects: 'full', candidates: 'false',
        service_hub: 'true', messages: 'true', documents: 'true',
        loyalty: 'true', development: 'true', import: 'false',
        referrals: 'true', ai_assistant: 'full', settings: 'false',
        rates: 'false',
    },
}
