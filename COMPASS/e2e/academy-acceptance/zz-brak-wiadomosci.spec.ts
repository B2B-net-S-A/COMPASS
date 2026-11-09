import { expect, test } from '@playwright/test'
import { messagesOutsideList } from './harness'

// Ostatni plik w kolejności alfabetycznej: każdy bieg kończy się tą asercją.
test('0 wiadomości poza listą skrzynek właściciela', async ({ request }) => {
    const outside = await messagesOutsideList(request)
    expect(outside, 'null oznacza brak kolejki albo awarię odczytu, więc wyniku nie można uznać').toBe(0)
})
