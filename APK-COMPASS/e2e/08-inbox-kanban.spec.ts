import { test, expect } from '@playwright/test'
import { loginAs, TEST_USERS } from './helpers/test-users'

/**
 * E2E smoke for the Inbox Kanban (Phase 10 — Moduł Obsługi Zgłoszeń).
 * Verifies:
 *   - Auth guard redirects unauthenticated users.
 *   - Consultant role is redirected away from /admin/inbox (only handlers can view).
 *   - Admin role can access /admin/inbox and sees the 5 status columns.
 */

test.describe('Inbox Kanban — guards', () => {
    test('unauthenticated /admin/inbox → redirect to /login', async ({ page }) => {
        await page.goto('/admin/inbox', { waitUntil: 'networkidle' })
        await page.waitForURL(/\/login/, { timeout: 30_000 })
        await expect(page).toHaveURL(/\/login/)
    })

    test('consultant role → redirect away from /admin/inbox', async ({ page }) => {
        const user = TEST_USERS.consultant()
        await loginAs(page, user)
        await page.goto('/admin/inbox', { waitUntil: 'networkidle' })
        // Either redirected to /home or to /login (depends on guard wiring)
        await page.waitForURL(/\/(home|login)/, { timeout: 15_000 })
        expect(page.url()).not.toContain('/admin/inbox')
    })

    test('admin role → can view Kanban board with 5 columns', async ({ page }) => {
        const user = TEST_USERS.admin()
        await loginAs(page, user)
        await page.goto('/admin/inbox', { waitUntil: 'networkidle' })
        await expect(page).toHaveURL(/\/admin\/inbox/)

        // Verify the 5 status column headings are present (Polish labels from TICKET_STATUS_LABEL)
        await expect(page.getByText('Otwarte')).toBeVisible()
        await expect(page.getByText('W trakcie')).toBeVisible()
        await expect(page.getByText('Oczekuje na Ciebie')).toBeVisible()
        await expect(page.getByText('Rozwiązane')).toBeVisible()
        await expect(page.getByText('Zamknięte')).toBeVisible()

        // The "Nowe zgłoszenie" CTA must be visible
        await expect(page.getByRole('button', { name: /Nowe zgłoszenie/ })).toBeVisible()
    })
})
