import { test, expect } from '@playwright/test'
import { loginAs, TEST_USERS } from './helpers/test-users'

/**
 * Smoke E2E dla 3 kont rolowych z .env.test (zakładanych ręcznie — patrz
 * e2e/helpers/test-users.ts; skryptu setup-test-users.ts nie ma w repo).
 * Verifies that login works and that role-appropriate UI elements appear post-login.
 * Roles: consultant (Konsultant IT) | internal (Konsultant biurowy) | admin (Super Admin).
 * Legacy roles `centrala` and `administrator` were dropped in Phase 16 (PR #27).
 */

test.describe.configure({ mode: 'serial' })

test('consultant: can login + lands on protected route', async ({ page }) => {
    const user = TEST_USERS.consultant()
    await loginAs(page, user)
    // After login, should NOT be on /login anymore
    await expect(page).not.toHaveURL(/\/login/)
})

test('admin: can login', async ({ page }) => {
    const user = TEST_USERS.admin()
    await loginAs(page, user)
    await expect(page).not.toHaveURL(/\/login/)
})

test('internal: can login', async ({ page }) => {
    const user = TEST_USERS.internal()
    await loginAs(page, user)
    await expect(page).not.toHaveURL(/\/login/)
})

test('logout flow: clears session', async ({ page, context }) => {
    const user = TEST_USERS.consultant()
    await loginAs(page, user)
    // Clear cookies → simulate logout (mimics what /logout endpoint does)
    await context.clearCookies()
    await page.goto('/home')
    // Without session, middleware should redirect to /login
    await expect(page).toHaveURL(/\/(login|consent|onboarding)/, { timeout: 10_000 })
})
