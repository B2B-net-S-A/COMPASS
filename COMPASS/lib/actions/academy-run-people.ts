'use server'

import { z } from 'zod'
import { academyAction, assertDatabaseResult, requireAcademyContext } from '@/lib/academy/server'
import { isMissingDatabaseObject } from '@/lib/academy/migration-contract'
import { mergeRunPeople, type RunPerson } from '@/lib/academy/run-people'
import type { WebinarRosterRow } from '@/lib/academy/webinar-import'
import type { AcademyRunParticipantDTO } from '@/lib/types/academy-sessions'
import { logger } from '@/lib/logger'

const SNAPSHOT_PAGE = 1000
const SNAPSHOT_LIMIT = 5000

export interface AcademyRunPeople { people: RunPerson[]; snapshotAt: string | null; snapshotAvailable: boolean }

async function readSnapshot(client: Awaited<ReturnType<typeof requireAcademyContext>>['client']): Promise<{ emails: Set<string>; seenAt: string | null } | null> {
    const emails = new Set<string>()
    let seenAt: string | null = null
    for (let from = 0; from < SNAPSHOT_LIMIT; from += SNAPSHOT_PAGE) {
        const { data, error } = await client.from('nexus_contract_snapshot').select('email,seen_at').not('email', 'is', null).order('nexus_contract_id').range(from, from + SNAPSHOT_PAGE - 1)
        if (error || !data) { logger.warn({ event: 'academy.run_people.snapshot_unavailable', code: error?.code }); return null }
        for (const row of data as Array<{ email: string; seen_at: string }>) {
            emails.add(row.email.trim().toLowerCase())
            if (!seenAt || row.seen_at > seenAt) seenAt = row.seen_at
        }
        if (data.length < SNAPSHOT_PAGE) break
    }
    return { emails, seenAt }
}

/** The list is the content of the screen; the snapshot only decorates it, so its failure degrades to "unknown". */
export async function getAcademyRunPeople(runId: string) {
    return academyAction<AcademyRunPeople>('sessions.run_people', async () => {
        const { client } = await requireAcademyContext({ editor: true })
        const id = z.uuid().parse(runId)
        const [participants, roster, snapshot] = await Promise.all([
            client.rpc('academy_run_participants', { p_run_id: id }),
            client.rpc('academy_webinar_roster', { p_run_id: id }),
            readSnapshot(client),
        ])
        assertDatabaseResult(participants.error)
        if (!isMissingDatabaseObject(roster.error)) assertDatabaseResult(roster.error)
        const rosterRows = isMissingDatabaseObject(roster.error) ? [] : (roster.data ?? []) as WebinarRosterRow[]
        return {
            people: mergeRunPeople((participants.data ?? []) as AcademyRunParticipantDTO[], rosterRows, snapshot?.emails ?? null),
            snapshotAt: snapshot?.seenAt ?? null,
            snapshotAvailable: snapshot !== null,
        }
    })
}
