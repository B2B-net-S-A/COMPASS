// Phase 28 — Placementy: pure import logic (bonus compute, name resolution, diff).
// No I/O here — all functions are deterministic and unit-tested.

import { addBusinessDays, format, parseISO } from 'date-fns'
import { recruiterTierForMargin } from '@/lib/types/bonus'
import {
    DL_BONUS_PERCENT,
    PLACEMENT_ELIGIBLE_BUSINESS_DAYS,
    PLACEMENT_MONTHLY_HOURS,
    normalizePersonName,
    placementNaturalKey,
    type ParsedPlacementRow,
    type PersonResolution,
    type PlacementBonusFields,
    type PlacementDiffStatus,
} from '@/lib/types/placement'

function round2(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100
}

/**
 * Compute margin, bonuses, tier and 168h-eligibility date from a parsed Excel row.
 * Source of truth = cost/revenue rates. The file's "Marża"/"Marża miesięcznie" are
 * treated only as a control (mismatch surfaces as a warning, not used here).
 */
export function computeBonusFields(row: ParsedPlacementRow): PlacementBonusFields {
    const marginPerHour = round2(row.revenueRate - row.costRate)
    const monthlyMargin = round2(marginPerHour * PLACEMENT_MONTHLY_HOURS)
    const dlBonusAmount = round2((monthlyMargin * DL_BONUS_PERCENT) / 100)

    const tier = recruiterTierForMargin(marginPerHour)
    if (!tier) {
        throw new Error(
            `Nieprawidłowa marża/h (${marginPerHour}) w wierszu ${row.rowNumber} — nie da się ustalić progu premii rekrutera.`,
        )
    }

    const bonusEligibleDate = format(
        addBusinessDays(parseISO(row.startDate), PLACEMENT_ELIGIBLE_BUSINESS_DAYS),
        'yyyy-MM-dd',
    )

    return {
        marginPerHour,
        monthlyMargin,
        dlBonusAmount,
        recruiterTier: tier.tier,
        recruiterBonusAmount: tier.bonus,
        bonusEligibleDate,
    }
}

/** True when the file's stated margin/h disagrees with the computed one (tolerance 0.01). */
export function marginMismatch(row: ParsedPlacementRow, computed: PlacementBonusFields): boolean {
    if (row.marginFromFile == null) return false
    return Math.abs(row.marginFromFile - computed.marginPerHour) > 0.01
}

export interface ProfileLite {
    id: string
    full_name: string
    role: string
}

/** Simple deterministic name-match score in [0,1]. Higher = better. */
export function scoreNameMatch(rawNorm: string, candidateName: string): number {
    const candNorm = normalizePersonName(candidateName)
    if (!candNorm || !rawNorm) return 0
    if (candNorm === rawNorm) return 1
    const a = new Set(rawNorm.split(' ').filter(Boolean))
    const b = new Set(candNorm.split(' ').filter(Boolean))
    if (a.size === 0 || b.size === 0) return 0
    let inter = 0
    for (const t of Array.from(a)) if (b.has(t)) inter += 1
    const union = a.size + b.size - inter
    const jaccard = inter / union
    // Bonus when one fully contains the other's tokens (e.g. "Jan Kowalski" vs "Jan Maria Kowalski").
    const containment = inter === Math.min(a.size, b.size) ? 0.15 : 0
    return Math.min(1, jaccard + containment)
}

/**
 * Build the resolution entry for one distinct raw name: alias hit takes priority,
 * otherwise top fuzzy suggestions (>= 0.34 score) capped at 5.
 */
export function resolvePersonName(
    rawName: string,
    profiles: ReadonlyArray<ProfileLite>,
    aliasProfileId: string | null,
): PersonResolution {
    const rawNameNorm = normalizePersonName(rawName)
    const scored = profiles
        .map((p) => ({ p, score: scoreNameMatch(rawNameNorm, p.full_name) }))
        .filter((s) => s.score >= 0.34)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)

    const suggestions = scored.map((s) => ({ id: s.p.id, fullName: s.p.full_name, role: s.p.role }))
    const suggestedProfileId =
        aliasProfileId ?? (scored.length > 0 && scored[0].score >= 0.9 ? scored[0].p.id : null)

    return { rawName, rawNameNorm, suggestedProfileId, suggestions }
}

/** Distinct DL + recruiter names across all rows, each resolved against aliases + profiles. */
export function buildPeopleResolutions(
    rows: ReadonlyArray<ParsedPlacementRow>,
    profiles: ReadonlyArray<ProfileLite>,
    aliasMap: ReadonlyMap<string, string>,
): PersonResolution[] {
    const byNorm = new Map<string, string>() // norm → original raw (first seen)
    for (const r of rows) {
        for (const raw of [r.deliveryLeadRaw, r.recruiterRaw]) {
            const norm = normalizePersonName(raw)
            if (norm && !byNorm.has(norm)) byNorm.set(norm, raw.trim())
        }
    }
    return Array.from(byNorm.entries())
        .map(([norm, raw]) => resolvePersonName(raw, profiles, aliasMap.get(norm) ?? null))
        .sort((a, b) => a.rawName.localeCompare(b.rawName, 'pl'))
}

export interface ExistingPlacementKey {
    id: string
    consultant_name: string
    client_name: string
    start_date: string
    // comparable fields for detecting 'updated'
    cost_rate: number
    revenue_rate: number
    position: string | null
    delivery_lead_raw: string
    recruiter_raw: string
}

/** Classify one uploaded row vs. the existing placement sharing its natural key. */
export function classifyRow(
    row: ParsedPlacementRow,
    existing: ExistingPlacementKey | undefined,
): PlacementDiffStatus {
    if (!existing) return 'new'
    const changed =
        Number(existing.cost_rate) !== row.costRate ||
        Number(existing.revenue_rate) !== row.revenueRate ||
        (existing.position ?? null) !== (row.position ?? null) ||
        existing.delivery_lead_raw.trim() !== row.deliveryLeadRaw.trim() ||
        existing.recruiter_raw.trim() !== row.recruiterRaw.trim() ||
        (existing.start_date ?? null) !== row.startDate
    return changed ? 'updated' : 'unchanged'
}

/** Existing placements whose natural key is not present in the uploaded file (cumulative mode). */
export function findDisappeared(
    uploaded: ReadonlyArray<ParsedPlacementRow>,
    existing: ReadonlyArray<ExistingPlacementKey>,
): ExistingPlacementKey[] {
    const uploadedKeys = new Set(
        uploaded.map((r) => placementNaturalKey(r.consultantName, r.clientName, r.startDate)),
    )
    return existing.filter(
        (e) => !uploadedKeys.has(placementNaturalKey(e.consultant_name, e.client_name, e.start_date)),
    )
}
