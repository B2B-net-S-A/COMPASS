// Phase 28 — Placementy admin panel (server). Lists placements; client handles import + actions.
import { listPlacements } from '@/lib/actions/placements'
import { PlacementsAdminClient } from '@/components/internal/PlacementsAdminClient'

export async function PlacementsAdminPanel() {
    const placements = await listPlacements()
    return <PlacementsAdminClient placements={placements} />
}
