import { test, expect } from '@playwright/test'
import { loginViaUI } from './helpers/auth'

test.describe('Loyalty Program', () => {
    test('1. /loyalty bez logowania → redirect do /login', async ({ page }) => {
        await page.goto('/loyalty', { waitUntil: 'networkidle' })
        await page.waitForURL(/\/login/, { timeout: 30_000 })
        await expect(page).toHaveURL(/\/login/)
    })

    test('2. Admin widzi zakładkę "Punkty konsultantów"', async ({ page }) => {
        await loginViaUI(page)

        await page.goto('/loyalty', { waitUntil: 'networkidle' })
        await expect(page).toHaveURL(/\/loyalty/)

        // Admin powinien widzieć tab "Punkty konsultantów" (nie "Moje punkty")
        const adminTab = page.getByRole('tab', { name: /konsultant/i })
        await expect(adminTab).toBeVisible({ timeout: 15_000 })
    })

    test('3. Admin widzi tabelę konsultantów z punktami', async ({ page }) => {
        await loginViaUI(page)

        await page.goto('/loyalty', { waitUntil: 'networkidle' })

        // Karty statystyk powinny być widoczne
        await expect(page.getByText(/Konsultanci/i).first()).toBeVisible({ timeout: 15_000 })

        // Tabela konsultantów
        await expect(page.getByText(/Punkty konsultant/i).first()).toBeVisible()
    })

    test('4. Pozostałe taby programu lojalnościowego są dostępne', async ({ page }) => {
        await loginViaUI(page)

        await page.goto('/loyalty', { waitUntil: 'networkidle' })

        // Sprawdź że inne taby istnieją
        await expect(page.getByRole('tab', { name: /Przegląd/i })).toBeVisible()
        await expect(page.getByRole('tab', { name: /Poziomy/i })).toBeVisible()
        await expect(page.getByRole('tab', { name: /FAQ/i })).toBeVisible()
    })

    test('5. Tab Poziomy wyświetla 4 tiery', async ({ page }) => {
        await loginViaUI(page)

        await page.goto('/loyalty', { waitUntil: 'networkidle' })

        // Kliknij tab Poziomy
        await page.getByRole('tab', { name: /Poziomy/i }).click()

        // 4 tiery powinny być widoczne
        await expect(page.getByText('BRONZE')).toBeVisible({ timeout: 10_000 })
        await expect(page.getByText('SILVER')).toBeVisible()
        await expect(page.getByText('GOLD')).toBeVisible()
        await expect(page.getByText('PLATINUM')).toBeVisible()
    })
})
