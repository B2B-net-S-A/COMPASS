import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import MyCoursesPage from '../page'
import AuthorAnalyticsPage from '../analytics/page'
import NewCoursePage from '../nowy/page'
import { getAcademyAccess } from '@/lib/actions/academy-access'
import { getMyCourses } from '@/lib/actions/courses'
import { getAdminLmsAnalytics, getAuthorAnalytics } from '@/lib/actions/courses-analytics'
const mocks = vi.hoisted(() => ({ role: 'talent_community' }))
vi.mock('@/lib/actions/academy-access', () => ({ getAcademyAccess: vi.fn() }))
vi.mock('@/lib/actions/courses', () => ({ getMyCourses: vi.fn() }))
vi.mock('@/lib/actions/courses-analytics', () => ({ getAdminLmsAnalytics: vi.fn(), getAuthorAnalytics: vi.fn() }))
vi.mock('@/components/academy/MaterialScanQueue', () => ({ MaterialScanQueue: () => <p>Kontrola skanera</p> }))
vi.mock('@/components/academy/CourseSurveyHistory', () => ({ CourseSurveyHistory: () => null }))
vi.mock('../nowy/NewCourseClient', () => ({ NewCourseClient: ({ allowCompanyType, defaultCourseType }: { allowCompanyType: boolean; defaultCourseType: string }) => <p>{allowCompanyType ? 'Można tworzyć firmowe' : 'Tylko konsultanta'} · {defaultCourseType}</p> }))
vi.mock('@/lib/supabase/server', () => ({ createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'tcm' } } }) }, from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { role: mocks.role } }) }) }) }) }) }))
beforeEach(() => {
    mocks.role = 'talent_community'
    vi.mocked(getAcademyAccess).mockResolvedValue({ success: true, data: { userId: 'tcm', isAdmin: false, canTeach: true, canManageAcademy: true, rolloutMode: 'closed', isPilot: false } })
    vi.mocked(getMyCourses).mockResolvedValue({ success: true, data: [{ id: 'foreign-course', title: 'Szkolenie innego autora', category: 'AI', status: 'draft', delivery_mode: 'live', can_edit: true, can_lead: true, version_status: 'draft' }] as never })
    vi.mocked(getAdminLmsAnalytics).mockResolvedValue({ success: true, data: { total_published_courses: 4, total_pending_review: 2, total_enrollments: 96, total_completions: 0, overall_completion_rate: 0, average_rating_all: 0, top_courses: [], monthly_enrollments: [] } })
})
afterEach(cleanup)
it('offers editing and editions for another author while hiding admin moderation', async () => {
    render(await MyCoursesPage())
    expect(screen.getByRole('heading', { name: 'Edytor Akademii' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Edytuj szkic' })).toHaveAttribute('href', '/learning/tworze/foreign-course/edit')
    expect(screen.getByRole('link', { name: 'Edycje' })).toHaveAttribute('href', '/learning/tworze/foreign-course/edycje')
    expect(screen.getByText('Kontrola skanera')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Administracja' })).not.toBeInTheDocument()
})
it('uses global analytics for TCM without a link to the admin moderation queue', async () => {
    render(await AuthorAnalyticsPage())
    expect(getAdminLmsAnalytics).toHaveBeenCalledOnce()
    expect(getAuthorAnalytics).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'Raport całej Akademii' })).toBeInTheDocument()
    expect(screen.getByText('96')).toBeInTheDocument()
    expect(document.querySelector('a[href="/admin/learning"]')).toBeNull()
})
it.each([['talent_community', 'Można tworzyć firmowe · company'], ['internal', 'Tylko konsultanta · consultant']] as const)('company creation selector is scoped to %s', async (role, expected) => {
    mocks.role = role
    render(await NewCoursePage({ searchParams: { type: 'company' } }))
    expect(screen.getByText(expected)).toBeInTheDocument()
})
