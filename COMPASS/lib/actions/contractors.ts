'use server'

// Phase 33 — Kontraktorzy: CRUD + conversation log + onboarding/exit interviews + departures.
// Authorization: admin OR talent_community (requireLifecycleManagerAction). Writes use the
// service client after the guard — the action is the trusted write path; RLS is defense-in-depth.

import { revalidatePath } from 'next/cache'
import { requireLifecycleManagerAction } from '@/lib/auth/internal-guard'
import { createServiceClient } from '@/lib/supabase/admin'
import { logAudit } from '@/lib/actions/audit'
import type {
    ClientDepartureRow,
    ClientEntryRow,
    ContractorConversationRow,
    ContractorDashboard,
    ContractorDetail,
    ContractorExitInterviewRow,
    ContractorFilters,
    ContractorListItem,
    ContractorOnboardingInterviewRow,
    ContractorRow,
    ConversationCategory,
    ConversationFilters,
    ConversationListItem,
    ConversationStatus,
    ContractorStatus,
    EntryListItem,
    WhoResigned,
} from '@/lib/types/contractor'

type ServiceClient = ReturnType<typeof createServiceClient>
const HUB = '/internal/kontraktorzy'

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
    const { data } = await admin
        .from('profiles')
        .select('id, full_name, role')
        .in('role', ['talent_community', 'admin'])
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
