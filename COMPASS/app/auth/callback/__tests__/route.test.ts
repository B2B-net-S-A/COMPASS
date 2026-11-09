import { beforeEach, describe, expect, it, vi } from 'vitest'

const exchangeCodeForSession = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
    createClient: () => ({ auth: { exchangeCodeForSession } }),
}))
vi.mock('@/lib/auth/sync-role', () => ({ syncRole: vi.fn() }))
vi.mock('@/lib/m365/people-sync', () => ({ syncProfileFromGraph: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn() } }))

import { GET } from '../route'

describe('GET /auth/callback — odmowa założenia konta', () => {
    beforeEach(() => {
        exchangeCodeForSession.mockReset()
        process.env.NEXT_PUBLIC_SITE_URL = 'https://compass.test'
    })

    it('kieruje na login z komunikatem, gdy GoTrue wraca z błędem zamiast kodu', async () => {
        const response = await GET(new Request(
            'https://internal:10000/auth/callback?error=server_error&error_code=unexpected_failure&error_description=Database+error+saving+new+user',
        ))

        expect(response.headers.get('location')).toBe('https://compass.test/login?error=auth_failed')
        expect(exchangeCodeForSession).not.toHaveBeenCalled()
    })

    it('bez kodu i bez błędu nie zgłasza nieudanego logowania', async () => {
        const response = await GET(new Request('https://internal:10000/auth/callback'))

        expect(response.headers.get('location')).toBe('https://compass.test/home')
    })
})
