/**
 * Test user credential helpers.
 * Loads from .env.test (gitignored) — populated by scripts/setup-test-users.ts.
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
        throw new Error(`Missing ${name} in .env.test — run scripts/setup-test-users.ts first`)
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
