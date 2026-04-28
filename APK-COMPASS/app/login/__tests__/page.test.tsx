import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../actions', () => ({
    login: vi.fn(),
    signup: vi.fn(),
    verifyMfaAction: vi.fn(),
}))

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

afterEach(() => {
    vi.clearAllMocks()
})

describe('<LoginPage /> — login mode', () => {
    it('renders by default in LOGIN mode (no signup-specific fields)', async () => {
        const LoginPage = (await import('../page')).default
        render(<LoginPage />)
        expect(screen.getByRole('button', { name: /Zaloguj się/ })).toBeInTheDocument()
        // No "Imię i Nazwisko" in login mode
        expect(screen.queryByLabelText(/Imię i Nazwisko/)).not.toBeInTheDocument()
        // No domain hint either
        expect(screen.queryByText(/Rejestracja dostępna tylko dla email/i)).not.toBeInTheDocument()
    })

    it('does NOT show GDPR consent checkbox in login mode', async () => {
        const LoginPage = (await import('../page')).default
        render(<LoginPage />)
        expect(screen.queryByText(/RODO/i)).not.toBeInTheDocument()
    })
})

describe('<LoginPage /> — signup mode (bug #001 fix)', () => {
    async function switchToSignup() {
        const user = userEvent.setup()
        const LoginPage = (await import('../page')).default
        render(<LoginPage />)
        // Click the "Zarejestruj się" toggle button (not submit; it's the button to switch mode)
        const toggleButtons = screen.getAllByRole('button', { name: /Zarejestruj się/ })
        // The one in the footer is the toggle; the submit one only appears AFTER toggling
        await user.click(toggleButtons[toggleButtons.length - 1])
        return user
    }

    it('shows the @b2bnetwork.pl domain hint under email field after switching to signup (FIX #001)', async () => {
        await switchToSignup()
        const hint = screen.getByText(/Rejestracja dostępna tylko dla email z domeny/i)
        expect(hint).toBeInTheDocument()
        // The hint should mention the specific domain
        expect(hint.textContent).toMatch(/@b2bnetwork\.pl/)
    })

    it('shows "Imię i Nazwisko" field in signup mode', async () => {
        await switchToSignup()
        expect(screen.getByLabelText(/Imię i Nazwisko/)).toBeInTheDocument()
    })

    it('shows GDPR consent label in signup mode', async () => {
        await switchToSignup()
        expect(screen.getByText(/RODO/i)).toBeInTheDocument()
    })

    it('hint disappears when switching back to login mode', async () => {
        const user = await switchToSignup()
        // Now toggle back to login by clicking the "Zaloguj się" footer button
        const toggleBack = screen.getByRole('button', { name: /Zaloguj się/i })
        await user.click(toggleBack)
        expect(screen.queryByText(/Rejestracja dostępna tylko dla email/i)).not.toBeInTheDocument()
    })
})

describe('<LoginPage /> — common controls', () => {
    it('has both email + password input fields with correct types', async () => {
        const LoginPage = (await import('../page')).default
        render(<LoginPage />)
        const email = screen.getByLabelText(/Email/i) as HTMLInputElement
        expect(email.type).toBe('email')
        // Password field — by label "Hasło"
        const password = screen.getByLabelText(/^Hasło$/i) as HTMLInputElement
        expect(password.type).toBe('password')
    })
})
