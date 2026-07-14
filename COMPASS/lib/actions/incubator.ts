'use server'

import { logCompat } from '@/lib/logger'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/admin'
import type {
    ApplicationStatus,
    CreatePitchInput,
    CreateProjectInput,
    IncubatorActionResult,
    IncubatorApplication,
    IncubatorApplicationWithMeta,
    IncubatorPitch,
    IncubatorPitchListItem,
    IncubatorProject,
    IncubatorProjectListItem,
    PitchStatus,
    ProjectStatus,
} from '@/lib/types/incubator'

async function isCallerAdmin(supabase: ReturnType<typeof createClient>, userId: string): Promise<boolean> {
    const { data } = await supabase.from('profiles').select('role').eq('id', userId).single()
    return data?.role === 'admin'
}

function slugify(text: string): string {
    const polishMap: Record<string, string> = {
        ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z',
        Ą: 'a', Ć: 'c', Ę: 'e', Ł: 'l', Ń: 'n', Ó: 'o', Ś: 's', Ź: 'z', Ż: 'z',
    }
    return text
        .split('').map((c) => polishMap[c] ?? c).join('')
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 80) || 'project'
}

async function notify(
    supabase: ReturnType<typeof createClient>,
    userIds: string[],
    type: 'incubator_pitch_status_changed' | 'incubator_application_received' | 'incubator_application_status_changed',
    title: string,
    body: string,
): Promise<void> {
    if (userIds.length === 0) return
    const rows = userIds.map((uid) => ({
        user_id: uid,
        type,
        title_pl: title,
        title_en: title,
        body_pl: body,
        body_en: body,
        priority: 'normal',
    }))
    try {
        await supabase.from('notifications').insert(rows)
    } catch (e) {
        logCompat.warn('[notify]', e)
    }
}

// ─── Pitches (Flow A) ────────────────────────────────────────────────

export async function submitPitch(input: CreatePitchInput): Promise<IncubatorActionResult<{ pitchId: string }>> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }

        if (!input.title || input.title.trim().length < 3) return { success: false, error: 'Tytuł min 3 znaki' }
        if (!input.description_md || input.description_md.trim().length < 30) return { success: false, error: 'Opis min 30 znaków' }
        if (!input.nda_accepted_at) return { success: false, error: 'Wymagana akceptacja NDA' }
        if (input.investment_ask_pln !== undefined && input.investment_ask_pln !== null) {
            if (input.investment_ask_pln < 0 || input.investment_ask_pln > 5_000_000) {
                return { success: false, error: 'Kwota inwestycji poza zakresem (0 — 5 000 000 PLN)' }
            }
        }

        const { data, error } = await supabase
            .from('incubator_pitches')
            .insert({
                submitter_id: user.id,
                title: input.title.trim(),
                description_md: input.description_md.trim(),
                attachment_urls: input.attachment_urls ?? [],
                equity_ask: input.equity_ask?.trim() || null,
                investment_ask_pln: input.investment_ask_pln ?? null,
                nda_accepted_at: input.nda_accepted_at,
                status: 'submitted',
            })
            .select('id')
            .single()

        if (error) throw error

        // Notify all admins
        const service = createServiceClient()
        const { data: admins } = await service.from('profiles').select('id').eq('role', 'admin')
        await notify(
            supabase,
            ((admins ?? []) as Array<{ id: string }>).map((p) => p.id),
            'incubator_pitch_status_changed',
            'Nowy pitch w Inkubatorze',
            input.title.trim(),
        )

        revalidatePath('/incubator/my-pitches')
        revalidatePath('/admin/incubator')
        return { success: true, data: { pitchId: data.id } }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd składania pitcha'
        logCompat.error('[submitPitch]', error)
        return { success: false, error: msg }
    }
}

async function enrichPitches(supabase: ReturnType<typeof createClient>, pitches: IncubatorPitch[]): Promise<IncubatorPitchListItem[]> {
    if (pitches.length === 0) return []
    const userIds = Array.from(new Set([...pitches.map((p) => p.submitter_id), ...pitches.map((p) => p.reviewer_id).filter((x): x is string => !!x)]))
    const { data: profiles } = await supabase.from('profile_directory').select('id, full_name').in('id', userIds)
    const map = new Map(((profiles ?? []) as Array<{ id: string; full_name: string | null }>).map((p) => [p.id, p.full_name]))
    return pitches.map((p) => ({
        ...p,
        submitter_name: map.get(p.submitter_id) ?? null,
        reviewer_name: p.reviewer_id ? (map.get(p.reviewer_id) ?? null) : null,
    }))
}

export async function listMyPitches(): Promise<IncubatorActionResult<IncubatorPitchListItem[]>> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }

        const { data, error } = await supabase
            .from('incubator_pitches')
            .select('*')
            .eq('submitter_id', user.id)
            .order('updated_at', { ascending: false })

        if (error) throw error
        return { success: true, data: await enrichPitches(supabase, (data ?? []) as IncubatorPitch[]) }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd pobierania pitchów'
        return { success: false, error: msg }
    }
}

export async function listAllPitchesAdmin(status?: PitchStatus): Promise<IncubatorActionResult<IncubatorPitchListItem[]>> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }
        const isAdmin = await isCallerAdmin(supabase, user.id)
        if (!isAdmin) return { success: false, error: 'Niewystarczające uprawnienia' }

        let query = supabase.from('incubator_pitches').select('*').order('updated_at', { ascending: false })
        if (status) query = query.eq('status', status)

        const { data, error } = await query
        if (error) throw error
        return { success: true, data: await enrichPitches(supabase, (data ?? []) as IncubatorPitch[]) }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd'
        return { success: false, error: msg }
    }
}

export async function getPitchById(pitchId: string): Promise<IncubatorActionResult<IncubatorPitchListItem>> {
    try {
        const supabase = createClient()
        const { data, error } = await supabase.from('incubator_pitches').select('*').eq('id', pitchId).single()
        if (error || !data) return { success: false, error: 'Pitch nie istnieje lub brak dostępu' }
        const enriched = await enrichPitches(supabase, [data as IncubatorPitch])
        return { success: true, data: enriched[0] }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd'
        return { success: false, error: msg }
    }
}

export async function changePitchStatus(pitchId: string, newStatus: PitchStatus, reviewNotes?: string): Promise<IncubatorActionResult<void>> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }
        const isAdmin = await isCallerAdmin(supabase, user.id)
        if (!isAdmin) return { success: false, error: 'Niewystarczające uprawnienia' }

        const updates: Record<string, unknown> = {
            status: newStatus,
            reviewer_id: user.id,
        }
        if (reviewNotes !== undefined) updates.review_notes_md = reviewNotes

        const { data: pitch } = await supabase.from('incubator_pitches').select('submitter_id, title').eq('id', pitchId).single()
        if (!pitch) return { success: false, error: 'Pitch nie istnieje' }

        const { error } = await supabase.from('incubator_pitches').update(updates).eq('id', pitchId)
        if (error) throw error

        await notify(
            supabase,
            [pitch.submitter_id],
            'incubator_pitch_status_changed',
            'Status pitcha zaktualizowany',
            `${pitch.title}: ${newStatus}`,
        )

        revalidatePath('/incubator/my-pitches')
        revalidatePath('/admin/incubator')
        return { success: true, data: undefined }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd'
        return { success: false, error: msg }
    }
}

// ─── Internal Projects (Flow B) ───────────────────────────────────────

export async function listProjects(): Promise<IncubatorActionResult<IncubatorProjectListItem[]>> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }

        const { data, error } = await supabase
            .from('incubator_projects')
            .select('*')
            .order('created_at', { ascending: false })

        if (error) throw error

        const projects = (data ?? []) as IncubatorProject[]
        if (projects.length === 0) return { success: true, data: [] }

        const projectIds = projects.map((p) => p.id)
        const [{ data: counts }, { data: myApps }] = await Promise.all([
            supabase.from('incubator_applications').select('project_id').in('project_id', projectIds),
            supabase.from('incubator_applications').select('project_id, status').in('project_id', projectIds).eq('applicant_id', user.id),
        ])

        const countMap = new Map<string, number>()
        for (const c of (counts ?? []) as Array<{ project_id: string }>) {
            countMap.set(c.project_id, (countMap.get(c.project_id) ?? 0) + 1)
        }
        const myAppMap = new Map<string, ApplicationStatus>()
        for (const a of (myApps ?? []) as Array<{ project_id: string; status: ApplicationStatus }>) {
            myAppMap.set(a.project_id, a.status)
        }

        return {
            success: true,
            data: projects.map((p) => ({
                ...p,
                application_count: countMap.get(p.id) ?? 0,
                user_application_status: myAppMap.get(p.id) ?? null,
            })),
        }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd pobierania projektów'
        return { success: false, error: msg }
    }
}

export async function getProjectBySlug(slug: string): Promise<IncubatorActionResult<IncubatorProjectListItem>> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }

        const { data, error } = await supabase.from('incubator_projects').select('*').eq('slug', slug).single()
        if (error || !data) return { success: false, error: 'Projekt nie istnieje' }

        const project = data as IncubatorProject
        const { count } = await supabase.from('incubator_applications').select('id', { count: 'exact', head: true }).eq('project_id', project.id)
        const { data: myApp } = await supabase.from('incubator_applications').select('status').eq('project_id', project.id).eq('applicant_id', user.id).maybeSingle()

        return {
            success: true,
            data: {
                ...project,
                application_count: count ?? 0,
                user_application_status: (myApp as { status?: ApplicationStatus } | null)?.status ?? null,
            },
        }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd'
        return { success: false, error: msg }
    }
}

export async function createProject(input: CreateProjectInput): Promise<IncubatorActionResult<{ id: string; slug: string }>> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }
        const isAdmin = await isCallerAdmin(supabase, user.id)
        if (!isAdmin) return { success: false, error: 'Niewystarczające uprawnienia' }

        if (!input.title || input.title.trim().length < 3) return { success: false, error: 'Tytuł min 3' }
        if (!input.description_md || input.description_md.trim().length < 20) return { success: false, error: 'Opis min 20' }

        const slug = `${slugify(input.title)}-${Math.random().toString(36).slice(2, 6)}`

        const { data, error } = await supabase
            .from('incubator_projects')
            .insert({
                owner_id: user.id,
                title: input.title.trim(),
                slug,
                description_md: input.description_md.trim(),
                tech_stack: input.tech_stack ?? [],
                compensation_model: input.compensation_model?.trim() || null,
                status: 'open',
            })
            .select('id, slug')
            .single()

        if (error) throw error
        revalidatePath('/incubator/projects')
        revalidatePath('/admin/incubator/projects')
        return { success: true, data: { id: data.id, slug: data.slug } }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd tworzenia'
        return { success: false, error: msg }
    }
}

export async function updateProjectStatus(projectId: string, status: ProjectStatus): Promise<IncubatorActionResult<void>> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }
        const isAdmin = await isCallerAdmin(supabase, user.id)
        if (!isAdmin) return { success: false, error: 'Niewystarczające uprawnienia' }

        const { error } = await supabase.from('incubator_projects').update({ status }).eq('id', projectId)
        if (error) throw error
        revalidatePath('/incubator/projects')
        revalidatePath('/admin/incubator/projects')
        return { success: true, data: undefined }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd'
        return { success: false, error: msg }
    }
}

// ─── Applications ────────────────────────────────────────────────────

export async function applyToProject(projectId: string, motivation: string): Promise<IncubatorActionResult<{ applicationId: string }>> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }

        if (!motivation || motivation.trim().length < 30) return { success: false, error: 'Motywacja min 30 znaków' }

        const { data, error } = await supabase
            .from('incubator_applications')
            .insert({
                project_id: projectId,
                applicant_id: user.id,
                motivation_md: motivation.trim(),
                status: 'submitted',
            })
            .select('id')
            .single()

        if (error) throw error

        const { data: project } = await supabase.from('incubator_projects').select('title').eq('id', projectId).single()
        const service = createServiceClient()
        const { data: admins } = await service.from('profiles').select('id').eq('role', 'admin')
        await notify(
            supabase,
            ((admins ?? []) as Array<{ id: string }>).map((p) => p.id),
            'incubator_application_received',
            'Nowa aplikacja w Inkubatorze',
            project?.title ?? 'Projekt wewnętrzny',
        )

        revalidatePath(`/incubator/projects`)
        revalidatePath('/admin/incubator/projects')
        return { success: true, data: { applicationId: data.id } }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd aplikacji'
        return { success: false, error: msg }
    }
}

export async function listApplicationsForProject(projectId: string): Promise<IncubatorActionResult<IncubatorApplicationWithMeta[]>> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }
        const isAdmin = await isCallerAdmin(supabase, user.id)
        if (!isAdmin) return { success: false, error: 'Niewystarczające uprawnienia' }

        const [{ data: apps }, { data: project }] = await Promise.all([
            supabase.from('incubator_applications').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
            supabase.from('incubator_projects').select('title, slug').eq('id', projectId).single(),
        ])

        const applicantIds = ((apps ?? []) as Array<IncubatorApplication>).map((a) => a.applicant_id)
        const { data: profiles } = applicantIds.length > 0
            ? await supabase.from('profile_directory').select('id, full_name').in('id', applicantIds)
            : { data: [] }
        const map = new Map(((profiles ?? []) as Array<{ id: string; full_name: string | null }>).map((p) => [p.id, p.full_name]))

        return {
            success: true,
            data: ((apps ?? []) as IncubatorApplication[]).map((a) => ({
                ...a,
                applicant_name: map.get(a.applicant_id) ?? null,
                project_title: project?.title ?? '',
                project_slug: project?.slug ?? '',
            })),
        }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd'
        return { success: false, error: msg }
    }
}

export async function changeApplicationStatus(applicationId: string, status: ApplicationStatus): Promise<IncubatorActionResult<void>> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }
        const isAdmin = await isCallerAdmin(supabase, user.id)
        if (!isAdmin) return { success: false, error: 'Niewystarczające uprawnienia' }

        const { data: app } = await supabase
            .from('incubator_applications')
            .select('applicant_id, project_id')
            .eq('id', applicationId)
            .single()
        if (!app) return { success: false, error: 'Aplikacja nie istnieje' }

        const { error } = await supabase.from('incubator_applications').update({ status }).eq('id', applicationId)
        if (error) throw error

        const { data: project } = await supabase.from('incubator_projects').select('title').eq('id', app.project_id).single()
        await notify(
            supabase,
            [app.applicant_id],
            'incubator_application_status_changed',
            'Status aplikacji zaktualizowany',
            `${project?.title ?? 'projekt'}: ${status}`,
        )

        revalidatePath('/incubator/projects')
        revalidatePath('/admin/incubator/projects')
        return { success: true, data: undefined }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd'
        return { success: false, error: msg }
    }
}
