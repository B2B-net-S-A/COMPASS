// ─── Types and constants for role permissions ────────────────────────────────
// This file must NOT have 'use server' — it's shared between client and server.

export type PermissionRole = 'recruiter' | 'delivery_lead' | 'finance' | 'consultant'
export type PermissionFeature =
    | 'dashboard'
    | 'projects'
    | 'candidates'
    | 'service_hub'
    | 'messages'
    | 'documents'
    | 'loyalty'
    | 'development'
    | 'import'
    | 'referrals'
    | 'ai_assistant'
    | 'settings'
    | 'rates'

export type PermissionValue = 'true' | 'false' | 'portfolio' | 'full' | 'readonly'

export type PermissionsMap = Record<PermissionRole, Record<PermissionFeature, PermissionValue>>

export interface PermissionUpdate {
    role: PermissionRole
    feature: PermissionFeature
    value: PermissionValue
}

export const DEFAULT_PERMISSIONS: PermissionsMap = {
    recruiter: {
        dashboard: 'true', projects: 'portfolio', candidates: 'portfolio',
        service_hub: 'true', messages: 'true', documents: 'true',
        loyalty: 'true', development: 'true', import: 'false',
        referrals: 'true', ai_assistant: 'portfolio', settings: 'false',
        rates: 'true',
    },
    delivery_lead: {
        dashboard: 'true', projects: 'portfolio', candidates: 'portfolio',
        service_hub: 'true', messages: 'true', documents: 'true',
        loyalty: 'true', development: 'true', import: 'false',
        referrals: 'true', ai_assistant: 'portfolio', settings: 'false',
        rates: 'true',
    },
    finance: {
        dashboard: 'true', projects: 'full', candidates: 'readonly',
        service_hub: 'true', messages: 'true', documents: 'true',
        loyalty: 'true', development: 'true', import: 'false',
        referrals: 'true', ai_assistant: 'portfolio', settings: 'false',
        rates: 'true',
    },
    consultant: {
        dashboard: 'true', projects: 'full', candidates: 'false',
        service_hub: 'true', messages: 'true', documents: 'true',
        loyalty: 'true', development: 'true', import: 'false',
        referrals: 'true', ai_assistant: 'full', settings: 'false',
        rates: 'false',
    },
}
