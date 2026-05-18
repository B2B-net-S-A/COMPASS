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
    // Phase 20f
    manager_id: string | null
    manager_full_name: string | null
    manager_email: string | null
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

        const { profiles: profileMap, managers } = await fetchProfilesForUsers(list.users.map((u) => u.id))
        const allItems = list.users.map((u) => mapUser(u, profileMap.get(u.id), superAdmins, managers))

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

    const { profiles: profileMap, managers } = await fetchProfilesForUsers(list.users.map((u) => u.id))
    const items = list.users.map((u) => mapUser(u, profileMap.get(u.id), superAdmins, managers))

    // SDK exposes total via list.total (fallback: nextPage / lastPage hint, otherwise 0).
    const total = (list as unknown as { total?: number }).total ?? items.length
    return { items, total, page, limit }
}

interface ProfileRow {
    id: string
    full_name: string | null
    role: string | null
    avatar_url: string | null
    manager_id: string | null
}

interface ManagerRow {
    id: string
    full_name: string | null
    email: string | null
}

async function fetchProfilesForUsers(userIds: string[]): Promise<{
    profiles: Map<string, ProfileRow>
    managers: Map<string, ManagerRow>
}> {
    if (userIds.length === 0) return { profiles: new Map(), managers: new Map() }
    const admin = createServiceClient()
    const { data, error } = await admin
        .from('profiles')
        .select('id, full_name, role, avatar_url, manager_id')
        .in('id', userIds)
    if (error) {
        logCompat.error('[user-admin] Failed to fetch profiles:', error)
        return { profiles: new Map(), managers: new Map() }
    }
    const profiles = new Map<string, ProfileRow>()
    const managerIds = new Set<string>()
    for (const row of data ?? []) {
        const pr = row as ProfileRow
        profiles.set(pr.id, pr)
        if (pr.manager_id) managerIds.add(pr.manager_id)
    }

    // Phase 20f: dociągnij dane managerów (full_name + email) jednym SELECT.
    const managers = new Map<string, ManagerRow>()
    if (managerIds.size > 0) {
        const { data: mgrData } = await admin
            .from('profiles')
            .select('id, full_name, email')
            .in('id', Array.from(managerIds))
        for (const m of (mgrData ?? []) as ManagerRow[]) {
            managers.set(m.id, m)
        }
    }
    return { profiles, managers }
}

function mapUser(
    u: { id: string; email?: string; created_at: string; last_sign_in_at?: string | null; banned_until?: string | null },
    profile: ProfileRow | undefined,
    superAdmins: readonly string[],
    managers: Map<string, ManagerRow>
): UserAdminItem {
    const email = u.email ?? ''
    const isBanned = !!u.banned_until && new Date(u.banned_until).getTime() > Date.now()
    const manager = profile?.manager_id ? managers.get(profile.manager_id) : undefined
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
        manager_id: profile?.manager_id ?? null,
        manager_full_name: manager?.full_name ?? null,
        manager_email: manager?.email ?? null,
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

    // Phase 20: HR-zone role'e (wszyscy oprócz konsultanta IT) nie mają consultant-style
    // onboarding (HR-only zone), więc przy promote auto-set onboarding_completed=true
    // żeby user nie utknął na /onboarding przy następnym loginie.
    const HR_ZONE_ROLES_FOR_ONBOARDING_SKIP: DbRole[] = ['internal', 'finanse', 'manager', 'talent_community']
    const updateData: { role: DbRole; onboarding_completed?: boolean } = { role: newRole }
    if (HR_ZONE_ROLES_FOR_ONBOARDING_SKIP.includes(newRole)) {
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
    // Phase 20: 5 invite'owalnych ról (admin promote'uje się przez admin_access_list).
    role: 'consultant' | 'internal' | 'finanse' | 'manager' | 'talent_community'
    employmentType?: 'uop' | 'b2b'
    workStartDate?: string | null
    // Phase 20: optional manager_id (UUID). Dla pracowników biurowych (internal/finanse/manager/talent_community).
    managerId?: string | null
    // Phase 22: opt-out from auto-starting the onboarding checklist. Default true (start onboarding).
    autoStartOnboarding?: boolean
    onboardingTemplateId?: string | null
}

const INVITABLE_ROLES: InviteUserInput['role'][] = [
    'consultant',
    'internal',
    'finanse',
    'manager',
    'talent_community',
]

export async function inviteUser(input: InviteUserInput): Promise<{ userId: string }> {
    const { user: actor } = await requireSuperAdmin()

    const email = input.email.trim().toLowerCase()
    if (!email.endsWith('@b2bnetwork.pl')) {
        throw new Error('Email musi być w domenie @b2bnetwork.pl')
    }
    if (!INVITABLE_ROLES.includes(input.role)) {
        throw new Error('Niedozwolona rola. Wybierz Konsultant IT, Konsultant wewnętrzny, Manager, Finanse lub Talent Community Manager. Super Admina dodaje się przez Administratorzy.')
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
    //    Phase 20: onboarding_completed=true dla wszystkich HR-zone (internal/finanse/manager/TCM).
    const HR_ZONE_FOR_INVITE: InviteUserInput['role'][] = ['internal', 'finanse', 'manager', 'talent_community']
    const updates: Record<string, unknown> = {
        role: input.role,
        full_name: input.fullName?.trim() || null,
    }
    if (HR_ZONE_FOR_INVITE.includes(input.role)) {
        updates.onboarding_completed = true
    }
    if (input.employmentType) {
        updates.employment_type = input.employmentType
    }
    if (input.workStartDate !== undefined) {
        updates.work_start_date = input.workStartDate
        // Phase 22: mirror to hired_at (used by lifecycle module for due_date calc).
        updates.hired_at = input.workStartDate
    }
    // Phase 20: manager_id — only for HR-zone roles (admin's choice).
    if (input.managerId !== undefined && HR_ZONE_FOR_INVITE.includes(input.role)) {
        updates.manager_id = input.managerId
    }
    // Phase 22: mark new HR-zone employees as 'pending' until they actually start onboarding.
    if (HR_ZONE_FOR_INVITE.includes(input.role) || input.role === 'consultant') {
        updates.employment_status = 'pending'
    }

    const { error: profileErr } = await admin
        .from('profiles')
        .update(updates)
        .eq('id', userId)
    if (profileErr) {
        throw new Error(`Profile update fail: ${profileErr.message}`)
    }

    // Phase 22 — auto-start onboarding (best-effort, never blocks invite).
    const shouldAutoStart =
        input.autoStartOnboarding !== false
        && (HR_ZONE_FOR_INVITE.includes(input.role) || input.role === 'consultant')

    let onboardingProgressId: string | null = null
    if (shouldAutoStart) {
        try {
            // Phase 22 RPC not yet in generated types — cast admin to any.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const adminAny = admin as any
            const { data: progressId, error: rpcErr } = await adminAny.rpc('start_onboarding_for_user', {
                p_user_id: userId,
                p_template_id: input.onboardingTemplateId ?? null,
                p_actor_id: actor.id,
            })
            if (rpcErr) {
                logCompat.error('Auto-start onboarding RPC error:', rpcErr)
            } else if (progressId) {
                onboardingProgressId = progressId as string
                await logAudit(actor.id, 'ONBOARDING_STARTED', {
                    user_id: userId,
                    progress_id: onboardingProgressId,
                    triggered_by: 'invite_user',
                })
            }
        } catch (e: unknown) {
            // Most likely: no default template found for role — log + continue.
            logCompat.error('Auto-start onboarding threw:', e)
        }
    }

    await logAudit(actor.id, 'INVITE_USER', {
        target_user_id: userId,
        target_email: email,
        role: input.role,
        employment_type: input.employmentType ?? null,
        work_start_date: input.workStartDate ?? null,
        manager_id: input.managerId ?? null,
        onboarding_started: onboardingProgressId !== null,
        onboarding_progress_id: onboardingProgressId,
    })

    return { userId }
}

// ─── Phase 20: Manager assignment ────────────────────────────────────────────

export interface ManagerCandidate {
    id: string
    full_name: string | null
    email: string
    role: string
}

/**
 * Phase 20 + 20e: list of users who can be assigned as a manager.
 * admin/manager/finanse — wszyscy z "managerską odpowiedzialnością".
 */
export async function listManagerCandidates(): Promise<ManagerCandidate[]> {
    await requireSuperAdmin()
    const admin = createServiceClient()
    const { data, error } = await admin
        .from('profiles')
        .select('id, full_name, email, role')
        .in('role', ['admin', 'manager', 'finanse'])
        .order('full_name', { ascending: true })
    if (error) throw new Error(`Błąd listowania managerów: ${error.message}`)
    return ((data ?? []) as Array<{ id: string; full_name: string | null; email: string | null; role: string }>)
        .filter((r) => !!r.email)
        .map((r) => ({
            id: r.id,
            full_name: r.full_name,
            email: r.email!,
            role: r.role,
        }))
}

/**
 * Phase 20: assign or unassign a manager for a target user.
 * Pass `managerId=null` to unassign.
 */
export async function setUserManager(targetUserId: string, managerId: string | null): Promise<void> {
    const { user: actor } = await requireSuperAdmin()
    const target = await fetchTargetUser(targetUserId)
    ensureCanModify(actor.id, target)

    if (managerId !== null && managerId === target.id) {
        throw new Error('Użytkownik nie może być swoim własnym managerem.')
    }

    const admin = createServiceClient()

    // Phase 20e: Validate managerId exists and has role IN (admin, manager, finanse).
    if (managerId) {
        const { data: mgr, error: mgrErr } = await admin
            .from('profiles')
            .select('id, role')
            .eq('id', managerId)
            .single<{ id: string; role: string }>()
        if (mgrErr || !mgr) {
            throw new Error('Wybrany manager nie istnieje.')
        }
        if (mgr.role !== 'admin' && mgr.role !== 'manager' && mgr.role !== 'finanse') {
            throw new Error('Manager musi mieć rolę Super Admin, Manager lub Finanse.')
        }
    }

    const { error } = await admin
        .from('profiles')
        .update({ manager_id: managerId })
        .eq('id', target.id)
    if (error) throw new Error(`Błąd przypisania managera: ${error.message}`)

    await logAudit(actor.id, 'MANAGER_ASSIGNED', {
        target_user_id: target.id,
        target_email: target.email ?? null,
        manager_id: managerId,
    })
}

// ─── Phase 22 follow-up — Archive (offboarding) + Hard delete ───────────────

/**
 * Archive employee = start full offboarding workflow (Phase 22):
 *   - sets `employment_status='offboarding'`
 *   - creates exit_interviews row (status=scheduled)
 *   - creates 5 default offboarding tasks (access_revoke, equipment_return, …)
 *   - sends exit-interview invitation email to employee
 *   - sends offboarding checklist email to manager (if assigned)
 *   - emits audit OFFBOARDING_STARTED + EXIT_INTERVIEW_SCHEDULED
 *
 * Termination date defaults to today (yyyy-mm-dd) if omitted. The actual exit
 * (`employment_status='exited'`) happens later when all required offboarding
 * tasks are done and TCM/admin clicks "Mark as exited" in /internal/lifecycle.
 *
 * Thin wrapper on `lifecycle.scheduleExitInterview` so the HR Employees panel
 * has a single semantic entry point.
 */
export async function archiveEmployee(
    targetUserId: string,
    terminationDate?: string,
): Promise<{ interviewId: string }> {
    const { user: actor } = await requireSuperAdmin()
    const target = await fetchTargetUser(targetUserId)
    ensureCanModify(actor.id, target)

    // Validate termination date (yyyy-mm-dd); default = today (UTC).
    const today = new Date().toISOString().slice(0, 10)
    const date = terminationDate?.trim() || today
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new Error('Data zakończenia musi być w formacie YYYY-MM-DD.')
    }

    // Lazy import: keeps `lifecycle.ts` (and its email/internal-guard imports)
    // out of the user-admin module graph at load time, so existing test mocks
    // for user-admin don't need to also stub the lifecycle module surface.
    const { scheduleExitInterview } = await import('@/lib/actions/lifecycle')
    const interviewId = await scheduleExitInterview(targetUserId, date)
    return { interviewId }
}

/**
 * Hard delete user account.
 *
 * WARNING: destructive. Cascades through Supabase Auth `auth.users` FK to
 * `profiles.id`, which then cascades to most child tables (timesheets,
 * invoices, documents, lifecycle artefacts, etc. — depending on per-table
 * `ON DELETE CASCADE` vs `SET NULL` vs `RESTRICT`). Some tables (e.g.
 * `incubator_submissions.submitter_id`) have `ON DELETE RESTRICT` and will
 * block deletion — in that case the operation fails and nothing is removed.
 *
 * Requires Super Admin. Refuses self-delete and deletion of other Super
 * Admins. Caller must pass `confirmEmail` matching target's email (UI types
 * it into a confirm box).
 *
 * For RODO-compliant audit retention, prefer `archiveEmployee` (Phase 22
 * offboarding flow). Use this only when the account was created in error or
 * the user has no production data tied to them.
 */
export async function deleteUserAccount(
    targetUserId: string,
    confirmEmail: string,
): Promise<void> {
    const { user: actor } = await requireSuperAdmin()
    const target = await fetchTargetUser(targetUserId)
    ensureCanModify(actor.id, target)

    const trimmed = confirmEmail.trim().toLowerCase()
    const targetEmail = (target.email ?? '').trim().toLowerCase()
    if (!targetEmail || trimmed !== targetEmail) {
        throw new Error('Potwierdzenie nie pasuje do emaila użytkownika.')
    }

    // Snapshot for audit BEFORE delete (after delete row is gone).
    const admin = createServiceClient()
    const { data: profileSnapshot } = await admin
        .from('profiles')
        .select('full_name, role, employment_status, manager_id')
        .eq('id', target.id)
        .maybeSingle<{
            full_name: string | null
            role: string | null
            employment_status: string | null
            manager_id: string | null
        }>()

    // Audit FIRST — if delete succeeds but audit fails we still want the trail;
    // if audit fails we'd rather abort than silently lose the record.
    await logAudit(actor.id, 'DELETE_USER', {
        target_user_id: target.id,
        target_email: target.email ?? null,
        target_full_name: profileSnapshot?.full_name ?? null,
        target_role: profileSnapshot?.role ?? null,
        target_employment_status: profileSnapshot?.employment_status ?? null,
        target_manager_id: profileSnapshot?.manager_id ?? null,
    })

    const { error } = await admin.auth.admin.deleteUser(target.id)
    if (error) {
        logCompat.error('[deleteUserAccount] deleteUser error:', error)
        throw new Error(`Błąd usuwania konta: ${error.message}`)
    }
}
