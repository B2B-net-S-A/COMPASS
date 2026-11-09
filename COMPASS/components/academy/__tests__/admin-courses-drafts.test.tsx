import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AcademyAdminCourses } from '../AcademyAdminCourses'
import type { AcademyAdminCourse, AcademyAdminCoursePage } from '@/lib/types/academy-admin'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), usePathname: () => '/', useSearchParams: () => new URLSearchParams() }))
vi.mock('@/lib/actions/courses-admin', () => ({ archiveCourse: vi.fn(), restoreCourse: vi.fn() }))
vi.mock('@/lib/actions/courses', () => ({ deleteDraftCourse: vi.fn() }))
afterEach(cleanup)

const published: AcademyAdminCourse = { id: 'course', title: 'Warsztat SQL', status: 'published', authorName: 'Autorka', publishedVersionNumber: 2, draftVersion: null, legacyReviewRequired: false }
const mount = (item: AcademyAdminCourse) => { const page: AcademyAdminCoursePage = { page: 1, pageSize: 25, total: 1, items: [item] }; render(<AcademyAdminCourses result={page} search="" status="all" />) }

describe('przywracanie i usuwanie w inwentarzu', () => {
    it('archiwum można przywrócić, ale nie usunąć', () => {
        mount({ ...published, status: 'archived' })
        expect(screen.getByRole('button', { name: 'Przywróć z archiwum' })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Usuń szkic' })).not.toBeInTheDocument()
    })
    it('niepublikowany szkic można usunąć', () => {
        mount({ ...published, status: 'draft', publishedVersionNumber: null })
        expect(screen.getByRole('button', { name: 'Usuń szkic' })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Przywróć z archiwum' })).not.toBeInTheDocument()
    })
    it('opublikowanego kursu nie można usunąć', () => {
        mount(published)
        expect(screen.queryByRole('button', { name: 'Usuń szkic' })).not.toBeInTheDocument()
    })
})
