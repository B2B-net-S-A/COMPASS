'use server'

// Phase 24a/b — per-user timesheet snippets ("Konsultacje SAP", "Code review", ...).
// Owner-only CRUD. RLS enforces user_id = auth.uid().
// Audit log actions: TIMESHEET_TEMPLATE_CREATED/UPDATED/DELETED/APPLIED.

import { createClient } from '@/lib/supabase/server'
import { requireInternalOrAdminAction } from '@/lib/auth/internal-guard'
import { logAudit } from '@/lib/actions/audit'

export interface TimesheetUserTemplate {
    id: string
    user_id: string
    name: string
    description: string
    project: string | null
    sort_order: number
    created_at: string
    updated_at: string
}

export interface CreateTemplateInput {
    name: string
    description: string
    project?: string | null
    sortOrder?: number
}

export interface UpdateTemplateInput {
    id: string
    name?: string
    description?: string
    project?: string | null
    sortOrder?: number
}

function validateTemplateFields(name: string | undefined, description: string | undefined) {
    if (name !== undefined) {
        const trimmed = name.trim()
        if (trimmed.length < 1 || trimmed.length > 80) {
            throw new Error('Nazwa szablonu musi mieć 1–80 znaków.')
        }
    }
    if (description !== undefined) {
        const trimmed = description.trim()
        if (trimmed.length < 1 || trimmed.length > 2000) {
            throw new Error('Opis szablonu musi mieć 1–2000 znaków.')
        }
    }
}

export async function listMyTemplates(): Promise<TimesheetUserTemplate[]> {
    const ctx = await requireInternalOrAdminAction()
    const supabase = createClient()
    const { data, error } = await supabase
        .from('timesheet_user_templates')
        .select('*')
        .eq('user_id', ctx.userId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false })
    if (error) throw new Error(`Błąd pobierania szablonów: ${error.message}`)
    return (data ?? []) as TimesheetUserTemplate[]
}

export async function createTemplate(input: CreateTemplateInput): Promise<TimesheetUserTemplate> {
    const ctx = await requireInternalOrAdminAction()
    validateTemplateFields(input.name, input.description)
    const supabase = createClient()
    const { data, error } = await supabase
        .from('timesheet_user_templates')
        .insert({
            user_id: ctx.userId,
            name: input.name.trim(),
            description: input.description.trim(),
            project: input.project?.trim() || null,
            sort_order: input.sortOrder ?? 0,
        })
        .select('*')
        .single<TimesheetUserTemplate>()
    if (error || !data) {
        if (error?.code === '23505') {
            throw new Error('Szablon o tej nazwie już istnieje.')
        }
        throw new Error(`Błąd tworzenia szablonu: ${error?.message ?? 'unknown'}`)
    }
    await logAudit(ctx.userId, 'TIMESHEET_TEMPLATE_CREATED', {
        template_id: data.id,
        name: data.name,
    })
    return data
}

export async function updateTemplate(input: UpdateTemplateInput): Promise<void> {
    const ctx = await requireInternalOrAdminAction()
    validateTemplateFields(input.name, input.description)
    const supabase = createClient()
    const updates: Record<string, unknown> = {}
    if (input.name !== undefined) updates.name = input.name.trim()
    if (input.description !== undefined) updates.description = input.description.trim()
    if (input.project !== undefined) updates.project = input.project?.trim() || null
    if (input.sortOrder !== undefined) updates.sort_order = input.sortOrder
    if (Object.keys(updates).length === 0) return

    const { error } = await supabase
        .from('timesheet_user_templates')
        .update(updates)
        .eq('id', input.id)
        .eq('user_id', ctx.userId) // belt-and-suspenders, RLS already enforces
    if (error) {
        if (error.code === '23505') {
            throw new Error('Inny szablon ma już tę nazwę.')
        }
        throw new Error(`Błąd aktualizacji: ${error.message}`)
    }
    await logAudit(ctx.userId, 'TIMESHEET_TEMPLATE_UPDATED', { template_id: input.id })
}

export async function deleteTemplate(id: string): Promise<void> {
    const ctx = await requireInternalOrAdminAction()
    const supabase = createClient()
    const { error } = await supabase
        .from('timesheet_user_templates')
        .delete()
        .eq('id', id)
        .eq('user_id', ctx.userId)
    if (error) throw new Error(`Błąd usuwania szablonu: ${error.message}`)
    await logAudit(ctx.userId, 'TIMESHEET_TEMPLATE_DELETED', { template_id: id })
}

/**
 * Apply a template to a timesheet entry: replace description + project. Owner-only.
 * The entry must belong to a draft timesheet of the current user (RLS-enforced).
 */
export async function applyTemplateToEntry(entryId: string, templateId: string): Promise<void> {
    const ctx = await requireInternalOrAdminAction()
    const supabase = createClient()

    const { data: tpl, error: tplErr } = await supabase
        .from('timesheet_user_templates')
        .select('id, description, project')
        .eq('id', templateId)
        .eq('user_id', ctx.userId)
        .single<{ id: string; description: string; project: string | null }>()
    if (tplErr || !tpl) throw new Error('Szablon nie istnieje lub brak uprawnień.')

    // Verify entry ownership through join with timesheets.
    const { data: entry, error: entryErr } = await supabase
        .from('timesheet_entries')
        .select('id, timesheet_id, timesheets!inner(user_id, status)')
        .eq('id', entryId)
        .single<{
            id: string
            timesheet_id: string
            timesheets: { user_id: string; status: string }
        }>()
    if (entryErr || !entry) throw new Error('Wpis nie istnieje.')
    if (entry.timesheets.user_id !== ctx.userId && !ctx.isAdmin) {
        throw new Error('To nie jest Twój wpis.')
    }
    if (entry.timesheets.status !== 'draft') {
        throw new Error('Można edytować tylko wpisy w timesheecie ze statusem "draft".')
    }

    const { error } = await supabase
        .from('timesheet_entries')
        .update({
            description: tpl.description,
            project: tpl.project,
        })
        .eq('id', entryId)
    if (error) throw new Error(`Błąd aplikowania szablonu: ${error.message}`)

    await logAudit(ctx.userId, 'TIMESHEET_TEMPLATE_APPLIED', {
        entry_id: entryId,
        template_id: templateId,
    })
}
