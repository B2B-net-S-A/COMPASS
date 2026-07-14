import { test, expect } from '@playwright/test'

/**
 * Public pages smoke — no login required.
 * Verifies that legal docs, login flow, and footer links all render and respond 2xx.
 */

test.describe.configure({ mode: 'serial' })

test('GET / redirects to /login (or /home) — never 404/5xx', async ({ page }) => {
    const response = await page.goto('/')
    expect(response?.status()).toBeGreaterThanOrEqual(200)
    expect(response?.status()).toBeLessThan(400)
    // Should land on either /login or /home (depending on auth state)
    await expect(page).toHaveURL(/\/(login|home|onboarding)/)
})

test('GET /login renders the Compass login card', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByText('COMPASS').first()).toBeVisible()
    await expect(page.getByRole('button', { name: /Zaloguj się/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Zarejestruj się/ })).toBeVisible()
})

test('GET /forgot-password renders the reset form', async ({ page }) => {
    const response = await page.goto('/forgot-password')
    expect(response?.status()).toBe(200)
    await expect(page.locator('input[type="email"]').first()).toBeVisible()
})

test('GET /privacy-policy returns 200 and renders content', async ({ page }) => {
    const response = await page.goto('/privacy-policy')
    expect(response?.status()).toBe(200)
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(100) // has actual content
})

test('GET /terms returns 200 and renders content', async ({ page }) => {
    const response = await page.goto('/terms')
    expect(response?.status()).toBe(200)
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(100)
})

test('GET /help returns 200', async ({ page }) => {
    const response = await page.goto('/help')
    expect(response?.status()).toBe(200)
})

test('GET /support returns 200', async ({ page }) => {
    const response = await page.goto('/support')
    expect(response?.status()).toBe(200)
})

test('GET /api/health returns database-backed readiness and exact release metadata', async ({ request }) => {
    const response = await request.get('/api/health')
    expect(response.status()).toBe(200)
    expect(response.headers()['cache-control']).toContain('no-store')
    const body = await response.json()
    expect(['healthy', 'degraded']).toContain(body.status)
    expect(body.version).toMatch(/^[0-9a-f]{40}$/)
    expect(body.deployedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(body.checks.database.status).toBe('healthy')
    expect(body.checks.supabase).toEqual(body.checks.database)
})

test('GET /api/livez reports process liveness without checking dependencies', async ({ request }) => {
    const response = await request.get('/api/livez')
    expect(response.status()).toBe(200)
    expect(response.headers()['cache-control']).toContain('no-store')
    const body = await response.json()
    expect(body.status).toBe('alive')
    expect(body.version).toMatch(/^[0-9a-f]{40}$/)
})

test('GET /nonexistent-page-12345 returns 404 (or proper not-found)', async ({ page }) => {
    const response = await page.goto('/this-route-does-not-exist-12345')
    expect(response?.status()).toBeGreaterThanOrEqual(400)
})

test('signup: rejects email outside @b2bnetwork.pl domain (UX issue #001)', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('button', { name: /Zarejestruj się/ }).click()
    await page.fill('input[type="email"]', 'test@gmail.com')
    await page.fill('input[placeholder="Jan Kowalski"]', 'Test')
    await page.fill('input[type="password"]', 'ComPass-2026-Test!')
    await page.locator('input[type="checkbox"]').check()
    await page.getByRole('button', { name: /Zarejestruj się/ }).click()
    await expect(page.getByText(/dozwolona tylko dla domeny @b2bnetwork\.pl/)).toBeVisible()
})

test('login: rejects invalid credentials with friendly Polish message', async ({ page }) => {
    await page.goto('/login')
    await page.fill('input[type="email"]', 'nonexistent@b2bnetwork.pl')
    await page.fill('input[type="password"]', 'WrongPassword123!')
    await page.getByRole('button', { name: /Zaloguj się/ }).click()
    // expect either "Invalid login credentials" (English from Supabase) or Polish translation
    const errorVisible = await Promise.race([
        page.locator('text=/zalogow|nieprawidł|invalid/i').first().waitFor({ timeout: 8_000 }).then(() => true).catch(() => false),
    ])
    expect(errorVisible).toBe(true)
})
