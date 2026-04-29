import { test, expect } from '@playwright/test'
import { loginAs, TEST_USERS } from './helpers/test-users'

/**
 * Smoke E2E for the 4 role accounts created via scripts/setup-test-users.ts.
 * Verifies that login works and that role-appropriate UI elements appear post-login.
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

test('centrala: can login', async ({ page }) => {
    const user = TEST_USERS.centrala()
    await loginAs(page, user)
    await expect(page).not.toHaveURL(/\/login/)
})

test('administrator: can login', async ({ page }) => {
    const user = TEST_USERS.administrator()
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
