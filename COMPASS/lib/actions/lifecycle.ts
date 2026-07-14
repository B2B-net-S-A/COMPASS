'use server'

// Phase 22 (2026-05-17) — Lifecycle module server actions.
// Onboarding (templates, checklist, check-ins) + Exit Interview + Offboarding + Analytics.

import { createHash } from 'crypto'
import { logCompat } from '@/lib/logger'
import { createLifecycleClient as createClient, createLifecycleAdminClient as createServiceClient } from '@/lib/supabase/lifecycle-client'
import {
    requireInternalOrAdminAction,
    requireLifecycleManagerAction,
} from '@/lib/auth/internal-guard'
import { logAudit } from '@/lib/actions/audit'
import {
    sendExitInterviewInvitation,
    sendOffboardingChecklistToManager,
    sendOnboardingWelcome,
} from '@/lib/email'
import { sendPushToUserId } from '@/lib/actions/push-subscriptions'
import { computeDueDate } from '@/lib/utils/sla'
import { roleLabelPl, type DbRole } from '@/lib/types/role'
import type {
    CheckinDay,
    ExitInterview,
    LifecycleAnalytics,
    LifecycleEvent,
    LifecycleEventType,
    LifecycleSidebarCount,
    OffboardingTask,
    OnboardingDetail,
    OnboardingProgress,
    OnboardingTask,
    OnboardingTemplate,
    OnboardingTemplateItem,
    ResponsibleRole,
} from '@/lib/types/lifecycle'

// ─── Constants ──────────────────────────────────────────────────────────────
const BUCKET = 'lifecycle-docs'
const MAX_ONBOARDING_FILE_BYTES = 10 * 1024 * 1024 // 10 MB
const MAX_EXIT_FILE_BYTES = 25 * 1024 * 1024 // 25 MB

// ─── Helpers ────────────────────────────────────────────────────────────────

function sanitizeFileName(name: string): string {
    const withoutDiacritics = name.normalize('NFD').replace(/[̀-ͯ]/g, '')
    return withoutDiacritics
        .replace(/\s+/g, '_')
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .replace(/_+/g, '_')
}

async function fileSha256(file: File): Promise<string> {
    const buffer = Buffer.from(await file.arrayBuffer())
    return createHash('sha256').update(buffer).digest('hex')
}

async function fetchUserContact(userId: string): Promise<{ email: string; full_name: string | null; role: DbRole; manager_id: string | null } | null> {
    const supabase = createServiceClient()
    const { data, error } = await supabase
        .from('profiles')
        .select('email, full_name, role, manager_id')
        .eq('id', userId)
        .single()
    if (error || !data) return null
    return data
}

async function fetchManagerContact(managerId: string): Promise<{ email: string; full_name: string | null } | null> {
    const supabase = createServiceClient()
    const { data, error } = await supabase
        .from('profiles')
        .select('email, full_name')
        .eq('id', managerId)
        .single()
    if (error || !data) return null
    return data
}

/**
 * Append to the employee lifecycle timeline through the only runtime write
 * path exposed by the database. The RPC is service-role-only and validates
 * that actorId belongs to an admin or Talent Community Manager. Keeping this
 * helper in the guarded server-action module prevents browser clients from
 * manufacturing audit history.
 */
async function recordLifecycleEvent(input: {
    userId: string
    eventType: LifecycleEventType
    actorId: string
    metadata?: Record<string, unknown>
}): Promise<void> {
    const supabase = createServiceClient()
    const { error } = await supabase.rpc('record_lifecycle_event', {
        p_user_id: input.userId,
        p_event_type: input.eventType,
        p_actor_id: input.actorId,
        p_metadata: input.metadata ?? {},
    })

    if (error) {
        logCompat.error('recordLifecycleEvent RPC error:', error)
        throw new Error('Nie udało się zapisać historii lifecycle.')
    }
}

// ─── Templates (TCM/admin CRUD) ─────────────────────────────────────────────

export async function listTemplates(): Promise<(OnboardingTemplate & { items_count: number })[]> {
    await requireInternalOrAdminAction() // RLS allows HR-zone read
    const supabase = createClient()
    const { data, error } = await supabase
        .from('onboarding_templates')
        .select('*, items_count:onboarding_template_items(count)')
        .eq('is_archived', false)
        .order('target_role', { ascending: true })
        .order('is_default', { ascending: false })
    if (error) {
        logCompat.error('listTemplates error:', error)
        throw new Error('Nie udało się pobrać szablonów.')
    }
    return (data ?? []).map((row: any) => ({
        ...row,
        items_count: Array.isArray(row.items_count) ? row.items_count[0]?.count ?? 0 : 0,
    }))
}

export async function getTemplate(templateId: string): Promise<{ template: OnboardingTemplate; items: OnboardingTemplateItem[] }> {
    await requireInternalOrAdminAction()
    const supabase = createClient()
    const [templateRes, itemsRes] = await Promise.all([
        supabase.from('onboarding_templates').select('*').eq('id', templateId).single(),
        supabase
            .from('onboarding_template_items')
            .select('*')
            .eq('template_id', templateId)
            .order('position', { ascending: true }),
    ])
    if (templateRes.error || !templateRes.data) {
        throw new Error('Szablon nie znaleziony.')
    }
    if (itemsRes.error) {
        throw new Error('Nie udało się pobrać items szablonu.')
    }
    return {
        template: templateRes.data as OnboardingTemplate,
        items: (itemsRes.data ?? []) as OnboardingTemplateItem[],
    }
}

export interface CreateTemplatePayload {
    name: string
    targetRole: DbRole
    description?: string | null
    isDefault?: boolean
    items: Array<{
        position: number
        category: 'docs' | 'access' | 'training' | 'meeting' | 'equipment' | 'other'
        title: string
        description?: string | null
        due_offset_days: number
        requires_file?: boolean
        course_slug?: string | null
        responsible_role: ResponsibleRole
        is_required?: boolean
    }>
}

export async function createTemplate(payload: CreateTemplatePayload): Promise<string> {
    const ctx = await requireLifecycleManagerAction()
    const supabase = createClient()

    if (payload.isDefault) {
        // Unset any existing default for this role first
        await supabase
            .from('onboarding_templates')
            .update({ is_default: false })
            .eq('target_role', payload.targetRole)
            .eq('is_default', true)
    }

    const { data: tpl, error: tplErr } = await supabase
        .from('onboarding_templates')
        .insert({
            name: payload.name,
            target_role: payload.targetRole,
            description: payload.description ?? null,
            is_default: payload.isDefault ?? false,
            created_by: ctx.userId,
        })
        .select('id')
        .single()
    if (tplErr || !tpl) throw new Error('Nie udało się utworzyć szablonu.')

    if (payload.items.length > 0) {
        const itemsToInsert = payload.items.map((item) => ({
            template_id: tpl.id,
            position: item.position,
            category: item.category,
            title: item.title,
            description: item.description ?? null,
            due_offset_days: item.due_offset_days,
            requires_file: item.requires_file ?? false,
            course_slug: item.course_slug ?? null,
            responsible_role: item.responsible_role,
            is_required: item.is_required ?? true,
        }))
        const { error: itemsErr } = await supabase
            .from('onboarding_template_items')
            .insert(itemsToInsert)
        if (itemsErr) {
            // Rollback template
            await supabase.from('onboarding_templates').delete().eq('id', tpl.id)
            throw new Error('Nie udało się utworzyć items szablonu.')
        }
    }

    await logAudit(ctx.userId, 'TEMPLATE_CREATED', { template_id: tpl.id, target_role: payload.targetRole })
    return tpl.id
}

export async function updateTemplate(
    templateId: string,
    updates: Partial<{ name: string; description: string | null; isDefault: boolean; isArchived: boolean }>,
): Promise<void> {
    const ctx = await requireLifecycleManagerAction()
    const supabase = createClient()

    if (updates.isDefault === true) {
        const { data: existing } = await supabase
            .from('onboarding_templates')
            .select('target_role')
            .eq('id', templateId)
            .single()
        if (existing?.target_role) {
            await supabase
                .from('onboarding_templates')
                .update({ is_default: false })
                .eq('target_role', existing.target_role)
                .eq('is_default', true)
                .neq('id', templateId)
        }
    }

    const patch: Record<string, unknown> = {}
    if (updates.name !== undefined) patch.name = updates.name
    if (updates.description !== undefined) patch.description = updates.description
    if (updates.isDefault !== undefined) patch.is_default = updates.isDefault
    if (updates.isArchived !== undefined) patch.is_archived = updates.isArchived

    if (Object.keys(patch).length > 0) {
        const { error } = await supabase.from('onboarding_templates').update(patch).eq('id', templateId)
        if (error) throw new Error('Nie udało się zaktualizować szablonu.')
    }

    await logAudit(ctx.userId, 'TEMPLATE_UPDATED', { template_id: templateId, fields: Object.keys(patch) })
}

export async function deleteTemplate(templateId: string): Promise<void> {
    const ctx = await requireLifecycleManagerAction()
    const supabase = createClient()

    const { count } = await supabase
        .from('onboarding_progress')
        .select('id', { count: 'exact', head: true })
        .eq('template_id', templateId)
    if ((count ?? 0) > 0) {
        // Soft delete (archive) if used
        await supabase.from('onboarding_templates').update({ is_archived: true, is_default: false }).eq('id', templateId)
    } else {
        // Hard delete unused template
        await supabase.from('onboarding_templates').delete().eq('id', templateId)
    }
    await logAudit(ctx.userId, 'TEMPLATE_DELETED', { template_id: templateId, soft: (count ?? 0) > 0 })
}

// ─── Employee lookup actions (for dialogs) ──────────────────────────────────

export interface EligibleEmployee {
    id: string
    email: string
    full_name: string | null
    role: DbRole
    hired_at: string | null
    work_start_date: string | null
    employment_status: string
    manager_id: string | null
    is_external: boolean
    external_notes: string | null
    has_active_onboarding: boolean
    has_active_exit_interview: boolean
}

/**
 * Phase 22.2 — list employees TCM can act on:
 *   filter='onboarding' → users WITHOUT active onboarding_progress
 *   filter='exit'       → users WITHOUT active exit_interview (status != archived)
 *   filter='all'        → all HR-zone employees
 */
export async function listEmployeesForLifecycle(filter: 'onboarding' | 'exit' | 'all' = 'all'): Promise<EligibleEmployee[]> {
    await requireLifecycleManagerAction()
    const supabase = createServiceClient()

    const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, email, full_name, role, hired_at, work_start_date, employment_status, manager_id, is_external, external_notes')
        .in('role', ['consultant', 'internal', 'finanse', 'manager', 'talent_community'])
        .neq('employment_status', 'exited')
        .order('full_name', { ascending: true })
    if (error || !profiles) {
        logCompat.error('listEmployeesForLifecycle error:', error)
        return []
    }

    const userIds = profiles.map((p: { id: string }) => p.id)

    const [{ data: progressRows }, { data: exitRows }] = await Promise.all([
        supabase.from('onboarding_progress').select('user_id, completed_at').in('user_id', userIds),
        supabase.from('exit_interviews').select('user_id, status').in('user_id', userIds).neq('status', 'archived'),
    ])

    const activeOnboardingSet = new Set<string>(
        (progressRows ?? []).filter((p: { completed_at: string | null }) => p.completed_at === null).map((p: { user_id: string }) => p.user_id),
    )
    const activeExitSet = new Set<string>((exitRows ?? []).map((e: { user_id: string }) => e.user_id))

    const all: EligibleEmployee[] = profiles.map((p: {
        id: string; email: string; full_name: string | null; role: DbRole;
        hired_at: string | null; work_start_date: string | null;
        employment_status: string; manager_id: string | null;
        is_external: boolean | null; external_notes: string | null
    }) => ({
        id: p.id,
        email: p.email,
        full_name: p.full_name,
        role: p.role,
        hired_at: p.hired_at,
        work_start_date: p.work_start_date,
        employment_status: p.employment_status,
        manager_id: p.manager_id,
        is_external: p.is_external === true,
        external_notes: p.external_notes,
        has_active_onboarding: activeOnboardingSet.has(p.id),
        has_active_exit_interview: activeExitSet.has(p.id),
    }))

    if (filter === 'onboarding') return all.filter((e) => !e.has_active_onboarding && e.employment_status !== 'offboarding')
    if (filter === 'exit') return all.filter((e) => !e.has_active_exit_interview && e.employment_status !== 'exited')
    return all
}

/**
 * Phase 22.2 — list potential buddy candidates for a given user:
 *   - any HR-zone employee EXCEPT the target user themselves
 *   - excludes 'exited' and 'pending'
 */
export async function listBuddyCandidates(forUserId: string): Promise<Array<{ id: string; email: string; full_name: string | null; role: DbRole }>> {
    await requireLifecycleManagerAction()
    const supabase = createServiceClient()
    const { data, error } = await supabase
        .from('profiles')
        .select('id, email, full_name, role')
        .in('role', ['consultant', 'internal', 'finanse', 'manager', 'talent_community', 'admin'])
        .in('employment_status', ['active', 'onboarding'])
        .neq('id', forUserId)
        .order('full_name', { ascending: true })
    if (error || !data) {
        logCompat.error('listBuddyCandidates error:', error)
        return []
    }
    return data as Array<{ id: string; email: string; full_name: string | null; role: DbRole }>
}

export interface TemplateChoice {
    id: string
    name: string
    target_role: DbRole
    is_default: boolean
    items_count: number
}

export async function listTemplateChoices(): Promise<TemplateChoice[]> {
    await requireLifecycleManagerAction()
    const supabase = createServiceClient()
    const { data, error } = await supabase
        .from('onboarding_templates')
        .select('id, name, target_role, is_default, onboarding_template_items(count)')
        .eq('is_archived', false)
        .order('target_role', { ascending: true })
        .order('is_default', { ascending: false })
    if (error || !data) {
        logCompat.error('listTemplateChoices error:', error)
        return []
    }
    return (data as Array<{
        id: string; name: string; target_role: DbRole; is_default: boolean;
        onboarding_template_items: Array<{ count: number }>
    }>).map((row) => ({
        id: row.id,
        name: row.name,
        target_role: row.target_role,
        is_default: row.is_default,
        items_count: row.onboarding_template_items[0]?.count ?? 0,
    }))
}

/**
 * Phase 22.2 — allow TCM/admin to override hired_at while bootstrapping onboarding.
 * Calls profile UPDATE first, then start_onboarding_for_user().
 */
export async function startOnboardingWithOptions(input: {
    userId: string
    templateId?: string | null
    hiredAt?: string | null // ISO date — if provided, updates profiles.hired_at first
    /**
     * Phase 25c: explicit opt-in to send the welcome email. Default `false` —
     * TCM/admin must check the box in the dialog (or use "Send now" later) to
     * avoid spamming external mailboxes set up purely for procedure tracking.
     */
    sendWelcomeEmail?: boolean
}): Promise<string> {
    const ctx = await requireLifecycleManagerAction()
    const supabase = createServiceClient()

    if (input.hiredAt) {
        const { error: updErr } = await supabase
            .from('profiles')
            .update({ hired_at: input.hiredAt, work_start_date: input.hiredAt })
            .eq('id', input.userId)
        if (updErr) throw new Error(`Nie udało się ustawić hired_at: ${updErr.message}`)
    }

    const { data, error } = await supabase.rpc('start_onboarding_for_user', {
        p_user_id: input.userId,
        p_template_id: input.templateId ?? null,
        p_actor_id: ctx.userId,
    })
    if (error || !data) {
        logCompat.error('startOnboardingWithOptions RPC error:', error)
        throw new Error(error?.message ?? 'Nie udało się rozpocząć onboardingu.')
    }
    const progressId = data as string

    const contact = await fetchUserContact(input.userId)
    if (contact) {
        if (input.sendWelcomeEmail === true) {
            await sendOnboardingWelcome(
                contact.email,
                contact.full_name ?? contact.email,
                progressId,
                roleLabelPl(contact.role),
            )
                .then(async () => {
                    await supabase
                        .from('onboarding_progress')
                        .update({ welcome_email_sent_at: new Date().toISOString(), welcome_email_sent_by: ctx.userId })
                        .eq('id', progressId)
                    await logAudit(ctx.userId, 'ONBOARDING_WELCOME_EMAIL_SENT', {
                        progress_id: progressId,
                        user_id: input.userId,
                        trigger: 'start_dialog',
                    })
                })
                .catch((e) => logCompat.error('sendOnboardingWelcome failed:', e))
        }

        // Push do pracownika (jeśli nie external — external nie ma auth.users).
        // Phase 25c: push pozostają — to in-app, nie spamują skrzynki.
        sendPushToUserId(input.userId, {
            title: 'Witamy w B2B Network!',
            body: `Twój onboarding jest gotowy — masz checklist do wypełnienia.`,
            url: `/internal/lifecycle/onboarding/${progressId}`,
            tag: `onboarding-${progressId}`,
        }).catch(() => undefined)

        if (contact.manager_id) {
            sendPushToUserId(contact.manager_id, {
                title: 'Team-member rozpoczyna onboarding',
                body: `${contact.full_name ?? contact.email} dołącza do zespołu.`,
                url: `/internal/lifecycle/onboarding/${progressId}`,
                tag: `team-onboarding-${progressId}`,
            }).catch(() => undefined)
        }
    }

    await logAudit(ctx.userId, 'ONBOARDING_STARTED', {
        user_id: input.userId,
        progress_id: progressId,
        template_id: input.templateId ?? null,
        triggered_by: 'manual',
        welcome_email_opt_in: input.sendWelcomeEmail === true,
    })
    return progressId
}

// ─── Template item CRUD ─────────────────────────────────────────────────────

export interface TemplateItemInput {
    category: 'docs' | 'access' | 'training' | 'meeting' | 'equipment' | 'other'
    title: string
    description?: string | null
    due_offset_days: number
    requires_file?: boolean
    course_slug?: string | null
    responsible_role: ResponsibleRole
    is_required?: boolean
}

export async function addTemplateItem(templateId: string, input: TemplateItemInput): Promise<string> {
    const ctx = await requireLifecycleManagerAction()
    const supabase = createClient()

    const { data: maxPos } = await supabase
        .from('onboarding_template_items')
        .select('position')
        .eq('template_id', templateId)
        .order('position', { ascending: false })
        .limit(1)
        .maybeSingle()
    const nextPos = (maxPos?.position ?? -1) + 1

    const { data, error } = await supabase
        .from('onboarding_template_items')
        .insert({
            template_id: templateId,
            position: nextPos,
            category: input.category,
            title: input.title,
            description: input.description ?? null,
            due_offset_days: input.due_offset_days,
            requires_file: input.requires_file ?? false,
            course_slug: input.course_slug ?? null,
            responsible_role: input.responsible_role,
            is_required: input.is_required ?? true,
        })
        .select('id')
        .single()
    if (error || !data) throw new Error('Nie udało się dodać items szablonu.')

    await logAudit(ctx.userId, 'TEMPLATE_UPDATED', { template_id: templateId, action: 'item_added', item_id: data.id })
    return data.id as string
}

export async function updateTemplateItem(itemId: string, updates: Partial<TemplateItemInput>): Promise<void> {
    const ctx = await requireLifecycleManagerAction()
    const supabase = createClient()

    const patch: Record<string, unknown> = {}
    if (updates.category !== undefined) patch.category = updates.category
    if (updates.title !== undefined) patch.title = updates.title
    if (updates.description !== undefined) patch.description = updates.description
    if (updates.due_offset_days !== undefined) patch.due_offset_days = updates.due_offset_days
    if (updates.requires_file !== undefined) patch.requires_file = updates.requires_file
    if (updates.course_slug !== undefined) patch.course_slug = updates.course_slug
    if (updates.responsible_role !== undefined) patch.responsible_role = updates.responsible_role
    if (updates.is_required !== undefined) patch.is_required = updates.is_required

    if (Object.keys(patch).length === 0) return

    const { error } = await supabase.from('onboarding_template_items').update(patch).eq('id', itemId)
    if (error) throw new Error('Nie udało się zaktualizować items.')

    await logAudit(ctx.userId, 'TEMPLATE_UPDATED', { item_id: itemId, action: 'item_updated', fields: Object.keys(patch) })
}

export async function deleteTemplateItem(itemId: string): Promise<void> {
    const ctx = await requireLifecycleManagerAction()
    const supabase = createClient()
    const { error } = await supabase.from('onboarding_template_items').delete().eq('id', itemId)
    if (error) throw new Error('Nie udało się usunąć items.')
    await logAudit(ctx.userId, 'TEMPLATE_UPDATED', { item_id: itemId, action: 'item_deleted' })
}

export async function reorderTemplateItems(templateId: string, orderedItemIds: string[]): Promise<void> {
    const ctx = await requireLifecycleManagerAction()
    const supabase = createClient()

    // Update positions in batch — each item gets a new position based on array order.
    const updates = orderedItemIds.map((id, idx) =>
        supabase.from('onboarding_template_items').update({ position: idx }).eq('id', id).eq('template_id', templateId),
    )
    const results = await Promise.all(updates)
    const failed = results.filter((r) => r.error)
    if (failed.length > 0) throw new Error(`Nie udało się przestawić ${failed.length} items.`)

    await logAudit(ctx.userId, 'TEMPLATE_UPDATED', { template_id: templateId, action: 'items_reordered', count: orderedItemIds.length })
}

// ─── Onboarding Workflow ───────────────────────────────────────────────────

export async function startOnboarding(userId: string, templateId?: string | null): Promise<string> {
    // Phase 25c: legacy entrypoint — welcome email is no longer sent here
    // automatically. Callers that want the email should use
    // `startOnboardingWithOptions({ sendWelcomeEmail: true })` or call
    // `sendOnboardingWelcomeEmailNow(progressId)` after start.
    const ctx = await requireLifecycleManagerAction()
    const supabase = createServiceClient() // bypass RLS — function is SECURITY DEFINER but we want admin context anyway

    const { data, error } = await supabase.rpc('start_onboarding_for_user', {
        p_user_id: userId,
        p_template_id: templateId ?? null,
        p_actor_id: ctx.userId,
    })
    if (error || !data) {
        logCompat.error('startOnboarding RPC error:', error)
        throw new Error(error?.message ?? 'Nie udało się rozpocząć onboardingu.')
    }
    const progressId = data as string

    await logAudit(ctx.userId, 'ONBOARDING_STARTED', { user_id: userId, progress_id: progressId, template_id: templateId ?? null, welcome_email_opt_in: false })
    return progressId
}

export async function assignBuddy(userId: string, buddyId: string | null): Promise<void> {
    const ctx = await requireLifecycleManagerAction()
    if (userId === buddyId) {
        throw new Error('Pracownik nie może być swoim własnym buddy.')
    }
    const supabase = createClient()
    const { error } = await supabase.from('profiles').update({ buddy_id: buddyId }).eq('id', userId)
    if (error) throw new Error('Nie udało się przypisać buddy.')

    if (buddyId) {
        await recordLifecycleEvent({
            userId,
            eventType: 'buddy_assigned',
            metadata: { buddy_id: buddyId },
            actorId: ctx.userId,
        })
        await logAudit(ctx.userId, 'BUDDY_ASSIGNED', { user_id: userId, buddy_id: buddyId })
    } else {
        await logAudit(ctx.userId, 'BUDDY_UNASSIGNED', { user_id: userId })
    }
}

export interface OnboardingQueueRow {
    progress_id: string
    user_id: string
    full_name: string | null
    email: string
    role: DbRole
    hired_at: string | null
    started_at: string
    completed_at: string | null
    tasks_total: number
    tasks_completed: number
    tasks_overdue: number
}

export async function listOnboardingQueue(filters?: {
    status?: 'in_progress' | 'completed' | 'all'
    role?: DbRole
}): Promise<OnboardingQueueRow[]> {
    await requireInternalOrAdminAction()
    const supabase = createClient()

    let query = supabase
        .from('onboarding_progress')
        .select(`
            id, user_id, started_at, completed_at,
            user:profiles!user_id(full_name, email, role, hired_at),
            tasks:onboarding_tasks(id, completed_at, due_date)
        `)

    if (!filters?.status || filters.status === 'in_progress') {
        query = query.is('completed_at', null)
    } else if (filters.status === 'completed') {
        query = query.not('completed_at', 'is', null)
    }

    const { data, error } = await query.order('started_at', { ascending: false })
    if (error) {
        logCompat.error('listOnboardingQueue error:', error)
        return []
    }

    const now = new Date()
    return (data ?? [])
        .filter((row: any) => !filters?.role || row.user?.role === filters.role)
        .map((row: any) => {
            const tasks: Array<{ completed_at: string | null; due_date: string | null }> = row.tasks ?? []
            const tasksCompleted = tasks.filter((t) => t.completed_at !== null).length
            const tasksOverdue = tasks.filter(
                (t) => t.completed_at === null && t.due_date && new Date(t.due_date) < now,
            ).length
            return {
                progress_id: row.id,
                user_id: row.user_id,
                full_name: row.user?.full_name ?? null,
                email: row.user?.email ?? '',
                role: (row.user?.role ?? 'consultant') as DbRole,
                hired_at: row.user?.hired_at ?? null,
                started_at: row.started_at,
                completed_at: row.completed_at,
                tasks_total: tasks.length,
                tasks_completed: tasksCompleted,
                tasks_overdue: tasksOverdue,
            }
        })
}

export async function getOnboardingDetail(progressId: string): Promise<OnboardingDetail> {
    await requireInternalOrAdminAction()
    const supabase = createClient()

    const { data: progress, error: progErr } = await supabase
        .from('onboarding_progress')
        .select('*')
        .eq('id', progressId)
        .single()
    if (progErr || !progress) throw new Error('Onboarding nie znaleziony.')

    const { data: template, error: tplErr } = await supabase
        .from('onboarding_templates')
        .select('*')
        .eq('id', progress.template_id)
        .single()
    if (tplErr || !template) throw new Error('Szablon onboardingu nie znaleziony.')

    const { data: tasks, error: tasksErr } = await supabase
        .from('onboarding_tasks')
        .select('*')
        .eq('progress_id', progressId)
        .order('position', { ascending: true })
    if (tasksErr) throw new Error('Nie udało się pobrać zadań.')

    // The progress row above is the authorization boundary enforced by RLS.
    // Hydrate sensitive HR profile fields only after that row was visible;
    // C2 will make direct cross-user profile reads unavailable to the session.
    const service = createServiceClient()
    const { data: employee, error: empErr } = await service
        .from('profiles')
        .select('id, full_name, email, role, hired_at, buddy_id, manager_id, employment_status')
        .eq('id', progress.user_id)
        .single()
    if (empErr || !employee) throw new Error('Profil pracownika nie znaleziony.')

    let buddy = null
    if (employee.buddy_id) {
        const { data: buddyRow } = await supabase
            .from('profile_directory')
            .select('id, full_name')
            .eq('id', employee.buddy_id)
            .single()
        if (buddyRow) buddy = buddyRow as { id: string; full_name: string | null }
    }

    let manager = null
    if (employee.manager_id) {
        const { data: managerRow } = await supabase
            .from('profile_directory')
            .select('id, full_name')
            .eq('id', employee.manager_id)
            .single()
        if (managerRow) manager = managerRow as { id: string; full_name: string | null }
    }

    return {
        progress,
        template,
        tasks: (tasks ?? []) as OnboardingTask[],
        employee: employee as OnboardingDetail['employee'],
        buddy,
        manager,
    }
}

export async function completeOnboardingTask(formData: FormData): Promise<void> {
    const ctx = await requireInternalOrAdminAction()
    const taskId = formData.get('taskId')?.toString()
    const notes = formData.get('notes')?.toString() ?? null
    const file = formData.get('file') as File | null
    if (!taskId) throw new Error('Brak taskId.')

    const supabase = createClient()
    const { data: task, error: taskErr } = await supabase
        .from('onboarding_tasks')
        .select('id, progress_id, requires_file, file_path')
        .eq('id', taskId)
        .single()
    if (taskErr || !task) throw new Error('Task nie znaleziony lub brak dostępu.')

    let uploadedPath: string | null = task.file_path
    let fileHash: string | null = null

    if (task.requires_file && file && file.size > 0) {
        if (file.size > MAX_ONBOARDING_FILE_BYTES) {
            throw new Error('Plik za duży (max 10 MB).')
        }
        // Resolve user_id from progress
        const { data: progress } = await supabase
            .from('onboarding_progress')
            .select('user_id')
            .eq('id', task.progress_id)
            .single()
        if (!progress) throw new Error('Onboarding nie znaleziony.')

        const safeName = sanitizeFileName(file.name)
        const path = `onboarding/${progress.user_id}/${Date.now()}_${safeName}`
        const { error: uploadErr } = await supabase.storage.from(BUCKET).upload(path, file, {
            contentType: file.type || 'application/octet-stream',
            upsert: false,
        })
        if (uploadErr) {
            logCompat.error('Onboarding upload error:', uploadErr)
            throw new Error('Nie udało się wgrać pliku.')
        }
        uploadedPath = path
        fileHash = await fileSha256(file)
    }

    const { error: updateErr } = await supabase
        .from('onboarding_tasks')
        .update({
            completed_at: new Date().toISOString(),
            completed_by: ctx.userId,
            notes,
            file_path: uploadedPath,
            file_hash: fileHash,
        })
        .eq('id', taskId)
    if (updateErr) {
        logCompat.error('Onboarding task update error:', updateErr)
        throw new Error(updateErr.message || 'Nie udało się oznaczyć zadania.')
    }

    await logAudit(ctx.userId, 'ONBOARDING_TASK_COMPLETED', {
        task_id: taskId,
        progress_id: task.progress_id,
        has_file: uploadedPath !== null,
    })
}

export async function addAdhocOnboardingTask(formData: FormData): Promise<void> {
    const ctx = await requireLifecycleManagerAction()
    const progressId = formData.get('progressId')?.toString()
    const title = formData.get('title')?.toString()
    const category = (formData.get('category')?.toString() ?? 'other') as OnboardingTask['category']
    const responsibleRole = (formData.get('responsibleRole')?.toString() ?? 'employee') as ResponsibleRole
    const dueDate = formData.get('dueDate')?.toString() || null
    const description = formData.get('description')?.toString() || null
    const requiresFile = formData.get('requiresFile') === 'true'
    const isRequired = formData.get('isRequired') !== 'false'

    if (!progressId || !title) throw new Error('progressId i title są wymagane.')

    const supabase = createClient()
    const { data: maxPos } = await supabase
        .from('onboarding_tasks')
        .select('position')
        .eq('progress_id', progressId)
        .order('position', { ascending: false })
        .limit(1)
        .single()

    const nextPos = (maxPos?.position ?? -1) + 1

    const { error } = await supabase.from('onboarding_tasks').insert({
        progress_id: progressId,
        title,
        description,
        category,
        responsible_role: responsibleRole,
        is_required: isRequired,
        requires_file: requiresFile,
        due_date: dueDate,
        position: nextPos,
    })
    if (error) throw new Error('Nie udało się dodać zadania.')

    await logAudit(ctx.userId, 'ONBOARDING_TASK_ADDED', { progress_id: progressId, title })
}

export async function submitOnboardingCheckin(
    progressId: string,
    day: CheckinDay,
    score: number,
    note: string | null,
): Promise<void> {
    const ctx = await requireInternalOrAdminAction()
    if (score < 1 || score > 5) throw new Error('Score musi być 1-5.')

    const supabase = createClient()
    const fieldPrefix = `checkin_day${day}`
    const patch: Record<string, unknown> = {
        [`${fieldPrefix}_at`]: new Date().toISOString(),
        [`${fieldPrefix}_score`]: score,
        [`${fieldPrefix}_note`]: note,
    }

    const { error } = await supabase.from('onboarding_progress').update(patch).eq('id', progressId)
    if (error) {
        logCompat.error('Checkin submit error:', error)
        throw new Error('Nie udało się zapisać check-inu.')
    }

    await logAudit(ctx.userId, 'ONBOARDING_CHECKIN_SUBMITTED', { progress_id: progressId, day, score })
}

export async function completeOnboarding(progressId: string): Promise<void> {
    const ctx = await requireLifecycleManagerAction()
    const supabase = createServiceClient()

    // Check all required tasks completed
    const { data: tasks, error: tasksErr } = await supabase
        .from('onboarding_tasks')
        .select('is_required, completed_at, progress_id')
        .eq('progress_id', progressId)
    if (tasksErr || !tasks) throw new Error('Nie udało się sprawdzić zadań.')

    const incompleteRequired = tasks.filter((t: any) => t.is_required && !t.completed_at)
    if (incompleteRequired.length > 0) {
        throw new Error(`Pozostało ${incompleteRequired.length} wymaganych zadań do ukończenia.`)
    }

    const { data: progress } = await supabase
        .from('onboarding_progress')
        .select('user_id')
        .eq('id', progressId)
        .single()
    if (!progress) throw new Error('Onboarding nie znaleziony.')

    const completedAt = new Date().toISOString()
    await supabase
        .from('onboarding_progress')
        .update({ completed_at: completedAt })
        .eq('id', progressId)

    await supabase.from('profiles').update({ employment_status: 'active' }).eq('id', progress.user_id)

    await recordLifecycleEvent({
        userId: progress.user_id,
        eventType: 'onboarding_completed',
        metadata: { progress_id: progressId, completed_at: completedAt },
        actorId: ctx.userId,
    })

    await logAudit(ctx.userId, 'ONBOARDING_COMPLETED', { progress_id: progressId, user_id: progress.user_id })
}

/**
 * Phase 25c: TCM/admin manually triggers the welcome onboarding email after
 * the fact (e.g. external pracownik who was created silently, or onboarding
 * already running without email yet). Idempotent in the sense that it can be
 * called repeatedly — each call overwrites `welcome_email_sent_at/by` and
 * appends an audit log entry, so a re-send is auditable.
 */
export async function sendOnboardingWelcomeEmailNow(progressId: string): Promise<void> {
    const ctx = await requireLifecycleManagerAction()
    const supabase = createServiceClient()

    const { data: progress, error: progErr } = await supabase
        .from('onboarding_progress')
        .select('id, user_id, completed_at')
        .eq('id', progressId)
        .single()
    if (progErr || !progress) throw new Error('Onboarding nie znaleziony.')
    if (progress.completed_at) throw new Error('Onboarding już zakończony — email niepotrzebny.')

    const contact = await fetchUserContact(progress.user_id)
    if (!contact) throw new Error('Nie znaleziono danych pracownika.')

    await sendOnboardingWelcome(
        contact.email,
        contact.full_name ?? contact.email,
        progressId,
        roleLabelPl(contact.role),
    )

    await supabase
        .from('onboarding_progress')
        .update({ welcome_email_sent_at: new Date().toISOString(), welcome_email_sent_by: ctx.userId })
        .eq('id', progressId)

    await logAudit(ctx.userId, 'ONBOARDING_WELCOME_EMAIL_SENT', {
        progress_id: progressId,
        user_id: progress.user_id,
        trigger: 'manual_send_now',
    })
}

// ─── Exit Interview Workflow ───────────────────────────────────────────────

/**
 * Phase 25c: explicit opt-in for outgoing exit-interview emails. Both default
 * to `false`. Push notifications (in-app) are unaffected — they always go out
 * because they don't spam external mailboxes.
 */
export interface ScheduleExitInterviewOptions {
    sendEmployeeEmail?: boolean
    sendManagerEmail?: boolean
}

export async function scheduleExitInterview(
    userId: string,
    terminationDate: string,
    scheduledFor?: string | null,
    options?: ScheduleExitInterviewOptions,
): Promise<string> {
    const ctx = await requireLifecycleManagerAction()
    const supabase = createServiceClient()

    const { data, error } = await supabase.rpc('start_offboarding_for_user', {
        p_user_id: userId,
        p_termination_date: terminationDate,
        p_scheduled_for: scheduledFor ?? null,
        p_actor_id: ctx.userId,
    })
    if (error || !data) {
        logCompat.error('scheduleExitInterview RPC error:', error)
        throw new Error(error?.message ?? 'Nie udało się rozpocząć offboardingu.')
    }
    const interviewId = data as string

    const sendEmployeeEmail = options?.sendEmployeeEmail === true
    const sendManagerEmail = options?.sendManagerEmail === true

    const employee = await fetchUserContact(userId)
    if (employee) {
        const scheduledForLabel = scheduledFor ?? terminationDate

        // Replaces the consultant exit-interview survey: file a tracking ticket
        // into the Inbox (Moduł Obsługi Zgłoszeń) auto-assigned to the actor.
        // Best-effort — the offboarding RPC already committed, so a ticket
        // failure must not roll back the offboarding.
        try {
            const { data: category } = await supabase
                .from('support_categories')
                .select('id')
                .eq('slug', 'inbox_offboarding')
                .single()
            if (!category) {
                logCompat.error('scheduleExitInterview: inbox_offboarding category missing')
            } else {
                const employeeName = employee.full_name ?? employee.email
                const subject = `${employeeName} Offboarding`
                const bodyLines = [
                    `**Offboarding pracownika: ${employeeName}**`,
                    '',
                    `- **Rola:** ${roleLabelPl(employee.role)}`,
                    `- **Data zakończenia współpracy:** ${terminationDate}`,
                ]
                if (scheduledFor) bodyLines.push(`- **Sugerowana data realizacji:** ${scheduledFor}`)
                bodyLines.push(
                    '',
                    'Zadania offboardingu (cofnięcie dostępów, zwrot sprzętu, knowledge transfer, finalne rozliczenie, archiwizacja) są w karcie pracownika:',
                    `[Otwórz checklist offboardingu](/internal/lifecycle/offboarding/${userId})`,
                    '',
                    '_Ticket utworzony automatycznie przy rozpoczęciu offboardingu._',
                )
                const { data: ticket, error: ticketErr } = await supabase
                    .from('support_tickets')
                    .insert({
                        user_id: ctx.userId,
                        assignee_id: ctx.userId,
                        category_id: category.id,
                        subject,
                        body_md: bodyLines.join('\n'),
                        priority: 'normal',
                        status: 'in_progress',
                    })
                    .select('id')
                    .single()
                if (ticketErr || !ticket) {
                    logCompat.error('scheduleExitInterview: offboarding ticket insert failed:', ticketErr)
                } else {
                    const { error: metaErr } = await supabase.from('support_inbox_meta').insert({
                        ticket_id: ticket.id,
                        source: 'manual_paste',
                        consultant_id: userId,
                        priority_level: 'P3',
                        due_date: computeDueDate('P3', new Date()).toISOString(),
                        email_subject: subject,
                    })
                    if (metaErr) {
                        await supabase.from('support_tickets').delete().eq('id', ticket.id)
                        logCompat.error('scheduleExitInterview: offboarding meta insert failed:', metaErr)
                    } else {
                        await logAudit(ctx.userId, 'OFFBOARDING_TICKET_CREATED', {
                            ticket_id: ticket.id,
                            user_id: userId,
                            interview_id: interviewId,
                        })
                    }
                }
            }
        } catch (e) {
            logCompat.error('scheduleExitInterview: offboarding ticket creation threw:', e)
        }

        if (sendEmployeeEmail) {
            await sendExitInterviewInvitation(
                employee.email,
                employee.full_name ?? employee.email,
                scheduledForLabel,
                interviewId,
            )
                .then(async () => {
                    await supabase
                        .from('exit_interviews')
                        .update({ invitation_sent_at: new Date().toISOString(), invitation_sent_by: ctx.userId })
                        .eq('id', interviewId)
                    await logAudit(ctx.userId, 'EXIT_INVITATION_EMAIL_SENT', {
                        interview_id: interviewId,
                        user_id: userId,
                        trigger: 'schedule_dialog',
                    })
                })
                .catch((e) => logCompat.error('sendExitInterviewInvitation failed:', e))
        }

        if (employee.manager_id) {
            if (sendManagerEmail) {
                const manager = await fetchManagerContact(employee.manager_id)
                if (manager) {
                    await sendOffboardingChecklistToManager(
                        manager.email,
                        manager.full_name ?? manager.email,
                        employee.full_name ?? employee.email,
                        terminationDate,
                        userId,
                    )
                        .then(async () => {
                            await supabase
                                .from('exit_interviews')
                                .update({ manager_checklist_sent_at: new Date().toISOString(), manager_checklist_sent_by: ctx.userId })
                                .eq('id', interviewId)
                            await logAudit(ctx.userId, 'OFFBOARDING_CHECKLIST_EMAIL_SENT', {
                                interview_id: interviewId,
                                user_id: userId,
                                manager_id: employee.manager_id,
                                trigger: 'schedule_dialog',
                            })
                        })
                        .catch((e) => logCompat.error('sendOffboardingChecklistToManager failed:', e))
                }
            }

            sendPushToUserId(employee.manager_id, {
                title: 'Team-member rozpoczyna offboarding',
                body: `${employee.full_name ?? employee.email} kończy współpracę ${terminationDate}.`,
                url: `/internal/lifecycle/offboarding/${userId}`,
                tag: `offboarding-${userId}`,
            }).catch(() => undefined)
        }
    }

    await logAudit(ctx.userId, 'OFFBOARDING_STARTED', {
        user_id: userId,
        interview_id: interviewId,
        termination_date: terminationDate,
    })
    await logAudit(ctx.userId, 'EXIT_INTERVIEW_SCHEDULED', {
        user_id: userId,
        interview_id: interviewId,
        scheduled_for: scheduledFor ?? terminationDate,
        employee_email_opt_in: sendEmployeeEmail,
        manager_email_opt_in: sendManagerEmail,
    })
    return interviewId
}

export async function getMyExitInterview(): Promise<ExitInterview | null> {
    const ctx = await requireInternalOrAdminAction()
    const supabase = createClient()
    const { data, error } = await supabase
        .from('exit_interviews')
        .select('*')
        .eq('user_id', ctx.userId)
        .neq('status', 'archived')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    if (error) {
        logCompat.error('getMyExitInterview error:', error)
        return null
    }
    return (data as ExitInterview) ?? null
}

export async function listExitInterviews(filters?: {
    status?: 'scheduled' | 'submitted' | 'reviewed' | 'archived' | 'all'
}): Promise<Array<ExitInterview & { user_full_name: string | null; user_email: string | null }>> {
    await requireLifecycleManagerAction()
    const supabase = createClient()
    let query = supabase
        .from('exit_interviews')
        .select('*, user:profiles!user_id(full_name, email)')
        .order('created_at', { ascending: false })

    if (filters?.status && filters.status !== 'all') {
        query = query.eq('status', filters.status)
    }

    const { data, error } = await query
    if (error) {
        logCompat.error('listExitInterviews error:', error)
        return []
    }

    return (data ?? []).map((row: any) => ({
        ...(row as ExitInterview),
        user_full_name: row.user?.full_name ?? null,
        user_email: row.user?.email ?? null,
    }))
}

export async function markExitInterviewReviewed(interviewId: string, note: string | null): Promise<void> {
    const ctx = await requireLifecycleManagerAction()
    const supabase = createClient()
    const { error } = await supabase
        .from('exit_interviews')
        .update({
            status: 'reviewed',
            reviewed_by: ctx.userId,
            reviewed_at: new Date().toISOString(),
            reviewer_note: note,
        })
        .eq('id', interviewId)
    if (error) throw new Error('Nie udało się oznaczyć jako reviewed.')
    await logAudit(ctx.userId, 'EXIT_INTERVIEW_REVIEWED', { interview_id: interviewId })
}

export async function completeOffboardingTask(taskId: string, notes?: string | null): Promise<void> {
    const ctx = await requireInternalOrAdminAction()
    const supabase = createClient()
    const { data: task } = await supabase
        .from('offboarding_tasks')
        .select('id, user_id')
        .eq('id', taskId)
        .single()
    if (!task) throw new Error('Task nie znaleziony.')

    const { error } = await supabase
        .from('offboarding_tasks')
        .update({
            completed_at: new Date().toISOString(),
            completed_by: ctx.userId,
            notes: notes ?? null,
        })
        .eq('id', taskId)
    if (error) {
        logCompat.error('completeOffboardingTask error:', error)
        throw new Error(error.message || 'Nie udało się oznaczyć zadania.')
    }
    await logAudit(ctx.userId, 'OFFBOARDING_TASK_COMPLETED', { task_id: taskId, user_id: task.user_id })
}

export async function markEmployeeExited(userId: string): Promise<void> {
    const ctx = await requireLifecycleManagerAction()
    const supabase = createServiceClient()

    // Ensure offboarding tasks complete (or warn) — informational only, do not block
    const { count: openTasks } = await supabase
        .from('offboarding_tasks')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .is('completed_at', null)
        .eq('is_required', true)

    await supabase.from('profiles').update({ employment_status: 'exited' }).eq('id', userId)

    await recordLifecycleEvent({
        userId,
        eventType: 'exited',
        metadata: { open_required_tasks: openTasks ?? 0 },
        actorId: ctx.userId,
    })

    await logAudit(ctx.userId, 'EMPLOYEE_EXITED', { user_id: userId, open_required_tasks: openTasks ?? 0 })
}

/**
 * Phase 25c: TCM/admin manually sends the exit interview invitation to the
 * employee after the fact. Updates `invitation_sent_at/by` and audits.
 */
export async function sendExitInvitationNow(interviewId: string): Promise<void> {
    const ctx = await requireLifecycleManagerAction()
    const supabase = createServiceClient()

    const { data: interview, error: ivErr } = await supabase
        .from('exit_interviews')
        .select('id, user_id, status, scheduled_for')
        .eq('id', interviewId)
        .single()
    if (ivErr || !interview) throw new Error('Exit interview nie znaleziony.')
    if (interview.status !== 'scheduled') {
        throw new Error('Email zaproszenia można wysłać tylko gdy ankieta ma status "scheduled".')
    }
    if (!interview.user_id) throw new Error('Ankieta zanonimizowana — nie można wysłać zaproszenia.')

    const contact = await fetchUserContact(interview.user_id)
    if (!contact) throw new Error('Nie znaleziono danych pracownika.')

    const scheduledForLabel = interview.scheduled_for ?? new Date().toISOString().slice(0, 10)

    await sendExitInterviewInvitation(
        contact.email,
        contact.full_name ?? contact.email,
        scheduledForLabel,
        interviewId,
    )

    await supabase
        .from('exit_interviews')
        .update({ invitation_sent_at: new Date().toISOString(), invitation_sent_by: ctx.userId })
        .eq('id', interviewId)

    await logAudit(ctx.userId, 'EXIT_INVITATION_EMAIL_SENT', {
        interview_id: interviewId,
        user_id: interview.user_id,
        trigger: 'manual_send_now',
    })
}

/**
 * Phase 25c: TCM/admin manually sends the offboarding checklist email to the
 * manager of an exiting employee. Updates `manager_checklist_sent_at/by`.
 */
export async function sendOffboardingChecklistNow(interviewId: string): Promise<void> {
    const ctx = await requireLifecycleManagerAction()
    const supabase = createServiceClient()

    const { data: interview, error: ivErr } = await supabase
        .from('exit_interviews')
        .select('id, user_id, status')
        .eq('id', interviewId)
        .single()
    if (ivErr || !interview) throw new Error('Exit interview nie znaleziony.')
    if (!interview.user_id) throw new Error('Ankieta zanonimizowana — nie można wysłać do managera.')

    const employee = await fetchUserContact(interview.user_id)
    if (!employee) throw new Error('Nie znaleziono danych pracownika.')
    if (!employee.manager_id) throw new Error('Pracownik nie ma przypisanego managera.')

    const manager = await fetchManagerContact(employee.manager_id)
    if (!manager) throw new Error('Nie znaleziono managera.')

    // Read termination_date from profiles (RPC start_offboarding_for_user set it).
    const { data: prof } = await supabase
        .from('profiles')
        .select('termination_date')
        .eq('id', interview.user_id)
        .single()
    const terminationDate = prof?.termination_date ?? new Date().toISOString().slice(0, 10)

    await sendOffboardingChecklistToManager(
        manager.email,
        manager.full_name ?? manager.email,
        employee.full_name ?? employee.email,
        terminationDate,
        interview.user_id,
    )

    await supabase
        .from('exit_interviews')
        .update({ manager_checklist_sent_at: new Date().toISOString(), manager_checklist_sent_by: ctx.userId })
        .eq('id', interviewId)

    await logAudit(ctx.userId, 'OFFBOARDING_CHECKLIST_EMAIL_SENT', {
        interview_id: interviewId,
        user_id: interview.user_id,
        manager_id: employee.manager_id,
        trigger: 'manual_send_now',
    })
}

// ─── Offboarding queries ───────────────────────────────────────────────────

export async function listOffboardingTasks(userId: string): Promise<OffboardingTask[]> {
    await requireInternalOrAdminAction()
    const supabase = createClient()
    const { data, error } = await supabase
        .from('offboarding_tasks')
        .select('*')
        .eq('user_id', userId)
        .order('position', { ascending: true })
    if (error) {
        logCompat.error('listOffboardingTasks error:', error)
        return []
    }
    return (data ?? []) as OffboardingTask[]
}

// ─── Lifecycle Timeline ────────────────────────────────────────────────────

export async function getLifecycleTimeline(userId: string): Promise<LifecycleEvent[]> {
    await requireInternalOrAdminAction()
    const supabase = createClient()
    const { data, error } = await supabase
        .from('lifecycle_events')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
    if (error) {
        logCompat.error('getLifecycleTimeline error:', error)
        return []
    }
    return (data ?? []) as LifecycleEvent[]
}

// ─── Sidebar count ─────────────────────────────────────────────────────────

export async function getLifecycleSidebarCount(): Promise<LifecycleSidebarCount> {
    const ctx = await requireInternalOrAdminAction()
    const supabase = createClient()

    // Overdue tasks where current user is responsible (employee/manager/buddy/tcm/admin)
    const now = new Date().toISOString().split('T')[0]
    const isManagerOrTcm = ctx.isAdmin || ctx.isManager || ctx.isTalentCommunity

    // Own active onboarding
    const { count: ownOnboarding } = await supabase
        .from('onboarding_progress')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', ctx.userId)
        .is('completed_at', null)

    // Own active exit interview
    const { count: ownExit } = await supabase
        .from('exit_interviews')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', ctx.userId)
        .eq('status', 'scheduled')

    // Pending checkins (mine, where I'm past day 1/7/30 + still not filled) — approximation
    let pendingCheckins = 0
    if ((ownOnboarding ?? 0) > 0) {
        const { data: myProgress } = await supabase
            .from('onboarding_progress')
            .select('checkin_day1_at, checkin_day7_at, checkin_day30_at, started_at')
            .eq('user_id', ctx.userId)
            .is('completed_at', null)
            .maybeSingle()
        if (myProgress) {
            const startedDays = Math.floor((Date.now() - new Date(myProgress.started_at).getTime()) / (1000 * 60 * 60 * 24))
            if (startedDays >= 1 && !myProgress.checkin_day1_at) pendingCheckins++
            if (startedDays >= 7 && !myProgress.checkin_day7_at) pendingCheckins++
            if (startedDays >= 30 && !myProgress.checkin_day30_at) pendingCheckins++
        }
    }

    // Overdue tasks (only managers/TCM/admin see this count for their visible scope)
    let overdueTasks = 0
    if (isManagerOrTcm) {
        const { count } = await supabase
            .from('onboarding_tasks')
            .select('id', { count: 'exact', head: true })
            .is('completed_at', null)
            .lt('due_date', now)
        overdueTasks = count ?? 0
    }

    // Pending exit interviews for TCM/admin
    let pendingExits = 0
    if (ctx.isAdmin || ctx.isTalentCommunity) {
        const { count } = await supabase
            .from('exit_interviews')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'submitted')
        pendingExits = count ?? 0
    }

    const total = overdueTasks + pendingCheckins + pendingExits + (ownExit ?? 0)
    return {
        overdueTasks,
        pendingCheckins,
        pendingExitInterviewsToReview: pendingExits,
        activeOwnOnboarding: (ownOnboarding ?? 0) > 0,
        activeOwnExitInterview: (ownExit ?? 0) > 0,
        total,
    }
}

// ─── Analytics ─────────────────────────────────────────────────────────────

export async function getLifecycleAnalytics(): Promise<LifecycleAnalytics> {
    await requireLifecycleManagerAction()
    const supabase = createClient()

    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
    const now = new Date()
    const todayIso = now.toISOString().split('T')[0]

    const [
        activeOnboardingsRes,
        completedOnboardingsRes,
        pendingExitsRes,
        completedExitsRes,
        overdueTasksRes,
        topReasonsRes,
        retentionRes,
    ] = await Promise.all([
        supabase.from('onboarding_progress').select('id', { count: 'exact', head: true }).is('completed_at', null),
        supabase
            .from('onboarding_progress')
            .select('started_at, completed_at')
            .not('completed_at', 'is', null)
            .gte('completed_at', ninetyDaysAgo),
        supabase.from('exit_interviews').select('id', { count: 'exact', head: true }).eq('status', 'submitted'),
        supabase
            .from('exit_interviews')
            .select('nps_score, exit_reason, role_snapshot')
            .in('status', ['submitted', 'reviewed', 'archived'])
            .gte('submitted_at', ninetyDaysAgo),
        supabase
            .from('onboarding_tasks')
            .select('id', { count: 'exact', head: true })
            .is('completed_at', null)
            .lt('due_date', todayIso),
        supabase
            .from('exit_interviews')
            .select('exit_reason')
            .not('exit_reason', 'is', null)
            .gte('submitted_at', ninetyDaysAgo),
        supabase
            .from('profiles')
            .select('role, employment_status')
            .in('role', ['consultant', 'internal', 'finanse', 'manager', 'talent_community']),
    ])

    const completedOnboardings = completedOnboardingsRes.data ?? []
    const avgOnboardingDays = completedOnboardings.length > 0
        ? completedOnboardings.reduce((sum: number, p: any) => {
              const days = (new Date(p.completed_at).getTime() - new Date(p.started_at).getTime()) / (1000 * 60 * 60 * 24)
              return sum + days
          }, 0) / completedOnboardings.length
        : null

    const exitData: Array<{ nps_score: number | null; exit_reason: string | null; role_snapshot: string }> =
        completedExitsRes.data ?? []
    const npsValues = exitData.map((e) => e.nps_score).filter((n): n is number => n !== null)
    const avgExitNps = npsValues.length > 0 ? npsValues.reduce((a, b) => a + b, 0) / npsValues.length : null

    const reasonCounts: Record<string, number> = {}
    for (const row of topReasonsRes.data ?? []) {
        const r = (row as { exit_reason: string }).exit_reason
        if (r) reasonCounts[r] = (reasonCounts[r] ?? 0) + 1
    }
    const topExitReasons = Object.entries(reasonCounts)
        .map(([reason, count]) => ({ reason: reason as LifecycleAnalytics['topExitReasons'][number]['reason'], count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)

    const retentionByRoleMap: Record<string, { total: number; exited: number }> = {}
    for (const row of (retentionRes.data ?? []) as Array<{ role: string; employment_status: string }>) {
        const r = row.role
        if (!retentionByRoleMap[r]) retentionByRoleMap[r] = { total: 0, exited: 0 }
        retentionByRoleMap[r].total++
        if (row.employment_status === 'exited') retentionByRoleMap[r].exited++
    }
    const retentionByRole = Object.entries(retentionByRoleMap).map(([role, v]) => ({
        role,
        total: v.total,
        retention_rate: v.total === 0 ? 0 : (v.total - v.exited) / v.total,
    }))

    return {
        period: { from: ninetyDaysAgo.split('T')[0], to: todayIso },
        activeOnboardings: activeOnboardingsRes.count ?? 0,
        completedOnboardings: completedOnboardings.length,
        avgOnboardingDays,
        onTimeCompletionRate: null, // computed separately if needed
        pendingExitInterviews: pendingExitsRes.count ?? 0,
        completedExitInterviews: exitData.length,
        avgExitNps,
        topExitReasons,
        retentionByRole,
        openTasksByResponsible: [],
        overdueTasks: overdueTasksRes.count ?? 0,
    }
}

// ──────────────────────────────────────────────────────────────────────────
// Phase 22f — Cancellation + restart + edit + notes + external + duplicate
// ──────────────────────────────────────────────────────────────────────────

export async function cancelOnboarding(progressId: string, reason: string | null): Promise<void> {
    const ctx = await requireLifecycleManagerAction()
    const supabase = createServiceClient()

    const { data: progress } = await supabase
        .from('onboarding_progress')
        .select('user_id, completed_at, cancelled_at')
        .eq('id', progressId)
        .single()
    if (!progress) throw new Error('Onboarding nie znaleziony.')
    if (progress.completed_at) throw new Error('Onboarding już zakończony — nie można anulować.')
    if (progress.cancelled_at) throw new Error('Onboarding już anulowany.')

    const now = new Date().toISOString()
    const { error: updErr } = await supabase
        .from('onboarding_progress')
        .update({
            cancelled_at: now,
            cancelled_by: ctx.userId,
            cancellation_reason: reason,
        })
        .eq('id', progressId)
    if (updErr) throw new Error('Nie udało się anulować onboardingu.')

    // Reset employment_status to 'active' so user is unblocked
    await supabase
        .from('profiles')
        .update({ employment_status: 'active' })
        .eq('id', progress.user_id)
        .eq('employment_status', 'onboarding')

    await recordLifecycleEvent({
        userId: progress.user_id,
        eventType: 'onboarding_started', // re-use, with metadata.cancelled flag
        metadata: { cancelled: true, progress_id: progressId, reason },
        actorId: ctx.userId,
    })

    await logAudit(ctx.userId, 'ONBOARDING_CANCELLED', { progress_id: progressId, user_id: progress.user_id, reason })
}

export async function restartOnboarding(progressId: string, newTemplateId?: string | null): Promise<string> {
    const ctx = await requireLifecycleManagerAction()
    const supabase = createServiceClient()

    const { data: progress } = await supabase
        .from('onboarding_progress')
        .select('user_id, template_id, cancelled_at, completed_at')
        .eq('id', progressId)
        .single()
    if (!progress) throw new Error('Onboarding nie znaleziony.')

    // First mark current onboarding as cancelled (if still active)
    if (!progress.cancelled_at && !progress.completed_at) {
        await supabase
            .from('onboarding_progress')
            .update({
                cancelled_at: new Date().toISOString(),
                cancelled_by: ctx.userId,
                cancellation_reason: 'restart',
            })
            .eq('id', progressId)
    }

    // Delete old progress entirely so UNIQUE user_id allows new one
    const { error: delErr } = await supabase
        .from('onboarding_progress')
        .delete()
        .eq('id', progressId)
    if (delErr) throw new Error('Nie udało się usunąć poprzedniego onboardingu.')

    // Start new onboarding
    const { data, error } = await supabase.rpc('start_onboarding_for_user', {
        p_user_id: progress.user_id,
        p_template_id: newTemplateId ?? progress.template_id,
        p_actor_id: ctx.userId,
    })
    if (error || !data) {
        logCompat.error('restartOnboarding RPC error:', error)
        throw new Error(error?.message ?? 'Nie udało się zrestartować onboardingu.')
    }

    await logAudit(ctx.userId, 'ONBOARDING_RESTARTED', {
        old_progress_id: progressId,
        new_progress_id: data,
        user_id: progress.user_id,
        new_template_id: newTemplateId ?? null,
    })
    return data as string
}

export async function cancelExitInterview(interviewId: string, reason: string | null): Promise<void> {
    const ctx = await requireLifecycleManagerAction()
    const supabase = createServiceClient()

    const { data: interview } = await supabase
        .from('exit_interviews')
        .select('user_id, status')
        .eq('id', interviewId)
        .single()
    if (!interview) throw new Error('Exit interview nie znaleziony.')
    if (interview.status !== 'scheduled') {
        throw new Error('Można anulować tylko exit interview ze statusem "scheduled".')
    }

    const { error: updErr } = await supabase
        .from('exit_interviews')
        .update({
            status: 'cancelled',
            cancelled_by: ctx.userId,
            cancellation_reason: reason,
        })
        .eq('id', interviewId)
    if (updErr) {
        logCompat.error('cancelExitInterview error:', updErr)
        throw new Error(updErr.message || 'Nie udało się anulować exit interview.')
    }

    // Reset employment_status to 'active' so user is unblocked (trigger allows because no submitted interview)
    if (interview.user_id) {
        await supabase
            .from('profiles')
            .update({ employment_status: 'active', termination_date: null })
            .eq('id', interview.user_id)
            .eq('employment_status', 'offboarding')

        // Also delete offboarding tasks since process is cancelled
        await supabase.from('offboarding_tasks').delete().eq('user_id', interview.user_id).is('completed_at', null)
    }

    await logAudit(ctx.userId, 'EXIT_INTERVIEW_CANCELLED', { interview_id: interviewId, user_id: interview.user_id, reason })
}

export interface UpdateLifecycleProfileInput {
    userId: string
    hiredAt?: string | null
    managerId?: string | null
    role?: DbRole
    externalNotes?: string | null
}

export async function updateLifecycleProfile(input: UpdateLifecycleProfileInput): Promise<void> {
    const ctx = await requireLifecycleManagerAction()
    const supabase = createServiceClient()

    const patch: Record<string, unknown> = {}
    if (input.hiredAt !== undefined) {
        patch.hired_at = input.hiredAt
        patch.work_start_date = input.hiredAt
    }
    if (input.managerId !== undefined) patch.manager_id = input.managerId
    if (input.role !== undefined) patch.role = input.role
    if (input.externalNotes !== undefined) patch.external_notes = input.externalNotes

    if (Object.keys(patch).length === 0) return

    const { error } = await supabase.from('profiles').update(patch).eq('id', input.userId)
    if (error) {
        logCompat.error('updateLifecycleProfile error:', error)
        throw new Error(error.message || 'Nie udało się zaktualizować profilu.')
    }

    await logAudit(ctx.userId, 'LIFECYCLE_PROFILE_UPDATED', {
        target_user_id: input.userId,
        fields: Object.keys(patch),
    })

    // Special-case: manager_id change should be logged as MANAGER_ASSIGNED event in timeline
    if (input.managerId !== undefined) {
        await recordLifecycleEvent({
            userId: input.userId,
            eventType: 'manager_changed',
            metadata: { new_manager_id: input.managerId },
            actorId: ctx.userId,
        })
    }
    if (input.role !== undefined) {
        await recordLifecycleEvent({
            userId: input.userId,
            eventType: 'role_changed',
            metadata: { new_role: input.role },
            actorId: ctx.userId,
        })
    }
}

export interface CreateExternalEmployeeInput {
    fullName: string
    email: string
    role: DbRole
    hiredAt: string // ISO date
    managerId?: string | null
    buddyId?: string | null
    externalNotes?: string | null
    templateId?: string | null
    autoStartOnboarding?: boolean
    /**
     * Phase 25c: explicit opt-in to send the welcome email after onboarding
     * starts. Only relevant when `autoStartOnboarding !== false`. Default `false`
     * — TCM must check the box in the dialog. Prevents accidental emails to
     * external mailboxes (vendors, contractors, ex-employees) that exist only
     * for procedure tracking.
     */
    sendWelcomeEmail?: boolean
}

export async function createExternalEmployee(input: CreateExternalEmployeeInput): Promise<{ userId: string; progressId: string | null }> {
    const ctx = await requireLifecycleManagerAction()
    const supabase = createServiceClient()

    // Schema fact (verified 2026-05-19 in prod):
    //   profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE
    // So a profile cannot exist without a matching auth.users row. To create an
    // external employee (someone who never logs in — vendor, contractor, "procedure
    // account"), we still need an auth.users row. We use admin.createUser with a
    // random password and email_confirm=true (no confirmation email sent). The
    // handle_new_user trigger then inserts a minimal profile row, which we update
    // below with HR fields (role, is_external, manager_id, etc.).
    //
    // External users can't actually log in because:
    //   1. The app is gated to @b2bnetwork.pl SSO (single tenant), so a third-party
    //      email cannot complete Azure OAuth even if they tried.
    //   2. The random password is never shared (only known to whoever has prod DB
    //      logs at the moment of creation).
    const email = input.email.trim().toLowerCase()
    const fullName = input.fullName.trim()
    // bcrypt (used by gotrue) caps the password at 72 bytes — keep the random
    // password well below that. One UUID (36 chars) is far more entropy than
    // anyone will ever brute-force.
    const randomPassword = crypto.randomUUID()

    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email,
        password: randomPassword,
        email_confirm: true,
        user_metadata: { full_name: fullName, is_external: true },
    })
    if (createErr) {
        const msg = createErr.message?.toLowerCase() ?? ''
        if (msg.includes('already') || msg.includes('exists') || msg.includes('registered')) {
            throw new Error('Konto z tym adresem email już istnieje (możliwe że ten pracownik już jest w systemie).')
        }
        logCompat.error('createExternalEmployee auth.createUser error:', createErr)
        throw new Error(`Nie udało się utworzyć konta external: ${createErr.message}`)
    }
    const userId = created?.user?.id
    if (!userId) {
        throw new Error('Supabase nie zwróciło ID użytkownika po createUser.')
    }

    // handle_new_user trigger has already inserted a minimal profile row
    // (id, email, full_name from user_metadata, avatar_url). Update with HR fields.
    const { error: profErr } = await supabase
        .from('profiles')
        .update({
            full_name: fullName,
            role: input.role,
            is_external: true,
            external_notes: input.externalNotes ?? null,
            hired_at: input.hiredAt,
            work_start_date: input.hiredAt,
            manager_id: input.managerId ?? null,
            buddy_id: input.buddyId ?? null,
            employment_status: 'pending',
            onboarding_completed: true, // skip /onboarding redirect since they can't login anyway
        })
        .eq('id', userId)
    if (profErr) {
        logCompat.error('createExternalEmployee profile update error:', profErr)
        // Roll back: delete the auth user we just created so the dialog can be retried cleanly.
        await supabase.auth.admin.deleteUser(userId).catch((e: unknown) =>
            logCompat.error('createExternalEmployee rollback deleteUser failed:', e),
        )
        throw new Error(profErr.message || 'Nie udało się ustawić danych external employee.')
    }

    // Log hired event in timeline
    await recordLifecycleEvent({
        userId,
        eventType: 'hired',
        metadata: { is_external: true, role: input.role, hired_at: input.hiredAt },
        actorId: ctx.userId,
    })

    await logAudit(ctx.userId, 'EXTERNAL_EMPLOYEE_CREATED', {
        user_id: userId,
        email: input.email,
        full_name: input.fullName,
        role: input.role,
    })

    // Optionally auto-start onboarding
    let progressId: string | null = null
    if (input.autoStartOnboarding !== false) {
        try {
            const { data, error } = await supabase.rpc('start_onboarding_for_user', {
                p_user_id: userId,
                p_template_id: input.templateId ?? null,
                p_actor_id: ctx.userId,
            })
            if (!error && data) {
                progressId = data as string
                await logAudit(ctx.userId, 'ONBOARDING_STARTED', {
                    user_id: userId,
                    progress_id: progressId,
                    triggered_by: 'external_create',
                    welcome_email_opt_in: input.sendWelcomeEmail === true,
                })

                // Phase 25c: welcome email only when TCM explicitly opted in.
                if (input.sendWelcomeEmail === true) {
                    await sendOnboardingWelcome(
                        input.email.trim().toLowerCase(),
                        input.fullName.trim(),
                        progressId,
                        roleLabelPl(input.role),
                    )
                        .then(async () => {
                            await supabase
                                .from('onboarding_progress')
                                .update({ welcome_email_sent_at: new Date().toISOString(), welcome_email_sent_by: ctx.userId })
                                .eq('id', progressId!)
                            await logAudit(ctx.userId, 'ONBOARDING_WELCOME_EMAIL_SENT', {
                                progress_id: progressId,
                                user_id: userId,
                                trigger: 'external_create_dialog',
                            })
                        })
                        .catch((e) => logCompat.error('sendOnboardingWelcome (external) failed:', e))
                }
            }
        } catch (e: unknown) {
            logCompat.error('Auto-start external onboarding failed:', e)
        }
    }

    return { userId, progressId }
}

// ─── Lifecycle notes ────────────────────────────────────────────────────────

export interface LifecycleNote {
    id: string
    user_id: string
    author_id: string | null
    author_name: string | null
    category: 'general' | 'onboarding' | 'exit' | 'flag'
    content: string
    is_private: boolean
    created_at: string
    updated_at: string
}

export async function listLifecycleNotes(userId: string): Promise<LifecycleNote[]> {
    await requireInternalOrAdminAction()
    const supabase = createClient()
    const { data, error } = await supabase
        .from('lifecycle_notes')
        .select('*, author:profiles!author_id(full_name)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
    if (error) {
        logCompat.error('listLifecycleNotes error:', error)
        return []
    }
    return (data ?? []).map((row: { id: string; user_id: string; author_id: string | null; author: { full_name: string | null } | null; category: 'general' | 'onboarding' | 'exit' | 'flag'; content: string; is_private: boolean; created_at: string; updated_at: string }) => ({
        id: row.id,
        user_id: row.user_id,
        author_id: row.author_id,
        author_name: row.author?.full_name ?? null,
        category: row.category,
        content: row.content,
        is_private: row.is_private,
        created_at: row.created_at,
        updated_at: row.updated_at,
    }))
}

export async function addLifecycleNote(input: {
    userId: string
    category: 'general' | 'onboarding' | 'exit' | 'flag'
    content: string
    isPrivate?: boolean
}): Promise<string> {
    const ctx = await requireLifecycleManagerAction()
    if (!input.content.trim()) throw new Error('Notatka nie może być pusta.')

    const supabase = createClient()
    const { data, error } = await supabase
        .from('lifecycle_notes')
        .insert({
            user_id: input.userId,
            author_id: ctx.userId,
            category: input.category,
            content: input.content.trim(),
            is_private: input.isPrivate ?? true,
        })
        .select('id')
        .single()
    if (error || !data) {
        logCompat.error('addLifecycleNote error:', error)
        throw new Error(error?.message || 'Nie udało się dodać notatki.')
    }

    await logAudit(ctx.userId, 'LIFECYCLE_NOTE_ADDED', { user_id: input.userId, note_id: data.id, category: input.category })
    return data.id as string
}

export async function deleteLifecycleNote(noteId: string): Promise<void> {
    const ctx = await requireLifecycleManagerAction()
    const supabase = createClient()
    const { error } = await supabase.from('lifecycle_notes').delete().eq('id', noteId)
    if (error) throw new Error('Nie udało się usunąć notatki.')
    await logAudit(ctx.userId, 'LIFECYCLE_NOTE_DELETED', { note_id: noteId })
}

// ─── Template duplicate ─────────────────────────────────────────────────────

export async function duplicateTemplate(templateId: string): Promise<string> {
    const ctx = await requireLifecycleManagerAction()
    const supabase = createServiceClient()

    const { data: source } = await supabase
        .from('onboarding_templates')
        .select('name, target_role, description')
        .eq('id', templateId)
        .single()
    if (!source) throw new Error('Szablon źródłowy nie znaleziony.')

    const { data: newTpl, error: tplErr } = await supabase
        .from('onboarding_templates')
        .insert({
            name: `${source.name} (kopia)`,
            target_role: source.target_role,
            description: source.description,
            is_default: false,
            created_by: ctx.userId,
        })
        .select('id')
        .single()
    if (tplErr || !newTpl) throw new Error('Nie udało się utworzyć kopii szablonu.')

    // Copy items
    const { data: sourceItems } = await supabase
        .from('onboarding_template_items')
        .select('position, category, title, description, due_offset_days, requires_file, course_slug, responsible_role, is_required')
        .eq('template_id', templateId)
        .order('position', { ascending: true })

    if (sourceItems && sourceItems.length > 0) {
        const itemsToInsert = (sourceItems as Array<{
            position: number; category: string; title: string; description: string | null;
            due_offset_days: number; requires_file: boolean; course_slug: string | null;
            responsible_role: string; is_required: boolean
        }>).map((it) => ({
            ...it,
            template_id: newTpl.id,
        }))
        await supabase.from('onboarding_template_items').insert(itemsToInsert)
    }

    await logAudit(ctx.userId, 'TEMPLATE_DUPLICATED', { source_template_id: templateId, new_template_id: newTpl.id })
    return newTpl.id as string
}

// ─── Audit log per pracownik ────────────────────────────────────────────────

export interface AuditEntry {
    id: string
    action: string
    details: Record<string, unknown> | null
    created_at: string
    actor_name: string | null
}

export async function listAuditLogForUser(userId: string, limit = 50): Promise<AuditEntry[]> {
    await requireLifecycleManagerAction()
    const supabase = createServiceClient()

    // Match by user_id (actor) AND details.target_user_id / user_id (subject)
    const { data, error } = await supabase
        .from('audit_logs')
        .select('id, action, details, created_at, user_id, actor:profiles!user_id(full_name)')
        .or(`user_id.eq.${userId},details->>target_user_id.eq.${userId},details->>user_id.eq.${userId}`)
        .order('created_at', { ascending: false })
        .limit(limit)
    if (error) {
        logCompat.error('listAuditLogForUser error:', error)
        return []
    }

    return (data ?? []).map((row: { id: string; action: string; details: Record<string, unknown> | null; created_at: string; actor: { full_name: string | null } | null }) => ({
        id: row.id,
        action: row.action,
        details: row.details,
        created_at: row.created_at,
        actor_name: row.actor?.full_name ?? null,
    }))
}

// ─── Exit interview CSV export ──────────────────────────────────────────────

export interface ExitInterviewCsvRow {
    submitted_at: string
    status: string
    is_anonymous: string
    role: string
    tenure_months: string
    exit_reason: string
    nps_score: string
    sat_team: string
    sat_manager: string
    sat_projects: string
    would_recommend: string
    what_worked: string
    what_to_improve: string
}

export async function exportExitInterviewsCsv(): Promise<string> {
    await requireLifecycleManagerAction()
    const supabase = createServiceClient()

    const { data, error } = await supabase
        .from('exit_interviews')
        .select(`
            submitted_at, status, is_anonymous, role_snapshot, tenure_months,
            exit_reason, nps_score,
            satisfaction_team, satisfaction_manager, satisfaction_projects,
            would_recommend, what_worked, what_to_improve
        `)
        .in('status', ['submitted', 'reviewed', 'archived'])
        .order('submitted_at', { ascending: false })

    if (error || !data) {
        logCompat.error('exportExitInterviewsCsv error:', error)
        throw new Error('Nie udało się pobrać danych do eksportu.')
    }

    const header = [
        'submitted_at', 'status', 'is_anonymous', 'role',
        'tenure_months', 'exit_reason', 'nps_score',
        'sat_team', 'sat_manager', 'sat_projects',
        'would_recommend', 'what_worked', 'what_to_improve',
    ]

    const escapeCsv = (v: unknown): string => {
        if (v === null || v === undefined) return ''
        const s = String(v)
        if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
        return s
    }

    const rows = (data as Array<{
        submitted_at: string | null; status: string; is_anonymous: boolean; role_snapshot: string;
        tenure_months: number | null; exit_reason: string | null; nps_score: number | null;
        satisfaction_team: number | null; satisfaction_manager: number | null; satisfaction_projects: number | null;
        would_recommend: boolean | null; what_worked: string | null; what_to_improve: string | null
    }>).map((r) => [
        r.submitted_at ?? '',
        r.status,
        r.is_anonymous ? 'tak' : 'nie',
        r.role_snapshot,
        r.tenure_months ?? '',
        r.exit_reason ?? '',
        r.nps_score ?? '',
        r.satisfaction_team ?? '',
        r.satisfaction_manager ?? '',
        r.satisfaction_projects ?? '',
        r.would_recommend === null ? '' : (r.would_recommend ? 'tak' : 'nie'),
        r.what_worked ?? '',
        r.what_to_improve ?? '',
    ].map(escapeCsv).join(','))

    return [header.join(','), ...rows].join('\n')
}

// ─── Archive listings ──────────────────────────────────────────────────────

export async function listCompletedOnboardings(limit = 100): Promise<Array<{
    progress_id: string
    user_id: string
    full_name: string | null
    email: string
    role: DbRole
    started_at: string
    completed_at: string | null
    cancelled_at: string | null
    cancellation_reason: string | null
    duration_days: number | null
}>> {
    await requireLifecycleManagerAction()
    const supabase = createClient()
    const { data, error } = await supabase
        .from('onboarding_progress')
        .select(`
            id, user_id, started_at, completed_at, cancelled_at, cancellation_reason,
            user:profiles!user_id(full_name, email, role)
        `)
        .or('completed_at.not.is.null,cancelled_at.not.is.null')
        .order('completed_at', { ascending: false, nullsFirst: false })
        .limit(limit)
    if (error || !data) {
        logCompat.error('listCompletedOnboardings error:', error)
        return []
    }

    return (data as Array<{
        id: string; user_id: string; started_at: string; completed_at: string | null;
        cancelled_at: string | null; cancellation_reason: string | null;
        user: { full_name: string | null; email: string; role: DbRole } | null
    }>).map((row) => {
        const endTs = row.completed_at ?? row.cancelled_at
        const durationDays = endTs
            ? Math.round((new Date(endTs).getTime() - new Date(row.started_at).getTime()) / (1000 * 60 * 60 * 24))
            : null
        return {
            progress_id: row.id,
            user_id: row.user_id,
            full_name: row.user?.full_name ?? null,
            email: row.user?.email ?? '',
            role: (row.user?.role ?? 'consultant') as DbRole,
            started_at: row.started_at,
            completed_at: row.completed_at,
            cancelled_at: row.cancelled_at,
            cancellation_reason: row.cancellation_reason,
            duration_days: durationDays,
        }
    })
}

export async function listExitedEmployees(limit = 100): Promise<Array<{
    id: string
    full_name: string | null
    email: string
    role: DbRole
    hired_at: string | null
    termination_date: string | null
    tenure_months: number | null
}>> {
    await requireLifecycleManagerAction()
    const supabase = createServiceClient()
    const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, role, hired_at, termination_date')
        .eq('employment_status', 'exited')
        .order('termination_date', { ascending: false, nullsFirst: false })
        .limit(limit)
    if (error || !data) return []

    return (data as Array<{
        id: string; full_name: string | null; email: string; role: DbRole;
        hired_at: string | null; termination_date: string | null
    }>).map((row) => {
        const tenureMonths = (row.hired_at && row.termination_date)
            ? Math.round(
                (new Date(row.termination_date).getTime() - new Date(row.hired_at).getTime())
                / (1000 * 60 * 60 * 24 * 30.4),
            )
            : null
        return { ...row, tenure_months: tenureMonths }
    })
}
