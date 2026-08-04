'use server'

// Phase 33 — Kontraktorzy: CRUD + conversation log + onboarding/exit interviews + departures.
// Authorization: admin OR talent_community (requireLifecycleManagerAction). Writes use the
// service client after the guard — the action is the trusted write path; RLS is defense-in-depth.

import { createHash } from 'crypto'
import { revalidatePath } from 'next/cache'
import { requireLifecycleManagerAction } from '@/lib/auth/internal-guard'
import { createServiceClient } from '@/lib/supabase/admin'
import { logCompat } from '@/lib/logger'
import { logAudit } from '@/lib/actions/audit'
import { normalizeContractorName, WHO_RESIGNED_PL } from '@/lib/types/contractor'
import {
    buildDepartureAnalytics,
    DEPARTURE_PERIODS,
    filterDepartures,
    resolvePeriodRange,
    type DepartureAnalytics,
    type DepartureAnalyticsQuery,
    type DepartureAnalyticsRow,
    type DeparturePeriod,
} from '@/lib/contractors/departure-analytics'
import { warsawDate } from '@/lib/oof/oof-dates'
import type {
    BenchBenefits,
    BenchItem,
    BenchStatus,
    ClientDepartureRow,
    ClientEntryRow,
    ContractorConversationRow,
    ContractorDashboard,
    ContractorDetail,
    ContractorExitInterviewRow,
    ContractorFilters,
    ContractorListItem,
    ContractorOnboardingInterviewRow,
    ContractorRosterItem,
    ContractorRow,
    ConversationCategory,
    ConversationFilters,
    ConversationListItem,
    ConversationStatus,
    ContractorStatus,
    ContractorTaskFilters,
    ContractorTaskListItem,
    ContractorTaskRow,
    ContractorTaskStatus,
    EntryListItem,
    ExitDepartureItem,
    ExitQueueItem,
    InterviewAttachment,
    InterviewKind,
    InterviewStatus,
    OnboardingEntryItem,
    OnboardingQueueItem,
    WhoResigned,
} from '@/lib/types/contractor'

type ServiceClient = ReturnType<typeof createServiceClient>
const HUB = '/internal/kontraktorzy'

// ─── Interview file uploads (Phase 38) ───────────────────────────────────────
// Bucket + prefixes provisioned in Phase 33c. Writes/reads go through the service client after the
// guard (the action is the trusted path); the file never touches a client-readable bucket directly.
const INTERVIEW_BUCKET = 'lifecycle-docs'
const MAX_INTERVIEW_FILE_BYTES = 10 * 1024 * 1024 // 10 MB
const ALLOWED_INTERVIEW_MIME = new Set([
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/png',
    'image/jpeg',
    'image/webp',
])

function sanitizeFileName(name: string): string {
    return name
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/\s+/g, '_')
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .replace(/_+/g, '_')
}

async function fileSha256(file: File): Promise<string> {
    const buf = Buffer.from(await file.arrayBuffer())
    return createHash('sha256').update(buf).digest('hex')
}

interface ProfileLite {
    id: string
    full_name: string | null
    email: string | null
    role: string
}

// ─── Shared lookups ──────────────────────────────────────────────────────────
async function loadProfilesByIds(admin: ServiceClient, ids: string[]): Promise<Map<string, ProfileLite>> {
    const unique = Array.from(new Set(ids.filter(Boolean)))
    const map = new Map<string, ProfileLite>()
    if (unique.length === 0) return map
    const { data } = await admin.from('profiles').select('id, full_name, email, role').in('id', unique)
    for (const p of (data ?? []) as ProfileLite[]) map.set(p.id, p)
    return map
}

/** TCM + admin profiles — for "owner"/"TCM" dropdowns. */
export async function listTcmProfiles(): Promise<Array<{ id: string; fullName: string }>> {
    await requireLifecycleManagerAction()
    const admin = createServiceClient()
    // Osoby odpowiedzialne za zadania TCM = operatorzy TCM: rola talent_community LUB
    // grant has_tcm_access (Phase 45). Bare-admini (właściciele firmy) NIE są tu
    // wypisywani — zaśmiecali listę „przypisane" (zgłoszenie Dominika). Admin, który
    // realnie prowadzi TCM, dostaje grant has_tcm_access.
    const { data } = await admin
        .from('profiles')
        .select('id, full_name, role')
        .or('role.eq.talent_community,has_tcm_access.eq.true')
        // Opiekun, który odszedł, nie jest opiekunem — nie oferuj go w dropdownie.
        .neq('employment_status', 'exited')
        .order('full_name', { ascending: true })
    return ((data ?? []) as ProfileLite[]).map((p) => ({ id: p.id, fullName: p.full_name ?? '—' }))
}

// ─── Contractors ──────────────────────────────────────────────────────────────
export async function listContractors(filters: ContractorFilters = {}): Promise<ContractorListItem[]> {
    await requireLifecycleManagerAction()
    const admin = createServiceClient()

    let q = admin.from('contractors').select('*').order('full_name', { ascending: true })
    if (filters.status) q = q.eq('status', filters.status)
    if (filters.ownerTcmId) q = q.eq('owner_tcm_id', filters.ownerTcmId)
    if (filters.client) q = q.ilike('current_client', `%${filters.client}%`)
    if (filters.search) q = q.ilike('full_name', `%${filters.search}%`)
    const { data } = await q
    const contractors = (data ?? []) as ContractorRow[]
    if (contractors.length === 0) return []

    const ids = contractors.map((c) => c.id)
    const [ownerMap, convAgg] = await Promise.all([
        loadProfilesByIds(admin, contractors.map((c) => c.owner_tcm_id ?? '').filter(Boolean)),
        admin
            .from('contractor_conversations')
            .select('contractor_id, status, conversation_date')
            .in('contractor_id', ids),
    ])

    const open = new Map<string, number>()
    const last = new Map<string, string>()
    for (const r of (convAgg.data ?? []) as Array<{ contractor_id: string; status: ConversationStatus; conversation_date: string }>) {
        if (r.status === 'potrzebny_kontakt' || r.status === 'pilne') {
            open.set(r.contractor_id, (open.get(r.contractor_id) ?? 0) + 1)
        }
        const prev = last.get(r.contractor_id)
        if (!prev || r.conversation_date > prev) last.set(r.contractor_id, r.conversation_date)
    }

    return contractors.map((c) => ({
        ...c,
        owner_tcm_name: c.owner_tcm_id ? ownerMap.get(c.owner_tcm_id)?.full_name ?? null : null,
        open_conversations: open.get(c.id) ?? 0,
        last_conversation_date: last.get(c.id) ?? null,
    }))
}

export async function getContractorDetail(contractorId: string): Promise<ContractorDetail> {
    await requireLifecycleManagerAction()
    const admin = createServiceClient()

    const { data: cRaw } = await admin.from('contractors').select('*').eq('id', contractorId).single()
    if (!cRaw) throw new Error('Kontraktor nie znaleziony.')
    const contractor = cRaw as ContractorRow

    const [convs, onb, exit, entries, deps, placements] = await Promise.all([
        listConversations({ contractorId }),
        admin.from('contractor_onboarding_interviews').select('*').eq('contractor_id', contractorId).order('created_at', { ascending: false }),
        admin.from('contractor_exit_interviews').select('*').eq('contractor_id', contractorId).order('created_at', { ascending: false }),
        admin.from('client_entries').select('*').eq('contractor_id', contractorId).order('start_date', { ascending: false }),
        admin.from('client_departures').select('*').eq('contractor_id', contractorId).order('departure_date', { ascending: false }),
        admin.from('placements').select('id, client_name, position, start_date, status').eq('contractor_id', contractorId).order('start_date', { ascending: false }),
    ])

    const ownerMap = await loadProfilesByIds(admin, [contractor.owner_tcm_id ?? ''])

    return {
        contractor,
        ownerTcmName: contractor.owner_tcm_id ? ownerMap.get(contractor.owner_tcm_id)?.full_name ?? null : null,
        conversations: convs,
        onboardingInterviews: (onb.data ?? []) as unknown as ContractorOnboardingInterviewRow[],
        exitInterviews: (exit.data ?? []) as unknown as ContractorExitInterviewRow[],
        entries: (entries.data ?? []) as ClientEntryRow[],
        departures: (deps.data ?? []) as ClientDepartureRow[],
        placements: (placements.data ?? []) as ContractorDetail['placements'],
    }
}

export async function createContractor(input: {
    fullName: string
    phone?: string | null
    email?: string | null
    currentClient?: string | null
    currentPosition?: string | null
    ownerTcmId?: string | null
    status?: ContractorStatus
    notes?: string | null
}): Promise<{ id: string }> {
    const ctx = await requireLifecycleManagerAction()
    const admin = createServiceClient()
    const fullName = input.fullName.trim()
    if (fullName.length < 2) throw new Error('Imię i nazwisko jest wymagane.')

    const { data, error } = await admin
        .from('contractors')
        .insert({
            full_name: fullName,
            phone: input.phone?.trim() || null,
            email: input.email?.trim() || null,
            current_client: input.currentClient?.trim() || null,
            current_position: input.currentPosition?.trim() || null,
            owner_tcm_id: input.ownerTcmId || null,
            status: input.status ?? 'active',
            notes: input.notes?.trim() || null,
            imported_by: ctx.userId,
        })
        .select('id')
        .single()
    if (error || !data) {
        if (error?.code === '23505') throw new Error(`Kontraktor „${fullName}" już istnieje.`)
        throw new Error(`Nie udało się dodać kontraktora: ${error?.message ?? 'unknown'}`)
    }
    await logAudit(ctx.userId, 'CONTRACTOR_CREATED', { contractor_id: (data as { id: string }).id, full_name: fullName })
    revalidatePath(HUB)
    return data as { id: string }
}

export async function updateContractor(
    id: string,
    input: Partial<{
        fullName: string
        phone: string | null
        email: string | null
        currentClient: string | null
        currentPosition: string | null
        ownerTcmId: string | null
        status: ContractorStatus
        notes: string | null
    }>,
): Promise<void> {
    const ctx = await requireLifecycleManagerAction()
    const admin = createServiceClient()
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (input.fullName !== undefined) patch.full_name = input.fullName.trim()
    if (input.phone !== undefined) patch.phone = input.phone?.trim() || null
    if (input.email !== undefined) patch.email = input.email?.trim() || null
    if (input.currentClient !== undefined) patch.current_client = input.currentClient?.trim() || null
    if (input.currentPosition !== undefined) patch.current_position = input.currentPosition?.trim() || null
    if (input.ownerTcmId !== undefined) patch.owner_tcm_id = input.ownerTcmId || null
    if (input.status !== undefined) patch.status = input.status
    if (input.notes !== undefined) patch.notes = input.notes?.trim() || null

    const { error } = await admin.from('contractors').update(patch).eq('id', id)
    if (error) throw new Error(`Nie udało się zaktualizować: ${error.message}`)
    await logAudit(ctx.userId, 'CONTRACTOR_UPDATED', { contractor_id: id, fields: Object.keys(patch) })
    revalidatePath(HUB)
    revalidatePath(`${HUB}/${id}`)
}

// ─── Conversation log ───────────────────────────────────────────────────────
export async function listConversations(filters: ConversationFilters = {}): Promise<ConversationListItem[]> {
    await requireLifecycleManagerAction()
    const admin = createServiceClient()

    let q = admin
        .from('contractor_conversations')
        .select('*')
        .order('conversation_date', { ascending: false })
        .limit(filters.limit ?? 500)
    if (filters.contractorId) q = q.eq('contractor_id', filters.contractorId)
    if (filters.tcmId) q = q.eq('tcm_id', filters.tcmId)
    if (filters.category) q = q.eq('category', filters.category)
    if (filters.status) q = q.eq('status', filters.status)
    if (filters.client) q = q.ilike('client_snapshot', `%${filters.client}%`)
    const { data } = await q
    const rows = (data ?? []) as ContractorConversationRow[]
    if (rows.length === 0) return []

    const [contractorMap, tcmMap] = await Promise.all([
        (async () => {
            const ids = Array.from(new Set(rows.map((r) => r.contractor_id)))
            const { data: cs } = await admin.from('contractors').select('id, full_name, phone').in('id', ids)
            const m = new Map<string, { full_name: string; phone: string | null }>()
            for (const c of (cs ?? []) as Array<{ id: string; full_name: string; phone: string | null }>) m.set(c.id, c)
            return m
        })(),
        loadProfilesByIds(admin, rows.map((r) => r.tcm_id ?? '').filter(Boolean)),
    ])

    let items = rows.map((r) => ({
        ...r,
        contractor_name: contractorMap.get(r.contractor_id)?.full_name ?? '—',
        contractor_phone: contractorMap.get(r.contractor_id)?.phone ?? null,
        tcm_name: r.tcm_id ? tcmMap.get(r.tcm_id)?.full_name ?? null : r.tcm_raw,
    }))
    if (filters.search) {
        const s = filters.search.toLowerCase()
        items = items.filter(
            (i) => i.contractor_name.toLowerCase().includes(s) || (i.note ?? '').toLowerCase().includes(s),
        )
    }
    return items
}

export async function addConversation(input: {
    contractorId: string
    conversationDate: string
    tcmId?: string | null
    clientSnapshot?: string | null
    category: ConversationCategory
    status: ConversationStatus
    note?: string | null
    followUpDate?: string | null
}): Promise<{ id: string }> {
    const ctx = await requireLifecycleManagerAction()
    const admin = createServiceClient()
    const { data, error } = await admin
        .from('contractor_conversations')
        .insert({
            contractor_id: input.contractorId,
            conversation_date: input.conversationDate,
            tcm_id: input.tcmId || ctx.userId,
            client_snapshot: input.clientSnapshot?.trim() || null,
            category: input.category,
            status: input.status,
            note: input.note?.trim() || null,
            follow_up_date: input.followUpDate || null,
            resolved_at: input.status === 'rozwiazane' ? new Date().toISOString() : null,
            source: 'manual',
            created_by: ctx.userId,
        })
        .select('id')
        .single()
    if (error || !data) throw new Error(`Nie udało się zapisać rozmowy: ${error?.message ?? 'unknown'}`)
    await logAudit(ctx.userId, 'CONTRACTOR_CONVERSATION_ADDED', {
        contractor_id: input.contractorId,
        conversation_id: (data as { id: string }).id,
        category: input.category,
        status: input.status,
    })
    revalidatePath(HUB)
    revalidatePath(`${HUB}/${input.contractorId}`)
    return data as { id: string }
}

export async function updateConversation(
    id: string,
    input: Partial<{
        conversationDate: string
        tcmId: string | null
        clientSnapshot: string | null
        category: ConversationCategory
        status: ConversationStatus
        note: string | null
        followUpDate: string | null
    }>,
): Promise<void> {
    const ctx = await requireLifecycleManagerAction()
    const admin = createServiceClient()
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (input.conversationDate !== undefined) patch.conversation_date = input.conversationDate
    if (input.tcmId !== undefined) patch.tcm_id = input.tcmId || null
    if (input.clientSnapshot !== undefined) patch.client_snapshot = input.clientSnapshot?.trim() || null
    if (input.category !== undefined) patch.category = input.category
    if (input.note !== undefined) patch.note = input.note?.trim() || null
    if (input.followUpDate !== undefined) patch.follow_up_date = input.followUpDate || null
    if (input.status !== undefined) {
        patch.status = input.status
        patch.resolved_at = input.status === 'rozwiazane' ? new Date().toISOString() : null
    }
    const { error } = await admin.from('contractor_conversations').update(patch).eq('id', id)
    if (error) throw new Error(`Nie udało się zaktualizować rozmowy: ${error.message}`)
    await logAudit(ctx.userId, 'CONTRACTOR_CONVERSATION_UPDATED', { conversation_id: id, fields: Object.keys(patch) })
    revalidatePath(HUB)
}

// ─── Onboarding interview ─────────────────────────────────────────────────────
export async function createOnboardingInterview(input: {
    contractorId: string
    placementId?: string | null
    scheduledFor?: string | null
}): Promise<{ id: string }> {
    const ctx = await requireLifecycleManagerAction()
    const admin = createServiceClient()
    const { data: c } = await admin
        .from('contractors')
        .select('current_client, current_position')
        .eq('id', input.contractorId)
        .single()
    const snap = (c ?? {}) as { current_client: string | null; current_position: string | null }
    const { data, error } = await admin
        .from('contractor_onboarding_interviews')
        .insert({
            contractor_id: input.contractorId,
            placement_id: input.placementId || null,
            client_snapshot: snap.current_client,
            position_snapshot: snap.current_position,
            scheduled_for: input.scheduledFor || null,
            status: 'scheduled',
            created_by: ctx.userId,
        })
        .select('id')
        .single()
    if (error || !data) throw new Error(`Nie udało się utworzyć wywiadu: ${error?.message ?? 'unknown'}`)
    await logAudit(ctx.userId, 'CONTRACTOR_ONBOARDING_INTERVIEW_CREATED', {
        contractor_id: input.contractorId,
        interview_id: (data as { id: string }).id,
    })
    revalidatePath(`${HUB}/${input.contractorId}`)
    return data as { id: string }
}

/** Save onboarding interview fields; optionally transition scheduled→submitted. */
export async function saveOnboardingInterview(
    id: string,
    fields: Partial<ContractorOnboardingInterviewRow>,
    submit = false,
): Promise<void> {
    const ctx = await requireLifecycleManagerAction()
    const admin = createServiceClient()
    const allowed: Array<keyof ContractorOnboardingInterviewRow> = [
        'position_snapshot', 'client_snapshot', 'start_date', 'tcm_role_note', 'first_day_note',
        'client_manager_name', 'equipment_note', 'system_access_note', 'duties_note', 'work_note',
        'manager_relation_note', 'missing_resolved_note', 'positive_surprise', 'negative_surprise',
        'doubts_note', 'side_projects_interest', 'cs_challenge', 'cs_solution', 'cs_technologies',
        'cs_client', 'cs_sector', 'scheduled_for', 'attachments',
    ]
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    for (const k of allowed) if (k in fields) patch[k] = (fields as Record<string, unknown>)[k]
    if (submit) patch.status = 'submitted'

    const { error } = await admin.from('contractor_onboarding_interviews').update(patch).eq('id', id)
    if (error) throw new Error(`Nie udało się zapisać: ${error.message}`)
    await logAudit(ctx.userId, submit ? 'CONTRACTOR_ONBOARDING_INTERVIEW_SUBMITTED' : 'CONTRACTOR_ONBOARDING_INTERVIEW_SAVED', { interview_id: id })
    revalidatePath(HUB)
}

export async function reviewOnboardingInterview(id: string, note: string): Promise<void> {
    const ctx = await requireLifecycleManagerAction()
    const admin = createServiceClient()
    const { error } = await admin
        .from('contractor_onboarding_interviews')
        .update({ status: 'reviewed', reviewed_by: ctx.userId, reviewed_at: new Date().toISOString(), reviewer_note: note.trim() || null })
        .eq('id', id)
    if (error) throw new Error(`Nie udało się oznaczyć jako sprawdzony: ${error.message}`)
    await logAudit(ctx.userId, 'CONTRACTOR_ONBOARDING_INTERVIEW_REVIEWED', { interview_id: id })
    revalidatePath(HUB)
}

// ─── Exit interview ───────────────────────────────────────────────────────────
export async function createExitInterview(input: {
    contractorId: string
    placementId?: string | null
    scheduledFor?: string | null
}): Promise<{ id: string }> {
    const ctx = await requireLifecycleManagerAction()
    const admin = createServiceClient()
    const { data: c } = await admin
        .from('contractors')
        .select('current_client, current_position')
        .eq('id', input.contractorId)
        .single()
    const snap = (c ?? {}) as { current_client: string | null; current_position: string | null }
    const { data, error } = await admin
        .from('contractor_exit_interviews')
        .insert({
            contractor_id: input.contractorId,
            placement_id: input.placementId || null,
            client_snapshot: snap.current_client,
            position_snapshot: snap.current_position,
            scheduled_for: input.scheduledFor || null,
            status: 'scheduled',
            created_by: ctx.userId,
        })
        .select('id')
        .single()
    if (error || !data) throw new Error(`Nie udało się utworzyć wywiadu: ${error?.message ?? 'unknown'}`)
    await logAudit(ctx.userId, 'CONTRACTOR_EXIT_INTERVIEW_CREATED', {
        contractor_id: input.contractorId,
        interview_id: (data as { id: string }).id,
    })
    revalidatePath(`${HUB}/${input.contractorId}`)
    return data as { id: string }
}

export async function saveExitInterview(
    id: string,
    fields: Partial<ContractorExitInterviewRow>,
    submit = false,
): Promise<void> {
    const ctx = await requireLifecycleManagerAction()
    const admin = createServiceClient()
    const allowed: Array<keyof ContractorExitInterviewRow> = [
        'position_snapshot', 'client_snapshot', 'start_date', 'end_date', 'formal_reason', 'causes',
        'repair_potential', 'is_final', 'can_retain_transfer', 'retain_transfer_note',
        'can_extend_departure', 'extend_departure_note', 'feedback_lessons', 'scheduled_for', 'attachments',
    ]
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    for (const k of allowed) if (k in fields) patch[k] = (fields as Record<string, unknown>)[k]
    if (submit) patch.status = 'submitted'

    const { error } = await admin.from('contractor_exit_interviews').update(patch).eq('id', id)
    if (error) throw new Error(`Nie udało się zapisać: ${error.message}`)
    await logAudit(ctx.userId, submit ? 'CONTRACTOR_EXIT_INTERVIEW_SUBMITTED' : 'CONTRACTOR_EXIT_INTERVIEW_SAVED', { interview_id: id })
    revalidatePath(HUB)
}

export async function reviewExitInterview(id: string, note: string): Promise<void> {
    const ctx = await requireLifecycleManagerAction()
    const admin = createServiceClient()
    const { error } = await admin
        .from('contractor_exit_interviews')
        .update({ status: 'reviewed', reviewed_by: ctx.userId, reviewed_at: new Date().toISOString(), reviewer_note: note.trim() || null })
        .eq('id', id)
    if (error) throw new Error(`Nie udało się oznaczyć jako sprawdzony: ${error.message}`)
    await logAudit(ctx.userId, 'CONTRACTOR_EXIT_INTERVIEW_REVIEWED', { interview_id: id })
    revalidatePath(HUB)
}

// ─── Departures ───────────────────────────────────────────────────────────────
export async function addDeparture(input: {
    contractorId?: string | null
    placementId?: string | null
    consultantName: string
    clientName: string
    position?: string | null
    startDate?: string | null
    departureDate?: string | null
    lastNoticeDay?: string | null
    whoResigned?: WhoResigned | null
    reason?: string | null
    transferred?: boolean
    replacement?: boolean
    comment?: string | null
    monthlyMargin?: number | null
}): Promise<{ id: string }> {
    const ctx = await requireLifecycleManagerAction()
    const admin = createServiceClient()
    const { data, error } = await admin
        .from('client_departures')
        .insert({
            contractor_id: input.contractorId || null,
            placement_id: input.placementId || null,
            consultant_name: input.consultantName.trim(),
            client_name: input.clientName.trim(),
            position: input.position?.trim() || null,
            start_date: input.startDate || null,
            departure_date: input.departureDate || null,
            last_notice_day: input.lastNoticeDay || null,
            who_resigned: input.whoResigned || null,
            reason: input.reason?.trim() || null,
            transferred: input.transferred ?? false,
            replacement: input.replacement ?? false,
            comment: input.comment?.trim() || null,
            monthly_margin: input.monthlyMargin ?? null,
            source: 'manual',
            created_by: ctx.userId,
        })
        .select('id')
        .single()
    if (error || !data) throw new Error(`Nie udało się zapisać zejścia: ${error?.message ?? 'unknown'}`)
    await logAudit(ctx.userId, 'CLIENT_DEPARTURE_RECORDED', {
        departure_id: (data as { id: string }).id,
        consultant: input.consultantName,
        client: input.clientName,
        who_resigned: input.whoResigned,
    })
    revalidatePath(HUB)
    return data as { id: string }
}

export async function listDepartures(filters: { client?: string; whoResigned?: WhoResigned } = {}): Promise<ClientDepartureRow[]> {
    await requireLifecycleManagerAction()
    const admin = createServiceClient()
    let q = admin.from('client_departures').select('*').order('departure_date', { ascending: false, nullsFirst: false })
    if (filters.client) q = q.ilike('client_name', `%${filters.client}%`)
    if (filters.whoResigned) q = q.eq('who_resigned', filters.whoResigned)
    const { data } = await q
    return (data ?? []) as ClientDepartureRow[]
}

/** Combined "Wejścia" view: historical archive (client_entries) + live placements. */
export async function listEntries(filters: { client?: string } = {}): Promise<EntryListItem[]> {
    await requireLifecycleManagerAction()
    const admin = createServiceClient()
    let eq = admin.from('client_entries').select('*').order('start_date', { ascending: false, nullsFirst: false })
    if (filters.client) eq = eq.ilike('client_name', `%${filters.client}%`)
    let pq = admin.from('placements').select('id, consultant_name, client_name, position, start_date, recruiter_raw, status').order('start_date', { ascending: false })
    if (filters.client) pq = pq.ilike('client_name', `%${filters.client}%`)
    const [entries, placements] = await Promise.all([eq, pq])

    const fromArchive = ((entries.data ?? []) as ClientEntryRow[]).map((e) => ({
        id: e.id,
        source: 'archive' as const,
        consultant_name: e.consultant_name,
        client_name: e.client_name,
        position: e.position,
        start_date: e.start_date,
        recruiter: e.recruiter_raw,
    }))
    const fromPlacements = ((placements.data ?? []) as Array<{ id: string; consultant_name: string; client_name: string; position: string | null; start_date: string; recruiter_raw: string; status: string }>)
        .filter((p) => p.status !== 'cancelled')
        .map((p) => ({
            id: p.id,
            source: 'placement' as const,
            consultant_name: p.consultant_name,
            client_name: p.client_name,
            position: p.position,
            start_date: p.start_date,
            recruiter: p.recruiter_raw,
        }))
    return [...fromPlacements, ...fromArchive].sort((a, b) => (b.start_date ?? '').localeCompare(a.start_date ?? ''))
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
export async function getContractorDashboard(): Promise<ContractorDashboard> {
    await requireLifecycleManagerAction()
    const admin = createServiceClient()

    const [contractors, convs, entries, placements, deps] = await Promise.all([
        admin.from('contractors').select('status'),
        admin.from('contractor_conversations').select('status, tcm_id, tcm_raw'),
        admin.from('client_entries').select('id'),
        admin.from('placements').select('status'),
        admin.from('client_departures').select('who_resigned, client_name'),
    ])

    const cRows = (contractors.data ?? []) as Array<{ status: ContractorStatus }>
    const convRows = (convs.data ?? []) as Array<{ status: ConversationStatus; tcm_id: string | null; tcm_raw: string | null }>
    const entryRows = (entries.data ?? []) as Array<{ id: string }>
    const placRows = (placements.data ?? []) as Array<{ status: string }>
    const depRows = (deps.data ?? []) as Array<{ who_resigned: WhoResigned | null; client_name: string }>

    const tcmIds = Array.from(new Set(convRows.map((r) => r.tcm_id ?? '').filter(Boolean)))
    const tcmMap = await loadProfilesByIds(admin, tcmIds)

    const reasonCount = new Map<WhoResigned, number>()
    const clientCount = new Map<string, number>()
    for (const d of depRows) {
        const who = d.who_resigned ?? 'nieznany'
        reasonCount.set(who, (reasonCount.get(who) ?? 0) + 1)
        clientCount.set(d.client_name, (clientCount.get(d.client_name) ?? 0) + 1)
    }
    const tcmCount = new Map<string, number>()
    for (const c of convRows) {
        const name = c.tcm_id ? tcmMap.get(c.tcm_id)?.full_name ?? c.tcm_raw ?? '—' : c.tcm_raw ?? '—'
        tcmCount.set(name, (tcmCount.get(name) ?? 0) + 1)
    }

    return {
        contractorsTotal: cRows.length,
        contractorsActive: cRows.filter((c) => c.status === 'active').length,
        openConversations: convRows.filter((c) => c.status === 'potrzebny_kontakt' || c.status === 'pilne').length,
        entriesTotal: entryRows.length + placRows.filter((p) => p.status !== 'cancelled').length,
        departuresTotal: depRows.length,
        departureReasons: Array.from(reasonCount.entries()).map(([who, count]) => ({ who, count })).sort((a, b) => b.count - a.count),
        conversationsByTcm: Array.from(tcmCount.entries()).map(([tcm, count]) => ({ tcm, count })).sort((a, b) => b.count - a.count),
        departuresByClient: Array.from(clientCount.entries()).map(([client, count]) => ({ client, count })).sort((a, b) => b.count - a.count).slice(0, 15),
    }
}

// ─── Analityka zejść (trend miesięczny + powody) ──────────────────────────────

/** Kolumny potrzebne analityce i eksportowi — jeden SELECT obsługuje oba. */
const DEPARTURE_ANALYTICS_COLUMNS =
    'id, consultant_name, client_name, position, recruiter_raw, start_date, departure_date, ' +
    'last_notice_day, who_resigned, reason, comment, transferred, replacement'

interface DepartureAnalyticsSourceRow extends DepartureAnalyticsRow {
    id: string
    consultant_name: string
    position: string | null
    start_date: string | null
    last_notice_day: string | null
    reason: string | null
    comment: string | null
    transferred: boolean
    replacement: boolean
}

export interface DepartureAnalyticsInput {
    period?: DeparturePeriod
    client?: string
    recruiter?: string
}

/**
 * „Dziś" wg kalendarza warszawskiego, znormalizowane do południa UTC. Serwer chodzi w UTC,
 * więc 1. dnia miesiąca nad ranem „Ten miesiąc" pokazywałby poprzedni (ta sama pułapka,
 * którą Phase 41 rozwiązuje przez warsawDate).
 */
function warsawNow(): Date {
    return new Date(`${warsawDate(new Date())}T12:00:00Z`)
}

/** Wspólne wczytanie + normalizacja filtra dla widoku i eksportu, żeby obie ścieżki liczyły to samo. */
async function loadDeparturesForAnalytics(input: DepartureAnalyticsInput): Promise<{
    all: DepartureAnalyticsSourceRow[]
    query: DepartureAnalyticsQuery
}> {
    const admin = createServiceClient()
    const { data, error } = await admin
        .from('client_departures')
        .select(DEPARTURE_ANALYTICS_COLUMNS)
        .order('departure_date', { ascending: false, nullsFirst: false })
    if (error) {
        logCompat.error('loadDeparturesForAnalytics error:', error)
        throw new Error('Nie udało się pobrać zejść.')
    }

    const period: DeparturePeriod = DEPARTURE_PERIODS.includes(input.period as DeparturePeriod)
        ? (input.period as DeparturePeriod)
        : 'last12'

    return {
        all: (data ?? []) as unknown as DepartureAnalyticsSourceRow[],
        query: {
            period,
            client: input.client?.trim() || null,
            recruiter: input.recruiter?.trim() || null,
        },
    }
}

/**
 * Zejścia w ujęciu czasowym: trend 12 miesięcy + zestawienia (kto zrezygnował / klient / rekruter)
 * przeliczane w wybranym okresie. Agregacja w JS — zbiór to setki wierszy, jeden SELECT wystarczy
 * (tak samo liczy getContractorDashboard).
 */
export async function getDepartureAnalytics(input: DepartureAnalyticsInput = {}): Promise<DepartureAnalytics> {
    await requireLifecycleManagerAction()
    const { all, query } = await loadDeparturesForAnalytics(input)
    return buildDepartureAnalytics(all, query, warsawNow())
}

/** Eksport zejść z tym samym filtrem, co widok. UTF-8 BOM dokłada strona kliencka. */
export async function exportDeparturesCsv(input: DepartureAnalyticsInput = {}): Promise<string> {
    await requireLifecycleManagerAction()
    const { all, query } = await loadDeparturesForAnalytics(input)
    // Ten sam filtr, co liczby w widoku — eksport nie może pokazywać innego zbioru.
    const filtered = filterDepartures(all, {
        range: resolvePeriodRange(query.period, warsawNow()),
        client: query.client ?? undefined,
        recruiter: query.recruiter ?? undefined,
    })

    const escapeCsv = (v: unknown): string => {
        if (v === null || v === undefined) return ''
        // Treści pochodzą z Excela wgrywanego przez TCM — komórka zaczynająca się od
        // =, +, - lub @ zostałaby w Excelu potraktowana jak formuła po ponownym otwarciu
        // pliku. Wiodący apostrof to standardowa mitygacja CSV injection.
        const raw = String(v)
        const s = /^[=+\-@]/.test(raw) ? `'${raw}` : raw
        // CR bez LF też wymaga cudzysłowów (RFC 4180) — inaczej parser widzi nowy wiersz.
        if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
        return s
    }

    const header = [
        'Konsultant', 'Klient', 'Stanowisko', 'Rekruter', 'Start', 'Data zejścia',
        'Wypowiedzenie', 'Kto zrezygnował', 'Powód / komentarz', 'Przepięcie', 'Replacement',
    ]
    const rows = filtered.map((r) => [
        r.consultant_name,
        r.client_name,
        r.position ?? '',
        r.recruiter_raw ?? '',
        r.start_date ?? '',
        r.departure_date ?? '',
        r.last_notice_day ?? '',
        r.who_resigned ? WHO_RESIGNED_PL[r.who_resigned] : '',
        r.reason ?? r.comment ?? '',
        r.transferred ? 'tak' : 'nie',
        r.replacement ? 'tak' : 'nie',
    ].map(escapeCsv).join(','))

    return [header.join(','), ...rows].join('\n')
}

// ─── Phase 34: journey-stage queues (Onboarding / Exit tabs) ──────────────────
/** Contractors still in prospect/onboarding + their latest onboarding-interview status. */
export async function listOnboardingQueue(): Promise<OnboardingQueueItem[]> {
    await requireLifecycleManagerAction()
    const admin = createServiceClient()
    const { data } = await admin
        .from('contractors')
        .select('id, full_name, current_client, current_position, status, owner_tcm_id')
        .in('status', ['prospect', 'onboarding'])
        .order('full_name', { ascending: true })
    const rows = (data ?? []) as Array<{
        id: string; full_name: string; current_client: string | null
        current_position: string | null; status: ContractorStatus; owner_tcm_id: string | null
    }>
    if (rows.length === 0) return []

    const ids = rows.map((r) => r.id)
    const [ownerMap, interviews] = await Promise.all([
        loadProfilesByIds(admin, rows.map((r) => r.owner_tcm_id ?? '').filter(Boolean)),
        admin
            .from('contractor_onboarding_interviews')
            .select('contractor_id, status, created_at')
            .in('contractor_id', ids)
            .order('created_at', { ascending: false }),
    ])
    // First row per contractor is the latest interview (ordered created_at desc).
    const interviewStatus = new Map<string, InterviewStatus>()
    for (const r of (interviews.data ?? []) as Array<{ contractor_id: string; status: InterviewStatus; created_at: string }>) {
        if (!interviewStatus.has(r.contractor_id)) interviewStatus.set(r.contractor_id, r.status)
    }
    return rows.map((r) => ({
        contractor_id: r.id,
        full_name: r.full_name,
        current_client: r.current_client,
        current_position: r.current_position,
        status: r.status,
        owner_tcm_name: r.owner_tcm_id ? ownerMap.get(r.owner_tcm_id)?.full_name ?? null : null,
        interview_status: interviewStatus.get(r.id) ?? null,
    }))
}

/** Scheduled or submitted exit interviews awaiting action, with contractor context. */
export async function listExitInterviewQueue(): Promise<ExitQueueItem[]> {
    await requireLifecycleManagerAction()
    const admin = createServiceClient()
    const { data } = await admin
        .from('contractor_exit_interviews')
        .select('id, contractor_id, client_snapshot, status, scheduled_for, submitted_at, formal_reason')
        .in('status', ['scheduled', 'submitted'])
        .order('scheduled_for', { ascending: true, nullsFirst: false })
    const rows = (data ?? []) as Array<{
        id: string; contractor_id: string; client_snapshot: string | null
        status: InterviewStatus; scheduled_for: string | null; submitted_at: string | null; formal_reason: string | null
    }>
    if (rows.length === 0) return []

    const ids = Array.from(new Set(rows.map((r) => r.contractor_id)))
    const { data: cs } = await admin.from('contractors').select('id, full_name').in('id', ids)
    const nameMap = new Map<string, string>()
    for (const c of (cs ?? []) as Array<{ id: string; full_name: string }>) nameMap.set(c.id, c.full_name)
    return rows.map((r) => ({
        interview_id: r.id,
        contractor_id: r.contractor_id,
        contractor_name: nameMap.get(r.contractor_id) ?? '—',
        client_snapshot: r.client_snapshot,
        status: r.status,
        scheduled_for: r.scheduled_for,
        submitted_at: r.submitted_at,
        formal_reason: r.formal_reason,
    }))
}

// ─── Phase 34: Zadania (department task list) ─────────────────────────────────
export async function listTasks(filters: ContractorTaskFilters = {}): Promise<ContractorTaskListItem[]> {
    await requireLifecycleManagerAction()
    const admin = createServiceClient()
    let q = admin.from('contractor_tasks').select('*').order('created_at', { ascending: false })
    if (filters.status) q = q.eq('status', filters.status)
    if (filters.assignedTcmId) q = q.eq('assigned_tcm_id', filters.assignedTcmId)
    if (filters.contractorId) q = q.eq('contractor_id', filters.contractorId)
    const { data } = await q
    const rows = (data ?? []) as ContractorTaskRow[]
    if (rows.length === 0) return []

    const [assigneeMap, contractorMap, ticketMap] = await Promise.all([
        loadProfilesByIds(admin, rows.map((r) => r.assigned_tcm_id ?? '').filter(Boolean)),
        (async () => {
            const ids = Array.from(new Set(rows.map((r) => r.contractor_id ?? '').filter(Boolean)))
            const m = new Map<string, string>()
            if (ids.length === 0) return m
            const { data: cs } = await admin.from('contractors').select('id, full_name').in('id', ids)
            for (const c of (cs ?? []) as Array<{ id: string; full_name: string }>) m.set(c.id, c.full_name)
            return m
        })(),
        (async () => {
            const ids = Array.from(new Set(rows.map((r) => r.source_ticket_id ?? '').filter(Boolean)))
            const m = new Map<string, string>()
            if (ids.length === 0) return m
            const { data: ts } = await admin.from('support_tickets').select('id, subject').in('id', ids)
            for (const t of (ts ?? []) as Array<{ id: string; subject: string }>) m.set(t.id, t.subject)
            return m
        })(),
    ])

    return rows.map((r) => ({
        ...r,
        assigned_tcm_name: r.assigned_tcm_id ? assigneeMap.get(r.assigned_tcm_id)?.full_name ?? null : null,
        contractor_name: r.contractor_id ? contractorMap.get(r.contractor_id) ?? null : null,
        source_ticket_subject: r.source_ticket_id ? ticketMap.get(r.source_ticket_id) ?? null : null,
    }))
}

export async function createTask(input: {
    title: string
    description?: string | null
    status?: ContractorTaskStatus
    assignedTcmId?: string | null
    dueDate?: string | null
    contractorId?: string | null
    sourceTicketId?: string | null
}): Promise<{ id: string }> {
    const ctx = await requireLifecycleManagerAction()
    const admin = createServiceClient()
    const title = input.title.trim()
    if (title.length < 2) throw new Error('Tytuł zadania jest wymagany.')

    const { data, error } = await admin
        .from('contractor_tasks')
        .insert({
            title,
            description: input.description?.trim() || null,
            status: input.status ?? 'todo',
            assigned_tcm_id: input.assignedTcmId || null,
            due_date: input.dueDate || null,
            contractor_id: input.contractorId || null,
            source_ticket_id: input.sourceTicketId || null,
            created_by: ctx.userId,
        })
        .select('id')
        .single()
    if (error || !data) throw new Error(`Nie udało się utworzyć zadania: ${error?.message ?? 'unknown'}`)
    await logAudit(ctx.userId, 'CONTRACTOR_TASK_CREATED', {
        task_id: (data as { id: string }).id,
        title,
        source_ticket_id: input.sourceTicketId ?? null,
        contractor_id: input.contractorId ?? null,
    })
    revalidatePath(HUB)
    if (input.sourceTicketId) revalidatePath(`/admin/inbox/${input.sourceTicketId}`)
    return data as { id: string }
}

export async function updateTask(
    id: string,
    input: Partial<{
        title: string
        description: string | null
        status: ContractorTaskStatus
        assignedTcmId: string | null
        dueDate: string | null
        contractorId: string | null
    }>,
): Promise<void> {
    const ctx = await requireLifecycleManagerAction()
    const admin = createServiceClient()
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (input.title !== undefined) patch.title = input.title.trim()
    if (input.description !== undefined) patch.description = input.description?.trim() || null
    if (input.status !== undefined) patch.status = input.status
    if (input.assignedTcmId !== undefined) patch.assigned_tcm_id = input.assignedTcmId || null
    if (input.dueDate !== undefined) patch.due_date = input.dueDate || null
    if (input.contractorId !== undefined) patch.contractor_id = input.contractorId || null

    const { error } = await admin.from('contractor_tasks').update(patch).eq('id', id)
    if (error) throw new Error(`Nie udało się zaktualizować zadania: ${error.message}`)
    await logAudit(ctx.userId, 'CONTRACTOR_TASK_UPDATED', { task_id: id, fields: Object.keys(patch) })
    revalidatePath(HUB)
}

export async function deleteTask(id: string): Promise<void> {
    const ctx = await requireLifecycleManagerAction()
    const admin = createServiceClient()
    const { error } = await admin.from('contractor_tasks').delete().eq('id', id)
    if (error) throw new Error(`Nie udało się usunąć zadania: ${error.message}`)
    await logAudit(ctx.userId, 'CONTRACTOR_TASK_DELETED', { task_id: id })
    revalidatePath(HUB)
}

// ─── Phase 38: Onboarding / Exit / Roster lists for the 5-element hub ──────────
/** Latest interview (id, status, attachments) per contractor for a given kind. */
async function latestInterviewByContractor(
    admin: ServiceClient,
    kind: InterviewKind,
    contractorIds: string[],
): Promise<Map<string, { id: string; status: InterviewStatus; attachments: InterviewAttachment[] }>> {
    const map = new Map<string, { id: string; status: InterviewStatus; attachments: InterviewAttachment[] }>()
    const ids = Array.from(new Set(contractorIds.filter(Boolean)))
    if (ids.length === 0) return map
    const table = kind === 'onboarding' ? 'contractor_onboarding_interviews' : 'contractor_exit_interviews'
    const { data } = await admin
        .from(table)
        .select('id, contractor_id, status, attachments, created_at')
        .in('contractor_id', ids)
        .order('created_at', { ascending: false })
    for (const r of (data ?? []) as Array<{ id: string; contractor_id: string; status: InterviewStatus; attachments: InterviewAttachment[] | null }>) {
        if (!map.has(r.contractor_id)) {
            map.set(r.contractor_id, { id: r.id, status: r.status, attachments: r.attachments ?? [] })
        }
    }
    return map
}

/**
 * "Wejścia" feed enriched with contractor link + latest onboarding-interview attachments. Drives
 * both the read-only Wejścia table and the actionable Onboarding table (interview file upload).
 */
export async function listOnboardingEntries(filters: { client?: string } = {}): Promise<OnboardingEntryItem[]> {
    await requireLifecycleManagerAction()
    const admin = createServiceClient()

    let eq = admin
        .from('client_entries')
        .select('id, contractor_id, consultant_name, client_name, position, recruiter_raw, start_date')
        .order('start_date', { ascending: false, nullsFirst: false })
    if (filters.client) eq = eq.ilike('client_name', `%${filters.client}%`)
    let pq = admin
        .from('placements')
        .select('id, contractor_id, consultant_name, client_name, position, recruiter_raw, start_date, status')
        .neq('status', 'cancelled')
        .order('start_date', { ascending: false })
    if (filters.client) pq = pq.ilike('client_name', `%${filters.client}%`)
    const [entries, placements] = await Promise.all([eq, pq])

    const rows: Array<Omit<OnboardingEntryItem, 'interview_id' | 'interview_status' | 'attachments'>> = [
        ...((placements.data ?? []) as Array<{ id: string; contractor_id: string | null; consultant_name: string; client_name: string; position: string | null; recruiter_raw: string | null; start_date: string | null }>).map((p) => ({
            entry_id: p.id,
            source: 'placement' as const,
            consultant_name: p.consultant_name,
            client_name: p.client_name,
            position: p.position,
            recruiter: p.recruiter_raw,
            start_date: p.start_date,
            contractor_id: p.contractor_id,
        })),
        ...((entries.data ?? []) as Array<{ id: string; contractor_id: string | null; consultant_name: string; client_name: string; position: string | null; recruiter_raw: string | null; start_date: string | null }>).map((e) => ({
            entry_id: e.id,
            source: 'archive' as const,
            consultant_name: e.consultant_name,
            client_name: e.client_name,
            position: e.position,
            recruiter: e.recruiter_raw,
            start_date: e.start_date,
            contractor_id: e.contractor_id,
        })),
    ].sort((a, b) => (b.start_date ?? '').localeCompare(a.start_date ?? ''))

    const interviews = await latestInterviewByContractor(admin, 'onboarding', rows.map((r) => r.contractor_id ?? ''))
    return rows.map((r) => {
        const iv = r.contractor_id ? interviews.get(r.contractor_id) : undefined
        return { ...r, interview_id: iv?.id ?? null, interview_status: iv?.status ?? null, attachments: iv?.attachments ?? [] }
    })
}

/** Recorded departures enriched with latest exit-interview attachments (Zejścia + Exit Interview). */
export async function listExitDepartures(filters: { client?: string } = {}): Promise<ExitDepartureItem[]> {
    await requireLifecycleManagerAction()
    const admin = createServiceClient()
    let q = admin.from('client_departures').select('*').order('departure_date', { ascending: false, nullsFirst: false })
    if (filters.client) q = q.ilike('client_name', `%${filters.client}%`)
    const { data } = await q
    const rows = (data ?? []) as ClientDepartureRow[]
    if (rows.length === 0) return []

    const interviews = await latestInterviewByContractor(admin, 'exit', rows.map((r) => r.contractor_id ?? ''))
    return rows.map((r) => {
        const iv = r.contractor_id ? interviews.get(r.contractor_id) : undefined
        return { ...r, interview_id: iv?.id ?? null, interview_status: iv?.status ?? null, attachments: iv?.attachments ?? [] }
    })
}

/**
 * Current contractor roster with commercials — live placements (non-cancelled) + the 2024 archive,
 * deduped by natural key (consultant + client + start), placements winning. Includes the rate columns.
 */
export async function listContractorRoster(filters: { client?: string; search?: string } = {}): Promise<ContractorRosterItem[]> {
    await requireLifecycleManagerAction()
    const admin = createServiceClient()

    const [placements, entries] = await Promise.all([
        admin
            .from('placements')
            .select('id, contractor_id, consultant_name, client_name, recruiter_raw, delivery_lead_raw, start_date, revenue_rate, cost_rate, monthly_margin, status')
            .neq('status', 'cancelled')
            .order('start_date', { ascending: false }),
        admin
            .from('client_entries')
            .select('id, contractor_id, consultant_name, client_name, recruiter_raw, delivery_lead_raw, start_date, revenue_rate, cost_rate, monthly_margin')
            .order('start_date', { ascending: false, nullsFirst: false }),
    ])

    const naturalKey = (consultant: string, client: string, start: string | null) =>
        `${consultant.trim().toLowerCase()}|${client.trim().toLowerCase()}|${start ?? ''}`
    const byKey = new Map<string, ContractorRosterItem>()

    for (const p of (placements.data ?? []) as Array<{ id: string; contractor_id: string | null; consultant_name: string; client_name: string; recruiter_raw: string | null; delivery_lead_raw: string | null; start_date: string | null; revenue_rate: number | null; cost_rate: number | null; monthly_margin: number | null }>) {
        byKey.set(naturalKey(p.consultant_name, p.client_name, p.start_date), {
            id: p.id,
            source: 'placement',
            consultant_name: p.consultant_name,
            client_name: p.client_name,
            recruiter: p.recruiter_raw,
            delivery_lead: p.delivery_lead_raw,
            start_date: p.start_date,
            revenue_rate: p.revenue_rate,
            cost_rate: p.cost_rate,
            monthly_margin: p.monthly_margin,
            contractor_id: p.contractor_id,
        })
    }
    for (const e of (entries.data ?? []) as Array<{ id: string; contractor_id: string | null; consultant_name: string; client_name: string; recruiter_raw: string | null; delivery_lead_raw: string | null; start_date: string | null; revenue_rate: number | null; cost_rate: number | null; monthly_margin: number | null }>) {
        const key = naturalKey(e.consultant_name, e.client_name, e.start_date)
        if (byKey.has(key)) continue // placement wins
        byKey.set(key, {
            id: e.id,
            source: 'archive',
            consultant_name: e.consultant_name,
            client_name: e.client_name,
            recruiter: e.recruiter_raw,
            delivery_lead: e.delivery_lead_raw,
            start_date: e.start_date,
            revenue_rate: e.revenue_rate,
            cost_rate: e.cost_rate,
            monthly_margin: e.monthly_margin,
            contractor_id: e.contractor_id,
        })
    }

    let out = Array.from(byKey.values()).sort((a, b) => (b.start_date ?? '').localeCompare(a.start_date ?? ''))
    if (filters.client) out = out.filter((r) => r.client_name.toLowerCase().includes(filters.client!.toLowerCase()))
    if (filters.search) {
        const s = filters.search.toLowerCase()
        out = out.filter((r) => r.consultant_name.toLowerCase().includes(s) || r.client_name.toLowerCase().includes(s))
    }
    return out
}

// ─── Phase 38: interview file uploads ─────────────────────────────────────────
/** Find a contractor by exact (case-insensitive) name, or create one; optionally link the source entry. */
async function resolveOrCreateContractor(
    admin: ServiceClient,
    ctxUserId: string,
    input: {
        consultantName: string
        client?: string | null
        position?: string | null
        status?: ContractorStatus
        entrySource?: 'placement' | 'archive' | 'departure' | null
        entryId?: string | null
    },
): Promise<string> {
    const name = input.consultantName.trim()
    if (name.length < 2) throw new Error('Brak imienia i nazwiska kontraktora — nie mogę powiązać wywiadu.')

    // Match on normalized name (case/whitespace-insensitive) among existing contractors.
    const norm = normalizeContractorName(name)
    const { data: candidates } = await admin.from('contractors').select('id, full_name').ilike('full_name', name)
    let contractorId = ((candidates ?? []) as Array<{ id: string; full_name: string }>)
        .find((c) => normalizeContractorName(c.full_name) === norm)?.id ?? null

    if (!contractorId) {
        const { data: created, error } = await admin
            .from('contractors')
            .insert({
                full_name: name,
                current_client: input.client?.trim() || null,
                current_position: input.position?.trim() || null,
                status: input.status ?? 'active',
                imported_by: ctxUserId,
            })
            .select('id')
            .single()
        if (error || !created) {
            if (error?.code === '23505') {
                const { data: again } = await admin.from('contractors').select('id').ilike('full_name', name).limit(1)
                contractorId = ((again ?? []) as Array<{ id: string }>)[0]?.id ?? null
            }
            if (!contractorId) throw new Error(`Nie udało się utworzyć kontraktora: ${error?.message ?? 'unknown'}`)
        } else {
            contractorId = (created as { id: string }).id
            await logAudit(ctxUserId, 'CONTRACTOR_CREATED', { contractor_id: contractorId, full_name: name, via: 'interview_upload' })
        }
    }

    // Link the source row so the file shows up against it on next render (only when currently unlinked).
    if (input.entryId && input.entrySource) {
        const table =
            input.entrySource === 'placement' ? 'placements'
            : input.entrySource === 'archive' ? 'client_entries'
            : 'client_departures'
        await admin.from(table).update({ contractor_id: contractorId }).eq('id', input.entryId).is('contractor_id', null)
    }
    return contractorId
}

/**
 * Upload an onboarding/exit interview file. Resolves (or creates + links) the contractor when only
 * an entry/departure identity is known, appends the file to the latest interview's attachments
 * (creating the interview if none exists yet).
 */
export async function uploadContractorInterviewFile(formData: FormData): Promise<{ contractorId: string; attachment: InterviewAttachment }> {
    const ctx = await requireLifecycleManagerAction()
    const admin = createServiceClient()

    const kind = (formData.get('kind')?.toString() ?? '') as InterviewKind
    if (kind !== 'onboarding' && kind !== 'exit') throw new Error('Nieprawidłowy typ wywiadu.')
    const file = formData.get('file') as File | null
    if (!file || file.size === 0) throw new Error('Brak pliku.')
    if (file.size > MAX_INTERVIEW_FILE_BYTES) throw new Error('Plik za duży (max 10 MB).')
    if (file.type && !ALLOWED_INTERVIEW_MIME.has(file.type)) {
        throw new Error('Niedozwolony format. Dozwolone: PDF, Word, Excel, obrazy.')
    }

    const explicitContractorId = formData.get('contractorId')?.toString() || null
    const contractorId = explicitContractorId ?? await resolveOrCreateContractor(admin, ctx.userId, {
        consultantName: formData.get('consultantName')?.toString() ?? '',
        client: formData.get('client')?.toString() ?? null,
        position: formData.get('position')?.toString() ?? null,
        status: kind === 'exit' ? 'offboarding' : 'onboarding',
        entrySource: (formData.get('entrySource')?.toString() || null) as 'placement' | 'archive' | 'departure' | null,
        entryId: formData.get('entryId')?.toString() || null,
    })

    const table = kind === 'onboarding' ? 'contractor_onboarding_interviews' : 'contractor_exit_interviews'

    // Latest interview for this contractor + kind, or create one carrying the contractor snapshot.
    const { data: existing } = await admin
        .from(table)
        .select('id, attachments')
        .eq('contractor_id', contractorId)
        .order('created_at', { ascending: false })
        .limit(1)
    let interviewId = ((existing ?? []) as Array<{ id: string; attachments: InterviewAttachment[] | null }>)[0]?.id ?? null
    let attachments = ((existing ?? []) as Array<{ id: string; attachments: InterviewAttachment[] | null }>)[0]?.attachments ?? []

    if (!interviewId) {
        const { data: c } = await admin.from('contractors').select('current_client, current_position').eq('id', contractorId).single()
        const snap = (c ?? {}) as { current_client: string | null; current_position: string | null }
        const { data: created, error: createErr } = await admin
            .from(table)
            .insert({ contractor_id: contractorId, client_snapshot: snap.current_client, position_snapshot: snap.current_position, status: 'scheduled', created_by: ctx.userId })
            .select('id, attachments')
            .single()
        if (createErr || !created) throw new Error(`Nie udało się utworzyć wywiadu: ${createErr?.message ?? 'unknown'}`)
        interviewId = (created as { id: string }).id
        attachments = ((created as { attachments: InterviewAttachment[] | null }).attachments) ?? []
    }

    const prefix = kind === 'onboarding' ? 'contractor-onboarding' : 'contractor-exit'
    const path = `${prefix}/${contractorId}/${Date.now()}_${sanitizeFileName(file.name)}`
    const { error: uploadErr } = await admin.storage.from(INTERVIEW_BUCKET).upload(path, file, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
    })
    if (uploadErr) throw new Error(`Nie udało się wgrać pliku: ${uploadErr.message}`)

    const attachment: InterviewAttachment = {
        path,
        name: file.name,
        size: file.size,
        hash: await fileSha256(file),
        uploaded_at: new Date().toISOString(),
    }
    const nextAttachments = [...attachments, attachment]
    const updatePatch: Record<string, unknown> = { attachments: nextAttachments, updated_at: new Date().toISOString() }
    const { error: updErr } = await admin.from(table).update(updatePatch).eq('id', interviewId)
    if (updErr) {
        await admin.storage.from(INTERVIEW_BUCKET).remove([path]).catch(() => undefined)
        throw new Error(`Nie udało się zapisać załącznika: ${updErr.message}`)
    }

    await logAudit(ctx.userId, kind === 'onboarding' ? 'CONTRACTOR_ONBOARDING_INTERVIEW_FILE_UPLOADED' : 'CONTRACTOR_EXIT_INTERVIEW_FILE_UPLOADED', {
        contractor_id: contractorId,
        interview_id: interviewId,
        file: attachment.name,
        size: attachment.size,
    })
    revalidatePath(HUB)
    revalidatePath(`${HUB}/${contractorId}`)
    return { contractorId, attachment }
}

/** Remove one attachment from a contractor's latest interview of the given kind (best-effort storage delete). */
export async function removeContractorInterviewFile(kind: InterviewKind, contractorId: string, path: string): Promise<void> {
    const ctx = await requireLifecycleManagerAction()
    const admin = createServiceClient()
    const table = kind === 'onboarding' ? 'contractor_onboarding_interviews' : 'contractor_exit_interviews'
    const { data } = await admin
        .from(table)
        .select('id, attachments')
        .eq('contractor_id', contractorId)
        .order('created_at', { ascending: false })
        .limit(1)
    const row = ((data ?? []) as Array<{ id: string; attachments: InterviewAttachment[] | null }>)[0]
    if (!row) throw new Error('Wywiad nie znaleziony.')
    const next = (row.attachments ?? []).filter((a) => a.path !== path)
    const removePatch: Record<string, unknown> = { attachments: next, updated_at: new Date().toISOString() }
    const { error } = await admin.from(table).update(removePatch).eq('id', row.id)
    if (error) throw new Error(`Nie udało się usunąć załącznika: ${error.message}`)
    await admin.storage.from(INTERVIEW_BUCKET).remove([path]).catch(() => undefined)
    await logAudit(ctx.userId, 'CONTRACTOR_INTERVIEW_FILE_REMOVED', { contractor_id: contractorId, kind, path })
    revalidatePath(HUB)
    revalidatePath(`${HUB}/${contractorId}`)
}

/** Short-lived signed URL to view/download an uploaded interview attachment. */
export async function getContractorInterviewFileUrl(path: string): Promise<string> {
    await requireLifecycleManagerAction()
    const admin = createServiceClient()
    const { data, error } = await admin.storage.from(INTERVIEW_BUCKET).createSignedUrl(path, 300)
    if (error || !data?.signedUrl) throw new Error('Nie udało się wygenerować linku do pliku.')
    return data.signedUrl
}

// ─── Phase 39: Bench (consultants between projects) ───────────────────────────

/**
 * List the bench worklist — READ-ONLY (audyt 2026-07-16, P1.8: render nie może
 * mieć efektów ubocznych). Auto-seed z niedawnych zejść żyje w
 * lib/contractors/bench-seed.ts i jest wołany przez joby tworzące zejścia
 * (cron tc-sync + commitZejsciaImport); pomija internalizację.
 */
export async function listBench(): Promise<BenchItem[]> {
    await requireLifecycleManagerAction()
    const admin = createServiceClient()

    const { data, error } = await admin
        .from('contractor_bench')
        .select('*')
        .is('dismissed_at', null)
        .order('departure_date', { ascending: false, nullsFirst: false })
    if (error) {
        logCompat.error('listBench error:', error)
        throw new Error('Nie udało się pobrać benchu.')
    }
    return (data ?? []) as BenchItem[]
}

/** Manually add a person to the bench (hybrid — for someone outside the auto-seed window). */
export async function addBenchEntry(input: {
    consultantName: string
    clientName?: string | null
    role?: string | null
    departureDate?: string | null
    noticeDate?: string | null
    status?: BenchStatus
    benefits?: BenchBenefits
    contractorId?: string | null
}): Promise<{ id: string }> {
    const ctx = await requireLifecycleManagerAction()
    const admin = createServiceClient()
    const name = input.consultantName.trim()
    if (name.length < 2) throw new Error('Imię i nazwisko jest wymagane.')
    const { data, error } = await admin
        .from('contractor_bench')
        .insert({
            consultant_name: name,
            client_name: input.clientName?.trim() || null,
            role: input.role?.trim() || null,
            departure_date: input.departureDate || null,
            notice_date: input.noticeDate || null,
            status: input.status ?? 'w_rekrutacji',
            benefits: input.benefits ?? 'aktywne',
            contractor_id: input.contractorId || null,
            source: 'manual',
            created_by: ctx.userId,
        })
        .select('id')
        .single()
    if (error || !data) throw new Error(`Nie udało się dodać na bench: ${error?.message ?? 'unknown'}`)
    await logAudit(ctx.userId, 'BENCH_ENTRY_ADDED', { bench_id: (data as { id: string }).id, consultant: name })
    revalidatePath(HUB)
    return data as { id: string }
}

/** Update the editable workflow state (status / benefits) of a bench entry. */
export async function updateBenchEntry(
    id: string,
    input: Partial<{ status: BenchStatus; benefits: BenchBenefits }>,
): Promise<void> {
    const ctx = await requireLifecycleManagerAction()
    const admin = createServiceClient()
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (input.status !== undefined) patch.status = input.status
    if (input.benefits !== undefined) patch.benefits = input.benefits
    const { error } = await admin.from('contractor_bench').update(patch).eq('id', id)
    if (error) throw new Error(`Nie udało się zaktualizować: ${error.message}`)
    await logAudit(ctx.userId, 'BENCH_ENTRY_UPDATED', { bench_id: id, fields: Object.keys(patch).filter((k) => k !== 'updated_at') })
    revalidatePath(HUB)
}

/** Soft-remove a bench entry (keeps the row so an auto-seeded departure isn't re-added). */
export async function dismissBenchEntry(id: string): Promise<void> {
    const ctx = await requireLifecycleManagerAction()
    const admin = createServiceClient()
    const patch: Record<string, unknown> = { dismissed_at: new Date().toISOString() }
    const { error } = await admin.from('contractor_bench').update(patch).eq('id', id)
    if (error) throw new Error(`Nie udało się usunąć z benchu: ${error.message}`)
    await logAudit(ctx.userId, 'BENCH_ENTRY_DISMISSED', { bench_id: id })
    revalidatePath(HUB)
}
