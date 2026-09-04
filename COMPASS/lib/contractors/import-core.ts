// Phase 39 — Kontraktorzy import core (plain module, NOT 'use server').
// Buffer-based idempotent importers + shared person-resolution helpers, so both the manual
// upload path (lib/actions/contractor-import.ts — human guard + FormData) and the daily
// SharePoint sync cron (app/api/cron/tc-sync — Bearer auth, no human) reuse the exact same
// parse → ensure-contractors → upsert logic. Idempotent via external_key.

import { createServiceClient } from '@/lib/supabase/admin'
import { logAudit } from '@/lib/actions/audit'
import { normalizePersonName } from '@/lib/types/placement'
import { scoreNameMatch, type ProfileLite } from '@/lib/placements/import'
import { importExternalKey } from '@/lib/types/contractor'
import type ExcelJS from 'exceljs'
import {
    loadWorkbook,
    parseRozmowyWorkbook,
    parseWejsciaFromWorkbook,
    parseZejsciaFromWorkbook,
    type ParsedConversation,
    type ParsedDeparture,
    type ParsedEntry,
} from '@/lib/contractors/parse'

export type ServiceClient = ReturnType<typeof createServiceClient>

export interface ImportResult {
    inserted: number
    contractorsCreated: number
    skippedDuplicates: number
}

// ─── Shared lookups + person resolution ──────────────────────────────────────
export async function loadProfiles(admin: ServiceClient): Promise<ProfileLite[]> {
    const { data } = await admin.from('profiles').select('id, full_name, role').not('full_name', 'is', null)
    return ((data ?? []) as ProfileLite[]).filter((p) => (p.full_name ?? '').trim().length > 0)
}

export async function loadAliasMap(admin: ServiceClient): Promise<Map<string, string>> {
    const { data } = await admin.from('placement_person_aliases').select('raw_name_norm, profile_id')
    const map = new Map<string, string>()
    for (const a of (data ?? []) as Array<{ raw_name_norm: string; profile_id: string }>) map.set(a.raw_name_norm, a.profile_id)
    return map
}

/** Best-effort: alias hit or fuzzy ≥ threshold → profile id; else null. */
export function resolveProfileId(
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
export function resolveTcmId(rawName: string | null | undefined, tcmProfiles: ReadonlyArray<ProfileLite>): string | null {
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

/**
 * Postgres unique_violation.
 *
 * Reaching this is not a bug: `contractors` is unique on lower(trim(full_name)), and
 * two imports running at once (the daily cron and someone pressing Import in the UI)
 * can both decide the same person is missing. The constraint settles it.
 */
const PG_UNIQUE_VIOLATION = '23505'

async function loadContractorMap(admin: ServiceClient): Promise<Map<string, string>> {
    const { data } = await admin.from('contractors').select('id, full_name')
    const map = new Map<string, string>()
    for (const c of (data ?? []) as Array<{ id: string; full_name: string }>) {
        map.set(normalizePersonName(c.full_name), c.id)
    }
    return map
}

/** Ensure a contractor row exists for each distinct name; returns map + #created. */
export async function ensureContractors(
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
        if (!error) {
            for (const c of (data ?? []) as Array<{ id: string; full_name: string }>) {
                map.set(normalizePersonName(c.full_name), c.id)
                created += 1
            }
            continue
        }
        if (error.code !== PG_UNIQUE_VIOLATION) {
            throw new Error(`Nie udało się utworzyć kontraktorów: ${error.message}`)
        }
        // Someone created one of these names between our map snapshot above and this
        // insert — `contractors` is unique on lower(trim(full_name)). The batch is
        // all-or-nothing, so a single contested name would otherwise abort the entire
        // import, not just its own row. Fall back to one row at a time and let the
        // constraint arbitrate; the map was only ever a cache, the index is the truth.
        const fresh = await loadContractorMap(admin)
        for (const candidate of chunk) {
            const norm = normalizePersonName(candidate.full_name)
            const known = fresh.get(norm)
            if (known) {
                map.set(norm, known)
                continue
            }
            const { data: one, error: oneErr } = await admin
                .from('contractors')
                .insert(candidate)
                .select('id, full_name')
                .single()
            if (!oneErr && one) {
                const row = one as { id: string; full_name: string }
                map.set(normalizePersonName(row.full_name), row.id)
                created += 1
                continue
            }
            if (oneErr?.code !== PG_UNIQUE_VIOLATION) {
                throw new Error(`Nie udało się utworzyć kontraktorów: ${oneErr?.message ?? 'unknown'}`)
            }
            // Lost the race for this name specifically — adopt the row that won, so
            // the rest of the import still links to a real contractor.
            const { data: found } = await admin
                .from('contractors')
                .select('id, full_name')
                .ilike('full_name', candidate.full_name)
                .maybeSingle()
            const winner = found as { id: string; full_name: string } | null
            if (winner) map.set(normalizePersonName(winner.full_name), winner.id)
        }
    }
    return { map, created }
}

type ImportTable = 'contractor_conversations' | 'client_entries' | 'client_departures'

export async function insertChunked(
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

// ─── Buffer importers (idempotent) ───────────────────────────────────────────
export async function importRozmowyFromBuffer(admin: ServiceClient, buffer: ArrayBuffer | Buffer, actorUserId: string): Promise<ImportResult> {
    const parsed = await parseRozmowyWorkbook(buffer)
    if (parsed.rows.length === 0) throw new Error(parsed.errors[0] ?? 'Brak danych (rozmowy).')
    const batchId = crypto.randomUUID()
    const tcmProfiles = (await loadProfiles(admin)).filter((p) => p.role === 'talent_community' || p.role === 'admin')
    const { map, created } = await ensureContractors(
        admin,
        parsed.rows.map((r) => ({ fullName: r.fullName, client: r.client, phone: r.phone })),
        actorUserId,
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
                imported_by: actorUserId,
                last_import_batch_id: batchId,
            }
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
    const inserted = await insertChunked(admin, 'contractor_conversations', rows)
    await logAudit(actorUserId, 'CONTRACTORS_IMPORTED', { kind: 'rozmowy', batch_id: batchId, inserted, contractors_created: created, parsed: parsed.rows.length })
    return { inserted, contractorsCreated: created, skippedDuplicates: rows.length - inserted }
}

export async function importWejsciaFromBuffer(admin: ServiceClient, buffer: ArrayBuffer | Buffer, actorUserId: string): Promise<ImportResult> {
    return importWejsciaFromWorkbook(admin, await loadWorkbook(buffer), actorUserId)
}

export async function importWejsciaFromWorkbook(admin: ServiceClient, wb: ExcelJS.Workbook, actorUserId: string): Promise<ImportResult> {
    const parsed = parseWejsciaFromWorkbook(wb)
    if (parsed.rows.length === 0) throw new Error(parsed.errors[0] ?? 'Brak danych (wejścia).')
    const batchId = crypto.randomUUID()
    const profiles = await loadProfiles(admin)
    const aliasMap = await loadAliasMap(admin)
    const { map, created } = await ensureContractors(
        admin,
        parsed.rows.map((r) => ({ fullName: r.fullName, client: r.client, position: null })),
        actorUserId,
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
        imported_by: actorUserId,
        last_import_batch_id: batchId,
    }))
    const inserted = await insertChunked(admin, 'client_entries', rows)
    await logAudit(actorUserId, 'CONTRACTORS_IMPORTED', { kind: 'wejscia', batch_id: batchId, inserted, contractors_created: created, parsed: parsed.rows.length })
    return { inserted, contractorsCreated: created, skippedDuplicates: rows.length - inserted }
}

export async function importZejsciaFromBuffer(admin: ServiceClient, buffer: ArrayBuffer | Buffer, actorUserId: string): Promise<ImportResult> {
    return importZejsciaFromWorkbook(admin, await loadWorkbook(buffer), actorUserId)
}

export async function importZejsciaFromWorkbook(admin: ServiceClient, wb: ExcelJS.Workbook, actorUserId: string): Promise<ImportResult> {
    const parsed = parseZejsciaFromWorkbook(wb)
    if (parsed.rows.length === 0) throw new Error(parsed.errors[0] ?? 'Brak danych (zejścia).')
    const batchId = crypto.randomUUID()
    const profiles = await loadProfiles(admin)
    const aliasMap = await loadAliasMap(admin)
    const { map, created } = await ensureContractors(
        admin,
        parsed.rows.map((r) => ({ fullName: r.fullName, client: r.client, position: r.position })),
        actorUserId,
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
        imported_by: actorUserId,
        last_import_batch_id: batchId,
    }))
    const inserted = await insertChunked(admin, 'client_departures', rows)
    await logAudit(actorUserId, 'CONTRACTORS_IMPORTED', { kind: 'zejscia', batch_id: batchId, inserted, contractors_created: created, parsed: parsed.rows.length })
    return { inserted, contractorsCreated: created, skippedDuplicates: rows.length - inserted }
}
