import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RunMaterialReviewQueue } from '../RunMaterialReviewQueue'

const list = vi.hoisted(() => vi.fn())
vi.mock('@/lib/actions/academy-materials', () => ({ listAcademyRunMaterialReviews: list }))

describe('run material review navigation', () => {
    it('shows the full count and preserves the course review page', async () => {
        list.mockResolvedValue({ success: true, data: { items: [{ id: 'material', filename: 'Agenda.pdf', run_id: 'run' }], total: 126, page: 5, pageSize: 25 } })
        render(await RunMaterialReviewQueue({ page: 5, coursePage: 3 }))

        expect(list).toHaveBeenCalledWith(5)
        expect(screen.getByText('126')).toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'Agenda.pdf' })).toHaveAttribute('href', '/learning/edycje/run')
        const navigation = within(screen.getByRole('navigation', { name: 'Strony materiałów edycji do akceptacji' }))
        expect(navigation.getByRole('link', { name: '← Poprzednia strona' })).toHaveAttribute('href', '/admin/learning?page=3&materialPage=4')
        expect(navigation.getByRole('link', { name: 'Następna strona →' })).toHaveAttribute('href', '/admin/learning?page=3&materialPage=6')
    })
})
