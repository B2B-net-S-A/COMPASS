import { beforeEach, describe, expect, it, vi } from 'vitest'
import { revalidatePath } from 'next/cache'
import { academyFixture, id, USER } from './academy-fixtures'
import type { MockSupabaseConfig } from '@/test/mocks/supabase'

const mocks = vi.hoisted(() => ({ create: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.create }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))
import { reconcileAcademyAttendance } from '../academy-sessions'

const SESSION = id(81)
const admin = { id: USER, role: 'admin', is_external: false, employment_status: 'active' }
let client: ReturnType<typeof academyFixture>
function setup(config: MockSupabaseConfig = {}) { client = academyFixture(config); mocks.create.mockReturnValue(client) }
beforeEach(() => { vi.clearAllMocks(); setup({ tables: { profiles: [admin] }, rpcs: { academy_reconcile_attendance: () => null } }) })

describe('Administrator attendance recovery action', () => {
    it('queues only the validated session ID, leaving decisions and revision to the database', async () => {
        expect(await reconcileAcademyAttendance(SESSION)).toEqual({ success: true, data: undefined })
        expect(client.rpc).toHaveBeenCalledWith('academy_reconcile_attendance', { p_session_id: SESSION })
        expect(revalidatePath).toHaveBeenCalledWith('/learning', 'layout')
    })
    it('rejects a malformed ID before invoking the mutation', async () => {
        expect((await reconcileAcademyAttendance('other-session')).success).toBe(false)
        expect(client.rpc).not.toHaveBeenCalledWith('academy_reconcile_attendance', expect.anything())
    })
    it.each([
        { role: 'consultant', is_external: false, employment_status: 'active' },
        { role: 'admin', is_external: true, employment_status: 'active' },
        { role: 'admin', is_external: false, employment_status: 'exited' },
    ])('rejects ineligible caller %j before mutation', async profile => {
        setup({ tables: { profiles: [{ id: USER, ...profile }] } })
        expect((await reconcileAcademyAttendance(SESSION)).success).toBe(false)
        expect(client.rpc).not.toHaveBeenCalledWith('academy_reconcile_attendance', expect.anything())
    })
    it('fails closed on rollout access denial', async () => {
        setup({ tables: { profiles: [admin] }, rpcs: { academy_rollout_access: () => ({ allowed: false }) } })
        expect((await reconcileAcademyAttendance(SESSION)).success).toBe(false)
        expect(client.rpc).not.toHaveBeenCalledWith('academy_reconcile_attendance', expect.anything())
    })
    it('preserves a bounded database refusal and does not refresh as successful', async () => {
        const refusal = { data: null, error: { code: 'P0001', message: 'Import obecności jest w trakcie. Poczekaj na wynik i ponów po jego zakończeniu.' } }
        client.rpc.mockResolvedValueOnce({ data: { allowed: true }, error: null })
            .mockResolvedValueOnce(refusal)
        expect(await reconcileAcademyAttendance(SESSION)).toEqual({ success: false, error: 'Import obecności jest w trakcie. Poczekaj na wynik i ponów po jego zakończeniu.' })
        expect(revalidatePath).not.toHaveBeenCalled()
    })
})
