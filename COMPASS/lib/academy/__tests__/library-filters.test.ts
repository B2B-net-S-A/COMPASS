// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { catalogHref, formatLibrarySummary, matchesLibraryFormat, parseCatalogFilters } from '@/components/academy/catalog/catalog-filters'

const summary = (videos: number, materials: number, modules = 1, minutes = 30) => ({ videos, materials, modules, minutes })

describe('matchesLibraryFormat', () => {
    it('classifies by content, not by delivery mode alone', () => {
        expect(matchesLibraryFormat('video', 'self_paced', summary(2, 1))).toBe(true)
        expect(matchesLibraryFormat('video', 'self_paced', summary(0, 1))).toBe(false)
        expect(matchesLibraryFormat('materials', 'self_paced', summary(0, 1))).toBe(true)
        expect(matchesLibraryFormat('materials', 'self_paced', summary(1, 1))).toBe(false)
        expect(matchesLibraryFormat('materials', 'self_paced', summary(0, 0))).toBe(false)
        expect(matchesLibraryFormat('live', 'live', undefined)).toBe(true)
        expect(matchesLibraryFormat('live', 'self_paced', summary(1, 0))).toBe(false)
        expect(matchesLibraryFormat('test', 'assessment', undefined)).toBe(true)
    })
    it('excludes a course with no summary from content formats', () => {
        expect(matchesLibraryFormat('video', 'self_paced', undefined)).toBe(false)
        expect(matchesLibraryFormat('materials', 'self_paced', undefined)).toBe(false)
    })
})

describe('library filter parsing', () => {
    it('reads valid values and rejects unknown formats', () => {
        expect(parseCatalogFilters({ library: 'video', topic: ' DORA ' })).toMatchObject({ libraryFormat: 'video', topic: 'DORA' })
        expect(parseCatalogFilters({ library: 'hacked' }).libraryFormat).toBeUndefined()
        expect(parseCatalogFilters({ topic: 'x'.repeat(300) }).topic).toHaveLength(100)
    })
    it('round-trips through the URL and omits empty values', () => {
        const filters = parseCatalogFilters({ library: 'materials', topic: 'IT' })
        expect(catalogHref(filters)).toBe('/learning?library=materials&topic=IT')
        expect(catalogHref(parseCatalogFilters({}))).toBe('/learning')
    })
})

describe('formatLibrarySummary', () => {
    it('declines the Polish noun and adds the duration', () => {
        expect(formatLibrarySummary(summary(1, 0, 1, 45))).toBe('1 moduł, 45 min')
        expect(formatLibrarySummary(summary(1, 0, 3, 90))).toBe('3 moduły, 1 godz. 30 min')
        expect(formatLibrarySummary(summary(1, 0, 5, 0))).toBe('5 modułów')
        expect(formatLibrarySummary(summary(1, 0, 12, 0))).toBe('12 modułów')
        expect(formatLibrarySummary(summary(1, 0, 22, 0))).toBe('22 moduły')
    })
})
