'use server'

// Phase 33/39 — Kontraktorzy: manual Excel import (preview + commit) for the 3 TCM formats.
// The actual parse → ensure-contractors → upsert logic lives in lib/contractors/import-core.ts and
// is shared with the daily SharePoint sync cron. This module is the human path: it adds the
// requireLifecycleManagerAction guard, reads the uploaded FormData file, and revalidates the hub.

import { revalidatePath } from 'next/cache'
import { requireLifecycleManagerAction } from '@/lib/auth/internal-guard'
import { createServiceClient } from '@/lib/supabase/admin'
import { normalizePersonName } from '@/lib/types/placement'
import {
    importRozmowyFromBuffer,
    importWejsciaFromBuffer,
    importZejsciaFromBuffer,
    loadProfiles,
    loadAliasMap,
    resolveProfileId,
    resolveTcmId,
    type ImportResult,
} from '@/lib/contractors/import-core'
import {
    parseRozmowyWorkbook,
    parseWejsciaWorkbook,
    parseZejsciaWorkbook,
} from '@/lib/contractors/parse'

const HUB = '/internal/kontraktorzy'

// Re-export the shared result type so existing consumers (ImportDialog) keep importing it from here.
export type { ImportResult } from '@/lib/contractors/import-core'

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

async function fileFromForm(formData: FormData): Promise<ArrayBuffer> {
    const file = formData.get('file')
    if (!file || typeof file === 'string') throw new Error('Brak pliku. Załącz plik .xlsx.')
    const f = file as File
    if (f.size === 0) throw new Error('Plik jest pusty.')
    if (f.size > 15 * 1024 * 1024) throw new Error('Plik za duży (max 15 MB).')
    return await f.arrayBuffer()
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
    const res = await importRozmowyFromBuffer(admin, await fileFromForm(formData), ctx.userId)
    revalidatePath(HUB)
    return res
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
    const res = await importWejsciaFromBuffer(admin, await fileFromForm(formData), ctx.userId)
    revalidatePath(HUB)
    return res
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
    const res = await importZejsciaFromBuffer(admin, await fileFromForm(formData), ctx.userId)
    revalidatePath(HUB)
    return res
}
