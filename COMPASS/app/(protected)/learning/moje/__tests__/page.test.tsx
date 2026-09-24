import { beforeEach, expect, it, vi } from 'vitest'
import MyEnrollmentsPage from '../page'
import { getMyEnrollmentsPage } from '@/lib/actions/course-learning'
import { getAcademyAccess } from '@/lib/actions/academy-access'
import { getMyAcademyRunOverview } from '@/lib/actions/academy-sessions'
import { redirect } from 'next/navigation'

vi.mock('@/lib/actions/course-learning', () => ({ getMyEnrollmentsPage: vi.fn() }))
vi.mock('@/lib/actions/academy-access', () => ({ getAcademyAccess: vi.fn() }))
vi.mock('@/lib/actions/academy-sessions', () => ({ getMyAcademyRunOverview: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn(() => { throw new Error('redirected') }) }))
vi.mock('@/components/academy/AcademyShell', () => ({ AcademyShell: () => null }))
vi.mock('@/components/academy/AcademyMyLearning', () => ({ AcademyMyLearning: () => null }))

beforeEach(() => {
    vi.mocked(getAcademyAccess).mockResolvedValue({ success: true, data: { userId: 'user', isAdmin: false, canTeach: false, rolloutMode: 'open', isPilot: false } })
    vi.mocked(getMyEnrollmentsPage).mockResolvedValue({ success: true, data: {
        items: [], totals: { active: 0, completed: 0, revoked: 0 },
        activePage: 2, completedPage: 1, revokedPage: 1, pageSize: 24,
    } })
    vi.mocked(getMyAcademyRunOverview).mockResolvedValue({ success: true, data: {
        waiting: { items: [], total: 10, page: 3, pageSize: 25 }, upcoming: null,
    } })
})

it('returns from an out-of-range waitlist page while keeping the enrollment pages', async () => {
    await expect(MyEnrollmentsPage({ searchParams: { activePage: '2', waitlistPage: '3' } })).rejects.toThrow('redirected')
    expect(getMyAcademyRunOverview).toHaveBeenCalledWith(3)
    expect(redirect).toHaveBeenCalledWith('/learning/moje?activePage=2&completedPage=1&revokedPage=1&waitlistPage=1')
})
