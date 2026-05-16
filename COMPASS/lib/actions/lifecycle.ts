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
import { roleLabelPl, type DbRole } from '@/lib/types/role'
import type {
    CheckinDay,
    ExitInterview,
    LifecycleAnalytics,
    LifecycleEvent,
    LifecycleSidebarCount,
    OffboardingTask,
    OnboardingDetail,
    OnboardingProgress,
    OnboardingTask,
    OnboardingTemplate,
    OnboardingTemplateItem,
    ResponsibleRole,
    SubmitExitInterviewInput,
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

    // Send welcome email (best-effort, don't fail action)
    const contact = await fetchUserContact(userId)
    if (contact) {
        await sendOnboardingWelcome(
            contact.email,
            contact.full_name ?? contact.email,
            progressId,
            roleLabelPl(contact.role),
        ).catch((e) => logCompat.error('sendOnboardingWelcome failed:', e))
    }

    await logAudit(ctx.userId, 'ONBOARDING_STARTED', { user_id: userId, progress_id: progressId, template_id: templateId ?? null })
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
        await supabase.from('lifecycle_events').insert({
            user_id: userId,
            event_type: 'buddy_assigned',
            metadata: { buddy_id: buddyId },
            created_by: ctx.userId,
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

    const { data: employee, error: empErr } = await supabase
        .from('profiles')
        .select('id, full_name, email, role, hired_at, buddy_id, manager_id, employment_status')
        .eq('id', progress.user_id)
        .single()
    if (empErr || !employee) throw new Error('Profil pracownika nie znaleziony.')

    let buddy = null
    if (employee.buddy_id) {
        const { data: buddyRow } = await supabase
            .from('profiles')
            .select('id, full_name')
            .eq('id', employee.buddy_id)
            .single()
        if (buddyRow) buddy = buddyRow as { id: string; full_name: string | null }
    }

    let manager = null
    if (employee.manager_id) {
        const { data: managerRow } = await supabase
            .from('profiles')
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

    await supabase.from('lifecycle_events').insert({
        user_id: progress.user_id,
        event_type: 'onboarding_completed',
        metadata: { progress_id: progressId, completed_at: completedAt },
        created_by: ctx.userId,
    })

    await logAudit(ctx.userId, 'ONBOARDING_COMPLETED', { progress_id: progressId, user_id: progress.user_id })
}

// ─── Exit Interview Workflow ───────────────────────────────────────────────

export async function scheduleExitInterview(
    userId: string,
    terminationDate: string,
    scheduledFor?: string | null,
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

    const employee = await fetchUserContact(userId)
    if (employee) {
        const scheduledForLabel = scheduledFor ?? terminationDate
        await sendExitInterviewInvitation(
            employee.email,
            employee.full_name ?? employee.email,
            scheduledForLabel,
            interviewId,
        ).catch((e) => logCompat.error('sendExitInterviewInvitation failed:', e))

        if (employee.manager_id) {
            const manager = await fetchManagerContact(employee.manager_id)
            if (manager) {
                await sendOffboardingChecklistToManager(
                    manager.email,
                    manager.full_name ?? manager.email,
                    employee.full_name ?? employee.email,
                    terminationDate,
                    userId,
                ).catch((e) => logCompat.error('sendOffboardingChecklistToManager failed:', e))
            }
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

export async function submitExitInterview(input: SubmitExitInterviewInput): Promise<void> {
    const ctx = await requireInternalOrAdminAction()
    const supabase = createClient()

    // Pre-check: ensure interview belongs to current user (RLS would also block)
    const { data: existing } = await supabase
        .from('exit_interviews')
        .select('id, user_id, status')
        .eq('id', input.interviewId)
        .single()
    if (!existing || existing.user_id !== ctx.userId || existing.status !== 'scheduled') {
        throw new Error('Nie można wypełnić tej ankiety.')
    }

    const { error } = await supabase
        .from('exit_interviews')
        .update({
            is_anonymous: input.isAnonymous,
            exit_reason: input.exitReason,
            exit_reason_detail: input.exitReasonDetail ?? null,
            nps_score: input.npsScore,
            satisfaction_team: input.satisfactionTeam ?? null,
            satisfaction_manager: input.satisfactionManager ?? null,
            satisfaction_projects: input.satisfactionProjects ?? null,
            would_recommend: input.wouldRecommend ?? null,
            what_worked: input.whatWorked ?? null,
            what_to_improve: input.whatToImprove ?? null,
            knowledge_transfer_notes: input.knowledgeTransferNotes ?? null,
            status: 'submitted',
            submitted_at: new Date().toISOString(),
        })
        .eq('id', input.interviewId)
    if (error) {
        logCompat.error('submitExitInterview error:', error)
        throw new Error(error.message || 'Nie udało się wysłać ankiety.')
    }

    // Audit — note: ctx.userId is the actor; user_id in interview may now be NULL after anonymization
    await logAudit(ctx.userId, 'EXIT_INTERVIEW_SUBMITTED', {
        interview_id: input.interviewId,
        is_anonymous: input.isAnonymous,
    })
    if (input.isAnonymous) {
        await logAudit(ctx.userId, 'EXIT_INTERVIEW_ANONYMIZED', { interview_id: input.interviewId })
    }
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

    await supabase.from('lifecycle_events').insert({
        user_id: userId,
        event_type: 'exited',
        metadata: { open_required_tasks: openTasks ?? 0 },
        created_by: ctx.userId,
    })

    await logAudit(ctx.userId, 'EMPLOYEE_EXITED', { user_id: userId, open_required_tasks: openTasks ?? 0 })
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
