import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const saveUserConsents = vi.fn()
const routerPush = vi.fn()
const routerRefresh = vi.fn()

vi.mock('@/lib/actions/compliance', () => ({
    saveUserConsents,
}))

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: routerPush, refresh: routerRefresh }),
}))

afterEach(() => {
    vi.clearAllMocks()
})

describe('<ConsentPage />', () => {
    it('renders title + 4 required checkboxes + submit button', async () => {
        const ConsentPage = (await import('../page')).default
        render(<ConsentPage />)
        expect(screen.getByText('Akceptacja regulaminów')).toBeInTheDocument()
        expect(screen.getByLabelText(/Akceptuję Regulamin/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/Polityką prywatności/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/przetwarzanie danych osobowych/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/narzędzi AI/i)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /Przejdź do systemu/ })).toBeInTheDocument()
    })

    it('submit button disabled when no checkboxes are ticked', async () => {
        const ConsentPage = (await import('../page')).default
        render(<ConsentPage />)
        const btn = screen.getByRole('button', { name: /Przejdź do systemu/ })
        expect(btn).toBeDisabled()
    })

    it('submit button STAYS disabled until ALL 4 checkboxes are ticked', async () => {
        const user = userEvent.setup()
        const ConsentPage = (await import('../page')).default
        render(<ConsentPage />)
        const btn = screen.getByRole('button', { name: /Przejdź do systemu/ })

        const checkboxes = screen.getAllByRole('checkbox')
        expect(checkboxes).toHaveLength(4)

        // Click 3 of 4 — still disabled
        await user.click(checkboxes[0])
        await user.click(checkboxes[1])
        await user.click(checkboxes[2])
        expect(btn).toBeDisabled()

        // Click 4th — now enabled
        await user.click(checkboxes[3])
        expect(btn).not.toBeDisabled()
    })

    it('calls saveUserConsents with all 4 flags=true on submit', async () => {
        saveUserConsents.mockResolvedValue({})
        const user = userEvent.setup()
        const ConsentPage = (await import('../page')).default
        render(<ConsentPage />)

        for (const cb of screen.getAllByRole('checkbox')) {
            await user.click(cb)
        }
        await user.click(screen.getByRole('button', { name: /Przejdź do systemu/ }))

        await waitFor(() => expect(saveUserConsents).toHaveBeenCalledTimes(1))
        expect(saveUserConsents).toHaveBeenCalledWith({
            accepted_terms: true,
            accepted_privacy: true,
            accepted_data_processing: true,
            accepted_ai: true,
        })
    })

    it('redirects to /home + refreshes on successful save', async () => {
        saveUserConsents.mockResolvedValue({})
        const user = userEvent.setup()
        const ConsentPage = (await import('../page')).default
        render(<ConsentPage />)
        for (const cb of screen.getAllByRole('checkbox')) await user.click(cb)
        await user.click(screen.getByRole('button', { name: /Przejdź do systemu/ }))
        await waitFor(() => expect(routerPush).toHaveBeenCalledWith('/home'))
        expect(routerRefresh).toHaveBeenCalled()
    })

    it('shows error message when saveUserConsents returns error', async () => {
        saveUserConsents.mockResolvedValue({ error: 'Błąd zapisu zgód.' })
        const user = userEvent.setup()
        const ConsentPage = (await import('../page')).default
        render(<ConsentPage />)
        for (const cb of screen.getAllByRole('checkbox')) await user.click(cb)
        await user.click(screen.getByRole('button', { name: /Przejdź do systemu/ }))
        await waitFor(() => expect(screen.getByText('Błąd zapisu zgód.')).toBeInTheDocument())
        // Should NOT redirect on error
        expect(routerPush).not.toHaveBeenCalled()
    })

    it('renders "Przeczytaj dokument" links pointing to /docs/<slug> for relevant checkboxes', async () => {
        const ConsentPage = (await import('../page')).default
        render(<ConsentPage />)
        const links = screen.getAllByText(/Przeczytaj dokument/)
        // 3 checkboxy mają docSlug (terms, privacy, ai); data_processing nie ma
        expect(links.length).toBe(3)
        for (const link of links) {
            expect(link.closest('a')?.getAttribute('href')).toMatch(/^\/docs\//)
        }
    })

    it('mentions IP + timestamp footer for transparency (RODO)', async () => {
        const ConsentPage = (await import('../page')).default
        const { container } = render(<ConsentPage />)
        expect(container.textContent).toMatch(/IP/i)
        expect(container.textContent).toMatch(/zarejestrowana/i)
    })
})
