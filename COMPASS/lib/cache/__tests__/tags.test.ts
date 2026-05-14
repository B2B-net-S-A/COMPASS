import { describe, expect, it } from 'vitest'
import { CACHE_TAGS, courseTag, profileTag, projectTag, ticketTag } from '../tags'

describe('CACHE_TAGS', () => {
    it('defines globalne tagi per-domain', () => {
        expect(CACHE_TAGS.COURSES).toBe('courses')
        expect(CACHE_TAGS.PROFILES).toBe('profiles')
        expect(CACHE_TAGS.PROJECTS).toBe('projects')
        expect(CACHE_TAGS.NEWS).toBe('news')
        expect(CACHE_TAGS.WORK_CLOCK).toBe('work-clock')
    })

    it('wszystkie wartości to lowercase + kebab-case', () => {
        for (const value of Object.values(CACHE_TAGS)) {
            expect(value).toMatch(/^[a-z][a-z0-9-]*$/)
        }
    })

    it('brak duplikatów wartości', () => {
        const values = Object.values(CACHE_TAGS)
        expect(new Set(values).size).toBe(values.length)
    })
})

describe('per-entity tag helpers', () => {
    it('profileTag prefixes z "profile:"', () => {
        expect(profileTag('abc-123')).toBe('profile:abc-123')
    })

    it('courseTag prefixes z "course:"', () => {
        expect(courseTag('xyz')).toBe('course:xyz')
    })

    it('projectTag prefixes z "project:"', () => {
        expect(projectTag('p1')).toBe('project:p1')
    })

    it('ticketTag prefixes z "ticket:"', () => {
        expect(ticketTag('t1')).toBe('ticket:t1')
    })

    it('per-entity tagi są odróżnialne od domain tags (kolon vs kebab)', () => {
        expect(profileTag('x')).not.toBe(CACHE_TAGS.PROFILES)
        expect(courseTag('y')).not.toBe(CACHE_TAGS.COURSES)
    })
})
