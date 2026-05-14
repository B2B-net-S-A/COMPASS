import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const replace = vi.fn()
let searchParamsValue = ''

vi.mock('next/navigation', () => ({
    useRouter: () => ({ replace, push: vi.fn() }),
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

describe('<SearchInput />', () => {
    it('renders an input with the placeholder', async () => {
        const { SearchInput } = await import('../SearchInput')
        render(<SearchInput placeholder="Szukaj..." />)
        expect(screen.getByPlaceholderText('Szukaj...')).toBeInTheDocument()
    })

    it('pre-fills with the current ?q value from URL', async () => {
        searchParamsValue = 'q=Kowalski'
        const { SearchInput } = await import('../SearchInput')
        render(<SearchInput placeholder="Szukaj" />)
        const input = screen.getByPlaceholderText('Szukaj') as HTMLInputElement
        expect(input.defaultValue).toBe('Kowalski')
    })

    it('calls router.replace with debounced query on user input', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true })
        const { SearchInput } = await import('../SearchInput')
        render(<SearchInput placeholder="Szukaj" />)
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
        const input = screen.getByPlaceholderText('Szukaj')
        await user.type(input, 'Jan')
        // Debounce window is 300ms — advance fake timers
        vi.advanceTimersByTime(400)
        expect(replace).toHaveBeenCalled()
        const lastCall = replace.mock.calls[replace.mock.calls.length - 1][0]
        expect(lastCall).toContain('q=Jan')
        vi.useRealTimers()
    })
})
