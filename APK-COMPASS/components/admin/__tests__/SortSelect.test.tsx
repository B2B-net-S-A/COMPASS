import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const replace = vi.fn()
let searchParamsValue = ''

vi.mock('next/navigation', () => ({
    useRouter: () => ({ replace, push: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
    useSearchParams: () => new URLSearchParams(searchParamsValue),
    usePathname: () => '/admin/candidates',
}))

beforeEach(() => {
    replace.mockClear()
    searchParamsValue = ''
})

afterEach(() => {
    vi.clearAllMocks()
})

describe('<SortSelect />', () => {
    it('renders with the default placeholder/value when no ?sort param', async () => {
        const { SortSelect } = await import('../SortSelect')
        render(<SortSelect />)
        expect(screen.getByText(/Najnowsze|Sortuj/)).toBeInTheDocument()
    })

    it('reflects the currently selected ?sort=oldest from URL', async () => {
        searchParamsValue = 'sort=oldest'
        const { SortSelect } = await import('../SortSelect')
        render(<SortSelect />)
        expect(screen.getByText('Najstarsze')).toBeInTheDocument()
    })
})
