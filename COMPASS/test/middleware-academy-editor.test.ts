import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { middleware } from '../middleware'
const state = vi.hoisted(() => ({ role: 'talent_community', flags: false, rollout: 'closed' as 'closed' | 'pilot' | 'error', rpcCalls: 0 }))
vi.mock('@/lib/supabase/mock-client', () => ({ isSupabaseConfigured: () => true }))
vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'editor' } } }) },
    rpc: async () => {
        state.rpcCalls += 1
        return state.rollout === 'error'
            ? { data: null, error: { message: 'boom' } }
            : { data: { mode: state.rollout, allowed: state.rollout === 'pilot' }, error: null }
    },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: {
        role: state.role, onboarding_completed: true, employment_status: 'active',
        has_tcm_access: state.flags, is_inbox_handler: state.flags,
    } }) }) }) }),
}) }))
beforeEach(() => { state.role = 'talent_community'; state.flags = false; state.rollout = 'closed'; state.rpcCalls = 0 })
describe('Academy editor edge access preserves HR boundaries', () => {
    it.each(['/learning', '/learning/tworze', '/learning/tworze/other-course/edit', '/learning/edycje/other-run'])('allows TCM %s', async pathname => {
        const response = await middleware(new NextRequest(`https://compass.test${pathname}`))
        expect(response.headers.get('location')).toBeNull()
    })
    it.each(['internal', 'finanse', 'manager'])('keeps %s out of Academy even with unrelated TCM grants', async role => {
        state.role = role; state.flags = true
        const response = await middleware(new NextRequest('https://compass.test/learning/tworze'))
        expect(response.headers.get('location')).toBe('https://compass.test/internal')
    })
    it.each(['/home', '/league'])('preserves TCM internal landing on %s', async pathname => {
        const response = await middleware(new NextRequest(`https://compass.test${pathname}`))
        expect(response.headers.get('location')).toBe('https://compass.test/internal')
    })
})

// „Ludzie w NEXUSIE”: landing ról HR zależy od przełącznika HR_MOVED_TO_NEXUS (env runtime).
describe('HR landing after modules move to NEXUS', () => {
    const ALL = 'people,leave,time,payroll,lifecycle,care,cases'
    afterEach(() => { vi.unstubAllEnvs() })

    it('sends TCM to the Academy once every HR module is in NEXUS', async () => {
        vi.stubEnv('HR_MOVED_TO_NEXUS', ALL)
        const response = await middleware(new NextRequest('https://compass.test/home'))
        expect(response.headers.get('location')).toBe('https://compass.test/learning')
    })

    it('keeps TCM on /internal while any HR module still lives in Compass', async () => {
        vi.stubEnv('HR_MOVED_TO_NEXUS', 'people,leave,time,payroll,lifecycle,care')
        const response = await middleware(new NextRequest('https://compass.test/home'))
        expect(response.headers.get('location')).toBe('https://compass.test/internal')
    })

    it.each(['internal', 'finanse', 'manager'])('keeps %s on the HR archive — the Academy does not admit them', async role => {
        vi.stubEnv('HR_MOVED_TO_NEXUS', ALL)
        state.role = role
        const response = await middleware(new NextRequest('https://compass.test/learning'))
        expect(response.headers.get('location')).toBe('https://compass.test/internal')
    })
})

// B1.1: role biurowe wchodzą do Akademii wyłącznie, gdy rollout wpuszcza daną osobę.
describe('Office roles reach the Academy only through the rollout', () => {
    const ALL = 'people,leave,time,payroll,lifecycle,care,cases'
    afterEach(() => { vi.unstubAllEnvs() })

    it.each(['internal', 'finanse', 'manager'])('admits %s from the pilot list', async role => {
        state.role = role; state.rollout = 'pilot'
        const response = await middleware(new NextRequest('https://compass.test/learning/moje'))
        expect(response.headers.get('location')).toBeNull()
    })

    it.each(['internal', 'finanse', 'manager'])('sends %s back while the rollout is closed', async role => {
        state.role = role
        vi.stubEnv('HR_MOVED_TO_NEXUS', ALL)
        const response = await middleware(new NextRequest('https://compass.test/learning'))
        expect(response.headers.get('location')).toBe('https://compass.test/internal')
    })

    it('fails closed when the rollout read errors', async () => {
        state.role = 'internal'; state.rollout = 'error'
        const response = await middleware(new NextRequest('https://compass.test/learning'))
        expect(response.headers.get('location')).toBe('https://compass.test/internal')
    })

    it('lands a pilot office user in the Academy once the HR hub is only an archive', async () => {
        state.role = 'manager'; state.rollout = 'pilot'
        vi.stubEnv('HR_MOVED_TO_NEXUS', ALL)
        const response = await middleware(new NextRequest('https://compass.test/home'))
        expect(response.headers.get('location')).toBe('https://compass.test/learning')
    })

    it('keeps a pilot office user on /internal while HR still lives in Compass', async () => {
        state.role = 'manager'; state.rollout = 'pilot'
        const response = await middleware(new NextRequest('https://compass.test/home'))
        expect(response.headers.get('location')).toBe('https://compass.test/internal')
    })

    it('never reads the rollout on ordinary office paths', async () => {
        state.role = 'internal'
        await middleware(new NextRequest('https://compass.test/internal/timesheet'))
        expect(state.rpcCalls).toBe(0)
    })

    it.each(['/league'])('keeps %s closed for a pilot office user', async pathname => {
        state.role = 'internal'; state.rollout = 'pilot'
        const response = await middleware(new NextRequest(`https://compass.test${pathname}`))
        expect(response.headers.get('location')).toBe('https://compass.test/internal')
    })
})
