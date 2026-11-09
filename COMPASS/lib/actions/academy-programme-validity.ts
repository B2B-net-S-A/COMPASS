'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { academyActionError } from '@/lib/academy/errors'
import { isMissingDatabaseObject, MIGRATION_PENDING_PL } from '@/lib/academy/migration-contract'
import { requireAcademyContext } from '@/lib/academy/server'
import { ExpectedError, runAction, type ActionResult } from '@/lib/actions/action-result'

export interface ProgrammeValidity { id: string; title: string; validity_months: number | null }

async function requireAdmin() {
    try { return await requireAcademyContext({ admin: true }) }
    catch (error) { throw new ExpectedError(academyActionError(error)) }
}

/** Puste, gdy kolumny jeszcze nie ma: panel mówi wtedy „czeka na migrację”. */
export async function listProgrammeValidity(): Promise<ActionResult<{ migrated: boolean; programmes: ProgrammeValidity[] }>> {
    return runAction('listProgrammeValidity', async () => {
        const { client } = await requireAdmin()
        const { data, error } = await client.from('academy_programmes').select('id,title,validity_months').order('title')
        if (isMissingDatabaseObject(error)) return { migrated: false, programmes: [] }
        if (error) throw new Error(`Nie udało się pobrać programów: ${error.message}`)
        if (data === null) throw new Error('Brak odpowiedzi przy odczycie programów')
        return { migrated: true, programmes: data as ProgrammeValidity[] }
    })
}

export async function setProgrammeValidity(programmeId: string, months: number | null): Promise<ActionResult<null>> {
    return runAction('setProgrammeValidity', async () => {
        const { client } = await requireAdmin()
        const input = z.object({ programmeId: z.uuid(), months: z.number().int().min(1).max(120).nullable() }).safeParse({ programmeId, months })
        if (!input.success) throw new ExpectedError('Podaj liczbę miesięcy od 1 do 120 albo zostaw pole puste.')
        const { error } = await client.rpc('academy_set_programme_validity', { p_programme_id: input.data.programmeId, p_months: input.data.months })
        if (isMissingDatabaseObject(error)) throw new ExpectedError(MIGRATION_PENDING_PL)
        if (error) throw new ExpectedError(academyActionError(new Error(error.message)))
        revalidatePath('/admin/learning/certificates')
        return null
    })
}
