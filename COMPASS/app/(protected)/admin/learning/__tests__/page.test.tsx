import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AdminAkademiaPage from '../page'

const actions = vi.hoisted(() => ({ reviewQueue: vi.fn(), legacyQueue: vi.fn() }))

vi.mock('@/lib/actions/courses-admin', () => ({ getReviewQueue: actions.reviewQueue, getLegacyReviewQueue: actions.legacyQueue }))
vi.mock('@/components/academy/RunMaterialReviewQueue', () => ({ RunMaterialReviewQueue: () => null }))

beforeEach(() => {
    actions.legacyQueue.mockResolvedValue({ success: true, data: [] })
    actions.reviewQueue.mockResolvedValue({ success: true, data: { items: [], total: 1001, page: 21, pageSize: 50 } })
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
})
