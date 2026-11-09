import { expect, test } from '@playwright/test'

// Szkielet B0: same sprawdzenia bez logowania. Scenariusze na kontach próbnych dochodzą w B1.
test('niezalogowany nie wejdzie do Akademii', async ({ page }) => {
    await page.goto('/learning')
    await expect(page).toHaveURL(/\/login/)
})

test('trasa wyników odrzuca brak sekretu', async ({ request }) => {
    const response = await request.get('/api/internal/academy-readiness')
    expect([401, 503]).toContain(response.status())
})

test('panel Gotowość jest niedostępny bez logowania', async ({ page }) => {
    await page.goto('/admin/learning/gotowosc')
    await expect(page).toHaveURL(/\/login/)
})
