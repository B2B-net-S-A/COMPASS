import { beforeEach, describe, expect, it, vi } from 'vitest'

// Push jest best-effort i chodzi po service-kliencie — w teście liczy się tylko to,
// że NIE decyduje o `delivered`.
const sendPushToUserId = vi.fn(async () => ({ sent: 1, failed: 0 }))
vi.mock('@/lib/push/dispatch', () => ({ sendPushToUserId: (...a: unknown[]) => sendPushToUserId(...(a as [])) }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import {
    dispatchGenericAlert,
    resolveAlertRecipients,
    type GenericAlertPayload,
} from '@/lib/notifications/alert-dispatch'

interface FakeOpts {
    profiles?: Array<{ id: string; email: string | null; full_name: string | null }>
    insertError?: { message: string } | null
}

/**
 * Minimalny stub klienta: `.from('profiles').select().in()` zwraca listę profili,
 * `.from('notifications').insert()` — wynik insertu (supabase-js v2 nie rejectuje,
 * tylko resolwuje `{ error }`, i to właśnie ta ścieżka decyduje o dostarczeniu).
 */
function fakeAdmin({ profiles = [], insertError = null }: FakeOpts) {
    return {
        from(table: string) {
            if (table === 'profiles') {
                return {
                    select: () => ({ in: async () => ({ data: profiles, error: null }) }),
                }
            }
            return {
                insert: (_row: unknown) => Promise.resolve({ error: insertError }),
            }
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
}

const payload = (emailOk: boolean): GenericAlertPayload => ({
    type: 'legal_monitor_red',
    titlePl: 'tytuł',
    titleEn: 'title',
    bodyPl: 'treść',
    bodyEn: 'body',
    actionUrl: '/x',
    pushTag: 'tag',
    emailFn: async () => ({ success: emailOk }),
})

describe('dispatchGenericAlert — attempted vs delivered', () => {
    beforeEach(() => {
        sendPushToUserId.mockClear()
    })

    it('bez odbiorców nie próbuje i nic nie dostarcza', async () => {
        const res = await dispatchGenericAlert(fakeAdmin({}), [], payload(true), 'ev')
        expect(res).toEqual({ attempted: 0, delivered: 0 })
    })

    it('liczy dostarczenie, gdy zadziałał dzwonek', async () => {
        const admin = fakeAdmin({ profiles: [{ id: 'u1', email: null, full_name: 'A' }] })
        const res = await dispatchGenericAlert(admin, ['u1'], payload(false), 'ev')
        expect(res).toEqual({ attempted: 1, delivered: 1 })
    })

    it('liczy dostarczenie, gdy dzwonek padł, ale mail poszedł', async () => {
        const admin = fakeAdmin({
            profiles: [{ id: 'u1', email: 'a@b.pl', full_name: 'A' }],
            insertError: { message: 'CHECK violation' },
        })
        const res = await dispatchGenericAlert(admin, ['u1'], payload(true), 'ev')
        expect(res).toEqual({ attempted: 1, delivered: 1 })
    })

    it('NIE liczy dostarczenia, gdy padł dzwonek i mail — sam push nie wystarcza', async () => {
        // To jest sedno C11.2: taki przebieg wyglądał wcześniej identycznie jak sukces,
        // więc wołający stemplował dedup i alert nie ponawiał się nigdy.
        const admin = fakeAdmin({
            profiles: [{ id: 'u1', email: 'a@b.pl', full_name: 'A' }],
            insertError: { message: 'CHECK violation' },
        })
        const res = await dispatchGenericAlert(admin, ['u1'], payload(false), 'ev')
        expect(res).toEqual({ attempted: 1, delivered: 0 })
        expect(sendPushToUserId).toHaveBeenCalledTimes(1)
    })

    it('odbiorca bez emaila i z padniętym dzwonkiem nie jest dostarczeniem', async () => {
        const admin = fakeAdmin({
            profiles: [{ id: 'u1', email: null, full_name: 'A' }],
            insertError: { message: 'boom' },
        })
        const res = await dispatchGenericAlert(admin, ['u1'], payload(true), 'ev')
        expect(res).toEqual({ attempted: 1, delivered: 0 })
    })

    it('deduplikuje odbiorców i sumuje po osobach', async () => {
        const admin = fakeAdmin({
            profiles: [
                { id: 'u1', email: 'a@b.pl', full_name: 'A' },
                { id: 'u2', email: 'c@d.pl', full_name: 'C' },
            ],
        })
        const res = await dispatchGenericAlert(admin, ['u1', 'u1', 'u2', ''], payload(true), 'ev')
        expect(res).toEqual({ attempted: 2, delivered: 2 })
    })
})


/**
 * Audyt 2026-08 — lista odbiorców to CSV z UUID-ami w `system_settings`, bez
 * klucza obcego. Nikt jej nie czyści, kiedy człowiek odchodzi z firmy.
 */
describe('resolveAlertRecipients — konfiguracja kontra rzeczywistość', () => {
    const CSV = (raw: string | null | undefined) =>
        (raw ?? '').split(',').map((s) => s.trim()).filter(Boolean)

    function settingsAdmin(value: string | null, profiles: Array<{ id: string; employment_status: string | null }>) {
        return {
            from(table: string) {
                if (table === 'system_settings') {
                    return {
                        select: () => ({
                            eq: () => ({ maybeSingle: async () => ({ data: value === null ? null : { value }, error: null }) }),
                        }),
                    }
                }
                return { select: () => ({ in: async () => ({ data: profiles, error: null }) }) }
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any
    }

    it('odsiewa zarchiwizowanych i nieistniejących, zostawia aktywnych', async () => {
        const admin = settingsAdmin('aktywny,odszedl,duch', [
            { id: 'aktywny', employment_status: 'active' },
            { id: 'odszedl', employment_status: 'exited' },
        ])
        expect(await resolveAlertRecipients(admin, 'klucz', ['zapas'], CSV)).toEqual(['aktywny'])
    })

    it('gdy po odsianiu nie zostaje nikt — wraca fallback, alert nie ginie', async () => {
        const admin = settingsAdmin('odszedl', [{ id: 'odszedl', employment_status: 'exited' }])
        expect(await resolveAlertRecipients(admin, 'klucz', ['zapas'], CSV)).toEqual(['zapas'])
    })

    it('pusta konfiguracja = fallback (bez odpytywania profili)', async () => {
        const admin = settingsAdmin(null, [])
        expect(await resolveAlertRecipients(admin, 'klucz', ['zapas', 'zapas', ''], CSV)).toEqual(['zapas'])
    })

    it('awaria odczytu profili nie wycisza alertu — jedzie wg konfiguracji', async () => {
        const admin = {
            from(table: string) {
                if (table === 'system_settings') {
                    return {
                        select: () => ({
                            eq: () => ({ maybeSingle: async () => ({ data: { value: 'a,b' }, error: null }) }),
                        }),
                    }
                }
                return { select: () => ({ in: async () => ({ data: null, error: { message: 'boom' } }) }) }
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any
        expect(await resolveAlertRecipients(admin, 'klucz', ['zapas'], CSV)).toEqual(['a', 'b'])
    })
})
