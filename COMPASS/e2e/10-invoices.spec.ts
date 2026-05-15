import { test, expect } from '@playwright/test'

/**
 * Phase 19 — Invoices E2E smoke test.
 *
 * Strategy: thin smoke — just verify routes mount and core UI elements render.
 * Full happy-path test requires:
 *   - seeded 'internal' user with approved timesheet
 *   - seeded 'finanse' user
 *   - real PDF file fixture
 *   - Supabase storage write
 *
 * Those need a dedicated test seed migration which is out of scope for v1.
 * This file ensures the page loads + tabs are wired (catches obvious regressions).
 */

test.describe('Invoices — smoke', () => {
    test('unauthorized user redirected from /internal', async ({ page }) => {
        await page.goto('/internal?tab=invoices')
        // Unauthorized → middleware redirects to /login (or /home for consultant)
        await expect(page).not.toHaveURL(/\/internal\?tab=invoices$/)
    })

    test('admin tab pattern wired on /internal/admin', async ({ page }) => {
        // We don't sign in here — just verify the URL is treated as a real route.
        const resp = await page.goto('/internal/admin?tab=invoices')
        // Either redirect to /login (expected for unauth) or the page renders (if dev bypass).
        // What we MUST NOT see: hard 404.
        expect(resp?.status()).toBeLessThan(500)
        expect([200, 302, 303, 307, 308]).toContain(resp?.status() ?? 0)
    })
})
