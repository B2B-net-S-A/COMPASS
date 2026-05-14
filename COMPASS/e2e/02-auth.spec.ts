import { test, expect } from '@playwright/test'
import { loginViaUI } from './helpers/auth'

test.describe('Authentication Flow', () => {
    test('1. Login z poprawnymi danymi → dashboard /home', async ({ page }) => {
        await loginViaUI(page)

        // Powinniśmy być na /home
        await expect(page).toHaveURL(/\/home/)

        // Dashboard powinien zawierać nawigację (sidebar z linkami)
        await expect(page.locator('nav').first()).toBeVisible()
        // Strona ma wiele linków /home — sprawdzamy czy przynajmniej jeden istnieje
        await expect(page.locator('a[href="/home"]').first()).toBeVisible()
    })

    test('2. Po loginie widoczne kluczowe elementy nawigacji', async ({ page }) => {
        await loginViaUI(page)

        // Sprawdź podstawowe linki w sidebar (first() bo strona ma wiele linków)
        await expect(page.locator('a[href="/home"]').first()).toBeVisible()
        await expect(page.locator('a[href="/messages"]').first()).toBeVisible()
    })

    test('3. Przejście na /messages po loginie działa', async ({ page }) => {
        await loginViaUI(page)

        await page.locator('a[href="/messages"]').first().click()
        await page.waitForURL(/\/messages/, { timeout: 15000 })
        await expect(page).toHaveURL(/\/messages/)

        // Nagłówek "Wiadomości" widoczny — użyj getByRole by uniknąć strict mode
        await expect(page.getByRole('heading', { name: 'Wiadomości' })).toBeVisible()
    })
})
