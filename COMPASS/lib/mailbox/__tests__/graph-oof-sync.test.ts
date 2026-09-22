import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Audyt 2026-09-22 — INT-02 / INT-03 / INT-04 na poziomie wywołań Graph.
 *
 * Atrapa klienta Graph liczy GET-y i PATCH-e. Najważniejsze asercje dotyczą
 * tego, czego NIE wolno zrobić: PATCH po błędzie odczytu, wyłączenie cudzego
 * OOF, nadpisanie trwającego urlopu późniejszym.
 */

const graph = vi.hoisted(() => ({
    get: vi.fn(),
    patch: vi.fn(),
}))

vi.mock('@/lib/graph/client', () => ({
    getGraphClient: async () => ({
        api: () => ({ get: graph.get, patch: graph.patch }),
    }),
    extractGraphErrorInfo: (err: unknown) => ({
        statusCode: (err as { statusCode?: number })?.statusCode,
        retryAfterMs: undefined,
    }),
    isRetryableGraphStatus: () => false,
}))
vi.mock('@sentry/nextjs', () => ({ captureMessage: vi.fn(), captureException: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import {
    compassOofBlocksNewLeave,
    compassOofMatchesLeave,
    disableOutOfOffice,
    readCurrentOof,
    setOutOfOffice,
    type CurrentOofState,
} from '../graph-oof'

const MARKER = '<!-- compass-managed-oof-v1 -->'
const USER = 'jan@b2bnetwork.pl'

function compassOof(start: string, endExclusive: string, tz = 'Europe/Warsaw'): CurrentOofState {
    return {
        status: 'scheduled',
        scheduledStartDateTime: { dateTime: `${start}T00:00:00`, timeZone: tz },
        scheduledEndDateTime: { dateTime: `${endExclusive}T00:00:00`, timeZone: tz },
        internalReplyMessage: `${MARKER}\n<p>Urlop</p>`,
        externalReplyMessage: `${MARKER}\n<p>Leave</p>`,
    }
}

const setInput = (startDate: string, endDate: string) => ({
    userEmail: USER,
    startDate,
    endDate,
    internalReply: '<p>PL</p>',
    externalReply: '<p>EN</p>',
})

beforeEach(() => {
    process.env.AZURE_TENANT_ID = 't'
    process.env.AZURE_CLIENT_ID = 'c'
    process.env.AZURE_CLIENT_SECRET = 's'
    graph.get.mockReset()
    graph.patch.mockReset()
    graph.patch.mockResolvedValue({})
})

afterEach(() => {
    vi.useRealTimers()
    delete process.env.AZURE_TENANT_ID
    delete process.env.AZURE_CLIENT_ID
    delete process.env.AZURE_CLIENT_SECRET
})

describe('readCurrentOof (INT-04 / INT-08)', () => {
    it('błąd Graph to jawne ok:false ze statusem, nie „brak OOF"', async () => {
        graph.get.mockRejectedValue(Object.assign(new Error('Too Many Requests'), { statusCode: 429 }))
        expect(await readCurrentOof(USER)).toMatchObject({ ok: false, statusCode: 429 })
    })

    it('odpowiedź bez statusu to też błąd odczytu', async () => {
        graph.get.mockResolvedValue({})
        expect((await readCurrentOof(USER)).ok).toBe(false)
    })

    it('brak poświadczeń → ok:false z flagą noCredentials', async () => {
        delete process.env.AZURE_CLIENT_SECRET
        expect(await readCurrentOof(USER)).toMatchObject({ ok: false, noCredentials: true })
    })
})

describe('setOutOfOffice', () => {
    it('INT-04: timeout odczytu → zero PATCH i błąd do graph_sync_error', async () => {
        graph.get.mockRejectedValue(Object.assign(new Error('timeout'), { statusCode: 504 }))
        const res = await setOutOfOffice(setInput('2026-10-05', '2026-10-09'))
        expect(res.success).toBe(false)
        expect(res.error).toMatch(/oof_read_failed/)
        expect(graph.patch).not.toHaveBeenCalled()
    })

    it('INT-02: trwający OOF COMPASS nie jest nadpisywany późniejszym urlopem', async () => {
        vi.useFakeTimers({ toFake: ['Date'] })
        vi.setSystemTime(new Date('2026-10-01T10:00:00Z'))
        // Urlop A: 28.09–02.10 (koniec wyłączny 03.10); nowy urlop B od 12.10.
        graph.get.mockResolvedValue(compassOof('2026-09-28', '2026-10-03'))
        const res = await setOutOfOffice(setInput('2026-10-12', '2026-10-16'))
        expect(res).toMatchObject({ success: true, skipped: true, skipReason: 'compass_active' })
        expect(graph.patch).not.toHaveBeenCalled()
    })

    it('INT-02: po końcu poprzedniego okna nowy urlop ustawia się normalnie', async () => {
        vi.useFakeTimers({ toFake: ['Date'] })
        vi.setSystemTime(new Date('2026-10-05T10:00:00Z'))
        graph.get.mockResolvedValue(compassOof('2026-09-28', '2026-10-03'))
        const res = await setOutOfOffice(setInput('2026-10-12', '2026-10-16'))
        expect(res).toEqual({ success: true })
        expect(graph.patch).toHaveBeenCalledTimes(1)
    })

    it('ten sam urlop (identyczne okno) nadpisuje — np. ponowienie z kolejki', async () => {
        vi.useFakeTimers({ toFake: ['Date'] })
        vi.setSystemTime(new Date('2026-10-01T10:00:00Z'))
        graph.get.mockResolvedValue(compassOof('2026-10-12', '2026-10-17'))
        const res = await setOutOfOffice(setInput('2026-10-12', '2026-10-16'))
        expect(res).toEqual({ success: true })
        expect(graph.patch).toHaveBeenCalledTimes(1)
    })

    it('własna, aktywna odpowiedź użytkownika nadal jest zachowana', async () => {
        graph.get.mockResolvedValue({ status: 'alwaysEnabled', internalReplyMessage: '<p>Szkolenie</p>' })
        const res = await setOutOfOffice(setInput('2026-10-12', '2026-10-16'))
        expect(res).toMatchObject({ skipped: true, skipReason: 'user_custom' })
        expect(graph.patch).not.toHaveBeenCalled()
    })
})

describe('disableOutOfOffice (INT-03)', () => {
    it('wyłącza OOF z markerem i oknem anulowanego urlopu', async () => {
        graph.get.mockResolvedValue(compassOof('2026-10-12', '2026-10-17'))
        const res = await disableOutOfOffice({ userEmail: USER, startDate: '2026-10-12', endDate: '2026-10-16' })
        expect(res).toEqual({ success: true })
        expect(graph.patch).toHaveBeenCalledWith({ automaticRepliesSetting: { status: 'disabled' } })
    })

    it('rozpoznaje okno zwrócone przez Graph w UTC', async () => {
        // 12.10 00:00 Warszawa = 11.10 22:00 UTC (czas letni), 17.10 00:00 = 16.10 22:00 UTC.
        graph.get.mockResolvedValue({
            ...compassOof('2026-10-12', '2026-10-17'),
            scheduledStartDateTime: { dateTime: '2026-10-11T22:00:00.0000000', timeZone: 'UTC' },
            scheduledEndDateTime: { dateTime: '2026-10-16T22:00:00.0000000', timeZone: 'UTC' },
        })
        const res = await disableOutOfOffice({ userEmail: USER, startDate: '2026-10-12', endDate: '2026-10-16' })
        expect(res).toEqual({ success: true })
        expect(graph.patch).toHaveBeenCalledTimes(1)
    })

    it('OOF innego urlopu (A→B→anulowanie A) zostaje nietknięty', async () => {
        graph.get.mockResolvedValue(compassOof('2026-11-02', '2026-11-07'))
        const res = await disableOutOfOffice({ userEmail: USER, startDate: '2026-10-12', endDate: '2026-10-16' })
        expect(res).toMatchObject({ success: true, skipped: true, skipReason: 'not_owned' })
        expect(graph.patch).not.toHaveBeenCalled()
    })

    it('własna odpowiedź użytkownika (bez markera) zostaje nietknięta', async () => {
        graph.get.mockResolvedValue({
            ...compassOof('2026-10-12', '2026-10-17'),
            internalReplyMessage: '<p>Moja odpowiedź</p>',
            externalReplyMessage: '<p>Mine</p>',
        })
        const res = await disableOutOfOffice({ userEmail: USER, startDate: '2026-10-12', endDate: '2026-10-16' })
        expect(res).toMatchObject({ skipped: true, skipReason: 'not_owned' })
        expect(graph.patch).not.toHaveBeenCalled()
    })

    it('błąd odczytu → brak PATCH i success:false (wołający zapisze graph_sync_error)', async () => {
        graph.get.mockRejectedValue(Object.assign(new Error('Forbidden'), { statusCode: 403 }))
        const res = await disableOutOfOffice({ userEmail: USER, startDate: '2026-10-12', endDate: '2026-10-16' })
        expect(res.success).toBe(false)
        expect(graph.patch).not.toHaveBeenCalled()
    })

    it('bez dat — dawne bezwarunkowe wyłączenie (zgodność wsteczna)', async () => {
        const res = await disableOutOfOffice({ userEmail: USER })
        expect(res).toEqual({ success: true })
        expect(graph.get).not.toHaveBeenCalled()
        expect(graph.patch).toHaveBeenCalledTimes(1)
    })
})

describe('reguły okna (pure)', () => {
    it('compassOofMatchesLeave wymaga markera i dokładnego okna', () => {
        expect(compassOofMatchesLeave(compassOof('2026-10-12', '2026-10-17'), '2026-10-12', '2026-10-16')).toBe(true)
        expect(compassOofMatchesLeave(compassOof('2026-10-12', '2026-10-18'), '2026-10-12', '2026-10-16')).toBe(false)
        expect(compassOofMatchesLeave(null, '2026-10-12', '2026-10-16')).toBe(false)
    })

    it('compassOofBlocksNewLeave: wcześniejszy nowy urlop nie jest blokowany', () => {
        const now = new Date('2026-10-01T10:00:00Z')
        const future = compassOof('2026-11-02', '2026-11-07')
        expect(compassOofBlocksNewLeave(future, '2026-10-12', now)).toBe(false)
        expect(compassOofBlocksNewLeave(future, '2026-11-09', now)).toBe(true)
    })
})
