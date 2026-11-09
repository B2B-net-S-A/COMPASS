import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AdminAkademiaPage from '../page'

const actions = vi.hoisted(() => ({ reviewQueue: vi.fn(), materialQueue: vi.fn(), access: vi.fn(), nav: vi.fn() }))

vi.mock('@/lib/actions/courses-admin', () => ({ getReviewQueue: actions.reviewQueue }))
vi.mock('@/lib/actions/academy-access', () => ({ getAcademyAccess: actions.access }))
vi.mock('@/components/academy/AcademyAdminNav', () => ({ AcademyAdminNav: actions.nav }))
vi.mock('@/components/academy/RunMaterialReviewQueue', () => ({ RunMaterialReviewQueue: actions.materialQueue }))

beforeEach(() => {
    actions.reviewQueue.mockResolvedValue({ success: true, data: { items: [], total: 1001, page: 21, pageSize: 50 } })
    actions.access.mockResolvedValue({ success: true, data: { isAdmin: true, canTeach: true, canReview: true } })
    actions.nav.mockReturnValue(null)
})

describe('administrator review queue navigation', () => {
    it('shows the real total and lets administrators return from a page beyond the default API limit', async () => {
        render(await AdminAkademiaPage({ searchParams: { page: '21' } }))

        expect(actions.reviewQueue).toHaveBeenCalledWith(21)
        expect(screen.getByText('1001')).toBeInTheDocument()
        const navigation = within(screen.getByRole('navigation', { name: 'Strony kolejki akceptacji' }))
        expect(navigation.getByText('Strona 21 z 21')).toBeInTheDocument()
        expect(navigation.getByRole('link', { name: '← Poprzednia strona' })).toHaveAttribute('href', '/admin/learning?page=20')
        expect(navigation.queryByRole('link', { name: 'Następna strona →' })).not.toBeInTheDocument()
        expect(screen.getByText('Brak zgłoszeń na tej stronie')).toBeInTheDocument()
    })

    it('offers the next page when another pending version exists', async () => {
        actions.reviewQueue.mockResolvedValue({ success: true, data: { items: [], total: 1001, page: 20, pageSize: 50 } })
        render(await AdminAkademiaPage({ searchParams: { page: '20' } }))

        const navigation = within(screen.getByRole('navigation', { name: 'Strony kolejki akceptacji' }))
        expect(navigation.getByRole('link', { name: 'Następna strona →' })).toHaveAttribute('href', '/admin/learning?page=21')
    })

    it('shows a TCM reviewer only the queue, without the administrator screens', async () => {
        actions.access.mockResolvedValue({ success: true, data: { isAdmin: false, canManageAcademy: true, canTeach: true, canReview: true } })
        render(await AdminAkademiaPage({ searchParams: { page: '21' } }))

        expect(actions.nav).toHaveBeenCalledWith({ active: 'review', reviewOnly: true }, {})
        expect(screen.getByRole('link', { name: 'Akceptacja szkoleń' })).toHaveAttribute('href', '/admin/learning')
        expect(screen.queryByRole('link', { name: 'Administracja' })).not.toBeInTheDocument()
    })

    it('keeps the full administrator navigation for an admin', async () => {
        render(await AdminAkademiaPage({ searchParams: { page: '21' } }))

        expect(actions.nav).toHaveBeenCalledWith({ active: 'review', reviewOnly: false }, {})
        expect(screen.getByRole('link', { name: 'Administracja' })).toBeInTheDocument()
    })

    it('keeps the material review page when navigating the course queue', async () => {
        render(await AdminAkademiaPage({ searchParams: { page: '20', materialPage: '5' } }))

        expect(actions.materialQueue).toHaveBeenCalledWith({ page: 5, coursePage: 20 }, {})
        const navigation = within(screen.getByRole('navigation', { name: 'Strony kolejki akceptacji' }))
        expect(navigation.getByRole('link', { name: '← Poprzednia strona' })).toHaveAttribute('href', '/admin/learning?page=19&materialPage=5')
    })
})
