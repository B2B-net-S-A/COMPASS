import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { middleware } from '../middleware'

const state = vi.hoisted(() => ({
    appMetadata: { academy_only: true } as Record<string, unknown>,
    employmentStatus: 'active',
    onboardingCompleted: false,
    signOut: vi.fn(async () => ({ error: null })),
}))

vi.mock('@/lib/supabase/mock-client', () => ({ isSupabaseConfigured: () => true }))
vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({
    auth: {
        getUser: async () => ({ data: { user: { id: 'learner', app_metadata: state.appMetadata } } }),
        signOut: state.signOut,
    },
    rpc: async () => ({ data: { allowed: false }, error: null }),
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: {
        role: 'consultant', onboarding_completed: state.onboardingCompleted, employment_status: state.employmentStatus,
    } }) }) }) }),
}) }))

beforeEach(() => {
    state.appMetadata = { academy_only: true }
    state.employmentStatus = 'active'
    state.onboardingCompleted = false
})

describe('konto nauki na brzegu aplikacji', () => {
    it.each(['/home', '/profile', '/settings', '/internal', '/admin/learning', '/documents', '/onboarding', '/learning/tworze/nowy', '/news'])('odsyła z %s do Akademii', async pathname => {
        const response = await middleware(new NextRequest(`https://compass.test${pathname}`))
        expect(response.headers.get('location')).toBe('https://compass.test/learning')
    })

    it.each(['/home', '/internal/admin'])('nie przepuszcza POST-a akcji serwerowej na %s', async pathname => {
        const response = await middleware(new NextRequest(`https://compass.test${pathname}`, {
            method: 'POST', headers: { 'next-action': 'abc' },
        }))
        expect(response.headers.get('location')).toBe('https://compass.test/learning')
    })

    it.each(['/learning', '/learning/moje', '/notifications'])('wpuszcza na %s bez bramki onboardingu z CV', async pathname => {
        const response = await middleware(new NextRequest(`https://compass.test${pathname}`))
        expect(response.headers.get('location')).toBeNull()
    })

    it('zarchiwizowane konto nauki traci sesję także na dozwolonej ścieżce', async () => {
        state.employmentStatus = 'exited'
        const response = await middleware(new NextRequest('https://compass.test/learning'))
        expect(response.headers.get('location')).toContain('/login')
        expect(state.signOut).toHaveBeenCalled()
    })

    it('zwykły konsultant bez znacznika dalej przechodzi przez onboarding', async () => {
        state.appMetadata = {}
        const response = await middleware(new NextRequest('https://compass.test/home'))
        expect(response.headers.get('location')).toBe('https://compass.test/onboarding')
    })
})
