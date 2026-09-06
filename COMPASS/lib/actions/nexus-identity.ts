'use server'

import { revalidatePath } from 'next/cache'
import { ExpectedError, runAction, type ActionResult } from '@/lib/actions/action-result'
import { logAudit } from '@/lib/actions/audit'
import { requireLifecycleManagerAction } from '@/lib/auth/internal-guard'
import { createServiceClient } from '@/lib/supabase/admin'
import { requireRows } from '@/lib/supabase/select-in-chunks'

/**
 * Kolejka ręcznego dopasowania kontraktorów do NEXUSA (Etap 2c).
 *
 * Cron (`/api/cron/nexus-contractors-sync`) linkuje AUTOMATEM wyłącznie przy
 * jednoznacznym e-mailu. Wszystko inne — a dziś to praktycznie wszystko, bo
 * 689 kontraktorów ma zero e-maili — czeka tutaj na człowieka.
 *
 * DLACZEGO AUTOMAT NIE DOKOŃCZY TEGO SAM: dopasowanie po nazwisku 689 osób do
 * ~49 tys. kandydatów w NEXUSIE skleja ludzi po cichu i trwale. Compass podjął
 * tę decyzję już raz — `20260714183425_consultant_success_hub.sql` linkował
 * `profile_id` tylko po unikalnym e-mailu, z komentarzem „Name matching is
 * intentionally forbidden".
 */

const HUB = '/internal/people'

export type NexusQueueRow = {
    id: string
    fullName: string
    currentClient: string | null
    matchStatus: string | null
    syncedAt: string | null
}

/**
 * Wiersze czekające na rozstrzygnięcie.
 *
 * `requireRows`, bo to jest TREŚĆ ekranu: pusta lista przy awarii odczytu
 * wyglądałaby jak „wszystko dopasowane", czyli odwrotność prawdy.
 */
export async function listNexusMatchQueue(): Promise<ActionResult<NexusQueueRow[]>> {
    return runAction('listNexusMatchQueue', async () => {
        await requireLifecycleManagerAction()
        const admin = createServiceClient()
        const res = await admin
            .from('contractors')
            .select('id, full_name, current_client, nexus_match_status, nexus_synced_at')
            .in('nexus_match_status', ['pending', 'ambiguous'])
            .order('full_name')
        const rows = requireRows('kolejki dopasowania NEXUSA', res)
        return rows.map((r) => ({
            id: r.id,
            fullName: r.full_name,
            currentClient: r.current_client,
            matchStatus: r.nexus_match_status,
            syncedAt: r.nexus_synced_at,
        }))
    })
}

/** Wiąże kontraktora z konkretnym kontraktem w NEXUSIE — decyzja człowieka. */
export async function linkContractorToNexus(input: {
    contractorId: string
    nexusContractId: number
}): Promise<ActionResult<void>> {
    return runAction('linkContractorToNexus', async () => {
        const ctx = await requireLifecycleManagerAction()
        if (!input.contractorId) throw new ExpectedError('Brak kontraktora.')
        if (!Number.isInteger(input.nexusContractId) || input.nexusContractId <= 0) {
            throw new ExpectedError('Podaj poprawne id kontraktu z NEXUSA.')
        }

        const admin = createServiceClient()
        const { error } = await admin
            .from('contractors')
            .update({
                nexus_contract_id: input.nexusContractId,
                nexus_match_status: 'linked',
                nexus_synced_at: new Date().toISOString(),
            })
            .eq('id', input.contractorId)

        if (error) {
            // Częściowy indeks unikalny: ten kontrakt jest już przypięty do
            // kogoś innego. To NIE jest awaria — to sygnał, że jedna z dwóch
            // decyzji jest błędna, i człowiek musi wybrać która.
            if ((error as { code?: string }).code === '23505') {
                throw new ExpectedError(
                    'Ten kontrakt z NEXUSA jest już powiązany z innym kontraktorem.',
                )
            }
            throw new Error(`Nie udało się powiązać kontraktora: ${error.message}`)
        }

        await logAudit(ctx.userId, 'CONTRACTOR_UPDATED', {
            contractor_id: input.contractorId,
            nexus_contract_id: input.nexusContractId,
        })
        revalidatePath(HUB)
    })
}

/**
 * „Tej osoby nie ma w NEXUSIE" — świadome zamknięcie wiersza.
 *
 * Osobna akcja, nie `linkContractorToNexus(null)`: to jest STWIERDZENIE
 * człowieka, a nie brak decyzji, i ma wypaść z kolejki na stałe. Kontraktor
 * sprzed wdrożenia NEXUSA nigdy nie dostanie odpowiednika.
 */
export async function dismissNexusMatch(input: {
    contractorId: string
}): Promise<ActionResult<void>> {
    return runAction('dismissNexusMatch', async () => {
        const ctx = await requireLifecycleManagerAction()
        if (!input.contractorId) throw new ExpectedError('Brak kontraktora.')

        const admin = createServiceClient()
        const { error } = await admin
            .from('contractors')
            .update({
                nexus_match_status: 'not_found',
                nexus_synced_at: new Date().toISOString(),
            })
            .eq('id', input.contractorId)
        if (error) {
            throw new Error(`Nie udało się zamknąć wiersza: ${error.message}`)
        }

        await logAudit(ctx.userId, 'CONTRACTOR_UPDATED', {
            contractor_id: input.contractorId,
            nexus_match: 'not_found',
        })
        revalidatePath(HUB)
    })
}
