import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { createServiceClientMock } = vi.hoisted(() => ({
    createServiceClientMock: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
    createServiceClient: createServiceClientMock,
}))

import { GET } from '../route'

function request(token?: string): NextRequest {
    const url = new URL('https://compass.test/api/internal/calendar.ics')
    if (token !== undefined) url.searchParams.set('token', token)
    return new NextRequest(url)
}

function queuedClient(results: Array<{ data: unknown; error: unknown }>) {
    const from = vi.fn(() => {
        const result = results.shift()
        if (!result) throw new Error('unexpected database query')
        const builder: Record<string, unknown> = {}
        for (const method of ['select', 'eq', 'is', 'maybeSingle', 'gte', 'lte', 'update']) {
            builder[method] = vi.fn(() => builder)
        }
        builder.then = (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve)
        return builder
    })
    return { from }
}

describe('calendar feed token boundary', () => {
    beforeEach(() => {
        createServiceClientMock.mockReset()
        createServiceClientMock.mockImplementation(() => {
            throw new Error('database must not be reached for an invalid token')
        })
    })

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

    it('returns 401 when the token is rotated while the feed is assembled', async () => {
        const client = queuedClient([
            { data: { user_id: 'user-1' }, error: null },
            {
                data: {
                    id: 'user-1',
                    full_name: 'User',
                    email: 'user@example.invalid',
                    role: 'internal',
                    employment_status: 'active',
                    is_external: false,
                },
                error: null,
            },
            { data: [], error: null },
            { data: [], error: null },
            { data: [], error: null },
            // The exact hash no longer matches at the final conditional update.
            { data: null, error: null },
        ])
        createServiceClientMock.mockReturnValue(client)

        const response = await GET(request('A'.repeat(43)))

        expect(response.status).toBe(401)
        expect(await response.text()).toBe('Unauthorized')
        expect(response.headers.get('cache-control')).toContain('no-store')
        expect(client.from).toHaveBeenCalledTimes(6)
    })

    it('returns a no-store calendar only after the exact token is revalidated', async () => {
        const client = queuedClient([
            { data: { user_id: 'user-1' }, error: null },
            {
                data: {
                    id: 'user-1',
                    full_name: 'User',
                    email: 'user@example.invalid',
                    role: 'internal',
                    employment_status: 'active',
                    is_external: false,
                },
                error: null,
            },
            { data: [], error: null },
            { data: [], error: null },
            { data: [], error: null },
            { data: { user_id: 'user-1' }, error: null },
        ])
        createServiceClientMock.mockReturnValue(client)

        const response = await GET(request('B'.repeat(43)))

        expect(response.status).toBe(200)
        expect(response.headers.get('cache-control')).toContain('no-store')
        expect(response.headers.get('content-type')).toContain('text/calendar')
        expect(await response.text()).toContain('BEGIN:VCALENDAR')
    })
})
