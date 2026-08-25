import { defineConfig, devices } from '@playwright/test'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.test' })

// Audyt 2026-08 (A0.5): tu był fallback na 'https://compass.dynaminds.pl', czyli
// PRODUKCJĘ. Zestaw e2e zawiera testy piszące (e2e/04-rls-database.spec.ts robi
// POST /auth/v1/signup), a w produkcyjnym auth.users siedzi konto
// e2e+consultant@b2bnetwork.pl z logowaniem 2026-04-29 — czyli to już się działo.
// Brak stagingu jest świadomą decyzją, więc jedyną obroną jest wymóg jawnego adresu:
// kto chce puścić testy przeciw produkcji, musi to napisać wprost.
const BASE_URL = process.env.BASE_URL || process.env.PLAYWRIGHT_BASE_URL

if (!BASE_URL) {
    throw new Error(
        'Brak BASE_URL. Ustaw adres testowanej instancji, np. BASE_URL=http://localhost:10000 ' +
            '(lokalnie) albo skopiuj .env.test.example do .env.test. ' +
            'Fallback na produkcję został usunięty — zestaw e2e zawiera testy piszące.',
    )
}

export default defineConfig({
    testDir: './e2e',
    timeout: 60_000,
    expect: { timeout: 10_000 },
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 1,
    workers: 1,
    reporter: process.env.CI
        ? [['github'], ['html', { open: 'never' }]]
        : [['list'], ['html', { open: 'never' }]],
    use: {
        baseURL: BASE_URL,
        headless: true,
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
        trace: 'retain-on-failure',
        actionTimeout: 15_000,
        navigationTimeout: 30_000,
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
})
