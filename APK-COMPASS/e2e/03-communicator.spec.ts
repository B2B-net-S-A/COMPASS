import { test, expect } from '@playwright/test'
import { loginViaUI } from './helpers/auth'

test.describe('Komunikator (Wiadomości)', () => {
    test.beforeEach(async ({ page }) => {
        await loginViaUI(page)
        await page.goto('/messages')
        await page.waitForLoadState('networkidle')
    })

    test('1. Strona wiadomości ładuje się poprawnie', async ({ page }) => {
        // Nagłówek "Wiadomości" (h2) — użyj getByRole by uniknąć strict mode
        await expect(page.getByRole('heading', { name: 'Wiadomości' })).toBeVisible()
        // Przycisk "Nowa" widoczny — użyj getByRole('button') by uniknąć strict mode
        await expect(page.getByRole('button', { name: 'Nowa' })).toBeVisible()
    })

    test('2. Kliknięcie "+Nowa" pokazuje listę odbiorców', async ({ page }) => {
        await page.getByRole('button', { name: 'Nowa' }).click()
        await page.waitForTimeout(2000)

        // Lista odbiorców powinna się pojawić
        await expect(page.getByPlaceholder('Szukaj osoby do napisania...')).toBeVisible()

        // Powinni być widoczni użytkownicy
        const userItems = page.locator('button').filter({ hasText: /Konsultant|Administrator|Centrala/ })
        await expect(userItems.first()).toBeVisible({ timeout: 5000 })
    })

    test('3. Tworzenie konwersacji nie zwraca błędu RLS', async ({ page }) => {
        await page.getByRole('button', { name: 'Nowa' }).click()
        await page.waitForTimeout(2000)

        // Kliknij na pierwszego dostępnego użytkownika
        const firstUser = page.locator('button').filter({ hasText: /Konsultant|Administrator|Centrala/ }).first()
        await firstUser.click()

        // NIE powinien pojawić się błąd RLS
        await page.waitForTimeout(3000)
        const errorToast = page.getByText('violates row-level security')
        await expect(errorToast).not.toBeVisible()

        // Powinno się otworzyć okno konwersacji z polem do wpisywania
        const messageInput = page.getByPlaceholder('Napisz wiadomość...')
        await expect(messageInput).toBeVisible({ timeout: 10000 })
    })
})
