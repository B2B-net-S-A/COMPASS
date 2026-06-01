'use server'

// Phase 33 — Kontraktorzy: idempotent Excel importers (Rozmowy, Wejścia, Zejścia).
// Pattern mirrors Phase 28 placements import. Authorization: admin OR talent_community.
// Person resolution (recruiter/DL/TCM) is best-effort: alias hit or high-confidence fuzzy
// match links a profile; otherwise the raw name is kept (no blocking — many historical
// recruiters are not current employees).

import { revalidatePath } from 'next/cache'
import { requireLifecycleManagerAction } from '@/lib/auth/internal-guard'
import { createServiceClient } from '@/lib/supabase/admin'
import { logAudit } from '@/lib/actions/audit'
import { normalizePersonName } from '@/lib/types/placement'
import { scoreNameMatch, type ProfileLite } from '@/lib/placements/import'
import { importExternalKey } from '@/lib/types/contractor'
import {
    parseRozmowyWorkbook,
    parseWejsciaWorkbook,
    parseZejsciaWorkbook,
    type ParsedConversation,
    type ParsedDeparture,
    type ParsedEntry,
} from '@/lib/contractors/parse'

type ServiceClient = ReturnType<typeof createServiceClient>
const HUB = '/internal/kontraktorzy'

export interface ImportPreview {
    kind: 'rozmowy' | 'wejscia' | 'zejscia'
    scannedRows: number
    validRows: number
    skippedBlankRows: number
    distinctContractors: number
    peopleMatched: number
    peopleUnmatched: number
    warnings: string[]
    sample: Array<Record<string, string | null>>
}

export interface ImportResult {
    inserted: number
    contractorsCreated: number
    skippedDuplicates: number
}

async function fileFromForm(formData: FormData): Promise<ArrayBuffer> {
    const file = formData.get('file')
    if (!file || typeof file === 'string') throw new Error('Brak pliku. Załącz plik .xlsx.')
    const f = file as File
    if (f.size === 0) throw new Error('Plik jest pusty.')
    if (f.size > 15 * 1024 * 1024) throw new Error('Plik za duży (max 15 MB).')
    return await f.arrayBuffer()
}

async function loadProfiles(admin: ServiceClient): Promise<ProfileLite[]> {
    const { data } = await admin.from('profiles').select('id, full_name, role').not('full_name', 'is', null)
    return ((data ?? []) as ProfileLite[]).filter((p) => (p.full_name ?? '').trim().length > 0)
}

async function loadAliasMap(admin: ServiceClient): Promise<Map<string, string>> {
    const { data } = await admin.from('placement_person_aliases').select('raw_name_norm, profile_id')
    const map = new Map<string, string>()
    for (const a of (data ?? []) as Array<{ raw_name_norm: string; profile_id: string }>) map.set(a.raw_name_norm, a.profile_id)
    return map
}

/** Best-effort: alias hit or fuzzy ≥ threshold → profile id; else null. */
function resolveProfileId(
    rawName: string | null | undefined,
    profiles: ReadonlyArray<ProfileLite>,
    aliasMap: ReadonlyMap<string, string>,
    threshold = 0.9,
): string | null {
    if (!rawName) return null
    const norm = normalizePersonName(rawName)
    if (!norm) return null
    const alias = aliasMap.get(norm)
    if (alias) return alias
    let best: { id: string; score: number } | null = null
    for (const p of profiles) {
        const score = scoreNameMatch(norm, p.full_name ?? '')
        if (!best || score > best.score) best = { id: p.id, score }
    }
    return best && best.score >= threshold ? best.id : null
}

/** TCM resolver: lenient first-name match against talent_community/admin profiles. */
function resolveTcmId(rawName: string | null | undefined, tcmProfiles: ReadonlyArray<ProfileLite>): string | null {
    if (!rawName) return null
    const norm = normalizePersonName(rawName)
    if (!norm || norm === 'nd') return null
    const matches = tcmProfiles.filter((p) => {
        const full = normalizePersonName(p.full_name ?? '')
        return full === norm || full.startsWith(`${norm} `) || full.split(' ').includes(norm)
    })
    if (matches.length === 1) return matches[0].id
    return resolveProfileId(rawName, tcmProfiles, new Map(), 0.9)
}

/** Fetch all contractors → map normalized name → id. */
async function loadContractorMap(admin: ServiceClient): Promise<Map<string, string>> {
    const { data } = await admin.from('contractors').select('id, full_name')
    const map = new Map<string, string>()
    for (const c of (data ?? []) as Array<{ id: string; full_name: string }>) {
        map.set(normalizePersonName(c.full_name), c.id)
    }
    return map
}

/** Ensure a contractor row exists for each distinct name; returns map + #created. */
async function ensureContractors(
    admin: ServiceClient,
    people: Array<{ fullName: string; client?: string | null; position?: string | null; phone?: string | null }>,
    importerId: string,
    batchId: string,
): Promise<{ map: Map<string, string>; created: number }> {
    const map = await loadContractorMap(admin)
    const toCreate = new Map<string, { full_name: string; current_client: string | null; current_position: string | null; phone: string | null }>()
    for (const p of people) {
        const name = p.fullName.trim()
        if (name.length < 2) continue
        const norm = normalizePersonName(name)
        if (map.has(norm) || toCreate.has(norm)) continue
        toCreate.set(norm, {
            full_name: name,
            current_client: p.client?.trim() || null,
            current_position: p.position?.trim() || null,
            phone: p.phone?.trim() || null,
        })
    }
    let created = 0
    const rows = Array.from(toCreate.values()).map((r) => ({ ...r, imported_by: importerId, last_import_batch_id: batchId }))
    for (let i = 0; i < rows.length; i += 200) {
        const chunk = rows.slice(i, i + 200)
        const { data, error } = await admin.from('contractors').insert(chunk).select('id, full_name')
        if (error) throw new Error(`Nie udało się utworzyć kontraktorów: ${error.message}`)
        for (const c of (data ?? []) as Array<{ id: string; full_name: string }>) {
            map.set(normalizePersonName(c.full_name), c.id)
            created += 1
        }
    }
    return { map, created }
}

type ImportTable = 'contractor_conversations' | 'client_entries' | 'client_departures'

async function insertChunked(
    admin: ServiceClient,
    table: ImportTable,
    rows: Array<Record<string, unknown>>,
): Promise<number> {
    let inserted = 0
    for (let i = 0; i < rows.length; i += 300) {
        const chunk = rows.slice(i, i + 300)
        const { data, error } = await admin
            .from(table)
            .upsert(chunk as never, { onConflict: 'external_key', ignoreDuplicates: true })
            .select('id')
        if (error) throw new Error(`Insert do ${table} nie powiódł się: ${error.message}`)
        inserted += (data ?? []).length
    }
    return inserted
}

// ─── 1. Rozmowy ────────────────────────────────────────────────────────────
export async function previewRozmowyImport(formData: FormData): Promise<ImportPreview> {
    await requireLifecycleManagerAction()
    const admin = createServiceClient()
    const parsed = await parseRozmowyWorkbook(await fileFromForm(formData))
    const tcmProfiles = (await loadProfiles(admin)).filter((p) => p.role === 'talent_community' || p.role === 'admin')

    const distinctTcm = new Set(parsed.rows.map((r) => normalizePersonName(r.tcmRaw ?? '')).filter(Boolean))
    let matched = 0
    for (const t of Array.from(distinctTcm)) if (resolveTcmId(t, tcmProfiles)) matched += 1

    return {
        kind: 'rozmowy',
        scannedRows: parsed.scannedRows,
        validRows: parsed.rows.length,
        skippedBlankRows: parsed.skippedBlankRows,
        distinctContractors: new Set(parsed.rows.map((r) => normalizePersonName(r.fullName))).size,
        peopleMatched: matched,
        peopleUnmatched: distinctTcm.size - matched,
        warnings: parsed.errors,
        sample: parsed.rows.slice(0, 10).map((r) => ({
            kontraktor: r.fullName,
            klient: r.client,
            data: r.conversationDate,
            tcm: r.tcmRaw,
            sprawa: r.category,
            status: r.status,
        })),
    }
}

export async function commitRozmowyImport(formData: FormData): Promise<ImportResult> {
    const ctx = await requireLifecycleManagerAction()
    const admin = createServiceClient()
    const parsed = await parseRozmowyWorkbook(await fileFromForm(formData))
    if (parsed.rows.length === 0) throw new Error(parsed.errors[0] ?? 'Brak danych.')

    const batchId = crypto.randomUUID()
    const tcmProfiles = (await loadProfiles(admin)).filter((p) => p.role === 'talent_community' || p.role === 'admin')
    const { map, created } = await ensureContractors(
        admin,
        parsed.rows.map((r) => ({ fullName: r.fullName, client: r.client, phone: r.phone })),
        ctx.userId,
        batchId,
    )

    const rows = parsed.rows
        .map((r: ParsedConversation) => {
            const cid = map.get(normalizePersonName(r.fullName))
            if (!cid) return null
            return {
                contractor_id: cid,
                conversation_date: r.conversationDate ?? new Date().toISOString().slice(0, 10),
                tcm_id: resolveTcmId(r.tcmRaw, tcmProfiles),
                tcm_raw: r.tcmRaw,
                client_snapshot: r.client,
                category: r.category,
                status: r.status ?? 'rozwiazane',
                note: r.note,
                source: 'import' as const,
                external_key: importExternalKey('conv', r.fullName, r.conversationDate, r.note?.slice(0, 60)),
                imported_by: ctx.userId,
                last_import_batch_id: batchId,
            }
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)

    const inserted = await insertChunked(admin, 'contractor_conversations', rows)
    await logAudit(ctx.userId, 'CONTRACTORS_IMPORTED', { kind: 'rozmowy', batch_id: batchId, inserted, contractors_created: created, parsed: parsed.rows.length })
    revalidatePath(HUB)
    return { inserted, contractorsCreated: created, skippedDuplicates: rows.length - inserted }
}

// ─── 2. Wejścia ──────────────────────────────────────────────────────────────
export async function previewWejsciaImport(formData: FormData): Promise<ImportPreview> {
    await requireLifecycleManagerAction()
    const admin = createServiceClient()
    const parsed = await parseWejsciaWorkbook(await fileFromForm(formData))
    const profiles = await loadProfiles(admin)
    const aliasMap = await loadAliasMap(admin)
    const distinct = new Set<string>()
    for (const r of parsed.rows) {
        for (const raw of [r.recruiterRaw, r.deliveryLeadRaw]) if (raw) distinct.add(normalizePersonName(raw))
    }
    let matched = 0
    for (const n of Array.from(distinct)) if (resolveProfileId(n, profiles, aliasMap)) matched += 1
    return {
        kind: 'wejscia',
        scannedRows: parsed.scannedRows,
        validRows: parsed.rows.length,
        skippedBlankRows: parsed.skippedBlankRows,
        distinctContractors: new Set(parsed.rows.map((r) => normalizePersonName(r.fullName))).size,
        peopleMatched: matched,
        peopleUnmatched: distinct.size - matched,
        warnings: parsed.errors,
        sample: parsed.rows.slice(0, 10).map((r) => ({ kontraktor: r.fullName, klient: r.client, rekruter: r.recruiterRaw, start: r.startDate })),
    }
}

export async function commitWejsciaImport(formData: FormData): Promise<ImportResult> {
    const ctx = await requireLifecycleManagerAction()
    const admin = createServiceClient()
    const parsed = await parseWejsciaWorkbook(await fileFromForm(formData))
    if (parsed.rows.length === 0) throw new Error(parsed.errors[0] ?? 'Brak danych.')

    const batchId = crypto.randomUUID()
    const profiles = await loadProfiles(admin)
    const aliasMap = await loadAliasMap(admin)
    const { map, created } = await ensureContractors(
        admin,
        parsed.rows.map((r) => ({ fullName: r.fullName, client: r.client, position: null })),
        ctx.userId,
        batchId,
    )

    const rows = parsed.rows.map((r: ParsedEntry) => ({
        contractor_id: map.get(normalizePersonName(r.fullName)) ?? null,
        consultant_name: r.fullName,
        client_name: r.client,
        recruiter_raw: r.recruiterRaw,
        recruiter_id: resolveProfileId(r.recruiterRaw, profiles, aliasMap),
        delivery_lead_raw: r.deliveryLeadRaw,
        delivery_lead_id: resolveProfileId(r.deliveryLeadRaw, profiles, aliasMap),
        signing_date: r.signingDate,
        start_date: r.startDate,
        order_term: r.orderTerm,
        order_number: r.orderNumber,
        guarantee: r.guarantee,
        cost_rate: r.costRate,
        revenue_rate: r.revenueRate,
        monthly_margin: r.monthlyMargin,
        note_am: r.noteAm,
        note_billing: r.noteBilling,
        note_hr: r.noteHr,
        source: 'import' as const,
        external_key: importExternalKey('entry', r.fullName, r.client, r.startDate),
        imported_by: ctx.userId,
        last_import_batch_id: batchId,
    }))

    const inserted = await insertChunked(admin, 'client_entries', rows)
    await logAudit(ctx.userId, 'CONTRACTORS_IMPORTED', { kind: 'wejscia', batch_id: batchId, inserted, contractors_created: created, parsed: parsed.rows.length })
    revalidatePath(HUB)
    return { inserted, contractorsCreated: created, skippedDuplicates: rows.length - inserted }
}

// ─── 3. Zejścia ──────────────────────────────────────────────────────────────
export async function previewZejsciaImport(formData: FormData): Promise<ImportPreview> {
    await requireLifecycleManagerAction()
    const admin = createServiceClient()
    const parsed = await parseZejsciaWorkbook(await fileFromForm(formData))
    const profiles = await loadProfiles(admin)
    const aliasMap = await loadAliasMap(admin)
    const distinct = new Set(parsed.rows.map((r) => normalizePersonName(r.recruiterRaw ?? '')).filter(Boolean))
    let matched = 0
    for (const n of Array.from(distinct)) if (resolveProfileId(n, profiles, aliasMap)) matched += 1
    return {
        kind: 'zejscia',
        scannedRows: parsed.scannedRows,
        validRows: parsed.rows.length,
        skippedBlankRows: parsed.skippedBlankRows,
        distinctContractors: new Set(parsed.rows.map((r) => normalizePersonName(r.fullName))).size,
        peopleMatched: matched,
        peopleUnmatched: distinct.size - matched,
        warnings: parsed.errors,
        sample: parsed.rows.slice(0, 10).map((r) => ({ kontraktor: r.fullName, klient: r.client, zejscie: r.departureDate, kto: r.whoResigned, przepiecie: String(r.transferred) })),
    }
}

export async function commitZejsciaImport(formData: FormData): Promise<ImportResult> {
    const ctx = await requireLifecycleManagerAction()
    const admin = createServiceClient()
    const parsed = await parseZejsciaWorkbook(await fileFromForm(formData))
    if (parsed.rows.length === 0) throw new Error(parsed.errors[0] ?? 'Brak danych.')

    const batchId = crypto.randomUUID()
    const profiles = await loadProfiles(admin)
    const aliasMap = await loadAliasMap(admin)
    const { map, created } = await ensureContractors(
        admin,
        parsed.rows.map((r) => ({ fullName: r.fullName, client: r.client, position: r.position })),
        ctx.userId,
        batchId,
    )

    const rows = parsed.rows.map((r: ParsedDeparture) => ({
        contractor_id: map.get(normalizePersonName(r.fullName)) ?? null,
        consultant_name: r.fullName,
        client_name: r.client,
        position: r.position,
        recruiter_raw: r.recruiterRaw,
        recruiter_id: resolveProfileId(r.recruiterRaw, profiles, aliasMap),
        manager_raw: r.managerRaw,
        start_date: r.startDate,
        departure_date: r.departureDate,
        last_notice_day: r.lastNoticeDay,
        guarantee_ratio: r.guaranteeRatio,
        who_resigned: r.whoResigned,
        reason: r.reason,
        transferred: r.transferred,
        replacement: r.replacement,
        comment: r.comment,
        order_term: r.orderTerm,
        order_number: r.orderNumber,
        cost_rate: r.costRate,
        revenue_rate: r.revenueRate,
        monthly_margin: r.monthlyMargin,
        note_am: r.noteAm,
        note_hr: r.noteHr,
        source: 'import' as const,
        external_key: importExternalKey('dep', r.fullName, r.client, r.departureDate),
        imported_by: ctx.userId,
        last_import_batch_id: batchId,
    }))

    const inserted = await insertChunked(admin, 'client_departures', rows)
    await logAudit(ctx.userId, 'CONTRACTORS_IMPORTED', { kind: 'zejscia', batch_id: batchId, inserted, contractors_created: created, parsed: parsed.rows.length })
    revalidatePath(HUB)
    return { inserted, contractorsCreated: created, skippedDuplicates: rows.length - inserted }
}
