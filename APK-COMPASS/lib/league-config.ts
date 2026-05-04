/**
 * Dynaminds League — 7-tier ladder configuration. Single source of truth.
 *
 * Phase 1.2 (2026-05-04) — replaces lib/loyalty-config.ts (4-tier bronze/silver/gold/platinum).
 * Aligned with DB enum `loyalty_tier_t` and trigger `update_loyalty_status`
 * (migration 20260504000003_phase1_loyalty_tiers_v2.sql).
 *
 * Thresholds: 0 / 250 / 750 / 2000 / 5000 / 10000 / 25000.
 *
 * No 'use server' directive — imported by both server actions and client components.
 */

export const TIER_CONFIG = [
    { name: 'scout',      label: 'SCOUT',      threshold: 0,     next: 'explorer'   as const, nextThreshold: 250 },
    { name: 'explorer',   label: 'EXPLORER',   threshold: 250,   next: 'pathfinder' as const, nextThreshold: 750 },
    { name: 'pathfinder', label: 'PATHFINDER', threshold: 750,   next: 'navigator'  as const, nextThreshold: 2000 },
    { name: 'navigator',  label: 'NAVIGATOR',  threshold: 2000,  next: 'captain'    as const, nextThreshold: 5000 },
    { name: 'captain',    label: 'CAPTAIN',    threshold: 5000,  next: 'admiral'    as const, nextThreshold: 10000 },
    { name: 'admiral',    label: 'ADMIRAL',    threshold: 10000, next: 'legend'     as const, nextThreshold: 25000 },
    { name: 'legend',     label: 'LEGEND',     threshold: 25000, next: null,                  nextThreshold: 25000 },
] as const

export type TierName = typeof TIER_CONFIG[number]['name']

export const DEFAULT_TIER: TierName = 'scout'

export const TIER_DISTRIBUTION_KEYS: Record<TierName, number> = {
    scout: 0,
    explorer: 0,
    pathfinder: 0,
    navigator: 0,
    captain: 0,
    admiral: 0,
    legend: 0,
}

/**
 * Lookup tier metadata for any tier name. Falls back to 'scout' if unknown
 * (e.g. legacy data still using bronze/silver/gold/platinum before migration).
 */
export function getTier(name: string | null | undefined) {
    return TIER_CONFIG.find(t => t.name === name) ?? TIER_CONFIG[0]
}

/**
 * Computes percentage progress within current tier toward next tier.
 * Returns 100 for top tier (legend).
 */
export function computeTierProgress(points: number, tierName: string | null | undefined): number {
    const tier = getTier(tierName)
    if (!tier.next) return 100
    const range = tier.nextThreshold - tier.threshold
    if (range <= 0) return 100
    return Math.min(100, Math.max(0, Math.round(((points - tier.threshold) / range) * 100)))
}

/**
 * Lookup tier color hue. Used by UI components to decorate badges.
 * Phase 1.2: minimalist palette; Phase 2 (League refresh) will introduce
 * branded gradients per tier.
 */
export const TIER_COLORS: Record<TierName, { text: string; bg: string }> = {
    scout:      { text: 'text-slate-400',  bg: 'bg-slate-400/10 border-slate-400/20' },
    explorer:   { text: 'text-emerald-400', bg: 'bg-emerald-400/10 border-emerald-400/20' },
    pathfinder: { text: 'text-cyan-400',    bg: 'bg-cyan-400/10 border-cyan-400/20' },
    navigator:  { text: 'text-blue-400',    bg: 'bg-blue-400/10 border-blue-400/20' },
    captain:    { text: 'text-violet-400',  bg: 'bg-violet-400/10 border-violet-400/20' },
    admiral:    { text: 'text-fuchsia-400', bg: 'bg-fuchsia-400/10 border-fuchsia-400/20' },
    legend:     { text: 'text-amber-400',   bg: 'bg-amber-400/10 border-amber-400/20' },
}
