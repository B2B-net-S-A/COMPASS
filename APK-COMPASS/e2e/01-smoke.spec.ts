import { test, expect } from '@playwright/test'

// Selektory formularza logowania (oparte na ID i typach — stabilne bez data-testid)
const SEL = {
    email: '#email',
    password: '#password',
    submit: 'button[type="submit"]',
}

// Render cold start może trwać 30-60s — dlatego pierwszy test "rozgrzewa" serwer
test.describe('Smoke Tests', () => {
    // Warmup: osobny test, który czeka na Render cold start
    test('0. Warmup: serwer Render odpowiada', async ({ page }) => {
        // Render cold start: daj do 90s na odpowiedź
        await page.goto('/login', { timeout: 90_000, waitUntil: 'networkidle' })
        await expect(page).toHaveURL(/\/(login|home)/)
    })

    test('1. Strona logowania ładuje się poprawnie', async ({ page }) => {
        await page.goto('/login', { waitUntil: 'networkidle' })
        await expect(page).toHaveTitle(/ComPass/i)

        // Formularz widoczny
        await expect(page.locator(SEL.email)).toBeVisible({ timeout: 15_000 })
        await expect(page.locator(SEL.password)).toBeVisible()
        await expect(page.locator(SEL.submit)).toBeVisible()
    })

    test('2. Auth guard: /home bez logowania → redirect do /login', async ({ page }) => {
        await page.goto('/home', { waitUntil: 'networkidle' })
        await page.waitForURL(/\/login/, { timeout: 30_000 })
        await expect(page).toHaveURL(/\/login/)
    })

    test('3. Auth guard: /messages bez logowania → redirect do /login', async ({ page }) => {
        await page.goto('/messages', { waitUntil: 'networkidle' })
        await page.waitForURL(/\/login/, { timeout: 30_000 })
        await expect(page).toHaveURL(/\/login/)
    })

    test('4. Auth guard: /admin/settings bez logowania → redirect do /login', async ({ page }) => {
        await page.goto('/admin/settings', { waitUntil: 'networkidle' })
        await page.waitForURL(/\/login/, { timeout: 30_000 })
        await expect(page).toHaveURL(/\/login/)
    })

    test('5. Strona /login wyświetla błąd przy złych danych', async ({ page }) => {
        await page.goto('/login', { waitUntil: 'networkidle' })
        await page.locator(SEL.email).fill('nieistnieje@test.pl')
        await page.locator(SEL.password).fill('zlehaslo123')
        await page.locator(SEL.submit).click()

        // Powinien pojawić się komunikat o błędzie (toast, alert, lub tekst na stronie)
        await expect(
            page.locator('text=/błąd|error|nieprawidłow|invalid|incorrect/i').first()
        ).toBeVisible({ timeout: 15_000 })
    })
})
