/**
 * Dane logowania kont testowych. Czytane z `.env.test` (poza repo).
 *
 * Audyt 2026-08: i ten plik, i `.env.test.example` odsyłały do
 * `scripts/setup-test-users.ts`, którego w repo NIE MA — nie da się więc
 * przygotować zestawu wg instrukcji. Konta zakłada się dziś ręcznie
 * (Administracja HR → Pracownicy → zaproś, albo Supabase Dashboard → Auth),
 * a ich adresy i hasło wpisuje do `.env.test`.
 *
 * UWAGA: nie ma środowiska testowego. Wskazanie `.env.test` na produkcję
 * oznacza testy przeciw danym 46 pracowników, a zestaw zawiera testy PISZĄCE
 * (e2e/04-rls-database.spec.ts robi POST /auth/v1/signup).
 */

import { type Page } from '@playwright/test'

export interface TestUser {
    email: string
    password: string
    role: 'consultant' | 'admin' | 'internal'
}

function need(name: string): string {
    const v = process.env[name]
    if (!v || v.startsWith('TODO')) {
        throw new Error(
            `Brak ${name} w .env.test — załóż konta testowe ręcznie i uzupełnij plik ` +
            `(wzór: .env.test.example).`,
        )
    }
    return v
}

export const TEST_USERS = {
    consultant(): TestUser {
        return { email: need('TEST_CONSULTANT_EMAIL'), password: need('TEST_PASSWORD'), role: 'consultant' }
    },
    admin(): TestUser {
        return { email: need('TEST_ADMIN_EMAIL'), password: need('TEST_PASSWORD'), role: 'admin' }
    },
    internal(): TestUser {
        return { email: need('TEST_INTERNAL_EMAIL'), password: need('TEST_PASSWORD'), role: 'internal' }
    },
}

/**
 * Login via UI form. Use when you also want to test the login flow itself.
 * For most tests, prefer loginViaAPI() (faster).
 */
export async function loginAs(page: Page, user: TestUser): Promise<void> {
    await page.goto('/login')
    await page.fill('input[type="email"]', user.email)
    await page.fill('input[type="password"]', user.password)
    await page.getByRole('button', { name: /Zaloguj się/ }).click()
    await page.waitForURL(url => !url.pathname.endsWith('/login'), { timeout: 15_000 })
}
