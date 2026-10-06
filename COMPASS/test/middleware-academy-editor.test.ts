import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { middleware } from '../middleware'
const state = vi.hoisted(() => ({ role: 'talent_community', flags: false }))
vi.mock('@/lib/supabase/mock-client', () => ({ isSupabaseConfigured: () => true }))
vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'editor' } } }) },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: {
        role: state.role, onboarding_completed: true, employment_status: 'active',
        has_tcm_access: state.flags, is_inbox_handler: state.flags,
    } }) }) }) }),
}) }))
beforeEach(() => { state.role = 'talent_community'; state.flags = false })
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
