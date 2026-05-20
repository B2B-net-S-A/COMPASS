// Phase 27h — pure helpers for forward rate progressions.
// No I/O: deterministic, fully unit-tested. Used by lib/actions/internal-rates.ts.
//
// Model: a user's rate over time is a chain of `user_rates` rows. A "fixed" rate
// (stała) is a single open-ended row. A "progressive" rate (progresywna) is a series
// of future change-points ending in an open row. We store ONLY months where the rate
// changes (change-points); equal consecutive months collapse.
//
// Entry/edit is append-only (Phase 27h decision): new change-points must be strictly
// later than any already-scheduled month and no earlier than next month. The DB trigger
// `auto_close_previous_rate` is the integrity backstop; these helpers fail fast in the UI/action.

import type { RateProgressionEntry, SkippedCopyEntry } from '@/lib/types/rates'
import { RATE_PROGRESSION_MAX_MONTHS } from '@/lib/types/rates'

/** Mirrors the NUMERIC(12,2) upper bound enforced in internal-rates.ts / the DB column. */
export const RATE_MAX = 9_999_999.99

const MONTH_FIRST_RE = /^\d{4}-\d{2}-01$/

function isoMonthFirst(year: number, monthIndex0: number): string {
    // Date.UTC normalises month overflow/underflow (e.g. monthIndex0 = 12 → next January).
    const d = new Date(Date.UTC(year, monthIndex0, 1))
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
}

/** First day (UTC) of the month after `now`, as YYYY-MM-01. */
export function firstDayOfNextMonth(now: Date = new Date()): string {
    return isoMonthFirst(now.getUTCFullYear(), now.getUTCMonth() + 1)
}

/** Add `n` months to a YYYY-MM-01 string, returning a YYYY-MM-01 string. */
export function addMonths(isoFirst: string, n: number): string {
    const year = Number(isoFirst.slice(0, 4))
    const month1 = Number(isoFirst.slice(5, 7)) // 1-based
    return isoMonthFirst(year, month1 - 1 + n)
}

export function isFirstOfMonth(iso: string): boolean {
    return MONTH_FIRST_RE.test(iso)
}

/**
 * Collapse a list of monthly entries to change-points: keep an entry only when its rate
 * differs from the last kept rate. `currentOpenRate` seeds the comparison (so a first month
 * equal to the current rate is dropped as a no-op). Input is sorted ascending defensively.
 */
export function buildChangePoints(
    currentOpenRate: number | null,
    entries: RateProgressionEntry[],
): RateProgressionEntry[] {
    const sorted = [...entries].sort((a, b) => (a.effective_from < b.effective_from ? -1 : a.effective_from > b.effective_from ? 1 : 0))
    const out: RateProgressionEntry[] = []
    let lastKept: number | null = currentOpenRate
    for (const e of sorted) {
        if (lastKept === null || e.hourly_rate !== lastKept) {
            out.push({ effective_from: e.effective_from, hourly_rate: e.hourly_rate })
            lastKept = e.hourly_rate
        }
    }
    return out
}

export interface ProgressionValidationOpts {
    /** YYYY-MM-01 — earliest allowed month (1st of next calendar month). */
    nextMonthFirst: string
    /** YYYY-MM-01 — the user's latest already-scheduled effective_from (open or closed), or null. */
    latestExistingEffectiveFrom: string | null
    /** Horizon cap in months from `nextMonthFirst` (default 24). */
    maxMonths?: number
}

/**
 * Validate a batch of progression entries (throws Error with a PL message on the first problem).
 * Enforces: non-empty, 1st-of-month, rate in [0, RATE_MAX], >= next month, within horizon,
 * strictly ascending/unique, and append-only (> latest existing scheduled month).
 */
export function validateProgressionEntries(
    entries: RateProgressionEntry[],
    opts: ProgressionValidationOpts,
): void {
    if (!Array.isArray(entries) || entries.length === 0) {
        throw new Error('Brak miesięcy w progresji.')
    }
    const maxMonths = opts.maxMonths ?? RATE_PROGRESSION_MAX_MONTHS
    const horizonEnd = addMonths(opts.nextMonthFirst, maxMonths - 1) // inclusive last allowed month
    let prev: string | null = null
    for (const e of entries) {
        if (!isFirstOfMonth(e.effective_from)) {
            throw new Error(`Miesiąc ${e.effective_from}: stawka może wejść w życie tylko 1. dnia miesiąca.`)
        }
        if (!Number.isFinite(e.hourly_rate) || e.hourly_rate < 0) {
            throw new Error(`Miesiąc ${e.effective_from}: stawka musi być >= 0.`)
        }
        if (e.hourly_rate > RATE_MAX) {
            throw new Error(`Miesiąc ${e.effective_from}: stawka za duża (max ${RATE_MAX}).`)
        }
        if (e.effective_from < opts.nextMonthFirst) {
            throw new Error(
                `Miesiąc ${e.effective_from}: najwcześniejszy dozwolony to ${opts.nextMonthFirst} (1. dzień przyszłego miesiąca).`,
            )
        }
        if (e.effective_from > horizonEnd) {
            throw new Error(`Miesiąc ${e.effective_from}: poza horyzontem ${maxMonths} miesięcy (max ${horizonEnd}).`)
        }
        if (opts.latestExistingEffectiveFrom && e.effective_from <= opts.latestExistingEffectiveFrom) {
            throw new Error(
                `Miesiąc ${e.effective_from}: pracownik ma już zaplanowaną stawkę od ${opts.latestExistingEffectiveFrom} (lub później). Dozwolone jest tylko dopisywanie kolejnych miesięcy.`,
            )
        }
        if (prev !== null && e.effective_from <= prev) {
            throw new Error(`Miesiące progresji muszą być rosnące i unikalne (problem przy ${e.effective_from}).`)
        }
        prev = e.effective_from
    }
}

export interface BuildCopyOpts {
    /** Source user's future change-points (effective_from in any order). */
    sourceFutureChangePoints: RateProgressionEntry[]
    /** Target user's current open rate (for no-op dedupe), or null. */
    targetCurrentOpenRate: number | null
    /** Target user's latest already-scheduled effective_from, or null. */
    targetLatestEffectiveFrom: string | null
    /** YYYY-MM-01 — 1st of next calendar month. */
    nextMonthFirst: string
}

/**
 * Build the entries that copying a source schedule into a target would apply (append-only).
 * Months earlier than next month → skipped 'past'; months at/before the target's last
 * scheduled month → skipped 'conflict'; months whose rate equals the running rate → 'no_change'.
 */
export function buildCopyEntries(opts: BuildCopyOpts): {
    applied: RateProgressionEntry[]
    skipped: SkippedCopyEntry[]
} {
    const skipped: SkippedCopyEntry[] = []
    const candidates: RateProgressionEntry[] = []
    const sorted = [...opts.sourceFutureChangePoints].sort((a, b) => (a.effective_from < b.effective_from ? -1 : 1))
    for (const e of sorted) {
        if (e.effective_from < opts.nextMonthFirst) {
            skipped.push({ ...e, reason: 'past' })
            continue
        }
        if (opts.targetLatestEffectiveFrom && e.effective_from <= opts.targetLatestEffectiveFrom) {
            skipped.push({ ...e, reason: 'conflict' })
            continue
        }
        candidates.push({ effective_from: e.effective_from, hourly_rate: e.hourly_rate })
    }
    const applied = buildChangePoints(opts.targetCurrentOpenRate, candidates)
    const appliedMonths = new Set(applied.map((a) => a.effective_from))
    for (const c of candidates) {
        if (!appliedMonths.has(c.effective_from)) {
            skipped.push({ ...c, reason: 'no_change' })
        }
    }
    return { applied, skipped }
}
