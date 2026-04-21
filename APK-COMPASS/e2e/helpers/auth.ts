import { Page, expect } from '@playwright/test'

function requireEnv(name: string): string {
    const value = process.env[name]
    if (!value) {
        throw new Error(`${name} must be set in environment for E2E tests`)
    }
    return value
}

/**
 * Loguje użytkownika przez UI (email + hasło).
 * Po logowaniu oczekuje przekierowania na /home.
 */
export async function loginViaUI(page: Page, email?: string, password?: string) {
    const userEmail = email || requireEnv('TEST_USER_EMAIL')
    const userPass = password || requireEnv('TEST_USER_PASSWORD')

    await page.goto('/login', { waitUntil: 'networkidle' })

    // Wypełnij formularz logowania (selektory oparte na ID — stabilne)
    await page.locator('#email').fill(userEmail)
    await page.locator('#password').fill(userPass)
    await page.locator('button[type="submit"]').click()

    // Czekaj na MFA dialog lub redirect
    try {
        const mfaInput = page.locator('input[name="mfa-code"], input[placeholder*="kod"], input[placeholder*="code"]')
        await mfaInput.waitFor({ state: 'visible', timeout: 5000 })
        // MFA detected — fall through to wait for redirect; test account must bypass or supply code elsewhere
    } catch {
        // No MFA — login should redirect to /home
    }

    // Poczekaj na dashboard
    await page.waitForURL(/\/(home|admin)/, { timeout: 30000 })
}

/**
 * Loguje przez Supabase API i ustawia cookies na stronie.
 * Szybsza alternatywa do loginViaUI.
 */
export async function loginViaAPI(page: Page) {
    const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
    const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
    if (!supabaseUrl || !anonKey) {
        throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY (or NEXT_PUBLIC_*) must be set for loginViaAPI')
    }
    const email = requireEnv('TEST_USER_EMAIL')
    const password = requireEnv('TEST_USER_PASSWORD')

    // Signup/login via Supabase REST API
    const response = await page.request.post(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
        headers: {
            'apikey': anonKey,
            'Content-Type': 'application/json',
        },
        data: { email, password },
    })

    if (!response.ok()) {
        throw new Error(`Login API failed: ${response.status()} ${await response.text()}`)
    }

    const data = await response.json()
    const accessToken = data.access_token
    const refreshToken = data.refresh_token

    // Ustawienie cookies Supabase Auth na stronie
    await page.goto('/login')
    await page.evaluate(({ accessToken, refreshToken, supabaseUrl }) => {
        // Supabase SSR przechowuje sesję w cookies
        const projectRef = new URL(supabaseUrl).hostname.split('.')[0]
        const cookieName = `sb-${projectRef}-auth-token`
        const session = JSON.stringify({
            access_token: accessToken,
            refresh_token: refreshToken,
            token_type: 'bearer',
        })
        document.cookie = `${cookieName}=${encodeURIComponent(session)}; path=/; max-age=3600; SameSite=Lax`
    }, { accessToken, refreshToken, supabaseUrl })

    // Nawiguj na stronę główną
    await page.goto('/home')
    await page.waitForLoadState('networkidle')
}
