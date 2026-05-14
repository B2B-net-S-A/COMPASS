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

// Self-signup wyłączony (admin invite flow zastępuje) — testy mode='signup' usunięte.
// Nowe konta są tworzone wyłącznie przez admin invite w /admin/settings/users.
// Stara `signup()` server action zachowana ale UI jej nie wywołuje.
describe('<LoginPage /> — self-signup is disabled', () => {
    it('does not render signup toggle button in footer', async () => {
        const LoginPage = (await import('../page')).default
        render(<LoginPage />)
        // Brak buttona "Zarejestruj się" w footerze (tylko "Zaloguj się" submit button jeśli w trybie login)
        const toggleButtons = screen.queryAllByRole('button', { name: /Zarejestruj się/i })
        expect(toggleButtons).toHaveLength(0)
    })

    it('shows hint "skontaktuj się z administratorem" in footer', async () => {
        const LoginPage = (await import('../page')).default
        render(<LoginPage />)
        expect(screen.getByText(/Skontaktuj się z administratorem/i)).toBeInTheDocument()
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
