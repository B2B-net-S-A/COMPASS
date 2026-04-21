/**
 * Tier configuration — single source of truth for the entire app.
 * Aligned with DB trigger: Bronze 0, Silver 500, Gold 2000, Platinum 5000.
 *
 * This file deliberately does NOT have 'use server' so it can be imported
 * by both server actions and client components.
 */
export const TIER_CONFIG = [
    { name: 'bronze', label: 'BRONZE', threshold: 0, next: 'silver' as const, nextThreshold: 500 },
    { name: 'silver', label: 'SILVER', threshold: 500, next: 'gold' as const, nextThreshold: 2000 },
    { name: 'gold', label: 'GOLD', threshold: 2000, next: 'platinum' as const, nextThreshold: 5000 },
    { name: 'platinum', label: 'PLATINUM', threshold: 5000, next: null, nextThreshold: 5000 },
] as const

export type TierName = typeof TIER_CONFIG[number]['name']
