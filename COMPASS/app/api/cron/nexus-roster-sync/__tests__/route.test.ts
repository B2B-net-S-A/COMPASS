import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// Odbiorca listy osób z NEXUSA. Fikcyjne dane, żadnych prawdziwych adresów.

const state = vi.hoisted(() => ({
    profiles: [] as Array<Record<string, unknown>>,
    readError: null as { message: string } | null,
    updates: [] as Array<{ patch: Record<string, unknown>; id?: unknown; status?: unknown }>,
    updateError: null as { message: string; code?: string } | null,
    unban: [] as string[],
    afterRead: null as null | (() => void),
}))
const revokeAccountAccess = vi.hoisted(() => vi.fn(async () => {}))
const logSystemAudit = vi.hoisted(() => vi.fn(async () => {}))

function adminClient() {
    return {
        auth: {
            admin: {
                updateUserById: async (id: string) => {
                    state.unban.push(id)
                    return { error: null }
                },
            },
        },
        from: (table: string) => {
            if (table !== 'profiles') throw new Error(`Unexpected table ${table}`)
            return {
                select: async () => {
                    const data = state.readError ? null : state.profiles.map((row) => ({ ...row }))
                    state.afterRead?.()
                    return { data, error: state.readError }
                },
                update: (patch: Record<string, unknown>) => {
                    const entry: { patch: Record<string, unknown>; id?: unknown; status?: unknown } = { patch }
                    const chain = {
                        eq: (col: string, value: unknown) => {
                            if (col === 'id') entry.id = value
                            else entry.status = value
                            return chain
                        },
                        is: (_col: string, value: unknown) => {
                            entry.status = value
                            return chain
                        },
                        select: async () => {
                            if (state.updateError) return { data: null, error: state.updateError }
                            state.updates.push(entry)
                            const row = state.profiles.find((p) => p.id === entry.id)
                            return { data: row && row.employment_status === entry.status ? [{ id: entry.id }] : [], error: null }
                        },
                    }
                    return chain
                },
            }
        },
    }
}

vi.mock('@/lib/supabase/admin', () => ({ createServiceClient: () => adminClient() }))
vi.mock('@/lib/audit/cron-heartbeat', () => ({ withCronHeartbeat: (_action: string, handler: unknown) => handler }))
vi.mock('@/lib/audit/system-log', () => ({ logSystemAudit }))
vi.mock('@/lib/auth/account-access', () => ({ revokeAccountAccess }))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), captureMessage: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import { GET } from '../route'

const fetchMock = vi.fn()
const request = () => new NextRequest('https://compass.test/api/cron/nexus-roster-sync', {
    headers: { authorization: 'Bearer test-cron-secret' },
})
const nexusPerson = (id: string, status = 'active', extra: Record<string, unknown> = {}) => ({
    email: `${id}@example.test`, name: 'Fikcyjna Osoba', employment_status: status, account_active: true,
    manager_email: null, department: null, job_title: null, work_start_date: '2026-01-05',
    last_working_day: null, exited_at: null, ...extra,
})
const compassProfile = (id: string, status = 'active', extra: Record<string, unknown> = {}) => ({
    id, email: `${id}@example.test`, employment_status: status, manager_id: null,
    work_start_date: '2026-01-05', termination_date: null, ...extra,
})
function respond(people: unknown[], init: { status?: number; count?: number } = {}) {
    fetchMock.mockResolvedValue(new Response(
        JSON.stringify({ count: init.count ?? people.length, generated_at: '2026-11-13T18:00:00+01:00', people }),
        { status: init.status ?? 200 },
    ))
}

beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('HR_MOVED_TO_NEXUS', 'lifecycle')
    vi.stubEnv('NEXUS_ROSTER_URL', 'https://nexus.example.test/api/integrations/compass/roster')
    vi.stubEnv('NEXUS_ROSTER_API_KEY', 'roster-key-fixture')
    state.profiles = [compassProfile('p1'), compassProfile('p2', 'offboarding'), compassProfile('p3', 'exited', { termination_date: '2026-09-30' })]
    state.readError = null
    state.updates = []
    state.updateError = null
    state.unban = []
    state.afterRead = null
    fetchMock.mockReset()
})
afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
})

describe('GET /api/cron/nexus-roster-sync', () => {
    it('stays idle until lifecycle is moved to NEXUS', async () => {
        vi.stubEnv('HR_MOVED_TO_NEXUS', 'leave,time')
        const response = await GET(request())
        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({ ok: true, skipped: true })
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('rejects calls without the cron secret before doing anything', async () => {
        const response = await GET(new NextRequest('https://compass.test/api/cron/nexus-roster-sync'))
        expect(response.status).toBe(401)
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('reports missing configuration as a failure', async () => {
        vi.stubEnv('NEXUS_ROSTER_API_KEY', '')
        const response = await GET(request())
        expect(response.status).toBe(500)
        expect(await response.json()).toMatchObject({ ok: false, stage: 'config' })
    })

    it('sends the key as X-API-Key and syncs status, dates, Auth and audit', async () => {
        respond([
            nexusPerson('p1', 'active', { work_start_date: '2026-02-01' }),
            nexusPerson('p2', 'exited', { last_working_day: '2026-10-31' }),
            nexusPerson('p3', 'active'),
            nexusPerson('unknown'),
        ])
        const response = await GET(request())
        const body = await response.json()

        expect(fetchMock).toHaveBeenCalledWith(
            'https://nexus.example.test/api/integrations/compass/roster',
            expect.objectContaining({ headers: { 'X-API-Key': 'roster-key-fixture' }, cache: 'no-store' }),
        )
        expect(response.status).toBe(200)
        expect(body).toMatchObject({ ok: true, matched: 3, not_in_compass: 1, written: 3, exits: 1, returns: 1 })
        expect(JSON.stringify(body)).not.toContain('@example.test')

        expect(state.updates).toEqual(expect.arrayContaining([
            { id: 'p1', status: 'active', patch: { work_start_date: '2026-02-01' } },
            { id: 'p2', status: 'offboarding', patch: { employment_status: 'exited', termination_date: '2026-10-31' } },
            { id: 'p3', status: 'exited', patch: { employment_status: 'active', termination_date: null } },
        ]))
        expect(revokeAccountAccess).toHaveBeenCalledWith('p2')
        expect(state.unban).toEqual(['p3'])
        expect(logSystemAudit).toHaveBeenCalledWith('p2', 'NEXUS_ROSTER_PROFILE_SYNCED', expect.objectContaining({
            employment_status: { from: 'offboarding', to: 'exited' },
        }))
    })

    it.each([
        ['5xx from NEXUS', () => fetchMock.mockResolvedValue(new Response('boom', { status: 503 })), 'fetch'],
        ['404 while NEXUS does not publish the list yet', () => fetchMock.mockResolvedValue(new Response('{}', { status: 404 })), 'fetch'],
        ['network error', () => fetchMock.mockRejectedValue(new Error('ECONNRESET')), 'fetch'],
        ['empty list', () => respond([]), 'contract'],
        ['truncated list', () => respond([nexusPerson('p1')], { count: 2 }), 'contract'],
    ])('changes nothing on %s', async (_label, arrange, stage) => {
        arrange()
        const response = await GET(request())
        expect(response.status).toBe(500)
        expect(await response.json()).toMatchObject({ ok: false, stage })
        expect(state.updates).toEqual([])
        expect(revokeAccountAccess).not.toHaveBeenCalled()
    })

    it('changes nobody when more than five people would exit at once', async () => {
        const ids = ['a', 'b', 'c', 'd', 'e', 'f']
        state.profiles = [...ids.map((id) => compassProfile(id)), compassProfile('p1')]
        respond([...ids.map((id) => nexusPerson(id, 'exited')), nexusPerson('p1', 'active', { work_start_date: '2026-03-01' })])
        const response = await GET(request())
        expect(response.status).toBe(500)
        expect(await response.json()).toMatchObject({ ok: false, stage: 'safety', refusal: 'mass_exit', exits: 6, written: 0 })
        expect(state.updates).toEqual([])
        expect(revokeAccountAccess).not.toHaveBeenCalled()
    })

    it('reports a trigger refusal as a failed run without hiding the other writes', async () => {
        respond([nexusPerson('p2', 'active')])
        state.updateError = { message: 'Nie można cofnąć statusu offboarding', code: 'P0001' }
        const response = await GET(request())
        expect(response.status).toBe(500)
        expect(await response.json()).toMatchObject({ ok: false, stage: 'write', blocked_by_trigger: 1, written: 0 })
    })

    it('skips a profile changed between read and write', async () => {
        respond([nexusPerson('p1', 'offboarding')])
        state.profiles = [compassProfile('p1')]
        // Admin zmienia status po naszym odczycie — zapis warunkowany starym statusem trafia w zero wierszy.
        state.afterRead = () => { state.profiles = [compassProfile('p1', 'exited')] }
        const response = await GET(request())
        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({ ok: true, written: 0, skipped_concurrent: 1 })
    })
})
