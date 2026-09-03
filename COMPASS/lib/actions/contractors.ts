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
    CareRosterItem,
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
    ContractorTaskStatus,
    ExitDepartureItem,
    InterviewAttachment,
    InterviewKind,
    InterviewStatus,
    OnboardingEntryItem,
    WhoResigned,
} from '@/lib/types/contractor'
import {
    resolveCareSituations,
    type CareBenchRow,
    type CareDepartureRow,
    type CareEntryRow,
} from '@/lib/contractors/care-roster'
import { excludeExited } from '@/lib/hr/employment-window'
import { ExpectedError } from '@/lib/actions/expected-error'
import { runAction, type ActionResult } from '@/lib/actions/action-result'
import { DEFAULT_IN_CHUNK_SIZE, requireRows, selectInChunks, type SelectInChunksOptions } from '@/lib/supabase/select-in-chunks'

type ServiceClient = ReturnType<typeof createServiceClient>
// Audyt 2026-08 — `/internal/kontraktorzy` to od Fazy 38/45 sama przekierowująca
// zaślepka (app/(protected)/internal/kontraktorzy/page.tsx robi redirect), więc
// revalidatePath na nią nie odświeżał NICZEGO. Realne listy kontraktorów żyją
// w hubie People Ops. Karta szczegółu `/internal/kontraktorzy/{id}` nadal istnieje
// jako prawdziwa strona — stąd osobna stała.
const HUB = '/internal/people'
const CONTRACTOR_DETAIL = '/internal/kontraktorzy'

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
/**
 * `selectInChunks` dla zapytań DEKORACYJNYCH — nazwisk, etykiet, odznak.
 *
 * Awaria degraduje wzbogacenie do pustki (z logiem), zamiast gasić listę, której
 * te dane tylko towarzyszą. Rozstrzygnięcie TREŚĆ vs DEKORACJA opisuje
 * lib/supabase/select-in-chunks.ts; nazwa tej funkcji ma czynić wybór widocznym
 * w miejscu wywołania, żeby dało się go zweryfikować bez wchodzenia w ciało.
 */
async function decorationRows<T>(options: SelectInChunksOptions): Promise<T[]> {
    try {
        return await selectInChunks<T>(options)
    } catch (error) {
        logCompat.warn(`Dane pomocnicze niedostępne (${options.source}) — lista bez wzbogacenia`, error)
        return []
    }
}

async function loadProfilesByIds(admin: ServiceClient, ids: string[]): Promise<Map<string, ProfileLite>> {
    const unique = Array.from(new Set(ids.filter(Boolean)))
    const map = new Map<string, ProfileLite>()
    if (unique.length === 0) return map
    const rows = await decorationRows<ProfileLite>({
        source: 'profiles',
        column: 'id',
        ids: unique,
        query: () => admin.from('profiles').select('id, full_name, email, role'),
    })
    for (const p of rows) map.set(p.id, p)
    return map
}

/** Kto może być opiekunem kontraktora — wyłącznie rola talent_community. */
export async function listTcmProfiles(): Promise<Array<{ id: string; fullName: string }>> {
    await requireLifecycleManagerAction()
    const admin = createServiceClient()
    // Opiekunem może być TYLKO osoba z rolą talent_community (decyzja Artura,
    // 2026-09-03). Wcześniej lista obejmowała też grant has_tcm_access (Phase 45),
    // przez co w wyborze opiekuna pojawiały się cztery osoby z finansów i manager.
    //
    // Rozróżnienie jest celowe: `has_tcm_access` daje DOSTĘP do strefy TCM
    // (podglądu, edycji), ale nie czyni z kogoś opiekuna konsultanta — opieka to
    // rola, nie uprawnienie. Bare-admini nie byli tu wypisywani już wcześniej,
    // bo zaśmiecali listę „przypisane" (zgłoszenie Dominika).
    //
    // Konsekwencja dla wywołujących: `assignCareOwner` waliduje po tej samej
    // liście, więc zawężenie obejmuje też zapis, nie tylko dropdown.
    // Opiekun, który odszedł, nie jest opiekunem — nie oferuj go w wyborze.
    const q = excludeExited(
        admin
            .from('profiles')
            .select('id, full_name, role')
            .eq('role', 'talent_community'),
    ).order('full_name', { ascending: true })
    // TREŚĆ — pusty dropdown mówi „nie ma komu przypisać", a nie „nie udało się sprawdzić".
    return (requireRows('profiles', await q) as ProfileLite[]).map((p) => ({ id: p.id, fullName: p.full_name ?? '—' }))
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
    // TREŚĆ — katalog kontraktorów. Awaria nie może udawać „nikogo nie ma".
    const contractors = requireRows('contractors', await q) as ContractorRow[]
    if (contractors.length === 0) return []

    // Agregat rozmów (open_conversations / last_conversation_date) zniknął razem
    // z RetencjaPanelem — był jego jedynym czytelnikiem. Bez niego katalog nie
    // przeciąga już całej tabeli contractor_conversations przy każdym otwarciu.
    const ownerMap = await loadProfilesByIds(
        admin,
        contractors.map((c) => c.owner_tcm_id ?? '').filter(Boolean),
    )

    return contractors.map((c) => ({
        ...c,
        owner_tcm_name: c.owner_tcm_id ? ownerMap.get(c.owner_tcm_id)?.full_name ?? null : null,
    }))
}

export async function getContractorDetail(contractorId: string): Promise<ContractorDetail> {
    await requireLifecycleManagerAction()
    const admin = createServiceClient()

    // Rozróżnienie „nie ma takiego kontraktora" od „zapytanie padło" jest tu
    // nośne: strona karty łapie brak rekordu i renderuje 404. Gdyby awaria szła
    // tą samą drogą, TCM zobaczyłby „nie znaleziono" — twierdzenie o DANYCH —
    // zamiast informacji o awarii, i mógłby uznać, że rekord skasowano.
    // Stąd `maybeSingle`: brak wiersza to `data === null` BEZ błędu.
    const { data: cRaw, error: cErr } = await admin
        .from('contractors')
        .select('*')
        .eq('id', contractorId)
        .maybeSingle()
    if (cErr) throw new Error(`Nie udało się pobrać kontraktora: ${cErr.message}`)
    if (!cRaw) throw new ExpectedError('Kontraktor nie znaleziony.')
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
        // TREŚĆ — każda z tych list jest osobną sekcją karty kontraktora; pusta
        // sekcja to twierdzenie „nic tu nie ma", nie „nie udało się sprawdzić".
        onboardingInterviews: requireRows('contractor_onboarding_interviews', onb) as unknown as ContractorOnboardingInterviewRow[],
        exitInterviews: requireRows('contractor_exit_interviews', exit) as unknown as ContractorExitInterviewRow[],
        entries: requireRows('client_entries', entries) as ClientEntryRow[],
        departures: requireRows('client_departures', deps) as ClientDepartureRow[],
        placements: requireRows('placements', placements) as ContractorDetail['placements'],
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
    revalidatePath(`${CONTRACTOR_DETAIL}/${id}`)
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
    // TREŚĆ — log rozmów.
    const rows = requireRows('contractor_conversations', await q) as ContractorConversationRow[]
    if (rows.length === 0) return []

    const [contractorMap, tcmMap] = await Promise.all([
        (async () => {
            // DEKORACJA — nazwisko i telefon dopisywane do wpisu rozmowy.
            const cs = await decorationRows<{ id: string; full_name: string; phone: string | null }>({
                source: 'contractors',
                column: 'id',
                ids: rows.map((r) => r.contractor_id),
                query: () => admin.from('contractors').select('id, full_name, phone'),
            })
            const m = new Map<string, { full_name: string; phone: string | null }>()
            for (const c of cs) m.set(c.id, c)
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
    revalidatePath(`${CONTRACTOR_DETAIL}/${input.contractorId}`)
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
    revalidatePath(`${CONTRACTOR_DETAIL}/${input.contractorId}`)
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
    revalidatePath(`${CONTRACTOR_DETAIL}/${input.contractorId}`)
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

    // TREŚĆ — KPI. „0 zejść" to konkretne twierdzenie o firmie, a nie brak odpowiedzi;
    // cicha awaria zamieniała tu awarię w fałszywy wynik pokazany jako fakt.
    const cRows = requireRows('contractors', contractors) as Array<{ status: ContractorStatus }>
    const convRows = requireRows('contractor_conversations', convs) as Array<{ status: ConversationStatus; tcm_id: string | null; tcm_raw: string | null }>
    const entryRows = requireRows('client_entries', entries) as Array<{ id: string }>
    const placRows = requireRows('placements', placements) as Array<{ status: string }>
    const depRows = requireRows('client_departures', deps) as Array<{ who_resigned: WhoResigned | null; client_name: string }>

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
    // null bez błędu ≠ brak zejść — patrz lib/supabase/select-in-chunks.ts.
    if (data === null) throw new Error('Brak odpowiedzi z client_departures (data=null bez błędu)')

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

// ─── Phase 38: Onboarding / Exit / Roster lists for the 5-element hub ──────────
/** Latest interview (id, status, attachments) per contractor for a given kind. */
interface InterviewLookupRow {
    id: string
    contractor_id: string
    status: InterviewStatus
    attachments: InterviewAttachment[] | null
}

async function latestInterviewByContractor(
    admin: ServiceClient,
    kind: InterviewKind,
    contractorIds: string[],
): Promise<Map<string, { id: string; status: InterviewStatus; attachments: InterviewAttachment[] }>> {
    const map = new Map<string, { id: string; status: InterviewStatus; attachments: InterviewAttachment[] }>()
    const ids = Array.from(new Set(contractorIds.filter(Boolean)))
    if (ids.length === 0) return map
    const table = kind === 'onboarding' ? 'contractor_onboarding_interviews' : 'contractor_exit_interviews'

    // DEKORACJA (odznaka statusu + kafelki plików): ścieżka uploadu sama wyszukuje
    // najnowszy wywiad, więc pusty wynik nie grozi założeniem duplikatu — degradujemy
    // zamiast gasić tabelę Wejść/Zejść. Paczkami, bo trafia tu ~350 id (URL ~13 kB).
    //
    // Sortowanie działa w obrębie paczki, ale dzielimy po TEJ SAMEJ kolumnie, po której
    // grupujemy — wszystkie wywiady kontraktora lądują w jednej paczce, więc „pierwszy
    // wiersz per kontraktor" nadal jest tym najnowszym.
    const rows = await decorationRows<InterviewLookupRow>({
        source: table,
        column: 'contractor_id',
        ids,
        query: () => admin
            .from(table)
            .select('id, contractor_id, status, attachments, created_at')
            .order('created_at', { ascending: false }),
    })

    for (const r of rows) {
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
        // TREŚĆ — tabela Onboardingu składa się z obu źródeł.
        ...(requireRows('placements', placements) as Array<{ id: string; contractor_id: string | null; consultant_name: string; client_name: string; position: string | null; recruiter_raw: string | null; start_date: string | null }>).map((p) => ({
            entry_id: p.id,
            source: 'placement' as const,
            consultant_name: p.consultant_name,
            client_name: p.client_name,
            position: p.position,
            recruiter: p.recruiter_raw,
            start_date: p.start_date,
            contractor_id: p.contractor_id,
        })),
        ...(requireRows('client_entries', entries) as Array<{ id: string; contractor_id: string | null; consultant_name: string; client_name: string; position: string | null; recruiter_raw: string | null; start_date: string | null }>).map((e) => ({
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
    // TREŚĆ tabeli Zejść. Bez sprawdzenia błędu `rows.length === 0 → return []`
    // zamieniało awarię w pustą tabelę bez słowa komunikatu — dokładnie ten
    // mechanizm ukrył incydent 2026-08-25 na kanbanie.
    const rows = requireRows('client_departures', await q) as ClientDepartureRow[]
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

    // TREŚĆ — roster ze stawkami. Cicha pustka po jednej stronie dawałaby listę
    // niepełną, ale wyglądającą na kompletną (dedup i tak scala oba źródła).
    const placementRows = requireRows('placements', placements)
    const entryRows = requireRows('client_entries', entries)

    const naturalKey = (consultant: string, client: string, start: string | null) =>
        `${consultant.trim().toLowerCase()}|${client.trim().toLowerCase()}|${start ?? ''}`
    const byKey = new Map<string, ContractorRosterItem>()

    for (const p of placementRows as Array<{ id: string; contractor_id: string | null; consultant_name: string; client_name: string; recruiter_raw: string | null; delivery_lead_raw: string | null; start_date: string | null; revenue_rate: number | null; cost_rate: number | null; monthly_margin: number | null }>) {
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
    for (const e of entryRows as Array<{ id: string; contractor_id: string | null; consultant_name: string; client_name: string; recruiter_raw: string | null; delivery_lead_raw: string | null; start_date: string | null; revenue_rate: number | null; cost_rate: number | null; monthly_margin: number | null }>) {
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
    //
    // Audyt 2026-08 — prefiltr `.ilike('full_name', name)` był OSTRZEJSZY niż porównanie
    // w JS, które robi się dwie linijki niżej: ilike ignoruje wielkość liter, ale NIE
    // skleja wielokrotnych spacji, a normalizeContractorName owszem. Kontraktor zapisany
    // w bazie jako „Jan  Kowalski" (dwie spacje z Excela) nie znajdował się dla „Jan
    // Kowalski" i zakładaliśmy DUPLIKAT. Prefiltr jest teraz szerszy (spacje → %),
    // a rozstrzyga dokładne porównanie znormalizowanych nazw.
    const norm = normalizeContractorName(name)
    const likePattern = norm.replace(/[%_\\]/g, (ch) => `\\${ch}`).split(' ').join('%')
    const { data: candidates } = await admin
        .from('contractors')
        .select('id, full_name')
        .ilike('full_name', likePattern)
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
                // Ten sam szerszy wzorzec co wyżej — inaczej wyścig o unikalny indeks kończył się
                // błędem „nie udało się utworzyć" mimo istniejącego wiersza z inną liczbą spacji.
                const { data: again } = await admin.from('contractors').select('id').ilike('full_name', likePattern).limit(1)
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
    // TREŚĆ, mimo że to lookup: wynik decyduje, czy zakładamy NOWY wywiad. Tabela nie ma
    // UNIQUE per kontraktor, więc cicha awaria dokłada pusty wywiad, który wygrywa
    // `order created_at desc limit 1` — i plik wgrany wcześniej znika z widoku.
    const existing = requireRows(table, await admin
        .from(table)
        .select('id, attachments')
        .eq('contractor_id', contractorId)
        .order('created_at', { ascending: false })
        .limit(1)) as Array<{ id: string; attachments: InterviewAttachment[] | null }>
    let interviewId = existing[0]?.id ?? null
    let attachments = existing[0]?.attachments ?? []

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
    revalidatePath(`${CONTRACTOR_DETAIL}/${contractorId}`)
    return { contractorId, attachment }
}

/** Remove one attachment from a contractor's latest interview of the given kind (best-effort storage delete). */
export async function removeContractorInterviewFile(kind: InterviewKind, contractorId: string, path: string): Promise<void> {
    const ctx = await requireLifecycleManagerAction()
    const admin = createServiceClient()
    const table = kind === 'onboarding' ? 'contractor_onboarding_interviews' : 'contractor_exit_interviews'
    // Bez sprawdzenia błędu awaria zapytania meldowała „Wywiad nie znaleziony" — nieprawdę.
    const found = requireRows(table, await admin
        .from(table)
        .select('id, attachments')
        .eq('contractor_id', contractorId)
        .order('created_at', { ascending: false })
        .limit(1)) as Array<{ id: string; attachments: InterviewAttachment[] | null }>
    const row = found[0]
    if (!row) throw new Error('Wywiad nie znaleziony.')
    const next = (row.attachments ?? []).filter((a) => a.path !== path)
    const removePatch: Record<string, unknown> = { attachments: next, updated_at: new Date().toISOString() }
    const { error } = await admin.from(table).update(removePatch).eq('id', row.id)
    if (error) throw new Error(`Nie udało się usunąć załącznika: ${error.message}`)
    await admin.storage.from(INTERVIEW_BUCKET).remove([path]).catch(() => undefined)
    await logAudit(ctx.userId, 'CONTRACTOR_INTERVIEW_FILE_REMOVED', { contractor_id: contractorId, kind, path })
    revalidatePath(HUB)
    revalidatePath(`${CONTRACTOR_DETAIL}/${contractorId}`)
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
    if (data === null) throw new Error('Brak odpowiedzi z contractor_bench (data=null bez błędu)')
    return data as BenchItem[]
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

// ─── Opieka TCM — lista konsultantów + przypisanie opiekuna ──────────────────
// Kolumna `contractors.owner_tcm_id` istnieje od Fazy 33a i jest czytana przez
// planner Consultant Success oraz alerty mapy technologicznej (brak opiekuna =
// alert idzie do WSZYSTKICH TCM i adminów). Nie było jednak ekranu, na którym da
// się ją wypełnić inaczej niż po jednej osobie — stąd 1 przypisanie na 688
// rekordów. Te dwie funkcje zamykają tę lukę.
//
// KTO JEST NA LIŚCIE liczy się z DANYCH, nie z `contractors.status`: ten ma na
// produkcji wartość 'active' u wszystkich 688 rekordów (default importu), więc
// oparcie listy na nim dałoby TCM pod opiekę ludzi, którzy odeszli lata temu.
// Reguła: ostatnie wejście do klienta bez późniejszego zejścia (= pracuje) LUB
// niezdjęty wpis na benchu (= między projektami, też wymaga kontaktu).

interface CareContractorRow {
    id: string
    full_name: string
    current_client: string | null
    current_position: string | null
    owner_tcm_id: string | null
    client_manager_name: string | null
}

/**
 * Lista konsultantów pod opieką Talent Community: pracujący u klienta + bench.
 *
 * Tabele źródłowe są małe (setki wierszy), więc składamy je w pamięci zamiast
 * budować widok w bazie — dzięki temu funkcja nie wymaga migracji, a sama reguła
 * „kto jest na liście" da się przetestować bez Postgresa
 * (lib/contractors/care-roster.ts).
 */
export async function listCareRoster(): Promise<CareRosterItem[]> {
    await requireLifecycleManagerAction()
    const admin = createServiceClient()

    const [entries, departures, bench] = await Promise.all([
        admin.from('client_entries').select('contractor_id, client_name, position, start_date').not('contractor_id', 'is', null),
        admin.from('client_departures').select('contractor_id, departure_date').not('contractor_id', 'is', null),
        admin.from('contractor_bench').select('contractor_id, client_name, role, departure_date, status').is('dismissed_at', null).not('contractor_id', 'is', null),
    ])

    // TREŚĆ — każde z tych trzech źródeł współtworzy listę. Cicha pustka
    // w którymkolwiek zabrałaby część ludzi z opieki, a lista dalej wyglądałaby
    // na kompletną: nikt by nie zauważył, że kogoś brakuje.
    const situations = resolveCareSituations({
        entries: requireRows('client_entries', entries) as CareEntryRow[],
        departures: requireRows('client_departures', departures) as CareDepartureRow[],
        bench: requireRows('contractor_bench', bench) as CareBenchRow[],
    })

    const ids = Array.from(situations.keys())
    if (ids.length === 0) return []

    // TREŚĆ — to jest sama lista, a nie jej ozdoba. Paczkami, bo przy ~330
    // identyfikatorach jedno `.in()` zbudowałoby URL, który po drodze bywa ucinany
    // (incydent 2026-08-25) i wróciłby pustką bez błędu.
    const contractors = await selectInChunks<CareContractorRow>({
        source: 'contractors',
        column: 'id',
        ids,
        query: () => admin.from('contractors').select('id, full_name, current_client, current_position, owner_tcm_id, client_manager_name'),
    })

    const ownerMap = await loadProfilesByIds(admin, contractors.map((c) => c.owner_tcm_id ?? ''))

    const items: CareRosterItem[] = contractors.map((c) => {
        const info = situations.get(c.id)
        return {
            contractorId: c.id,
            fullName: c.full_name,
            situation: info?.situation ?? 'bench',
            clientName: info?.clientName ?? c.current_client,
            position: info?.position ?? c.current_position,
            sinceDate: info?.sinceDate ?? null,
            benchStatus: info?.benchStatus ?? null,
            clientManagerName: c.client_manager_name,
            ownerTcmId: c.owner_tcm_id,
            ownerTcmName: c.owner_tcm_id ? ownerMap.get(c.owner_tcm_id)?.full_name ?? null : null,
        }
    })

    return items.sort((a, b) => a.fullName.localeCompare(b.fullName, 'pl'))
}

/** Ile rekordów wolno ruszyć jednym przypisaniem — z zapasem nad całą listą (~330). */
const MAX_CARE_ASSIGN_BATCH = 500

/**
 * Masowe przypisanie opiekuna TCM. `ownerTcmId === null` zdejmuje opiekuna.
 *
 * Wołane z komponentu klienckiego, więc przez `runAction` — bez tego Next
 * zamieniłby komunikat walidacji na „An error occurred…", a awaria nie trafiłaby
 * do Sentry (SDK nie instrumentuje plików 'use server').
 */
export async function assignCareOwner(input: {
    contractorIds: string[]
    ownerTcmId: string | null
}): Promise<ActionResult<{ updated: number }>> {
    return runAction('assignCareOwner', async () => {
        const ctx = await requireLifecycleManagerAction()
        const admin = createServiceClient()

        const ids = Array.from(new Set(input.contractorIds.filter(Boolean)))
        if (ids.length === 0) throw new ExpectedError('Nie zaznaczono żadnego konsultanta.')
        if (ids.length > MAX_CARE_ASSIGN_BATCH) {
            throw new ExpectedError(`Maksymalnie ${MAX_CARE_ASSIGN_BATCH} osób naraz — zawęź zaznaczenie.`)
        }

        // Opiekun musi pochodzić z listy uprawnionych. Bez tego sprawdzenia dowolny
        // UUID z `profiles` przeszedłby jako opiekun — a wtedy alerty mapy i check-iny
        // Consultant Success poleciałyby do osoby, która nie ma dostępu do TCM
        // i nigdy by ich nie zobaczyła.
        if (input.ownerTcmId) {
            const eligible = await listTcmProfiles()
            if (!eligible.some((p) => p.id === input.ownerTcmId)) {
                throw new ExpectedError('Wskazana osoba nie jest opiekunem Talent Community.')
            }
        }

        // Paczkami z tego samego powodu co przy odczycie: `update().in()` z setkami
        // identyfikatorów buduje dokładnie tak samo długi URL.
        //
        // Paczki lecą po kolei i każda commituje osobno, więc błąd na paczce N
        // zostawia wcześniejsze zapisane, a użytkownik widzi błąd. Przy ~330
        // osobach to najwyżej 6 paczek i skutek jest odwracalny (ponowne
        // przypisanie), więc nie owijamy tego w transakcję. Gdyby
        // MAX_CARE_ASSIGN_BATCH miało urosnąć — trzeba to przemyśleć na nowo.
        let updated = 0
        for (let i = 0; i < ids.length; i += DEFAULT_IN_CHUNK_SIZE) {
            const chunk = ids.slice(i, i + DEFAULT_IN_CHUNK_SIZE)
            const { data, error } = await admin
                .from('contractors')
                .update({ owner_tcm_id: input.ownerTcmId, updated_at: new Date().toISOString() })
                .in('id', chunk)
                .select('id')
            if (error) throw new Error(`Nie udało się przypisać opiekuna: ${error.message}`)
            updated += (data ?? []).length
        }

        await logAudit(ctx.userId, 'CONTRACTOR_OWNER_ASSIGNED', {
            owner_tcm_id: input.ownerTcmId,
            count: updated,
            // Pełna lista bywa 500-elementowa — do audytu wystarczy próbka i licznik.
            contractor_ids: ids.slice(0, 50),
        })
        revalidatePath(HUB)
        return { updated }
    })
}
