import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { CourseCatalog } from '../CourseCatalog'
import { nearestCatalogRun } from '../catalog/catalog-runs'
import { parseCatalogFilters } from '../catalog/catalog-filters'
import type { CourseListItem } from '@/lib/types/learning'

afterEach(cleanup)

const course = (id: string, title: string) => ({ id, slug: id, title, category: 'IT', description: null, delivery_mode: 'live', level: 'beginner', course_type: 'company', duration_minutes: null, ratings_count: 0, cover_image_url: null, tags: [] }) as unknown as CourseListItem
const run = (startsAt: string, full = false) => ({ runId: 'r', title: 'Edycja', startsAt, timeZone: 'Europe/Warsaw', full })
const nextRuns = { late: run('2027-03-20T09:00:00Z'), soon: run('2027-03-17T09:00:00Z', true) }
const heading = () => screen.queryByRole('heading', { name: 'Najbliższe szkolenie live' })
const show = (params = {}, page = 1, runs: typeof nextRuns | Record<string, never> = nextRuns) => render(<CourseCatalog filters={parseCatalogFilters(params)} page={page} courses={[course('late', 'Później'), course('soon', 'PEGA')]} total={2} canTeach={false} nextRuns={runs} />)

describe('nearestCatalogRun', () => {
    it('picks the earliest and handles an empty list', () => {
        expect(nearestCatalogRun(nextRuns)?.courseId).toBe('soon')
        expect(nearestCatalogRun({})).toBeNull()
    })
})

describe('nearest live block', () => {
    it('shows the earliest edition with its date and capacity', () => {
        show()
        expect(heading()).toBeInTheDocument()
        const section = heading()!.closest('section')!
        expect(section).toHaveTextContent('PEGA')
        expect(section).toHaveTextContent('17 marca 2027')
        expect(section).toHaveTextContent('brak wolnych miejsc')
        expect(section.querySelector('a')).toHaveAttribute('href', '/learning/soon')
    })
    it('is hidden with filters, on later pages and without upcoming editions', () => {
        show({ q: 'x' })
        expect(heading()).toBeNull()
        cleanup()
        show({}, 2)
        expect(heading()).toBeNull()
        cleanup()
        show({}, 1, {})
        expect(heading()).toBeNull()
    })
})
