import { test, expect } from '@playwright/test'

/**
 * Phase 26 — Bonuses (assigned workflow) E2E smoke test.
 *
 * Strategy: thin smoke — verify routes mount and Phase 26 flow doesn't 5xx.
 *   - `/internal?tab=bonuses` (employee view, read-only)
 *   - `/internal/admin?tab=bonuses` (admin/manager view, assign + edit + cancel)
 *
 * Full happy-path test requires:
 *   - seeded 'manager' user + direct report
 *   - test bonuses table state (insert + cleanup)
 *   - email/push interception (Graph/web-push mocks)
 *
 * Those need dedicated test seed + mock infrastructure — out of scope here.
 * This file catches obvious regressions: import errors, missing components, hard 500s.
 */

test.describe('Bonuses (Phase 26) — smoke', () => {
    test('unauthorized user redirected from /internal?tab=bonuses', async ({ page }) => {
        await page.goto('/internal?tab=bonuses')
        // Middleware should redirect to /login (or /home for consultant who has no HR zone).
        await expect(page).not.toHaveURL(/\/internal\?tab=bonuses$/)
    })

    test('admin bonuses tab route mounts without 5xx', async ({ page }) => {
        const resp = await page.goto('/internal/admin?tab=bonuses')
        expect(resp?.status()).toBeLessThan(500)
        expect([200, 302, 303, 307, 308]).toContain(resp?.status() ?? 0)
    })

    test('invoices tab is hidden when feature flag off', async ({ page }) => {
        // With NEXT_PUBLIC_INVOICES_ENABLED!=='true', the page should not render an
        // active "Faktury" tab. We accept either redirect (unauth) or 200 with no faktury text.
        const resp = await page.goto('/internal')
        if (resp && resp.status() === 200) {
            const body = await page.content()
            // Tab label "Faktury" should NOT appear in employee hub when flag off.
            // (If flag back on in future, this assertion needs revisit.)
            const flagOff = process.env.NEXT_PUBLIC_INVOICES_ENABLED !== 'true'
            if (flagOff) {
                expect(body).not.toContain('>Faktury<')
            }
        } else {
            // Unauthed redirect — also valid.
            expect(resp?.status()).toBeLessThan(500)
        }
    })
})
