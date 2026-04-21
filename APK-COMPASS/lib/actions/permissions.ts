'use server'

import { createClient } from '@/lib/supabase/server'
import { cache } from 'react'
import type {
    PermissionsMap,
    PermissionRole,
    PermissionFeature,
    PermissionValue,
    PermissionUpdate,
} from '@/lib/types/permissions'
import { DEFAULT_PERMISSIONS } from '@/lib/types/permissions'

const VALID_ROLES: PermissionRole[] = ['recruiter', 'delivery_lead', 'finance', 'consultant']
const VALID_VALUES: PermissionValue[] = ['true', 'false', 'portfolio', 'full', 'readonly']
const VALID_FEATURES: PermissionFeature[] = [
    'dashboard', 'projects', 'candidates', 'service_hub', 'messages', 'documents',
    'loyalty', 'development', 'import', 'referrals', 'ai_assistant', 'settings', 'rates',
]
function isValidRole(r: unknown): r is PermissionRole {
    return typeof r === 'string' && VALID_ROLES.includes(r as PermissionRole)
}
function isValidFeature(f: unknown): f is PermissionFeature {
    return typeof f === 'string' && VALID_FEATURES.includes(f as PermissionFeature)
}
function isValidValue(v: unknown): v is PermissionValue {
    return typeof v === 'string' && VALID_VALUES.includes(v as PermissionValue)
}

// ─── Admin helper ─────────────────────────────────────────────────────────────

async function requireAdmin() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Brak autoryzacji')

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (!['administrator', 'admin'].includes(profile?.role || '')) {
        throw new Error('Wymagany dostęp administratora')
    }

    return { supabase, user }
}

// ─── Get all permissions ──────────────────────────────────────────────────────
// PERF: Using React cache() to deduplicate within a single request.
//       This avoids the "cookies inside unstable_cache" error while still
//       preventing redundant DB calls within the same render pass.

async function fetchPermissionsFromDB(): Promise<PermissionsMap> {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('role_permissions')
        .select('role, feature, value')

    if (error || !data || data.length === 0) {
        return DEFAULT_PERMISSIONS
    }

    const map: PermissionsMap = {
        recruiter: { ...DEFAULT_PERMISSIONS.recruiter },
        delivery_lead: { ...DEFAULT_PERMISSIONS.delivery_lead },
        finance: { ...DEFAULT_PERMISSIONS.finance },
        consultant: { ...DEFAULT_PERMISSIONS.consultant },
    }

    for (const row of data) {
        if (!isValidRole(row.role) || !isValidFeature(row.feature) || !isValidValue(row.value)) continue
        if (map[row.role] && row.feature in map[row.role]) {
            map[row.role][row.feature] = row.value
        }
    }

    return map
}

const getCachedPermissions = cache(fetchPermissionsFromDB)

export async function getPermissions(): Promise<PermissionsMap> {
    return getCachedPermissions()
}

// ─── Update permissions (batch) ───────────────────────────────────────────────

export async function updatePermissions(updates: PermissionUpdate[]) {
    const { supabase, user } = await requireAdmin()

    if (!updates.length) return { success: true }

    const rows = updates.map(u => ({
        role: u.role,
        feature: u.feature,
        value: u.value,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
    }))

    const { error } = await supabase
        .from('role_permissions')
        .upsert(rows, { onConflict: 'role,feature' })

    if (error) {
        console.error('Error updating permissions:', error)
        throw new Error('Błąd zapisu uprawnień: ' + error.message)
    }

    // PERF: Invalidate permissions cache so next page load picks up changes
    const { revalidateTag } = await import('next/cache')
    revalidateTag('permissions')

    return { success: true }
}
