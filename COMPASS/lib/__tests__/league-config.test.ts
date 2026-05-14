import { describe, expect, it } from 'vitest'
import { TIER_CONFIG, type TierName, getTier, computeTierProgress, DEFAULT_TIER, TIER_COLORS } from '../league-config'

describe('TIER_CONFIG (Dynaminds League — 7 tiers)', () => {
    it('has 7 tiers in canonical order', () => {
        expect(TIER_CONFIG).toHaveLength(7)
        expect(TIER_CONFIG.map(t => t.name)).toEqual([
            'scout', 'explorer', 'pathfinder', 'navigator', 'captain', 'admiral', 'legend',
        ])
    })

    it('starts at threshold 0 (scout)', () => {
        expect(TIER_CONFIG[0]).toMatchObject({ name: 'scout', threshold: 0 })
    })

    it('thresholds match DB enum migration (0/250/750/2000/5000/10000/25000)', () => {
        expect(TIER_CONFIG.map(t => t.threshold)).toEqual([0, 250, 750, 2000, 5000, 10000, 25000])
    })

    it('thresholds are strictly increasing', () => {
        for (let i = 1; i < TIER_CONFIG.length; i++) {
            expect(TIER_CONFIG[i].threshold).toBeGreaterThan(TIER_CONFIG[i - 1].threshold)
        }
    })

    it('chains via .next correctly through to legend', () => {
        expect(TIER_CONFIG[0].next).toBe('explorer')
        expect(TIER_CONFIG[1].next).toBe('pathfinder')
        expect(TIER_CONFIG[2].next).toBe('navigator')
        expect(TIER_CONFIG[3].next).toBe('captain')
        expect(TIER_CONFIG[4].next).toBe('admiral')
        expect(TIER_CONFIG[5].next).toBe('legend')
        expect(TIER_CONFIG[6].next).toBeNull()
    })

    it('nextThreshold of every non-final tier matches threshold of next tier', () => {
        for (let i = 0; i < TIER_CONFIG.length - 1; i++) {
            expect(TIER_CONFIG[i].nextThreshold).toBe(TIER_CONFIG[i + 1].threshold)
        }
    })

    it('legend is the top tier with no next', () => {
        const legend = TIER_CONFIG[TIER_CONFIG.length - 1]
        expect(legend.name).toBe('legend')
        expect(legend.next).toBeNull()
    })

    it('TierName type accepts only known names', () => {
        const ok: TierName = 'navigator'
        expect(['scout', 'explorer', 'pathfinder', 'navigator', 'captain', 'admiral', 'legend']).toContain(ok)
    })
})

describe('DEFAULT_TIER', () => {
    it('is "scout" — every new profile starts here', () => {
        expect(DEFAULT_TIER).toBe('scout')
    })
})

describe('getTier', () => {
    it('returns the matching tier for known names', () => {
        expect(getTier('captain').name).toBe('captain')
        expect(getTier('legend').name).toBe('legend')
    })

    it('falls back to scout for unknown / legacy names', () => {
        expect(getTier('bronze').name).toBe('scout')
        expect(getTier('platinum').name).toBe('scout')
        expect(getTier(null).name).toBe('scout')
        expect(getTier(undefined).name).toBe('scout')
    })
})

describe('computeTierProgress', () => {
    it('returns 0 at lower bound of tier', () => {
        expect(computeTierProgress(0, 'scout')).toBe(0)
        expect(computeTierProgress(250, 'explorer')).toBe(0)
    })

    it('returns 100 within the same tier when at upper bound', () => {
        expect(computeTierProgress(249, 'scout')).toBeGreaterThan(95)
        expect(computeTierProgress(749, 'explorer')).toBeGreaterThan(95)
    })

    it('returns 100 for legend (top tier, no next)', () => {
        expect(computeTierProgress(30000, 'legend')).toBe(100)
    })
})

describe('TIER_COLORS', () => {
    it('has an entry for every tier', () => {
        for (const tier of TIER_CONFIG) {
            expect(TIER_COLORS[tier.name]).toBeDefined()
            expect(TIER_COLORS[tier.name].text).toMatch(/^text-/)
            expect(TIER_COLORS[tier.name].bg).toMatch(/^bg-/)
        }
    })
})
