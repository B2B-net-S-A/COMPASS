'use server'

// Phase 46 — Mapa technologiczna: słowniki (technologie/vendorzy/obszary),
// karty wywiadów (draft → finalizacja) i widok „przed rozmową".
// Authorization: admin OR talent_community OR grant has_tcm_access
// (requireLifecycleManagerAction). Zapisy service-rolem po guardzie — akcja jest
// zaufaną ścieżką zapisu, RLS to defense-in-depth (wzorzec lib/actions/contractors.ts).

import { revalidatePath } from 'next/cache'
import { ExpectedError, runAction, type ActionResult } from '@/lib/actions/action-result'
import {
    requireLifecycleManagerAction,
    requireTechMapViewerAction,
    type InternalAuthContext,
} from '@/lib/auth/internal-guard'
import { createServiceClient } from '@/lib/supabase/admin'
import { logCompat } from '@/lib/logger'
import { logAudit } from '@/lib/actions/audit'
import { listConversations } from '@/lib/actions/contractors'
import { normalizeClientName } from '@/lib/contractors/name-normalization'
import { warsawDate } from '@/lib/oof/oof-dates'
import { validateCardBase, validateCardForFinalize } from '@/lib/tech-map/validation'
import {
    buildClientTechMap,
    type AggCard,
    type AggInitiative,
    type AggLink,
    type ClientTechMap,
} from '@/lib/tech-map/aggregation'
import {
    allTcmAndAdmins,
    dispatchAlert,
    DEMAND_RECIPIENTS_KEY,
    PROJECT_END_RECIPIENTS_KEY,
    parseRecipientCsv,
    resolveRecipients,
} from '@/lib/tech-map/alerts'
import { buildTechMapKpi } from '@/lib/tech-map/analytics'
import { sendTechMapDemand } from '@/lib/email'
import { daysBetween } from '@/lib/tech-map/freshness'
import { CONVERSATION_CATEGORY_PL } from '@/lib/types/contractor'
import {
    generateTechSlug,
    HIRING_SOURCE_PL,
    INTERVIEW_CARD_STATUS_PL,
    type BriefTimelineEntry,
    type CardDetail,
    type CardInitiativeRow,
    type CardInput,
    type CardListItem,
    type ClientAreaRow,
    type PreInterviewBrief,
    type TechCategory,
    type TechInterviewCardRow,
    type TechnologyRow,
    type VendorRow,
} from '@/lib/types/tech-map'

type ServiceClient = ReturnType<typeof createServiceClient>

const HUB = '/internal/people'
const MAPA = '/internal/people/mapa'
const NAME_MAX = 120

// ─── Helpers ────────────────────────────────────────────────────────────────

function requireAdmin(ctx: InternalAuthContext): void {
    if (!ctx.isAdmin) throw new ExpectedError('Tylko administrator może zarządzać słownikiem.')
}

function validateDictName(raw: string): string {
    const trimmed = (raw ?? '').trim().replace(/\s+/g, ' ')
    if (trimmed.length < 2) throw new ExpectedError('Nazwa jest za krótka (min 2 znaki).')
    if (trimmed.length > NAME_MAX) throw new ExpectedError(`Nazwa za długa (max ${NAME_MAX} znaków).`)
    return trimmed
}

/** Wartość do exact-match przez .ilike() — escapuje wildcardy % i _. */
function ilikeExact(value: string): string {
    return value.replace(/[\\%_]/g, '\\$&')
}

async function loadProfileNames(admin: ServiceClient, ids: Array<string | null>): Promise<Map<string, string>> {
    const unique = Array.from(new Set(ids.filter((id): id is string => Boolean(id))))
    const map = new Map<string, string>()
    if (unique.length === 0) return map
    const { data } = await admin.from('profiles').select('id, full_name').in('id', unique)
    for (const p of (data ?? []) as Array<{ id: string; full_name: string | null }>) {
        map.set(p.id, p.full_name ?? '—')
    }
    return map
}

function canEditCard(ctx: InternalAuthContext, card: TechInterviewCardRow): boolean {
    return ctx.isAdmin || card.tcm_id === ctx.userId || card.created_by === ctx.userId
}

// ─── Słownik technologii ────────────────────────────────────────────────────

export async function listTechnologies(): Promise<TechnologyRow[]> {
    await requireLifecycleManagerAction()
    const admin = createServiceClient()
    const { data, error } = await admin.from('technologies').select('*').order('name')
    if (error) throw new Error(`Błąd pobierania technologii: ${error.message}`)
    return (data ?? []) as TechnologyRow[]
}

/**
 * Tag-picker „Dodaj: X" — nowa pozycja trafia do słownika jako NIEZWERYFIKOWANA.
 * Idempotentne: kolizja nazwy/sluga zwraca istniejący wiersz (picker wybiera
 * pozycję kanoniczną zamiast dublować słownik).
 */
export async function createTechnologyUnverified(name: string): Promise<ActionResult<TechnologyRow>> {
    return runAction('createTechnologyUnverified', async () => {
        const ctx = await requireLifecycleManagerAction()
        const trimmed = validateDictName(name)
        const slug = generateTechSlug(trimmed)
        if (!slug) {
            throw new ExpectedError('Nazwa nie zawiera znaków, z których można zbudować identyfikator.')
        }

        const admin = createServiceClient()
        const { data, error } = await admin
            .from('technologies')
            .insert({ name: trimmed, slug, is_verified: false, category: 'inne', created_by: ctx.userId })
            .select('*')
            .single()

        if (error) {
            if ((error as { code?: string }).code === '23505') {
                // Konflikt slug/nazwy → zwróć pozycję kanoniczną. Dwa parametryzowane
                // lookupy zamiast ręcznie sklejanego .or() — przecinki/nawiasy w nazwie
                // rozsypałyby parser filtrów PostgREST.
                const { data: bySlug } = await admin
                    .from('technologies')
                    .select('*')
                    .eq('slug', slug)
                    .maybeSingle()
                if (bySlug) return bySlug as TechnologyRow
                const { data: byName } = await admin
                    .from('technologies')
                    .select('*')
                    .ilike('name', ilikeExact(trimmed))
                    .limit(1)
                    .maybeSingle()
                if (byName) return byName as TechnologyRow
            }
            throw new Error(`Błąd dodawania technologii: ${error.message}`)
        }

        const row = data as TechnologyRow
        await logAudit(ctx.userId, 'TECH_DICT_CREATED', { kind: 'technology', id: row.id, name: trimmed, slug })
        return row
    })
}

/** Admin CRUD — slug jest NIEZMIENNY (stabilny klucz pod sync z NEXUS). */
export async function updateTechnology(input: {
    id: string
    name?: string
    category?: TechCategory
    aliases?: string[]
    isVerified?: boolean
}): Promise<ActionResult<void>> {
    return runAction('updateTechnology', async () => {
        const ctx = await requireLifecycleManagerAction()
        requireAdmin(ctx)
        if (!input.id) throw new ExpectedError('Brak id technologii.')

        const patch: Record<string, unknown> = {}
        if (input.name !== undefined) patch.name = validateDictName(input.name)
        if (input.category !== undefined) patch.category = input.category
        if (input.aliases !== undefined) {
            patch.aliases = input.aliases.map((a) => a.trim().toLowerCase()).filter(Boolean)
        }
        if (input.isVerified !== undefined) patch.is_verified = input.isVerified
        if (Object.keys(patch).length === 0) return

        const admin = createServiceClient()
        const { error } = await admin.from('technologies').update(patch).eq('id', input.id)
        if (error) {
            if ((error as { code?: string }).code === '23505') {
                throw new ExpectedError('Technologia o tej nazwie już istnieje.')
            }
            throw new Error(`Błąd aktualizacji technologii: ${error.message}`)
        }
        await logAudit(ctx.userId, 'TECH_DICT_UPDATED', { kind: 'technology', id: input.id, changes: patch })
        revalidatePath(HUB)
    })
}

export async function deleteTechnology(id: string): Promise<ActionResult<void>> {
    return runAction('deleteTechnology', async () => {
        const ctx = await requireLifecycleManagerAction()
        requireAdmin(ctx)
        if (!id) throw new ExpectedError('Brak id technologii.')
        const admin = createServiceClient()
        const { error } = await admin.from('technologies').delete().eq('id', id)
        if (error) {
            if ((error as { code?: string }).code === '23503') {
                throw new ExpectedError(
                    'Technologia jest użyta na kartach wywiadów — zmień nazwę lub oznacz jako niezweryfikowaną zamiast usuwać.',
                )
            }
            throw new Error(`Błąd usuwania technologii: ${error.message}`)
        }
        await logAudit(ctx.userId, 'TECH_DICT_DELETED', { kind: 'technology', id })
        revalidatePath(HUB)
    })
}

// ─── Słownik vendorów ───────────────────────────────────────────────────────

export async function listVendors(): Promise<VendorRow[]> {
    await requireLifecycleManagerAction()
    const admin = createServiceClient()
    const { data, error } = await admin.from('vendors').select('*').order('name')
    if (error) throw new Error(`Błąd pobierania dostawców: ${error.message}`)
    return (data ?? []) as VendorRow[]
}

export async function createVendorUnverified(name: string): Promise<ActionResult<VendorRow>> {
    return runAction('createVendorUnverified', async () => {
        const ctx = await requireLifecycleManagerAction()
        const trimmed = validateDictName(name)
        const admin = createServiceClient()
        const { data, error } = await admin
            .from('vendors')
            .insert({ name: trimmed, is_verified: false, created_by: ctx.userId })
            .select('*')
            .single()

        if (error) {
            if ((error as { code?: string }).code === '23505') {
                const { data: existing } = await admin
                    .from('vendors')
                    .select('*')
                    .ilike('name', ilikeExact(trimmed))
                    .limit(1)
                    .maybeSingle()
                if (existing) return existing as VendorRow
            }
            throw new Error(`Błąd dodawania dostawcy: ${error.message}`)
        }

        const row = data as VendorRow
        await logAudit(ctx.userId, 'TECH_DICT_CREATED', { kind: 'vendor', id: row.id, name: trimmed })
        return row
    })
}

export async function updateVendor(input: {
    id: string
    name?: string
    isVerified?: boolean
}): Promise<ActionResult<void>> {
    return runAction('updateVendor', async () => {
        const ctx = await requireLifecycleManagerAction()
        requireAdmin(ctx)
        if (!input.id) throw new ExpectedError('Brak id dostawcy.')

        const patch: Record<string, unknown> = {}
        if (input.name !== undefined) patch.name = validateDictName(input.name)
        if (input.isVerified !== undefined) patch.is_verified = input.isVerified
        if (Object.keys(patch).length === 0) return

        const admin = createServiceClient()
        const { error } = await admin.from('vendors').update(patch).eq('id', input.id)
        if (error) {
            if ((error as { code?: string }).code === '23505') {
                throw new ExpectedError('Dostawca o tej nazwie już istnieje.')
            }
            throw new Error(`Błąd aktualizacji dostawcy: ${error.message}`)
        }
        await logAudit(ctx.userId, 'TECH_DICT_UPDATED', { kind: 'vendor', id: input.id, changes: patch })
        revalidatePath(HUB)
    })
}

export async function deleteVendor(id: string): Promise<ActionResult<void>> {
    return runAction('deleteVendor', async () => {
        const ctx = await requireLifecycleManagerAction()
        requireAdmin(ctx)
        if (!id) throw new ExpectedError('Brak id dostawcy.')
        const admin = createServiceClient()
        const { error } = await admin.from('vendors').delete().eq('id', id)
        if (error) {
            if ((error as { code?: string }).code === '23503') {
                throw new ExpectedError(
                    'Dostawca jest użyty na kartach wywiadów — zmień nazwę zamiast usuwać.',
                )
            }
            throw new Error(`Błąd usuwania dostawcy: ${error.message}`)
        }
        await logAudit(ctx.userId, 'TECH_DICT_DELETED', { kind: 'vendor', id })
        revalidatePath(HUB)
    })
}

// ─── Obszary klienta ────────────────────────────────────────────────────────

export async function listClientAreas(clientId?: string): Promise<ClientAreaRow[]> {
    await requireLifecycleManagerAction()
    const admin = createServiceClient()
    let q = admin.from('client_areas').select('*').order('name')
    if (clientId) q = q.eq('client_id', clientId)
    const { data, error } = await q
    if (error) throw new Error(`Błąd pobierania obszarów: ${error.message}`)
    return (data ?? []) as ClientAreaRow[]
}

export async function createClientArea(
    clientId: string,
    name: string,
): Promise<ActionResult<ClientAreaRow>> {
    return runAction('createClientArea', async () => {
        const ctx = await requireLifecycleManagerAction()
        if (!clientId) throw new ExpectedError('Brak id klienta.')
        const trimmed = validateDictName(name)
        const admin = createServiceClient()
        const { data, error } = await admin
            .from('client_areas')
            .insert({ client_id: clientId, name: trimmed, created_by: ctx.userId })
            .select('*')
            .single()

        if (error) {
            if ((error as { code?: string }).code === '23505') {
                const { data: existing } = await admin
                    .from('client_areas')
                    .select('*')
                    .eq('client_id', clientId)
                    .ilike('name', ilikeExact(trimmed))
                    .limit(1)
                    .maybeSingle()
                if (existing) return existing as ClientAreaRow
            }
            throw new Error(`Błąd dodawania obszaru: ${error.message}`)
        }

        const row = data as ClientAreaRow
        await logAudit(ctx.userId, 'TECH_AREA_CREATED', {
            area_id: row.id,
            client_id: clientId,
            name: trimmed,
        })
        return row
    })
}

/**
 * TCM może dodać brakującego klienta prosto z formularza karty (świadoma decyzja
 * Phase 46 — bez tego wywiad utknąłby na wpisie, który dziś ma tylko admin+finanse).
 * Nazwa przechodzi kanonizację Phase 42a, wpis jest audytowany, a klient ląduje
 * w TEJ SAMEJ tabeli `clients`, widocznej w panelu admina.
 */
export async function createClientForTechMap(
    name: string,
): Promise<ActionResult<{ id: string; name: string }>> {
    return runAction('createClientForTechMap', async () => {
        const ctx = await requireLifecycleManagerAction()
        const normalized = normalizeClientName(name)
        if (!normalized || normalized.length < 2) {
            throw new ExpectedError('Nazwa klienta jest za krótka.')
        }
        if (normalized.length > NAME_MAX) {
            throw new ExpectedError(`Nazwa klienta za długa (max ${NAME_MAX} znaków).`)
        }

        const admin = createServiceClient()
        const { data, error } = await admin
            .from('clients')
            .insert({ name: normalized, created_by: ctx.userId })
            .select('id, name')
            .single()

        if (error) {
            if ((error as { code?: string }).code === '23505') {
                const { data: existing } = await admin
                    .from('clients')
                    .select('id, name')
                    .ilike('name', ilikeExact(normalized))
                    .limit(1)
                    .maybeSingle()
                if (existing) return existing as { id: string; name: string }
            }
            throw new Error(`Błąd dodawania klienta: ${error.message}`)
        }

        const row = data as { id: string; name: string }
        await logAudit(ctx.userId, 'CLIENT_CREATED_FROM_TECH_MAP', { client_id: row.id, name: normalized })
        return row
    })
}

// ─── Karty wywiadów ─────────────────────────────────────────────────────────

function cardPayloadFromInput(input: CardInput) {
    return {
        client_id: input.clientId,
        client_area_id: input.clientAreaId,
        // Puste pole = powrót do tytułu domyślnego („Rozmowa: {konsultant}"),
        // dlatego '' zapisujemy jako NULL, a nie jako pusty nagłówek.
        title: input.title?.trim() || null,
        interview_date: input.interviewDate,
        status: input.status,
        satisfaction: input.satisfaction,
        satisfaction_comment: input.satisfactionComment?.trim() || null,
        project_end_month: input.projectEndMonth,
        project_end_year: input.projectEndYear,
        project_end_unknown: input.projectEndUnknown,
        hiring: input.hiring,
        hiring_roles: input.hiringRoles.map((r) => r.trim()).filter(Boolean),
        hiring_source: input.hiring === true ? input.hiringSource : null,
        professional_insurance: input.professionalInsurance,
        memorable_quote: input.memorableQuote?.trim() || null,
        tech_old_new: input.techOldNew?.trim() || null,
        team_size: input.teamSize?.trim() || null,
        team_externals: input.teamExternals,
        vendors_note: input.vendorsNote?.trim() || null,
    }
}

async function assertAreaBelongsToClient(admin: ServiceClient, input: CardInput): Promise<void> {
    if (!input.clientAreaId) return
    const { data } = await admin
        .from('client_areas')
        .select('client_id')
        .eq('id', input.clientAreaId)
        .maybeSingle()
    if (!data || (data as { client_id: string }).client_id !== input.clientId) {
        throw new ExpectedError('Wybrany obszar nie należy do wybranego klienta.')
    }
}

// Rewrite junctions: delete + insert (supabase-js nie daje transakcji klienckiej).
// Błędy delete są sprawdzane; częściowy zapis naprawia się przy kolejnym zapisie
// karty, bo relacje są zawsze przepisywane w całości z inputu.
async function syncCardRelations(admin: ServiceClient, cardId: string, input: CardInput): Promise<void> {
    const delTech = await admin.from('tech_interview_card_technologies').delete().eq('card_id', cardId)
    if (delTech.error) throw new Error(`Błąd zapisu technologii: ${delTech.error.message}`)
    if (input.technologyIds.length > 0) {
        const { error } = await admin
            .from('tech_interview_card_technologies')
            .insert(input.technologyIds.map((technology_id) => ({ card_id: cardId, technology_id })))
        if (error) throw new Error(`Błąd zapisu technologii: ${error.message}`)
    }

    const delVendors = await admin.from('tech_interview_card_vendors').delete().eq('card_id', cardId)
    if (delVendors.error) throw new Error(`Błąd zapisu dostawców: ${delVendors.error.message}`)
    if (input.vendorIds.length > 0) {
        const { error } = await admin
            .from('tech_interview_card_vendors')
            .insert(input.vendorIds.map((vendor_id) => ({ card_id: cardId, vendor_id })))
        if (error) throw new Error(`Błąd zapisu dostawców: ${error.message}`)
    }

    const delInitiatives = await admin.from('tech_interview_card_initiatives').delete().eq('card_id', cardId)
    if (delInitiatives.error) throw new Error(`Błąd zapisu inicjatyw: ${delInitiatives.error.message}`)
    const initiatives = input.initiatives
        .map((i) => ({ name: i.name.trim(), kind: i.kind, priority: i.priority }))
        .filter((i) => i.name.length >= 2)
    if (initiatives.length > 0) {
        const { error } = await admin
            .from('tech_interview_card_initiatives')
            .insert(initiatives.map((i) => ({ card_id: cardId, ...i })))
        if (error) throw new Error(`Błąd zapisu inicjatyw: ${error.message}`)
    }
}

async function loadCardOrThrow(admin: ServiceClient, cardId: string): Promise<TechInterviewCardRow> {
    const { data, error } = await admin
        .from('tech_interview_cards')
        .select('*')
        .eq('id', cardId)
        .maybeSingle()
    if (error) throw new Error(`Błąd pobierania karty: ${error.message}`)
    if (!data) throw new ExpectedError('Karta nie istnieje.')
    return data as TechInterviewCardRow
}

export async function createCardDraft(input: CardInput): Promise<ActionResult<{ id: string }>> {
    return runAction('createCardDraft', async () => {
        const ctx = await requireLifecycleManagerAction()
        const baseErrors = validateCardBase(input)
        if (baseErrors.length > 0) throw new ExpectedError(baseErrors.join(' '))

        const admin = createServiceClient()
        await assertAreaBelongsToClient(admin, input)

        // Prefill placementu: najświeższy aktywny placement kontraktora (jeśli jest).
        // Opcjonalny — błąd lookupa nie blokuje karty, ale zostawia ślad w logach.
        const { data: placement, error: placementError } = await admin
            .from('placements')
            .select('id')
            .eq('contractor_id', input.contractorId)
            .in('status', ['upcoming', 'started'])
            .order('start_date', { ascending: false })
            .limit(1)
            .maybeSingle()
        if (placementError) {
            logCompat.warn('tech-map: prefill placementu nie powiódł się', placementError)
        }

        const { data, error } = await admin
            .from('tech_interview_cards')
            .insert({
                ...cardPayloadFromInput(input),
                contractor_id: input.contractorId,
                placement_id: (placement as { id: string } | null)?.id ?? null,
                tcm_id: ctx.userId,
                created_by: ctx.userId,
                is_draft: true,
            })
            .select('id')
            .single()
        if (error) throw new Error(`Błąd zapisu karty: ${error.message}`)

        const cardId = (data as { id: string }).id
        await syncCardRelations(admin, cardId, input)

        await logAudit(ctx.userId, 'TECH_CARD_CREATED', {
            card_id: cardId,
            contractor_id: input.contractorId,
            client_id: input.clientId,
        })
        revalidatePath(HUB)
        return { id: cardId }
    })
}

async function saveCardInternal(
    cardId: string,
    input: CardInput,
    opts: { finalize: boolean },
): Promise<void> {
    const ctx = await requireLifecycleManagerAction()
    const admin = createServiceClient()
    const card = await loadCardOrThrow(admin, cardId)
    if (!canEditCard(ctx, card)) throw new ExpectedError('Możesz edytować tylko własne karty.')
    if (input.contractorId !== card.contractor_id) {
        throw new ExpectedError(
            'Nie można zmienić konsultanta na istniejącej karcie — utwórz nową kartę.',
        )
    }

    const today = warsawDate(new Date())
    const mustBeComplete = opts.finalize || !card.is_draft
    const errors = mustBeComplete
        ? validateCardForFinalize(input, today)
        : validateCardBase(input)
    if (errors.length > 0) throw new ExpectedError(errors.join(' '))

    await assertAreaBelongsToClient(admin, input)

    const patch = {
        ...cardPayloadFromInput(input),
        ...(opts.finalize && card.is_draft
            ? { is_draft: false, finalized_at: new Date().toISOString() }
            : {}),
    }

    const { error } = await admin.from('tech_interview_cards').update(patch).eq('id', cardId)
    if (error) throw new Error(`Błąd zapisu karty: ${error.message}`)

    await syncCardRelations(admin, cardId, input)

    await logAudit(
        ctx.userId,
        opts.finalize && card.is_draft ? 'TECH_CARD_FINALIZED' : 'TECH_CARD_UPDATED',
        { card_id: cardId, contractor_id: card.contractor_id, status: input.status },
    )

    // Alert popytu (Etap 3): odpala się gdy karta JEST sfinalizowana, hiring=true,
    // a alert jeszcze nie poszedł (dedup demand_alerted_at). Event-driven — nie cron.
    const isFinalizedAfter = (opts.finalize && card.is_draft) || !card.is_draft
    if (isFinalizedAfter && input.hiring === true && card.demand_alerted_at === null) {
        await fireDemandAlert(admin, ctx.userId, cardId, card.contractor_id, input)
    }

    revalidatePath(HUB)
    revalidatePath(`${MAPA}/karta/${cardId}`)
}

/**
 * Alert do sprzedaży: klient szuka ludzi. Best-effort — błąd alertu NIE cofa
 * zapisu karty (opakowany try/catch). Stempluje demand_alerted_at, żeby kolejne
 * edycje sfinalizowanej karty nie spamowały.
 */
async function fireDemandAlert(
    admin: ServiceClient,
    actorUserId: string,
    cardId: string,
    contractorId: string,
    input: CardInput,
): Promise<void> {
    try {
        const [{ data: contractor }, { data: client }] = await Promise.all([
            admin.from('contractors').select('full_name, owner_tcm_id').eq('id', contractorId).maybeSingle(),
            admin.from('clients').select('name').eq('id', input.clientId).maybeSingle(),
        ])
        const ownerTcmId = (contractor as { owner_tcm_id?: string | null } | null)?.owner_tcm_id ?? null
        const clientName = (client as { name?: string } | null)?.name ?? 'klient'
        const areaName = input.clientAreaId
            ? ((await admin.from('client_areas').select('name').eq('id', input.clientAreaId).maybeSingle())
                  .data as { name?: string } | null)?.name ?? null
            : null

        const fallback = ownerTcmId ? [ownerTcmId] : await allTcmAndAdmins(admin)
        const recipients = await resolveRecipients(admin, DEMAND_RECIPIENTS_KEY, fallback)

        const roles = input.hiringRoles.map((r) => r.trim()).filter(Boolean)
        const sourcePl = input.hiringSource ? HIRING_SOURCE_PL[input.hiringSource] : null

        await dispatchAlert(admin, recipients, {
            type: 'tech_map_demand',
            titlePl: `${clientName} szuka ludzi`,
            titleEn: `${clientName} is hiring`,
            bodyPl: roles.length > 0 ? `Role: ${roles.join(', ')}` : 'Potrzeba rekrutacyjna zgłoszona.',
            bodyEn: roles.length > 0 ? `Roles: ${roles.join(', ')}` : 'Hiring need reported.',
            actionUrl: `/internal/people/mapa/klienci/${input.clientId}`,
            pushTag: `tech-map-demand-${cardId}`,
            emailFn: (email, name) =>
                sendTechMapDemand(email, name, clientName, roles, sourcePl, areaName),
        })

        await admin
            .from('tech_interview_cards')
            .update({ demand_alerted_at: new Date().toISOString() })
            .eq('id', cardId)

        await logAudit(actorUserId, 'TECH_MAP_DEMAND_ALERTED', {
            card_id: cardId,
            contractor_id: contractorId,
            client_id: input.clientId,
            recipients: recipients.length,
        })
    } catch (e) {
        logCompat.error('tech-map: alert popytu nie powiódł się', e)
    }
}

/** Zapis (draft zostaje draftem; karta sfinalizowana musi pozostać kompletna). */
export async function saveCard(cardId: string, input: CardInput): Promise<ActionResult<void>> {
    return runAction('saveCard', () => saveCardInternal(cardId, input, { finalize: false }))
}

/** Zapis + finalizacja (pełna matryca kompletności). */
export async function finalizeCard(cardId: string, input: CardInput): Promise<ActionResult<void>> {
    return runAction('finalizeCard', () => saveCardInternal(cardId, input, { finalize: true }))
}

export interface CardFilters {
    clientId?: string
    tcmId?: string
    contractorId?: string
    dateFrom?: string
    dateTo?: string
    includeDrafts?: boolean
    limit?: number
}

export async function listCards(filters: CardFilters = {}): Promise<CardListItem[]> {
    await requireLifecycleManagerAction()
    const admin = createServiceClient()

    let q = admin
        .from('tech_interview_cards')
        .select('*')
        .order('interview_date', { ascending: false })
        .limit(filters.limit ?? 500)
    if (filters.clientId) q = q.eq('client_id', filters.clientId)
    if (filters.tcmId) q = q.eq('tcm_id', filters.tcmId)
    if (filters.contractorId) q = q.eq('contractor_id', filters.contractorId)
    if (filters.dateFrom) q = q.gte('interview_date', filters.dateFrom)
    if (filters.dateTo) q = q.lte('interview_date', filters.dateTo)
    if (filters.includeDrafts === false) q = q.eq('is_draft', false)

    const { data, error } = await q
    if (error) throw new Error(`Błąd pobierania kart: ${error.message}`)
    const rows = (data ?? []) as TechInterviewCardRow[]
    if (rows.length === 0) return []

    const [contractorMap, clientMap, areaMap, tcmNames] = await Promise.all([
        (async () => {
            const ids = Array.from(new Set(rows.map((r) => r.contractor_id)))
            const { data: cs } = await admin.from('contractors').select('id, full_name').in('id', ids)
            const m = new Map<string, string>()
            for (const c of (cs ?? []) as Array<{ id: string; full_name: string }>) m.set(c.id, c.full_name)
            return m
        })(),
        (async () => {
            const ids = Array.from(new Set(rows.map((r) => r.client_id)))
            const { data: cls } = await admin.from('clients').select('id, name').in('id', ids)
            const m = new Map<string, string>()
            for (const c of (cls ?? []) as Array<{ id: string; name: string }>) m.set(c.id, c.name)
            return m
        })(),
        (async () => {
            const ids = Array.from(new Set(rows.map((r) => r.client_area_id).filter(Boolean))) as string[]
            const m = new Map<string, string>()
            if (ids.length === 0) return m
            const { data: areas } = await admin.from('client_areas').select('id, name').in('id', ids)
            for (const a of (areas ?? []) as Array<{ id: string; name: string }>) m.set(a.id, a.name)
            return m
        })(),
        loadProfileNames(admin, rows.map((r) => r.tcm_id)),
    ])

    return rows.map((r) => ({
        id: r.id,
        contractorId: r.contractor_id,
        contractorName: contractorMap.get(r.contractor_id) ?? '—',
        title: r.title,
        clientId: r.client_id,
        clientName: clientMap.get(r.client_id) ?? '—',
        areaName: r.client_area_id ? (areaMap.get(r.client_area_id) ?? null) : null,
        interviewDate: r.interview_date,
        status: r.status,
        isDraft: r.is_draft,
        tcmId: r.tcm_id,
        tcmName: r.tcm_id ? (tcmNames.get(r.tcm_id) ?? null) : null,
        hiring: r.hiring,
        satisfaction: r.satisfaction,
    }))
}

export async function getCardDetail(cardId: string): Promise<CardDetail> {
    await requireLifecycleManagerAction()
    const admin = createServiceClient()
    const card = await loadCardOrThrow(admin, cardId)

    const [contractor, client, area, tcmNames, techRows, vendorRows, initiativeRows] = await Promise.all([
        admin.from('contractors').select('full_name').eq('id', card.contractor_id).maybeSingle(),
        admin.from('clients').select('name').eq('id', card.client_id).maybeSingle(),
        card.client_area_id
            ? admin.from('client_areas').select('name').eq('id', card.client_area_id).maybeSingle()
            : Promise.resolve({ data: null }),
        loadProfileNames(admin, [card.tcm_id]),
        admin.from('tech_interview_card_technologies').select('technology_id').eq('card_id', cardId),
        admin.from('tech_interview_card_vendors').select('vendor_id').eq('card_id', cardId),
        admin.from('tech_interview_card_initiatives').select('*').eq('card_id', cardId),
    ])

    const techIds = ((techRows.data ?? []) as Array<{ technology_id: string }>).map((t) => t.technology_id)
    const vendorIds = ((vendorRows.data ?? []) as Array<{ vendor_id: string }>).map((v) => v.vendor_id)

    const [techs, vendors] = await Promise.all([
        techIds.length > 0
            ? admin.from('technologies').select('id, name').in('id', techIds)
            : Promise.resolve({ data: [] }),
        vendorIds.length > 0
            ? admin.from('vendors').select('id, name').in('id', vendorIds)
            : Promise.resolve({ data: [] }),
    ])

    return {
        card,
        contractorName: (contractor.data as { full_name?: string } | null)?.full_name ?? '—',
        clientName: (client.data as { name?: string } | null)?.name ?? '—',
        areaName: (area.data as { name?: string } | null)?.name ?? null,
        tcmName: card.tcm_id ? (tcmNames.get(card.tcm_id) ?? null) : null,
        technologies: ((techs.data ?? []) as Array<{ id: string; name: string }>).sort((a, b) =>
            a.name.localeCompare(b.name, 'pl'),
        ),
        vendors: ((vendors.data ?? []) as Array<{ id: string; name: string }>).sort((a, b) =>
            a.name.localeCompare(b.name, 'pl'),
        ),
        initiatives: (initiativeRows.data ?? []) as CardInitiativeRow[],
    }
}

// ─── Widok „przed rozmową" ──────────────────────────────────────────────────

/**
 * Brief przed rozmową: przydzielony blok (liczony CZYSTO — bez zapisu w renderze,
 * audyt P1.8), prefill klienta z kanonizacją Phase 42a i „co już wiemy" — wspólna
 * oś czasu kart wywiadów ORAZ logu rozmów opieki, żeby nie pytać drugi raz o to samo.
 */
export async function getPreInterviewBrief(contractorId: string): Promise<PreInterviewBrief> {
    await requireLifecycleManagerAction()
    if (!contractorId) throw new Error('Brak id konsultanta.')
    const admin = createServiceClient()

    const { data: contractorData, error } = await admin
        .from('contractors')
        .select('id, full_name, current_client, current_position, owner_tcm_id')
        .eq('id', contractorId)
        .maybeSingle()
    if (error) throw new Error(`Błąd pobierania konsultanta: ${error.message}`)
    if (!contractorData) throw new Error('Konsultant nie istnieje.')
    const contractor = contractorData as {
        id: string
        full_name: string
        current_client: string | null
        current_position: string | null
        owner_tcm_id: string | null
    }

    const todayISO = warsawDate(new Date())

    const [cardsRes, conversations, ownerNames] = await Promise.all([
        admin
            .from('tech_interview_cards')
            .select('*')
            .eq('contractor_id', contractorId)
            .order('interview_date', { ascending: false })
            .limit(30),
        listConversations({ contractorId, limit: 10 }),
        loadProfileNames(admin, [contractor.owner_tcm_id]),
    ])

    const cards = (cardsRes.data ?? []) as TechInterviewCardRow[]
    // Karty są posortowane malejąco po dacie — pierwsza to najnowsza.
    const latestCardRow = cards[0] ?? null
    const latestFinal = cards.find((c) => !c.is_draft)

    // Prefill klienta: kanonizacja current_client → dopasowanie do słownika clients.
    let matchedClientId: string | null = null
    let matchedClientName: string | null = null
    const canonical = normalizeClientName(contractor.current_client)
    if (canonical) {
        const { data: match } = await admin
            .from('clients')
            .select('id, name')
            .ilike('name', canonical)
            .limit(1)
            .maybeSingle()
        if (match) {
            matchedClientId = (match as { id: string }).id
            matchedClientName = (match as { name: string }).name
        }
    }

    const timeline: BriefTimelineEntry[] = [
        ...cards.map<BriefTimelineEntry>((c) => ({
            kind: 'card',
            id: c.id,
            date: c.interview_date,
            label: 'Karta',
            summary:
                c.memorable_quote?.trim() ||
                (c.status ? INTERVIEW_CARD_STATUS_PL[c.status] : 'Wersja robocza'),
            status: c.is_draft ? 'draft' : c.status,
        })),
        ...conversations.map<BriefTimelineEntry>((conv) => ({
            kind: 'conversation',
            id: conv.id,
            date: conv.conversation_date,
            label: CONVERSATION_CATEGORY_PL[conv.category],
            summary: (conv.note ?? '').trim() || '—',
            status: conv.status,
        })),
    ]
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 12)

    return {
        contractor: {
            id: contractor.id,
            fullName: contractor.full_name,
            currentClient: contractor.current_client,
            currentPosition: contractor.current_position,
            ownerTcmName: contractor.owner_tcm_id
                ? (ownerNames.get(contractor.owner_tcm_id) ?? null)
                : null,
        },
        matchedClientId,
        matchedClientName,
        latestCard: latestCardRow
            ? { id: latestCardRow.id, interviewDate: latestCardRow.interview_date, isDraft: latestCardRow.is_draft }
            : null,
        timeline,
        daysSinceLastCard: latestFinal ? daysBetween(latestFinal.interview_date, todayISO) : null,
    }
}

// ─── Etap 2: karta klienta (agregaty) ───────────────────────────────────────

export interface ClientTechMapResult {
    client: { id: string; name: string }
    map: ClientTechMap
}

/**
 * Zagregowana mapa technologiczna klienta — WYŁĄCZNIE z kart sfinalizowanych
 * (drafty to notatki w toku, nie wiedza o kliencie).
 *
 * PRYWATNOŚĆ: wynik nie zawiera nazwisk konsultantów ani id kart — agregacja
 * (lib/tech-map/aggregation.ts) zwraca liczby, daty i nazwy słownikowe. Nazwiska
 * widać tylko na pojedynczej karcie. Dzięki temu widok jest gotowy pod przyszły
 * read-only dostęp sprzedaży (Etap 3) bez zmian w kształcie danych.
 */
export async function getClientTechMap(clientId: string): Promise<ClientTechMapResult> {
    // Guard szerszy niż reszta modułu: dopuszcza też rolę „sprzedaż"
    // (can_view_tech_map) — to jedyny widok read-only bez nazwisk konsultantów.
    await requireTechMapViewerAction()
    if (!clientId) throw new Error('Brak id klienta.')
    const admin = createServiceClient()

    const { data: clientRow, error: clientError } = await admin
        .from('clients')
        .select('id, name')
        .eq('id', clientId)
        .maybeSingle()
    if (clientError) throw new Error(`Błąd pobierania klienta: ${clientError.message}`)
    if (!clientRow) throw new Error('Klient nie istnieje.')

    const [cardsRes, areasRes] = await Promise.all([
        admin
            .from('tech_interview_cards')
            // Jeden literał, bez konkatenacji — supabase-js wnioskuje typ wiersza
            // z treści select() na poziomie typów; sklejanie `+` to psuje.
            .select('id, client_area_id, interview_date, hiring, hiring_roles, hiring_source, project_end_month, project_end_year, project_end_unknown, tech_old_new, vendors_note, memorable_quote, team_size, team_externals')
            .eq('client_id', clientId)
            .eq('is_draft', false)
            .order('interview_date', { ascending: false }),
        admin.from('client_areas').select('id, name').eq('client_id', clientId).order('name'),
    ])
    if (cardsRes.error) throw new Error(`Błąd pobierania kart: ${cardsRes.error.message}`)

    const cards = (cardsRes.data ?? []) as AggCard[]
    const areas = ((areasRes.data ?? []) as Array<{ id: string; name: string }>).map((a) => ({
        id: a.id,
        name: a.name,
    }))
    const cardIds = cards.map((c) => c.id)

    // Puste `in()` w PostgREST zwraca pustą listę, ale zapytania i tak pomijamy.
    const [techLinksRes, vendorLinksRes, initiativesRes] = await Promise.all([
        cardIds.length > 0
            ? admin.from('tech_interview_card_technologies').select('card_id, technology_id').in('card_id', cardIds)
            : Promise.resolve({ data: [], error: null }),
        cardIds.length > 0
            ? admin.from('tech_interview_card_vendors').select('card_id, vendor_id').in('card_id', cardIds)
            : Promise.resolve({ data: [], error: null }),
        cardIds.length > 0
            ? admin
                  .from('tech_interview_card_initiatives')
                  .select('card_id, name, kind, priority')
                  .in('card_id', cardIds)
            : Promise.resolve({ data: [], error: null }),
    ])

    const techLinks: AggLink[] = (
        (techLinksRes.data ?? []) as Array<{ card_id: string; technology_id: string }>
    ).map((r) => ({ card_id: r.card_id, ref_id: r.technology_id }))
    const vendorLinks: AggLink[] = (
        (vendorLinksRes.data ?? []) as Array<{ card_id: string; vendor_id: string }>
    ).map((r) => ({ card_id: r.card_id, ref_id: r.vendor_id }))
    const initiatives = (initiativesRes.data ?? []) as AggInitiative[]

    // Nazwy pozycji słownikowych tylko dla realnie użytych id.
    const techIds = Array.from(new Set(techLinks.map((l) => l.ref_id)))
    const vendorIds = Array.from(new Set(vendorLinks.map((l) => l.ref_id)))
    const [techDict, vendorDict] = await Promise.all([
        techIds.length > 0
            ? admin.from('technologies').select('id, name').in('id', techIds)
            : Promise.resolve({ data: [] }),
        vendorIds.length > 0
            ? admin.from('vendors').select('id, name').in('id', vendorIds)
            : Promise.resolve({ data: [] }),
    ])

    const map = buildClientTechMap({
        cards,
        areas,
        technologies: (techDict.data ?? []) as Array<{ id: string; name: string }>,
        vendors: (vendorDict.data ?? []) as Array<{ id: string; name: string }>,
        techLinks,
        vendorLinks,
        initiatives,
        todayISO: warsawDate(new Date()),
    })

    return { client: clientRow as { id: string; name: string }, map }
}

/** Klienci z co najmniej jedną sfinalizowaną kartą — wejście do kart klientów. */
export async function listClientsWithCards(): Promise<
    Array<{ id: string; name: string; cards: number; lastInterviewDate: string }>
> {
    await requireLifecycleManagerAction()
    const admin = createServiceClient()

    const { data, error } = await admin
        .from('tech_interview_cards')
        .select('client_id, interview_date')
        .eq('is_draft', false)
    if (error) throw new Error(`Błąd pobierania kart: ${error.message}`)

    const rows = (data ?? []) as Array<{ client_id: string; interview_date: string }>
    const acc = new Map<string, { cards: number; last: string }>()
    for (const r of rows) {
        const existing = acc.get(r.client_id)
        if (existing) {
            existing.cards += 1
            if (r.interview_date > existing.last) existing.last = r.interview_date
        } else {
            acc.set(r.client_id, { cards: 1, last: r.interview_date })
        }
    }
    if (acc.size === 0) return []

    const { data: clientRows } = await admin
        .from('clients')
        .select('id, name')
        .in('id', Array.from(acc.keys()))
    const names = new Map(
        ((clientRows ?? []) as Array<{ id: string; name: string }>).map((c) => [c.id, c.name]),
    )

    return Array.from(acc, ([id, v]) => ({
        id,
        name: names.get(id) ?? '—',
        cards: v.cards,
        lastInterviewDate: v.last,
    })).sort((a, b) => b.lastInterviewDate.localeCompare(a.lastInterviewDate))
}

// ─── Etap 3: KPI mapy technologicznej (zakładka Analityka) ──────────────────

export interface TechMapKpiResult {
    totalFinalized: number
    cardsLast7dTotal: number
    cardsLast7dByTcm: Array<{ tcmName: string; count: number }>
    areaCoverage: { total: number; fresh: number; pct: number | null }
    activeDemandSignals: number
    projectEndsWithin90: number
}

/** KPI: aktywność prowadzących, świeżość pokrycia, popyt, końce projektów. */
export async function getTechMapKpi(): Promise<TechMapKpiResult> {
    await requireLifecycleManagerAction()
    const admin = createServiceClient()

    const [cardsRes, areasRes] = await Promise.all([
        admin
            .from('tech_interview_cards')
            .select('tcm_id, finalized_at, interview_date, client_area_id, contractor_id, hiring, project_end_month, project_end_year')
            .eq('is_draft', false),
        admin.from('client_areas').select('id'),
    ])
    if (cardsRes.error) throw new Error(`Błąd pobierania kart: ${cardsRes.error.message}`)

    const rows = (cardsRes.data ?? []) as Array<{
        tcm_id: string | null
        finalized_at: string | null
        interview_date: string
        client_area_id: string | null
        contractor_id: string
        hiring: boolean | null
        project_end_month: number | null
        project_end_year: number | null
    }>

    const kpi = buildTechMapKpi({
        cards: rows.map((r) => ({
            tcmId: r.tcm_id,
            finalizedAt: r.finalized_at,
            interviewDate: r.interview_date,
            clientAreaId: r.client_area_id,
            contractorId: r.contractor_id,
            hiring: r.hiring,
            projectEndMonth: r.project_end_month,
            projectEndYear: r.project_end_year,
        })),
        totalAreas: (areasRes.data ?? []).length,
        todayISO: warsawDate(new Date()),
    })

    const tcmNames = await loadProfileNames(admin, kpi.cardsLast7dByTcm.map((t) => t.tcmId))
    return {
        totalFinalized: kpi.totalFinalized,
        cardsLast7dTotal: kpi.cardsLast7dTotal,
        cardsLast7dByTcm: kpi.cardsLast7dByTcm.map((t) => ({
            tcmName: tcmNames.get(t.tcmId) ?? '—',
            count: t.count,
        })),
        areaCoverage: kpi.areaCoverage,
        activeDemandSignals: kpi.activeDemandSignals,
        projectEndsWithin90: kpi.projectEndsWithin90,
    }
}

// ─── Etap 3: konfiguracja odbiorców alertów (admin) ─────────────────────────

export interface AlertRecipientsConfig {
    demandCsv: string
    projectEndCsv: string
}

/** Aktualna konfiguracja odbiorców alertów + lista TCM/admin do wyboru. */
export async function getAlertRecipientsConfig(): Promise<{
    config: AlertRecipientsConfig
    candidates: Array<{ id: string; fullName: string; role: string }>
}> {
    const ctx = await requireLifecycleManagerAction()
    requireAdmin(ctx)
    const admin = createServiceClient()

    const [demand, projectEnd, candidatesRes] = await Promise.all([
        admin.from('system_settings').select('value').eq('key', DEMAND_RECIPIENTS_KEY).maybeSingle(),
        admin.from('system_settings').select('value').eq('key', PROJECT_END_RECIPIENTS_KEY).maybeSingle(),
        admin
            .from('profiles')
            .select('id, full_name, role')
            .in('role', ['admin', 'talent_community', 'finanse', 'manager'])
            .neq('employment_status', 'exited')
            .order('full_name'),
    ])

    return {
        config: {
            demandCsv: (demand.data as { value?: string } | null)?.value ?? '',
            projectEndCsv: (projectEnd.data as { value?: string } | null)?.value ?? '',
        },
        candidates: ((candidatesRes.data ?? []) as Array<{ id: string; full_name: string; role: string }>).map(
            (p) => ({ id: p.id, fullName: p.full_name, role: p.role }),
        ),
    }
}

/** Zapis listy odbiorców (CSV UUID) do system_settings. Admin only. */
export async function setAlertRecipients(
    kind: 'demand' | 'project_end',
    userIds: string[],
): Promise<ActionResult<void>> {
    return runAction('setAlertRecipients', async () => {
        const ctx = await requireLifecycleManagerAction()
        requireAdmin(ctx)
        const key = kind === 'demand' ? DEMAND_RECIPIENTS_KEY : PROJECT_END_RECIPIENTS_KEY
        const csv = parseRecipientCsv(userIds.join(','))

        const admin = createServiceClient()
        const { error } = await admin
            .from('system_settings')
            .upsert({ key, value: csv.join(','), updated_at: new Date().toISOString(), updated_by: ctx.userId }, {
                onConflict: 'key',
            })
        if (error) throw new Error(`Błąd zapisu odbiorców: ${error.message}`)
        await logAudit(ctx.userId, 'TECH_DICT_UPDATED', {
            kind: `alert_recipients_${kind}`,
            count: csv.length,
        })
        revalidatePath(HUB)
    })
}
