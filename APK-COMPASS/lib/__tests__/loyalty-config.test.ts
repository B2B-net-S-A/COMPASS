import { describe, expect, it } from 'vitest'
import { TIER_CONFIG, type TierName } from '../loyalty-config'

describe('TIER_CONFIG', () => {
    it('has 4 tiers in ascending order', () => {
        expect(TIER_CONFIG).toHaveLength(4)
        expect(TIER_CONFIG.map(t => t.name)).toEqual(['bronze', 'silver', 'gold', 'platinum'])
    })

    it('starts at threshold 0 (bronze)', () => {
        expect(TIER_CONFIG[0]).toMatchObject({ name: 'bronze', threshold: 0 })
    })

    it('thresholds are strictly increasing', () => {
        for (let i = 1; i < TIER_CONFIG.length; i++) {
            expect(TIER_CONFIG[i].threshold).toBeGreaterThan(TIER_CONFIG[i - 1].threshold)
        }
    })

    it('chains via .next correctly: bronze→silver→gold→platinum', () => {
        expect(TIER_CONFIG[0].next).toBe('silver')
        expect(TIER_CONFIG[1].next).toBe('gold')
        expect(TIER_CONFIG[2].next).toBe('platinum')
        expect(TIER_CONFIG[3].next).toBeNull()
    })

    it('nextThreshold of every non-final tier matches threshold of next tier', () => {
        for (let i = 0; i < TIER_CONFIG.length - 1; i++) {
            expect(TIER_CONFIG[i].nextThreshold).toBe(TIER_CONFIG[i + 1].threshold)
        }
    })

    it('platinum is the top tier with no next', () => {
        const platinum = TIER_CONFIG[TIER_CONFIG.length - 1]
        expect(platinum.name).toBe('platinum')
        expect(platinum.next).toBeNull()
    })

    it('matches the documented spec: Bronze 0 / Silver 500 / Gold 2000 / Platinum 5000', () => {
        expect(TIER_CONFIG[0].threshold).toBe(0)
        expect(TIER_CONFIG[1].threshold).toBe(500)
        expect(TIER_CONFIG[2].threshold).toBe(2000)
        expect(TIER_CONFIG[3].threshold).toBe(5000)
    })

    it('TierName type accepts only known tier names (compile-time safety check)', () => {
        const ok: TierName = 'gold'
        expect(['bronze', 'silver', 'gold', 'platinum']).toContain(ok)
    })
})
