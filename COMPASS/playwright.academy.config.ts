import { defineConfig, devices } from '@playwright/test'

// Osobny zestaw akceptacyjny Akademii (B0.7). Uruchamiany ręcznie z laptopa albo przez workflow_dispatch.
// Bez nagrań, śladów i automatycznych zrzutów: artefakty GH nie mogą zawierać ekranów z produkcji,
// a jedyną drogą zrzutu jest wgranie go przez człowieka do prywatnego bucketu w panelu Gotowość.
const BASE_URL = process.env.ACADEMY_E2E_BASE_URL
if (!BASE_URL) throw new Error('Ustaw ACADEMY_E2E_BASE_URL, adres testowanej instancji COMPASS.')

// Scenariusze kończące się dokumentem zostawiają nieusuwalne ukończenia, więc idą tylko przy zmianie ich ścieżek.
const INCLUDE_DOCUMENT = process.env.ACADEMY_E2E_INCLUDE_DOCUMENT === 'true'

export default defineConfig({
    testDir: './e2e/academy-acceptance',
    grepInvert: INCLUDE_DOCUMENT ? undefined : /@document/,
    timeout: 60_000,
    expect: { timeout: 10_000 },
    fullyParallel: false,
    forbidOnly: true,
    retries: 0,
    workers: 1,
    reporter: [['list']],
    use: {
        baseURL: BASE_URL,
        headless: true,
        // Reguła Cloudflare odrzuca runnery GH bez tego znacznika.
        userAgent: 'dynaminds-smoke-test/1.0 academy-acceptance',
        screenshot: 'off',
        video: 'off',
        trace: 'off',
    },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], userAgent: 'dynaminds-smoke-test/1.0 academy-acceptance' } }],
})
