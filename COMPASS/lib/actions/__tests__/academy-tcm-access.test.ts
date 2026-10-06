import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MockSupabase } from '@/test/mocks/supabase'
import { academyFixture, COURSE, USER, VERSION, id } from './academy-fixtures'
import { requireAcademyContext } from '@/lib/academy/server'
import { approveCourse } from '../courses-admin'
import { setAcademyRollout, setAcademyTrainer, listAcademyTrainerPage } from '../academy-access'

let client: MockSupabase
vi.mock('@/lib/supabase/server', () => ({ createClient: () => client }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))
const profile = { id: USER, role: 'talent_community', is_external: false, employment_status: 'active' }
beforeEach(() => {
    client = academyFixture({ tables: { profiles: [profile], academy_user_capabilities: [] }, rpcs: { academy_rollout_access: () => ({ allowed: true, mode: 'closed', isPilot: false }) } })
})

describe('TCM Academy editor authorization', () => {
    it('uses role-based editing without a trainer grant or administrator identity', async () => {
        const { access } = await requireAcademyContext({ trainer: true, editor: true })
        expect(access).toMatchObject({ userId: USER, isAdmin: false, canTeach: true, canManageAcademy: true, rolloutMode: 'closed', isPilot: false })
        expect(client.from).not.toHaveBeenCalledWith('academy_user_capabilities')
    })
    it.each([
        () => approveCourse(COURSE, VERSION, id(90)),
        () => setAcademyTrainer(id(2), true),
        () => setAcademyRollout({ mode: 'open', userIds: [] }),
    ])('denies administrator writes before their RPC', async action => {
        expect(await action()).toEqual({ success: false, error: 'Ta operacja wymaga uprawnień administratora.' })
        expect(client.rpc.mock.calls.map(([name]) => name)).toEqual(['academy_rollout_access'])
    })
    it('does not grant a consultant trainer global editing', async () => {
        client = academyFixture()
        await expect(requireAcademyContext({ editor: true })).rejects.toThrow('uprawnień obsługi Akademii')
    })
    it.each([{ is_external: true }, { employment_status: 'exited' }, { role: 'internal' }, { role: 'manager' }, { role: 'finanse' }])('denies ineligible profiles %j', async patch => {
        client = academyFixture({ tables: { profiles: [{ ...profile, ...patch }] } })
        await expect(requireAcademyContext({ editor: true })).rejects.toThrow('Nie masz dostępu do Akademii')
        expect(client.rpc).not.toHaveBeenCalled()
    })
    it('fails closed when the rollout authority denies access', async () => {
        client = academyFixture({ tables: { profiles: [profile] }, rpcs: { academy_rollout_access: () => ({ allowed: false, mode: 'closed' }) } })
        await expect(requireAcademyContext({ editor: true })).rejects.toThrow('nie jest jeszcze dostępna')
    })
    it('fails closed when the rollout check fails', async () => {
        client = academyFixture({ tables: { profiles: [profile] }, rpcs: { academy_rollout_access: () => { throw new Error('unavailable') } } })
        await expect(requireAcademyContext({ editor: true })).rejects.toThrow('sprawdzić dostępności')
    })
    it('requires an authenticated user', async () => {
        client = academyFixture({ user: null })
        await expect(requireAcademyContext({ editor: true })).rejects.toThrow('Zaloguj się')
    })
    it('shows TCM as an automatic editor in the administrator trainer directory', async () => {
        client = academyFixture({ tables: { profiles: [{ ...profile, full_name: 'TCM', email: 'tcm@example.test' }, { id: id(2), role: 'admin', is_external: false, employment_status: 'active', full_name: 'Admin', email: 'admin@example.test' }], academy_user_capabilities: [] }, user: { id: id(2), email: 'admin@example.test' } })
        const result = await listAcademyTrainerPage({ search: 'tcm' })
        expect(result.success && result.data.items).toEqual([expect.objectContaining({ id: USER, role: 'talent_community', canTeach: true, grantedAt: null })])
        expect(client.from).not.toHaveBeenCalledWith('academy_user_capabilities')
    })
})
