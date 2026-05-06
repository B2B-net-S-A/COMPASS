'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/admin'
import { getSuperAdmins, isSuperAdmin } from '@/lib/auth/super-admins'
import { logAudit } from '@/lib/actions/audit'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface UserAdminItem {
    id: string
    email: string
    full_name: string | null
    role: string | null
    avatar_url: string | null
    last_sign_in_at: string | null
    created_at: string
    has_logged_in: boolean
    is_banned: boolean
    is_super_admin: boolean
}

export interface ListAllUsersInput {
    search?: string
    page?: number
    limit?: number
}

export interface ListAllUsersResult {
    items: UserAdminItem[]
    total: number
    page: number
    limit: number
}

// ─── Auth guard ──────────────────────────────────────────────────────────────

async function requireSuperAdmin() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    if (!isSuperAdmin(user.email)) {
        throw new Error('Wymagane uprawnienia Super Admina.')
    }

    return { user }
}

async function fetchTargetUser(targetUserId: string) {
    const admin = createServiceClient()
    const { data, error } = await admin.auth.admin.getUserById(targetUserId)
    if (error || !data?.user) {
        throw new Error('Nie znaleziono użytkownika.')
    }
    return data.user
}

function ensureCanModify(actorId: string, targetUser: { id: string; email?: string | null }) {
    if (actorId === targetUser.id) {
        throw new Error('Nie możesz zmieniać własnego konta tą drogą — użyj formularza zmiany hasła.')
    }
    if (targetUser.email && isSuperAdmin(targetUser.email)) {
        throw new Error('Nie można modyfikować konta innego Super Admina.')
    }
}

// ─── Listing ─────────────────────────────────────────────────────────────────

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200
const SEARCH_FETCH_BATCH = 1000

export async function listAllUsers(input?: ListAllUsersInput): Promise<ListAllUsersResult> {
    await requireSuperAdmin()

    const search = input?.search?.trim().toLowerCase() ?? ''
    const limit = Math.min(MAX_LIMIT, Math.max(1, input?.limit ?? DEFAULT_LIMIT))
    const page = Math.max(1, input?.page ?? 1)

    const admin = createServiceClient()
    const superAdmins = getSuperAdmins()

    if (search) {
        // Search mode: fetch first batch (≤1000), filter in-memory.
        const { data: list, error } = await admin.auth.admin.listUsers({
            page: 1,
            perPage: SEARCH_FETCH_BATCH,
        })
        if (error) throw new Error(`Błąd pobierania listy: ${error.message}`)

        const profileMap = await fetchProfilesForUsers(list.users.map((u) => u.id))
        const allItems = list.users.map((u) => mapUser(u, profileMap.get(u.id), superAdmins))

        const filtered = allItems.filter((it) => {
            return (
                it.email.toLowerCase().includes(search) ||
                (it.full_name?.toLowerCase().includes(search) ?? false)
            )
        })

        const total = filtered.length
        const from = (page - 1) * limit
        const items = filtered.slice(from, from + limit)
        return { items, total, page, limit }
    }

    // Paginated mode: 1:1 mapping between SDK page/perPage and our page/limit.
    const { data: list, error } = await admin.auth.admin.listUsers({
        page,
        perPage: limit,
    })
    if (error) throw new Error(`Błąd pobierania listy: ${error.message}`)

    const profileMap = await fetchProfilesForUsers(list.users.map((u) => u.id))
    const items = list.users.map((u) => mapUser(u, profileMap.get(u.id), superAdmins))

    // SDK exposes total via list.total (fallback: nextPage / lastPage hint, otherwise 0).
    const total = (list as unknown as { total?: number }).total ?? items.length
    return { items, total, page, limit }
}

interface ProfileRow {
    id: string
    full_name: string | null
    role: string | null
    avatar_url: string | null
}

async function fetchProfilesForUsers(userIds: string[]): Promise<Map<string, ProfileRow>> {
    if (userIds.length === 0) return new Map()
    const admin = createServiceClient()
    const { data, error } = await admin
        .from('profiles')
        .select('id, full_name, role, avatar_url')
        .in('id', userIds)
    if (error) {
        console.error('[user-admin] Failed to fetch profiles:', error)
        return new Map()
    }
    const map = new Map<string, ProfileRow>()
    for (const row of data ?? []) {
        map.set(row.id, row as ProfileRow)
    }
    return map
}

function mapUser(
    u: { id: string; email?: string; created_at: string; last_sign_in_at?: string | null; banned_until?: string | null },
    profile: ProfileRow | undefined,
    superAdmins: readonly string[]
): UserAdminItem {
    const email = u.email ?? ''
    const isBanned = !!u.banned_until && new Date(u.banned_until).getTime() > Date.now()
    return {
        id: u.id,
        email,
        full_name: profile?.full_name ?? null,
        role: profile?.role ?? null,
        avatar_url: profile?.avatar_url ?? null,
        last_sign_in_at: u.last_sign_in_at ?? null,
        created_at: u.created_at,
        has_logged_in: !!u.last_sign_in_at,
        is_banned: isBanned,
        is_super_admin: !!email && superAdmins.includes(email.toLowerCase()),
    }
}

// ─── Password reset link ─────────────────────────────────────────────────────

export async function sendPasswordResetLink(targetUserId: string): Promise<void> {
    const { user: actor } = await requireSuperAdmin()
    const target = await fetchTargetUser(targetUserId)
    ensureCanModify(actor.id, target)

    if (!target.email) {
        throw new Error('Użytkownik nie ma adresu email — nie można wysłać linku.')
    }

    const admin = createServiceClient()
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || ''
    const redirectTo = appUrl ? `${appUrl}/auth/callback?next=/auth/update-password` : undefined

    const { error } = await admin.auth.resetPasswordForEmail(target.email, redirectTo ? { redirectTo } : undefined)

    if (error) {
        const msg = error.message?.toLowerCase() ?? ''
        if (msg.includes('rate') || msg.includes('limit') || (error as unknown as { status?: number }).status === 429) {
            throw new Error('Limit emaili Supabase przekroczony (~2/h). Spróbuj za 30 min lub użyj „Ustaw hasło teraz".')
        }
        throw new Error(`Błąd wysyłki linku: ${error.message}`)
    }

    await logAudit(actor.id, 'PASSWORD_RESET', {
        target_user_id: target.id,
        target_email: target.email,
        method: 'send_link',
    })
}

// ─── Force-set password ──────────────────────────────────────────────────────

const PASSWORD_MIN_LEN = 8

function validatePassword(password: string) {
    if (password.length < PASSWORD_MIN_LEN) {
        throw new Error(`Hasło musi mieć minimum ${PASSWORD_MIN_LEN} znaków.`)
    }
    if (!/[0-9]/.test(password)) {
        throw new Error('Hasło musi zawierać przynajmniej jedną cyfrę.')
    }
    if (!/[A-Za-z]/.test(password)) {
        throw new Error('Hasło musi zawierać przynajmniej jedną literę.')
    }
}

export async function forceSetPassword(targetUserId: string, newPassword: string): Promise<void> {
    const { user: actor } = await requireSuperAdmin()
    validatePassword(newPassword)
    const target = await fetchTargetUser(targetUserId)
    ensureCanModify(actor.id, target)

    const admin = createServiceClient()
    const { error } = await admin.auth.admin.updateUserById(target.id, { password: newPassword })
    if (error) throw new Error(`Błąd zmiany hasła: ${error.message}`)

    // Supabase auto-revokes refresh tokens on password change, but we additionally
    // delete sessions to ensure any in-flight access tokens are killed at the next refresh.
    const { error: rpcError } = await admin.rpc('admin_revoke_user_sessions', {
        target_user_id: target.id,
    })
    if (rpcError) {
        console.error('[user-admin] revoke sessions RPC failed:', rpcError)
        // Non-fatal — password change already revokes refresh tokens
    }

    await logAudit(actor.id, 'PASSWORD_RESET', {
        target_user_id: target.id,
        target_email: target.email ?? null,
        method: 'force_set',
        sessions_invalidated: true,
    })
}

// ─── Sign out all sessions ───────────────────────────────────────────────────

export async function signOutAllSessions(targetUserId: string): Promise<void> {
    const { user: actor } = await requireSuperAdmin()
    const target = await fetchTargetUser(targetUserId)
    ensureCanModify(actor.id, target)

    const admin = createServiceClient()
    const { error } = await admin.rpc('admin_revoke_user_sessions', {
        target_user_id: target.id,
    })
    if (error) throw new Error(`Błąd wylogowywania sesji: ${error.message}`)

    await logAudit(actor.id, 'PASSWORD_RESET', {
        target_user_id: target.id,
        target_email: target.email ?? null,
        method: 'sign_out_only',
    })
}

// ─── Ban / Unban ─────────────────────────────────────────────────────────────

const PERMANENT_BAN_DURATION = '876000h' // ≈ 100 years

export async function setUserBan(targetUserId: string, banned: boolean): Promise<void> {
    const { user: actor } = await requireSuperAdmin()
    const target = await fetchTargetUser(targetUserId)
    ensureCanModify(actor.id, target)

    const admin = createServiceClient()
    const { error } = await admin.auth.admin.updateUserById(target.id, {
        ban_duration: banned ? PERMANENT_BAN_DURATION : 'none',
    })
    if (error) throw new Error(`Błąd ${banned ? 'blokowania' : 'odblokowywania'}: ${error.message}`)

    await logAudit(actor.id, banned ? 'BLOCK_USER' : 'UNBLOCK_USER', {
        target_user_id: target.id,
        target_email: target.email ?? null,
    })
}

// ─── Public helper: is current user a Super Admin? ───────────────────────────

export async function checkUserAdminAccess(): Promise<boolean> {
    try {
        await requireSuperAdmin()
        return true
    } catch {
        return false
    }
}
