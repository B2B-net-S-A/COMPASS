import { describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase/admin', () => ({
    createServiceClient: vi.fn(() => {
        throw new Error('database must not be reached for an invalid token')
    }),
}))

import { GET } from '../route'

function request(token?: string): NextRequest {
    const url = new URL('https://compass.test/api/internal/calendar.ics')
    if (token !== undefined) url.searchParams.set('token', token)
    return new NextRequest(url)
}

describe('calendar feed token boundary', () => {
    it('returns the uniform 401 response for a missing token', async () => {
        const response = await GET(request())
        expect(response.status).toBe(401)
        expect(await response.text()).toBe('Unauthorized')
        expect(response.headers.get('cache-control')).toContain('no-store')
        expect(response.headers.get('www-authenticate')).toBe('Bearer')
    })

    it('returns the same 401 response for a malformed token', async () => {
        const response = await GET(request('not-a-calendar-token'))
        expect(response.status).toBe(401)
        expect(await response.text()).toBe('Unauthorized')
        expect(response.headers.get('cache-control')).toContain('no-store')
    })

    it('permanently rejects the legacy user UUID token with 410', async () => {
        const response = await GET(request('6f9619ff-8b86-4d11-842d-00cf4fc964ff'))
        expect(response.status).toBe(410)
        expect(await response.text()).toBe('Gone')
        expect(response.headers.get('cache-control')).toContain('no-store')
    })
})
