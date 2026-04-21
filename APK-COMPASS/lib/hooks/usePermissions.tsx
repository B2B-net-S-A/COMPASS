'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { PermissionFeature, PermissionValue } from '@/lib/types/permissions'

// ─── Context ──────────────────────────────────────────────────────────────────

type UserPermissions = Record<PermissionFeature, PermissionValue>

interface PermissionsContextValue {
    permissions: UserPermissions | null
    role: 'consultant' | 'admin' | 'centrala' | 'administrator'
}

const PermissionsContext = createContext<PermissionsContextValue>({
    permissions: null,
    role: 'consultant',
})

// ─── Provider ─────────────────────────────────────────────────────────────────

interface PermissionsProviderProps {
    children: ReactNode
    permissions: UserPermissions | null
    role: 'consultant' | 'admin' | 'centrala' | 'administrator'
}

export function PermissionsProvider({ children, permissions, role }: PermissionsProviderProps) {
    return (
        <PermissionsContext.Provider value={{ permissions, role }}>
            {children}
        </PermissionsContext.Provider>
    )
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePermissions() {
    const { permissions, role } = useContext(PermissionsContext)
    const isAdmin = role === 'administrator' || role === 'admin'

    /**
     * Check if the current user has access to a feature.
     * Returns true if:
     * - User is admin (always has access)
     * - Feature permission is anything other than 'false'
     */
    function hasAccess(feature: PermissionFeature): boolean {
        if (isAdmin) return true
        if (!permissions) return true // Fallback: allow access if permissions not loaded
        return permissions[feature] !== 'false'
    }

    /**
     * Get the permission value for a feature.
     * Returns 'full' for admins.
     */
    function getPermissionValue(feature: PermissionFeature): PermissionValue {
        if (isAdmin) return 'full'
        if (!permissions) return 'true'
        return permissions[feature]
    }

    /**
     * Check if the feature is in readonly mode.
     */
    function isReadonly(feature: PermissionFeature): boolean {
        if (isAdmin) return false
        if (!permissions) return false
        return permissions[feature] === 'readonly'
    }

    return { hasAccess, getPermissionValue, isReadonly, isAdmin, role, permissions }
}
