// Phase 26 — Pracownik widzi swoje premie (read-only).
//   Assigned/paid → "Moje premie" (lista z miesiącem, kwotą, uzasadnieniem)
//   Cancelled     → "Anulowane" (osobna sekcja z powodem)
import { listMyBonuses } from '@/lib/actions/internal-bonus'
import { MyBonusesClient } from '@/components/internal/MyBonusesClient'

export async function MyBonusesPanel() {
    const bonuses = await listMyBonuses()
    return <MyBonusesClient initialBonuses={bonuses} />
}
