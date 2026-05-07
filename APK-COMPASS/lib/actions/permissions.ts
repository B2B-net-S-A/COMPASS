'use server'

import type { PermissionsMap } from '@/lib/types/permissions'
import { DEFAULT_PERMISSIONS } from '@/lib/types/permissions'

// Phase 16 (2026-05-07): role_permissions table was dropped together with the
// centrala module. Permissions are now constants from DEFAULT_PERMISSIONS.
// We keep this server action so existing call-sites (e.g. ProtectedLayout)
// don't need to change their data-fetch pattern.

export async function getPermissions(): Promise<PermissionsMap> {
    return DEFAULT_PERMISSIONS
}
