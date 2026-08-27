'use server'

// Phase 28 — Placementy: server actions (Excel import preview/commit, aliases, listing).
// Authorization: admin or manager (requireBonusProposerAction). Writes use the service
// client after the guard — the action is the trusted write path; RLS is defense-in-depth.

import { revalidatePath } from 'next/cache'
import { requireBonusProposerAction } from '@/lib/auth/internal-guard'
import { createServiceClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/actions/audit'
import { sendBonusAssigned, sendBonusCancelled } from '@/lib/email'
import { sendPushToUserId } from '@/lib/push/dispatch'
import { differenceInCalendarDays } from 'date-fns'
import {
    bonusPeriodFromEligibleDate,
    defaultDlBonusReason,
    defaultRecruiterBonusReason,
    normalizePersonName,
    placementNaturalKey,
    type CommitImportResult,
    type ConfirmPlacementHoursOverrides,
    type PlacementBonusOverride,
    type PlacementImportPreview,
    type PlacementReviewRow,
    type PlacementRow,
    type PlacementWithBonusStatus,
} from '@/lib/types/placement'
import {
    BONUS_MAX_AMOUNT,
    BONUS_MIN_AMOUNT,
    BONUS_NOTES_MAX_LENGTH,
    BONUS_REASON_MAX_LENGTH,
    BONUS_REASON_MIN_LENGTH,
    type BonusStatus,
} from '@/lib/types/bonus'
import { parsePlacementsWorkbook } from '@/lib/placements/parse-xlsx'
import {
    buildPeopleResolutions,
    classifyRow,
    computeBonusFields,
    findDisappeared,
    marginMismatch,
    type ExistingPlacementKey,
    type ProfileLite,
} from '@/lib/placements/import'
import { ensureContractors } from '@/lib/contractors/import-core'
import { excludeExited } from '@/lib/hr/employment-window'
import { ExpectedError, runAction, type ActionResult } from '@/lib/actions/action-result'

type ServiceClient = ReturnType<typeof createServiceClient>

const EXISTING_KEY_COLUMNS =
    'id, consultant_name, client_name, start_date, cost_rate, revenue_rate, position, delivery_lead_raw, recruiter_raw'

async function fileFromForm(formData: FormData): Promise<ArrayBuffer> {
    const file = formData.get('file')
    if (!file || typeof file === 'string') {
        throw new Error('Brak pliku. Załącz plik .xlsx.')
    }
    const f = file as File
    if (f.size === 0) throw new Error('Plik jest pusty.')
    if (f.size > 10 * 1024 * 1024) throw new Error('Plik za duży (max 10 MB).')
    return await f.arrayBuffer()
}

async function loadProfilesForMatching(admin: ServiceClient): Promise<ProfileLite[]> {
    const { data } = await excludeExited(
        admin
            .from('profiles')
            .select('id, full_name, role')
            .not('full_name', 'is', null),
    )
    return ((data ?? []) as ProfileLite[]).filter((p) => (p.full_name ?? '').trim().length > 0)
}

async function loadAliasMap(admin: ServiceClient): Promise<Map<string, string>> {
    const { data } = await admin.from('placement_person_aliases').select('raw_name_norm, profile_id')
    const map = new Map<string, string>()
    for (const a of (data ?? []) as Array<{ raw_name_norm: string; profile_id: string }>) {
        map.set(a.raw_name_norm, a.profile_id)
    }
    return map
}

async function loadExistingKeys(admin: ServiceClient): Promise<ExistingPlacementKey[]> {
    const { data } = await admin
        .from('placements')
        .select(EXISTING_KEY_COLUMNS)
        .neq('status', 'cancelled')
    return (data ?? []) as ExistingPlacementKey[]
}

/**
 * Parse + analyse an uploaded file WITHOUT writing anything.
 * Returns review rows (with computed bonuses + diff), distinct people to resolve, and
 * existing placements missing from the file (cumulative mode → cancellation candidates).
 */
export async function previewPlacementImport(formData: FormData): Promise<PlacementImportPreview> {
    await requireBonusProposerAction()
    const admin = createServiceClient()

    const buf = await fileFromForm(formData)
    const parsed = await parsePlacementsWorkbook(buf)

    const [profiles, aliasMap, existing] = await Promise.all([
        loadProfilesForMatching(admin),
        loadAliasMap(admin),
        loadExistingKeys(admin),
    ])
    const existingByKey = new Map<string, ExistingPlacementKey>()
    for (const e of existing) {
        existingByKey.set(placementNaturalKey(e.consultant_name, e.client_name, e.start_date), e)
    }

    const warnings = [...parsed.errors]
    const rows: PlacementReviewRow[] = []
    for (const r of parsed.rows) {
        const computed = computeBonusFields(r)
        if (marginMismatch(r, computed)) {
            warnings.push(
                `Wiersz ${r.rowNumber}: marża w pliku (${r.marginFromFile}) różni się od policzonej (${computed.marginPerHour}). Użyto policzonej ze stawek.`,
            )
        }
        const key = placementNaturalKey(r.consultantName, r.clientName, r.startDate)
        rows.push({ ...r, ...computed, naturalKey: key, diff: classifyRow(r, existingByKey.get(key)) })
    }

    const people = buildPeopleResolutions(parsed.rows, profiles, aliasMap)
    const candidates = profiles
        .map((p) => ({ id: p.id, fullName: p.full_name, role: p.role }))
        .sort((a, b) => a.fullName.localeCompare(b.fullName, 'pl'))
    const disappeared = findDisappeared(parsed.rows, existing).map((e) => ({
        id: e.id,
        consultantName: e.consultant_name,
        clientName: e.client_name,
        startDate: e.start_date,
    }))

    return {
        rows,
        people,
        candidates,
        disappeared,
        warnings,
        scannedRows: parsed.scannedRows,
        skippedBlankRows: parsed.skippedBlankRows,
    }
}

function priorityForStart(startDate: string): { priority: 'low' | 'normal' | 'high'; level: 'P1' | 'P2' | 'P3' } {
    const days = differenceInCalendarDays(new Date(startDate), new Date())
    if (days <= 14) return { priority: 'high', level: 'P1' }
    if (days <= 30) return { priority: 'normal', level: 'P2' }
    return { priority: 'low', level: 'P3' }
}

async function createTcmOnboardingTicket(
    admin: ServiceClient,
    placement: { id: string; consultant_name: string; client_name: string; position: string | null; start_date: string; delivery_lead_raw: string; recruiter_raw: string },
    importerUserId: string,
    categoryId: string,
): Promise<string | null> {
    const { priority, level } = priorityForStart(placement.start_date)
    const subject = `Onboarding placementu: ${placement.consultant_name} @ ${placement.client_name} — start ${placement.start_date}`
    const bodyMd = [
        `**Nowy placement do przygotowania onboardingu.**`,
        ``,
        `- Konsultant: ${placement.consultant_name}`,
        `- Klient: ${placement.client_name}`,
        placement.position ? `- Stanowisko: ${placement.position}` : null,
        `- Data startu: ${placement.start_date}`,
        `- Delivery Lead: ${placement.delivery_lead_raw}`,
        `- Rekruter: ${placement.recruiter_raw}`,
    ].filter(Boolean).join('\n')

    const { data: ticket, error } = await admin
        .from('support_tickets')
        .insert({ user_id: importerUserId, assignee_id: null, category_id: categoryId, subject, body_md: bodyMd, priority, status: 'open' })
        .select('id')
        .single()
    if (error || !ticket) return null
    const ticketId = (ticket as { id: string }).id

    const { error: metaErr } = await admin.from('support_inbox_meta').insert({
        ticket_id: ticketId,
        source: 'user',
        external_message_id: `placement:${placement.id}`,
        priority_level: level,
        due_date: new Date(`${placement.start_date}T00:00:00Z`).toISOString(),
        email_subject: subject,
    })
    if (metaErr) {
        await admin.from('support_tickets').delete().eq('id', ticketId)
        return null
    }
    return ticketId
}

/**
 * Re-parse the file (authoritative recompute), resolve every DL/recruiter via the supplied
 * name→profile map (rows with an unresolved person are rejected), UPSERT by natural key, and
 * create a TCM onboarding ticket per NEW placement. Optionally cancel disappeared placements.
 */
export async function commitPlacementImport(formData: FormData): Promise<CommitImportResult> {
    const ctx = await requireBonusProposerAction()
    const admin = createServiceClient()

    const buf = await fileFromForm(formData)
    const parsed = await parsePlacementsWorkbook(buf)
    if (parsed.rows.length === 0) {
        throw new Error(parsed.errors[0] ?? 'Plik nie zawiera poprawnych wierszy.')
    }

    const personMapRaw = formData.get('personMap')
    const personMap: Record<string, string> =
        typeof personMapRaw === 'string' && personMapRaw ? JSON.parse(personMapRaw) : {}
    const cancelIdsRaw = formData.get('cancelDisappeared')
    const cancelIds: string[] =
        typeof cancelIdsRaw === 'string' && cancelIdsRaw ? JSON.parse(cancelIdsRaw) : []

    // Resolve every row's people; block if any unresolved (decision 7).
    const unresolved = new Set<string>()
    for (const r of parsed.rows) {
        if (!personMap[normalizePersonName(r.deliveryLeadRaw)]) unresolved.add(r.deliveryLeadRaw.trim())
        if (!personMap[normalizePersonName(r.recruiterRaw)]) unresolved.add(r.recruiterRaw.trim())
    }
    if (unresolved.size > 0) {
        throw new Error(`Nie przypisano profilu do: ${Array.from(unresolved).join(', ')}. Domapuj wszystkie osoby przed zapisem.`)
    }

    // Persist new aliases (raw_name_norm → profile).
    const aliasRows = Object.entries(personMap).map(([raw_name_norm, profile_id]) => ({
        raw_name_norm,
        profile_id,
        created_by: ctx.userId,
    }))
    if (aliasRows.length > 0) {
        await admin.from('placement_person_aliases').upsert(aliasRows, { onConflict: 'raw_name_norm' })
    }

    const existing = await loadExistingKeys(admin)
    const existingByKey = new Map<string, ExistingPlacementKey>()
    for (const e of existing) existingByKey.set(placementNaturalKey(e.consultant_name, e.client_name, e.start_date), e)

    const { data: cat } = await admin.from('support_categories').select('id').eq('slug', 'inbox_onboarding').single()
    const categoryId = (cat as { id: string } | null)?.id ?? null

    const batchId = crypto.randomUUID()

    // Audyt 2026-08-25 (C12.1): placement MUSI wskazywać kontraktora, inaczej nie pokaże
    // się ani na jego profilu, ani w Consultant Success. Na `placements` nie ma triggera,
    // a jedyne zapełnienie FK to jednorazowy backfill Fazy 33a — 0/52 placementów z późniejszych
    // importów było podpiętych. Ten sam helper co importer Wejść/Zejść (idempotentny, sam
    // rozstrzyga wyścig o `contractors` przez unikalny indeks na lower(trim(full_name))).
    const { map: contractorMap, created: contractorsCreated } = await ensureContractors(
        admin,
        parsed.rows.map((r) => ({ fullName: r.consultantName, client: r.clientName, position: r.position })),
        ctx.userId,
        batchId,
    )

    let created = 0
    let updated = 0
    let ticketsCreated = 0
    const rowErrors: string[] = []

    for (const r of parsed.rows) {
        const computed = computeBonusFields(r)
        const key = placementNaturalKey(r.consultantName, r.clientName, r.startDate)
        const ex = existingByKey.get(key)
        const base = {
            contractor_id: contractorMap.get(normalizePersonName(r.consultantName)) ?? null,
            consultant_name: r.consultantName,
            client_name: r.clientName,
            position: r.position,
            start_date: r.startDate,
            signing_date: r.signingDate,
            delivery_lead_id: personMap[normalizePersonName(r.deliveryLeadRaw)],
            recruiter_id: personMap[normalizePersonName(r.recruiterRaw)],
            delivery_lead_raw: r.deliveryLeadRaw.trim(),
            recruiter_raw: r.recruiterRaw.trim(),
            cost_rate: r.costRate,
            revenue_rate: r.revenueRate,
            margin_per_hour: computed.marginPerHour,
            monthly_margin: computed.monthlyMargin,
            bonus_eligible_date: computed.bonusEligibleDate,
            dl_bonus_amount: computed.dlBonusAmount,
            recruiter_tier: computed.recruiterTier,
            recruiter_bonus_amount: computed.recruiterBonusAmount,
            last_import_batch_id: batchId,
            updated_at: new Date().toISOString(),
        }

        if (ex) {
            const { error: updErr } = await admin.from('placements').update(base).eq('id', ex.id)
            if (updErr) {
                rowErrors.push(`Wiersz ${r.rowNumber} (${r.consultantName} @ ${r.clientName}): UPDATE failed — ${updErr.message}`)
                continue
            }
            updated += 1
        } else {
            const { data: inserted, error: insErr } = await admin
                .from('placements')
                .insert({ ...base, status: 'upcoming', imported_by: ctx.userId })
                .select('id, consultant_name, client_name, position, start_date, delivery_lead_raw, recruiter_raw')
                .single()
            if (insErr || !inserted) {
                // Most common cause: idx_placements_natural_key collision with a cancelled
                // placement holding the same (consultant, client, start). Surface clearly so
                // the manager isn't told "Sukces!" while nothing landed in DB.
                rowErrors.push(
                    `Wiersz ${r.rowNumber} (${r.consultantName} @ ${r.clientName}, start ${r.startDate}): INSERT failed — ${insErr?.message ?? 'no row returned'}`,
                )
                continue
            }
            created += 1
            if (categoryId) {
                const ticketId = await createTcmOnboardingTicket(
                    admin,
                    inserted as {
                        id: string
                        consultant_name: string
                        client_name: string
                        position: string | null
                        start_date: string
                        delivery_lead_raw: string
                        recruiter_raw: string
                    },
                    ctx.userId,
                    categoryId,
                )
                if (ticketId) {
                    await admin.from('placements').update({ tcm_ticket_id: ticketId }).eq('id', (inserted as { id: string }).id)
                    ticketsCreated += 1
                }
            }
        }
    }

    // Optional: cancel placements the manager confirmed are gone from the file.
    let cancelled = 0
    if (cancelIds.length > 0) {
        const { count } = await admin
            .from('placements')
            .update({
                status: 'cancelled',
                cancelled_at: new Date().toISOString(),
                cancelled_by: ctx.userId,
                cancel_reason: 'Usunięty z pliku importu',
            }, { count: 'exact' })
            .in('id', cancelIds)
            .neq('status', 'bonus_confirmed')
        cancelled = count ?? 0
    }

    await logAudit(ctx.userId, 'PLACEMENTS_IMPORTED', {
        batch_id: batchId,
        created,
        updated,
        tickets: ticketsCreated,
        cancelled,
        contractors_created: contractorsCreated,
        row_errors: rowErrors.length > 0 ? rowErrors : undefined,
    })
    if (aliasRows.length > 0) {
        await logAudit(ctx.userId, 'PLACEMENT_PERSON_ALIAS_SET', { count: aliasRows.length })
    }

    revalidatePath('/internal/admin')
    revalidatePath('/internal/placements')

    // If any row failed, throw AFTER successful rows have been persisted — the manager
    // sees an error toast with the failing rows listed, but the partial progress is
    // already saved. This is safer than silently lying "Sukces!" while half the file
    // didn't land in DB.
    if (rowErrors.length > 0) {
        const summary = `Zaimportowano ${created} nowych, ${updated} zaktualizowanych. ${rowErrors.length} wierszy NIE zapisano:\n\n${rowErrors.slice(0, 10).join('\n')}${rowErrors.length > 10 ? `\n…i ${rowErrors.length - 10} więcej (zobacz audit log).` : ''}`
        throw new Error(summary)
    }

    return { created, updated, ticketsCreated, cancelled }
}

/**
 * Manager/admin: list all placements (newest first) augmented with the live status of
 * the linked DL/recruiter bonuses. The UI uses this to hide cancel buttons once a
 * placement bonus is already cancelled.
 */
export async function listPlacements(): Promise<PlacementWithBonusStatus[]> {
    await requireBonusProposerAction()
    const admin = createServiceClient()
    const { data } = await admin.from('placements').select('*').order('start_date', { ascending: false })
    const placements = (data ?? []) as PlacementRow[]

    const bonusIds = Array.from(
        new Set(
            placements
                .flatMap((p) => [p.dl_bonus_id, p.recruiter_bonus_id])
                .filter((id): id is string => Boolean(id)),
        ),
    )
    const bonusById = new Map<string, { status: BonusStatus; amount: number }>()
    if (bonusIds.length > 0) {
        const { data: bonusRows } = await admin
            .from('bonuses')
            .select('id, status, amount')
            .in('id', bonusIds)
        for (const b of (bonusRows ?? []) as Array<{ id: string; status: BonusStatus; amount: number | string }>) {
            bonusById.set(b.id, { status: b.status, amount: Number(b.amount) })
        }
    }

    return placements.map((p) => ({
        ...p,
        dl_bonus_status: p.dl_bonus_id ? bonusById.get(p.dl_bonus_id)?.status ?? null : null,
        recruiter_bonus_status: p.recruiter_bonus_id
            ? bonusById.get(p.recruiter_bonus_id)?.status ?? null
            : null,
        dl_bonus_actual_amount: p.dl_bonus_id ? bonusById.get(p.dl_bonus_id)?.amount ?? null : null,
        recruiter_bonus_actual_amount: p.recruiter_bonus_id
            ? bonusById.get(p.recruiter_bonus_id)?.amount ?? null
            : null,
    }))
}

/** DL/Recruiter self-view: own placements (RLS scopes to delivery_lead_id/recruiter_id = me). */
export async function listMyPlacements(): Promise<PlacementWithBonusStatus[]> {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Brak sesji.')
    const { data } = await supabase
        .from('placements')
        .select('*')
        .or(`delivery_lead_id.eq.${user.id},recruiter_id.eq.${user.id}`)
        .order('start_date', { ascending: false })
    const placements = (data ?? []) as PlacementRow[]
    const bonusIds = Array.from(
        new Set(
            placements
                .flatMap((p) => [p.dl_bonus_id, p.recruiter_bonus_id])
                .filter((id): id is string => Boolean(id)),
        ),
    )
    const bonusById = new Map<string, { status: BonusStatus; amount: number }>()
    if (bonusIds.length > 0) {
        const { data: bonusRows } = await supabase
            .from('bonuses')
            .select('id, status, amount')
            .in('id', bonusIds)
        for (const b of (bonusRows ?? []) as Array<{ id: string; status: BonusStatus; amount: number | string }>) {
            bonusById.set(b.id, { status: b.status, amount: Number(b.amount) })
        }
    }

    return placements.map((p) => ({
        ...p,
        dl_bonus_status: p.dl_bonus_id ? bonusById.get(p.dl_bonus_id)?.status ?? null : null,
        recruiter_bonus_status: p.recruiter_bonus_id
            ? bonusById.get(p.recruiter_bonus_id)?.status ?? null
            : null,
        dl_bonus_actual_amount: p.dl_bonus_id ? bonusById.get(p.dl_bonus_id)?.amount ?? null : null,
        recruiter_bonus_actual_amount: p.recruiter_bonus_id
            ? bonusById.get(p.recruiter_bonus_id)?.amount ?? null
            : null,
    }))
}

interface Contact {
    id: string
    full_name: string | null
    email: string | null
}

async function notifyBonusRecipient(
    recipient: Contact,
    proposerName: string,
    amount: number,
    year: number,
    month: number,
    reason: string,
    bonusId: string,
    kind: 'dl' | 'recruiter',
): Promise<void> {
    if (recipient.email) {
        await sendBonusAssigned(
            recipient.email,
            recipient.full_name ?? recipient.email,
            proposerName,
            amount,
            'PLN',
            year,
            month,
            reason,
        ).catch(() => undefined)
    }
    await sendPushToUserId(recipient.id, {
        title: 'Przyznano premię',
        body: `${amount.toLocaleString('pl-PL')} zł — ${reason}`,
        url: '/internal?tab=bonuses',
        tag: `bonus-${kind}-${bonusId}`,
    }).catch(() => undefined)
}

async function cleanupFreshPlacementBonuses(admin: ServiceClient, bonusIds: string[]): Promise<string | null> {
    if (bonusIds.length === 0) return null
    const { error } = await admin.from('bonuses').delete().in('id', bonusIds)
    return error?.message ?? null
}

/**
 * Defense-in-depth validation of a manager-supplied bonus override. The dialog validates
 * the same rules client-side; this guards the trusted write path against a crafted call.
 * NB: the period window is intentionally NOT restricted to "past 12 months" (unlike the
 * manual assignBonus form) — a placement can be confirmed early, making its eligible month
 * a future one, which is legitimate here.
 */
function validateBonusOverride(o: PlacementBonusOverride, label: string): void {
    if (!Number.isFinite(o.amount) || o.amount < BONUS_MIN_AMOUNT) {
        throw new ExpectedError(`Premia ${label}: kwota musi być >= ${BONUS_MIN_AMOUNT}.`)
    }
    if (o.amount > BONUS_MAX_AMOUNT) {
        throw new ExpectedError(`Premia ${label}: kwota za duża (max ${BONUS_MAX_AMOUNT}).`)
    }
    const reason = o.reason.trim()
    if (reason.length < BONUS_REASON_MIN_LENGTH) {
        throw new ExpectedError(`Premia ${label}: uzasadnienie min ${BONUS_REASON_MIN_LENGTH} znaki.`)
    }
    if (reason.length > BONUS_REASON_MAX_LENGTH) {
        throw new ExpectedError(`Premia ${label}: uzasadnienie max ${BONUS_REASON_MAX_LENGTH} znaków.`)
    }
    if (!Number.isInteger(o.periodMonth) || o.periodMonth < 1 || o.periodMonth > 12) {
        throw new ExpectedError(`Premia ${label}: nieprawidłowy miesiąc premii.`)
    }
    if (!Number.isInteger(o.periodYear) || o.periodYear < 2020 || o.periodYear > 2100) {
        throw new ExpectedError(`Premia ${label}: nieprawidłowy rok premii.`)
    }
    if (o.notes != null && o.notes.trim().length > BONUS_NOTES_MAX_LENGTH) {
        throw new ExpectedError(`Premia ${label}: notatka za długa (max ${BONUS_NOTES_MAX_LENGTH} znaków).`)
    }
}

/**
 * Confirm a placement's consultant worked 168h → generate the selected DL/recruiter bonuses
 * (status 'assigned'), link them on the placement, notify recipients. Idempotent: a placement
 * already marked `bonus_confirmed` is rejected, including when one side was intentionally skipped.
 *
 * `overrides` lets the manager edit amount/reason/period/notes for each bonus in a
 * pre-filled dialog BEFORE generation + notification. When a side is omitted the computed
 * defaults are used (legacy behaviour); an explicit `null` means that recipient's bonus is
 * intentionally skipped. Category-specific columns (candidate, margins, tier) always come
 * from the placement — the manager tunes the payout, not the provenance.
 */
async function confirmPlacementHoursBody(
    placementId: string,
    overrides?: ConfirmPlacementHoursOverrides,
): Promise<void> {
    const ctx = await requireBonusProposerAction()
    const admin = createServiceClient()

    const generateDlBonus = overrides?.dl !== null
    const generateRecruiterBonus = overrides?.recruiter !== null

    if (overrides?.dl) validateBonusOverride(overrides.dl, 'DL')
    if (overrides?.recruiter) validateBonusOverride(overrides.recruiter, 'rekrutera')

    const { data: pRaw, error: placementLoadError } = await admin
        .from('placements')
        .select('*')
        .eq('id', placementId)
        .maybeSingle()
    if (placementLoadError) {
        throw new Error(`Nie udało się pobrać placementu: ${placementLoadError.message}`)
    }
    if (!pRaw) throw new ExpectedError('Placement nie znaleziony.')
    const p = pRaw as PlacementRow
    if (p.status === 'cancelled') throw new ExpectedError('Placement jest anulowany.')
    // A confirmed placement is terminal for this action. This also prevents an old client
    // (which sends no explicit selections) from generating a bonus that was intentionally
    // skipped during the original confirmation.
    if (p.status === 'bonus_confirmed') {
        throw new ExpectedError('168h zostało już potwierdzone. Odśwież listę placementów.')
    }
    if (!generateDlBonus && !generateRecruiterBonus) {
        throw new ExpectedError('Wybierz co najmniej jedną premię do naliczenia.')
    }

    const { year: defYear, month: defMonth } = bonusPeriodFromEligibleDate(p.bonus_eligible_date)

    // Computed defaults (also used below to decide whether the manager actually changed
    // anything, so the audit's `edited` flag is truthful rather than just "went via dialog").
    const dlDefaultAmount = Number(p.dl_bonus_amount)
    const recDefaultAmount = Number(p.recruiter_bonus_amount)
    const dlDefaultReason = defaultDlBonusReason(p.consultant_name, p.client_name, Number(p.monthly_margin))
    const recDefaultReason = defaultRecruiterBonusReason(
        p.consultant_name,
        p.client_name,
        p.recruiter_tier,
        Number(p.margin_per_hour),
    )

    // Effective (edited-or-default) values per bonus, resolved once so they feed the INSERT,
    // the notification, and the audit log consistently.
    const dlAmount = overrides?.dl ? overrides.dl.amount : dlDefaultAmount
    const dlReason = overrides?.dl ? overrides.dl.reason.trim() : dlDefaultReason
    const dlYear = overrides?.dl ? overrides.dl.periodYear : defYear
    const dlMonth = overrides?.dl ? overrides.dl.periodMonth : defMonth
    const dlNotes = overrides?.dl?.notes?.trim() || null

    const recAmount = overrides?.recruiter ? overrides.recruiter.amount : recDefaultAmount
    const recReason = overrides?.recruiter ? overrides.recruiter.reason.trim() : recDefaultReason
    const recYear = overrides?.recruiter ? overrides.recruiter.periodYear : defYear
    const recMonth = overrides?.recruiter ? overrides.recruiter.periodMonth : defMonth
    const recNotes = overrides?.recruiter?.notes?.trim() || null

    // Did the manager actually change a value vs. the computed default? (A click-through of
    // the pre-filled dialog is NOT an edit; adding an internal note counts as one.)
    const dlEdited =
        generateDlBonus &&
        (dlAmount !== dlDefaultAmount ||
            dlReason !== dlDefaultReason ||
            dlYear !== defYear ||
            dlMonth !== defMonth ||
            dlNotes !== null)
    const recEdited =
        generateRecruiterBonus &&
        (recAmount !== recDefaultAmount ||
            recReason !== recDefaultReason ||
            recYear !== defYear ||
            recMonth !== defMonth ||
            recNotes !== null)

    const { data: peopleRaw } = await admin
        .from('profiles')
        .select('id, full_name, email')
        .in('id', [p.delivery_lead_id, p.recruiter_id])
    const people = (peopleRaw ?? []) as Contact[]
    const dl = people.find((x) => x.id === p.delivery_lead_id) ?? null
    const rec = people.find((x) => x.id === p.recruiter_id) ?? null
    const { data: proposerRow } = await admin.from('profiles').select('full_name').eq('id', ctx.userId).single()
    const proposerName = (proposerRow as { full_name: string | null } | null)?.full_name ?? 'Manager'

    let dlBonusId = p.dl_bonus_id
    let createdDlBonusId: string | null = null
    if (generateDlBonus && !dlBonusId) {
        const { data: b, error } = await admin
            .from('bonuses')
            .insert({
                recipient_user_id: p.delivery_lead_id,
                proposed_by: ctx.userId,
                amount: dlAmount,
                currency: 'PLN',
                reason: dlReason,
                notes: dlNotes,
                status: 'assigned',
                period_year: dlYear,
                period_month: dlMonth,
                category: 'delivery_lead',
                client_name: p.client_name,
                delivery_candidate_name: p.consultant_name,
                delivery_margin_amount: Number(p.monthly_margin),
                delivery_margin_percent: 10,
            })
            .select('id')
            .single()
        if (error || !b) throw new Error(`Nie udało się utworzyć premii DL: ${error?.message ?? 'unknown'}`)
        dlBonusId = (b as { id: string }).id
        createdDlBonusId = dlBonusId
    }

    let recBonusId = p.recruiter_bonus_id
    let createdRecruiterBonusId: string | null = null
    if (generateRecruiterBonus && !recBonusId) {
        const { data: b, error } = await admin
            .from('bonuses')
            .insert({
                recipient_user_id: p.recruiter_id,
                proposed_by: ctx.userId,
                amount: recAmount,
                currency: 'PLN',
                reason: recReason,
                notes: recNotes,
                status: 'assigned',
                period_year: recYear,
                period_month: recMonth,
                category: 'recruiter',
                client_name: p.client_name,
                recruiter_margin_per_hour: Number(p.margin_per_hour),
                recruiter_candidate_name: p.consultant_name,
                recruiter_calculated_tier: p.recruiter_tier,
            })
            .select('id')
            .single()
        if (error || !b) {
            const primaryError = `Nie udało się utworzyć premii rekrutera: ${error?.message ?? 'unknown'}`
            const cleanupError = await cleanupFreshPlacementBonuses(
                admin,
                createdDlBonusId ? [createdDlBonusId] : [],
            )
            if (cleanupError) {
                throw new Error(`${primaryError}. Nie udało się też wycofać premii DL: ${cleanupError}`)
            }
            throw new Error(primaryError)
        }
        recBonusId = (b as { id: string }).id
        createdRecruiterBonusId = recBonusId
    }

    const { data: confirmedPlacement, error: placementUpdateError } = await admin
        .from('placements')
        .update({
            status: 'bonus_confirmed',
            hours_confirmed_at: new Date().toISOString(),
            hours_confirmed_by: ctx.userId,
            dl_bonus_id: dlBonusId,
            recruiter_bonus_id: recBonusId,
            updated_at: new Date().toISOString(),
        })
        .eq('id', placementId)
        .in('status', ['upcoming', 'started'])
        .select('id')
        .maybeSingle()
    if (placementUpdateError || !confirmedPlacement) {
        const createdBonusIds = [createdDlBonusId, createdRecruiterBonusId].filter(
            (id): id is string => id !== null,
        )
        const cleanupError = await cleanupFreshPlacementBonuses(admin, createdBonusIds)
        const primaryError = placementUpdateError
            ? `Nie udało się powiązać premii z placementem: ${placementUpdateError.message}`
            : '168h zostało już potwierdzone przez inną osobę. Odśwież listę placementów.'
        if (cleanupError) {
            throw new Error(`${primaryError} Nie udało się wycofać nowych premii: ${cleanupError}`)
        }
        if (placementUpdateError) throw new Error(primaryError)
        throw new ExpectedError(primaryError)
    }

    // Notify only after the placement links are safely persisted. A failed write therefore
    // cannot announce a bonus that the UI would not be able to find afterwards.
    if (createdDlBonusId && dl) {
        await notifyBonusRecipient(dl, proposerName, dlAmount, dlYear, dlMonth, dlReason, createdDlBonusId, 'dl')
    }
    if (createdRecruiterBonusId && rec) {
        await notifyBonusRecipient(
            rec,
            proposerName,
            recAmount,
            recYear,
            recMonth,
            recReason,
            createdRecruiterBonusId,
            'recruiter',
        )
    }

    await logAudit(ctx.userId, 'PLACEMENT_HOURS_CONFIRMED', { placement_id: placementId })
    await logAudit(ctx.userId, 'PLACEMENT_BONUSES_GENERATED', {
        placement_id: placementId,
        dl_bonus_id: dlBonusId,
        recruiter_bonus_id: recBonusId,
        edited: dlEdited || recEdited,
        dl: generateDlBonus
            ? { amount: dlAmount, period_year: dlYear, period_month: dlMonth, edited: dlEdited }
            : { skipped: true },
        recruiter: generateRecruiterBonus
            ? { amount: recAmount, period_year: recYear, period_month: recMonth, edited: recEdited }
            : { skipped: true },
    })

    revalidatePath('/internal/admin')
    revalidatePath('/internal/placements')
    revalidatePath('/internal')
}

export async function confirmPlacementHours(
    placementId: string,
    overrides?: ConfirmPlacementHoursOverrides,
): Promise<ActionResult<void>> {
    return runAction('confirmPlacementHours', () => confirmPlacementHoursBody(placementId, overrides))
}

/**
 * Hard-delete one of the two bonuses linked to a placement (DL or recruiter). The
 * `bonuses` row is removed from the DB; the FK from placements is `ON DELETE SET NULL`,
 * so the link disappears automatically. If both linked bonuses end up NULL, the
 * placement is reverted to `started` so the manager can re-click 168h with updated
 * numbers (e.g. after rate corrections). A snapshot is preserved in audit_log even
 * though the bonus row is gone.
 *
 * Notifies the recipient (email + push) only if the bonus was still active —
 * legacy `cancelled` rows from the soft-cancel iteration are purged silently.
 *
 * Blocked when the bonus is already paid or linked to an invoice (payment trail must
 * stay intact).
 */
export async function deletePlacementBonus(input: {
    placementId: string
    bonusKind: 'dl' | 'recruiter'
    deletionReason: string
}): Promise<void> {
    const ctx = await requireBonusProposerAction()
    const admin = createServiceClient()

    const reason = (input.deletionReason ?? '').trim()
    if (reason.length < 3) throw new Error('Powód usunięcia musi mieć co najmniej 3 znaki.')
    if (reason.length > 500) throw new Error('Powód usunięcia za długi (max 500 znaków).')

    const { data: pRaw } = await admin
        .from('placements')
        .select('id, status, dl_bonus_id, recruiter_bonus_id, consultant_name, client_name')
        .eq('id', input.placementId)
        .single()
    if (!pRaw) throw new Error('Placement nie znaleziony.')
    const p = pRaw as {
        id: string
        status: string
        dl_bonus_id: string | null
        recruiter_bonus_id: string | null
        consultant_name: string
        client_name: string
    }

    const bonusId = input.bonusKind === 'dl' ? p.dl_bonus_id : p.recruiter_bonus_id
    const label = input.bonusKind === 'dl' ? 'DL' : 'rekrutera'
    if (!bonusId) {
        throw new Error(`Premia ${label} nie istnieje dla tego placementu.`)
    }

    const { data: bRaw } = await admin
        .from('bonuses')
        .select('id, recipient_user_id, proposed_by, amount, currency, reason, status, period_year, period_month, linked_invoice_id')
        .eq('id', bonusId)
        .single()
    if (!bRaw) {
        // Bonus already gone — make sure the placement link is null and we're done.
        await admin
            .from('placements')
            .update({
                ...(input.bonusKind === 'dl' ? { dl_bonus_id: null } : { recruiter_bonus_id: null }),
                updated_at: new Date().toISOString(),
            })
            .eq('id', input.placementId)
        revalidatePath('/internal/admin')
        revalidatePath('/internal/placements')
        return
    }
    const b = bRaw as {
        id: string
        recipient_user_id: string
        proposed_by: string
        amount: number | string
        currency: string
        reason: string
        status: 'assigned' | 'pending' | 'paid' | 'cancelled'
        period_year: number | null
        period_month: number | null
        linked_invoice_id: string | null
    }

    if (b.status === 'paid') {
        throw new Error('Nie można usunąć wypłaconej premii.')
    }
    if (b.linked_invoice_id) {
        throw new Error('Premia jest podlinkowana do faktury — najpierw odlinkuj fakturę.')
    }

    // Authorization: admin, proposer, or manager of recipient. Mirrors cancelBonus.
    const { data: recipProfile } = await admin
        .from('profiles')
        .select('id, full_name, email, manager_id')
        .eq('id', b.recipient_user_id)
        .single()
    const recip = recipProfile as
        | { id: string; full_name: string | null; email: string | null; manager_id: string | null }
        | null
    if (!ctx.isAdmin && b.proposed_by !== ctx.userId && recip?.manager_id !== ctx.userId) {
        throw new Error('Możesz usuwać tylko premie swoich podwładnych lub te, które sam wystawiłeś.')
    }

    const { error: delErr } = await admin.from('bonuses').delete().eq('id', bonusId)
    if (delErr) throw new Error(`Nie udało się usunąć premii: ${delErr.message}`)

    // FK ON DELETE SET NULL already nulled the placement link; check if both are null now.
    const { data: pAfterRaw } = await admin
        .from('placements')
        .select('dl_bonus_id, recruiter_bonus_id, status')
        .eq('id', input.placementId)
        .single()
    const pAfter = pAfterRaw as
        | { dl_bonus_id: string | null; recruiter_bonus_id: string | null; status: string }
        | null

    let revertedToStarted = false
    if (
        pAfter &&
        pAfter.dl_bonus_id === null &&
        pAfter.recruiter_bonus_id === null &&
        pAfter.status === 'bonus_confirmed'
    ) {
        await admin
            .from('placements')
            .update({
                status: 'started',
                hours_confirmed_at: null,
                hours_confirmed_by: null,
                updated_at: new Date().toISOString(),
            })
            .eq('id', input.placementId)
        revertedToStarted = true
    }

    await logAudit(ctx.userId, 'PLACEMENT_BONUS_DELETED', {
        placement_id: p.id,
        bonus_id: bonusId,
        bonus_kind: input.bonusKind,
        recipient_user_id: b.recipient_user_id,
        amount: Number(b.amount),
        currency: b.currency,
        bonus_reason: b.reason,
        previous_status: b.status,
        period_year: b.period_year,
        period_month: b.period_month,
        consultant_name: p.consultant_name,
        client_name: p.client_name,
        deletion_reason: reason,
        placement_reverted_to_started: revertedToStarted,
    })

    // Notify the recipient only if the bonus was still active. Legacy rows that were
    // already in `cancelled` from the soft-cancel iteration already got their email.
    if (b.status !== 'cancelled' && recip?.email) {
        const { data: proposerRow } = await admin
            .from('profiles')
            .select('full_name')
            .eq('id', ctx.userId)
            .single()
        const proposerName = (proposerRow as { full_name: string | null } | null)?.full_name ?? 'Manager'
        await sendBonusCancelled(
            recip.email,
            recip.full_name ?? recip.email,
            proposerName,
            Number(b.amount),
            b.currency,
            reason,
        ).catch(() => undefined)
        await sendPushToUserId(b.recipient_user_id, {
            title: 'Anulowano premię',
            body: `${Number(b.amount).toLocaleString('pl-PL')} zł — ${reason}`,
            url: '/internal?tab=bonuses',
            tag: `bonus-deleted-${bonusId}`,
        }).catch(() => undefined)
    }

    revalidatePath('/internal/admin')
    revalidatePath('/internal/placements')
    revalidatePath('/internal')
}

/** Cancel a placement (only before bonuses are generated). */
export async function cancelPlacement(placementId: string, reason: string): Promise<void> {
    const ctx = await requireBonusProposerAction()
    const admin = createServiceClient()
    const { data: p } = await admin.from('placements').select('status').eq('id', placementId).single()
    if (!p) throw new Error('Placement nie znaleziony.')
    if ((p as { status: string }).status === 'bonus_confirmed') {
        throw new Error('Nie można anulować — premie zostały już wygenerowane.')
    }
    await admin
        .from('placements')
        .update({
            status: 'cancelled',
            cancelled_at: new Date().toISOString(),
            cancelled_by: ctx.userId,
            cancel_reason: reason.trim() || null,
            updated_at: new Date().toISOString(),
        })
        .eq('id', placementId)
    await logAudit(ctx.userId, 'PLACEMENT_CANCELLED', { placement_id: placementId, reason })
    revalidatePath('/internal/admin')
    revalidatePath('/internal/placements')
}
