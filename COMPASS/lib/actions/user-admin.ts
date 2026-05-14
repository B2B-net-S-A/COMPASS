'use server'

import { logCompat } from '@/lib/logger'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/admin'
import { getSuperAdmins, isSuperAdmin } from '@/lib/auth/super-admins'
import { logAudit } from '@/lib/actions/audit'
import { DB_ROLES, type DbRole, roleLabelPl } from '@/lib/types/role'
import { sendRoleChangeEmail } from '@/lib/email'

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
        logCompat.error('[user-admin] Failed to fetch profiles:', error)
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
        logCompat.error('[user-admin] revoke sessions RPC failed:', rpcError)
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

// ─── Phase 11: change role ──────────────────────────────────────────────────

export async function setUserRole(targetUserId: string, newRole: DbRole): Promise<void> {
    const { user: actor } = await requireSuperAdmin()
    if (!DB_ROLES.includes(newRole)) {
        throw new Error(`Nieprawidłowa rola: ${newRole}`)
    }

    const target = await fetchTargetUser(targetUserId)
    ensureCanModify(actor.id, target)

    const admin = createServiceClient()
    const { data: profile, error: profileErr } = await admin
        .from('profiles')
        .select('role, full_name')
        .eq('id', target.id)
        .single<{ role: string | null; full_name: string | null }>()
    if (profileErr) throw new Error(`Nie udało się odczytać profilu: ${profileErr.message}`)

    const oldRole = profile?.role ?? 'consultant'
    if (oldRole === newRole) {
        return
    }

    // Konsultant biurowy nie ma consultant-style onboarding (HR-only zone), więc
    // przy promote na 'internal' auto-set onboarding_completed=true żeby user nie
    // utknął na /onboarding przy następnym loginie (middleware:69 sprawdza ten flag).
    const updateData: { role: DbRole; onboarding_completed?: boolean } = { role: newRole }
    if (newRole === 'internal') {
        updateData.onboarding_completed = true
    }

    const { error: updateErr } = await admin
        .from('profiles')
        .update(updateData)
        .eq('id', target.id)
    if (updateErr) throw new Error(`Błąd zmiany roli: ${updateErr.message}`)

    await logAudit(actor.id, 'ROLE_CHANGE', {
        target_user_id: target.id,
        target_email: target.email ?? null,
        old_role: oldRole,
        new_role: newRole,
    })

    if (target.email) {
        const action: 'added' | 'removed' = newRole === 'consultant' ? 'removed' : 'added'
        try {
            await sendRoleChangeEmail(
                target.email,
                profile?.full_name ?? target.email,
                roleLabelPl(newRole),
                action
            )
        } catch (e) {
            logCompat.error('[setUserRole] role-change email failed:', e)
        }
    }
}

// ─── Phase 11: edit HR profile fields (default_location, employment_type, …) ───
// `annual_leave_days` zostało usunięte z UI — wszyscy są na B2B (nielimitowane
// urlopy, ale wymagane wnioski). Kolumna w DB pozostaje dla back-compat,
// nie jest już ani zapisywana, ani odczytywana.

export interface EmployeeProfileInput {
    default_location?: 'onsite' | 'remote'
    employment_type?: 'uop' | 'b2b'
    work_start_date?: string | null
}

export interface EmployeeProfileFields {
    default_location: 'onsite' | 'remote' | null
    employment_type: 'uop' | 'b2b' | null
    work_start_date: string | null
}

export async function setEmployeeProfile(targetUserId: string, fields: EmployeeProfileInput): Promise<void> {
    const { user: actor } = await requireSuperAdmin()
    const target = await fetchTargetUser(targetUserId)
    ensureCanModify(actor.id, target)

    const updates: Record<string, unknown> = {}
    if (fields.default_location !== undefined) {
        if (!['onsite', 'remote'].includes(fields.default_location)) {
            throw new Error('default_location musi być "onsite" lub "remote".')
        }
        updates.default_location = fields.default_location
    }
    if (fields.employment_type !== undefined) {
        if (!['uop', 'b2b'].includes(fields.employment_type)) {
            throw new Error('employment_type musi być "uop" lub "b2b".')
        }
        updates.employment_type = fields.employment_type
    }
    if (fields.work_start_date !== undefined) {
        if (fields.work_start_date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(fields.work_start_date)) {
            throw new Error('work_start_date musi być w formacie YYYY-MM-DD lub null.')
        }
        updates.work_start_date = fields.work_start_date
    }

    if (Object.keys(updates).length === 0) {
        return
    }

    const admin = createServiceClient()
    const { error } = await admin.from('profiles').update(updates).eq('id', target.id)
    if (error) throw new Error(`Błąd zmiany profilu pracownika: ${error.message}`)

    await logAudit(actor.id, 'EMPLOYEE_PROFILE_UPDATE', {
        target_user_id: target.id,
        target_email: target.email ?? null,
        fields: updates,
    })
}

export async function getEmployeeProfileFields(targetUserId: string): Promise<EmployeeProfileFields> {
    await requireSuperAdmin()
    const admin = createServiceClient()
    const { data, error } = await admin
        .from('profiles')
        .select('default_location, employment_type, work_start_date')
        .eq('id', targetUserId)
        .single<EmployeeProfileFields>()
    if (error) throw new Error(`Nie udało się odczytać profilu: ${error.message}`)
    return {
        default_location: data?.default_location ?? null,
        employment_type: data?.employment_type ?? null,
        work_start_date: data?.work_start_date ?? null,
    }
}

// ─── Phase: admin invite flow ────────────────────────────────────────────────
// Super Admin tworzy konto dla pracownika bez O365 (np. biurowa Pani z HR).
// Supabase wysyła email z linkiem aktywacyjnym → user ustawia hasło → automatic
// login → redirect na /internal (jeśli internal) lub /home (jeśli consultant).
//
// Nie tworzy adminów — Super Admin role dodaje się przez /admin/settings/admins
// (admin_access_list), które syncRole() automatycznie podbija przy loginie.

export interface InviteUserInput {
    email: string
    fullName?: string
    role: 'consultant' | 'internal' | 'finanse'
    employmentType?: 'uop' | 'b2b'
    workStartDate?: string | null
}

export async function inviteUser(input: InviteUserInput): Promise<{ userId: string }> {
    const { user: actor } = await requireSuperAdmin()

    const email = input.email.trim().toLowerCase()
    if (!email.endsWith('@b2bnetwork.pl')) {
        throw new Error('Email musi być w domenie @b2bnetwork.pl')
    }
    if (input.role !== 'consultant' && input.role !== 'internal' && input.role !== 'finanse') {
        throw new Error('Niedozwolona rola. Wybierz Konsultant IT, Konsultant biurowy lub Finanse. Super Admina dodaje się przez Administratorzy.')
    }

    const admin = createServiceClient()
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || ''
    const redirectTo = appUrl ? `${appUrl}/auth/callback` : undefined

    // 1. Invite via Supabase Auth — wysyła email z linkiem aktywacyjnym.
    //    handle_new_user trigger w DB stworzy automatycznie row w `profiles`
    //    z domyślnym role='consultant'. Overrideujemy w kroku 2.
    const { data, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
        data: {
            full_name: input.fullName?.trim() || undefined,
        },
        redirectTo,
    })
    if (inviteErr) {
        const msg = inviteErr.message?.toLowerCase() ?? ''
        if (msg.includes('already') || msg.includes('exists') || msg.includes('registered')) {
            throw new Error('Konto z tym adresem email już istnieje.')
        }
        throw new Error(`Błąd zaproszenia: ${inviteErr.message}`)
    }
    const userId = data?.user?.id
    if (!userId) {
        throw new Error('Supabase nie zwróciło ID użytkownika.')
    }

    // 2. Override profile fields z wybranymi opcjami HR.
    //    onboarding_completed=true dla 'internal' (biurowi nie mają consultant onboarding).
    const updates: Record<string, unknown> = {
        role: input.role,
        full_name: input.fullName?.trim() || null,
    }
    if (input.role === 'internal') {
        updates.onboarding_completed = true
    }
    if (input.employmentType) {
        updates.employment_type = input.employmentType
    }
    if (input.workStartDate !== undefined) {
        updates.work_start_date = input.workStartDate
    }

    const { error: profileErr } = await admin
        .from('profiles')
        .update(updates)
        .eq('id', userId)
    if (profileErr) {
        throw new Error(`Profile update fail: ${profileErr.message}`)
    }

    await logAudit(actor.id, 'INVITE_USER', {
        target_user_id: userId,
        target_email: email,
        role: input.role,
        employment_type: input.employmentType ?? null,
        work_start_date: input.workStartDate ?? null,
    })

    return { userId }
}
