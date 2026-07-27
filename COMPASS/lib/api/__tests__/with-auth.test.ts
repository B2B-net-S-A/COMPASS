import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

vi.mock('@/lib/supabase/admin', () => ({
    createServiceClient: vi.fn(() => ({ /* mock */ })),
}))

let mockUser: { id: string; email: string | null } | null = null
let mockProfile: { role: string; employment_status?: string } | null = null

vi.mock('@/lib/supabase/server', () => ({
    createClient: () => ({
        auth: {
            getUser: vi.fn(async () => ({ data: { user: mockUser }, error: null })),
        },
        from: vi.fn(() => ({
            select: vi.fn(() => ({
                eq: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => ({ data: mockProfile, error: null })),
                })),
            })),
        })),
    }),
}))

import { withCronAuth, withAuth } from '../with-auth'

function mockRequest(opts: { url?: string; auth?: string } = {}): NextRequest {
    const url = opts.url ?? 'https://example.com/api/cron/test'
    const headers = new Headers()
    if (opts.auth) headers.set('authorization', opts.auth)
    return { url, headers: { get: (k: string) => headers.get(k) } } as unknown as NextRequest
}

beforeEach(() => {
    mockUser = null
    mockProfile = null
    delete process.env.CRON_SECRET
})

afterEach(() => {
    delete process.env.CRON_SECRET
})

describe('withCronAuth', () => {
    it('returns 503 when CRON_SECRET not configured', async () => {
        const handler = vi.fn(async () => new Response('ok'))
        const wrapped = withCronAuth(handler)
        const res = await wrapped(mockRequest())
        expect(res.status).toBe(503)
        expect(handler).not.toHaveBeenCalled()
    })

    it('returns 401 when secret missing', async () => {
        process.env.CRON_SECRET = 'topsecret'
        const handler = vi.fn(async () => new Response('ok'))
        const res = await withCronAuth(handler)(mockRequest())
        expect(res.status).toBe(401)
        expect(handler).not.toHaveBeenCalled()
    })

    it('returns 401 when secret mismatch', async () => {
        process.env.CRON_SECRET = 'topsecret'
        const handler = vi.fn(async () => new Response('ok'))
        const res = await withCronAuth(handler)(mockRequest({ auth: 'Bearer wrong' }))
        expect(res.status).toBe(401)
    })

    it('accepts valid Bearer header', async () => {
        process.env.CRON_SECRET = 'topsecret'
        const handler = vi.fn(async () => new Response('ok'))
        const res = await withCronAuth(handler)(mockRequest({ auth: 'Bearer topsecret' }))
        expect(res.status).toBe(200)
        expect(handler).toHaveBeenCalledOnce()
    })

    it('accepts query param fallback', async () => {
        process.env.CRON_SECRET = 'topsecret'
        const handler = vi.fn(async () => new Response('ok'))
        const res = await withCronAuth(handler)(
            mockRequest({ url: 'https://example.com/api/cron/test?secret=topsecret' }),
        )
        expect(res.status).toBe(200)
        expect(handler).toHaveBeenCalledOnce()
    })

    it('passes service_role client to handler', async () => {
        process.env.CRON_SECRET = 'topsecret'
        let receivedAdmin: unknown = null
        const handler = async (_req: NextRequest, ctx: { admin: unknown }) => {
            receivedAdmin = ctx.admin
            return new Response('ok')
        }
        await withCronAuth(handler)(mockRequest({ auth: 'Bearer topsecret' }))
        expect(receivedAdmin).toBeDefined()
    })
})

describe('withAuth', () => {
    it('returns 401 when not authenticated', async () => {
        mockUser = null
        const handler = vi.fn(async () => new Response('ok'))
        const res = await withAuth(handler)(mockRequest())
        expect(res.status).toBe(401)
        expect(handler).not.toHaveBeenCalled()
    })

    it('calls handler when authenticated (no role requirement)', async () => {
        mockUser = { id: 'u1', email: 'a@b.com' }
        const handler = vi.fn(async () => new Response('ok'))
        const res = await withAuth(handler)(mockRequest())
        expect(res.status).toBe(200)
        expect(handler).toHaveBeenCalledOnce()
    })

    it('returns 403 when role does not match', async () => {
        mockUser = { id: 'u1', email: 'a@b.com' }
        mockProfile = { role: 'consultant' }
        const handler = vi.fn(async () => new Response('ok'))
        const res = await withAuth(handler, { role: 'admin' })(mockRequest())
        expect(res.status).toBe(403)
        expect(handler).not.toHaveBeenCalled()
    })

    it('calls handler when role matches', async () => {
        mockUser = { id: 'u1', email: 'a@b.com' }
        mockProfile = { role: 'admin' }
        const handler = vi.fn(async () => new Response('ok'))
        const res = await withAuth(handler, { role: 'admin' })(mockRequest())
        expect(res.status).toBe(200)
    })

    it('accepts array of allowed roles', async () => {
        mockUser = { id: 'u1', email: 'a@b.com' }
        mockProfile = { role: 'internal' }
        const handler = vi.fn(async () => new Response('ok'))
        const res = await withAuth(handler, { role: ['admin', 'internal'] })(mockRequest())
        expect(res.status).toBe(200)
    })

    it('rejects role not in allowed list', async () => {
        mockUser = { id: 'u1', email: 'a@b.com' }
        mockProfile = { role: 'consultant' }
        const handler = vi.fn(async () => new Response('ok'))
        const res = await withAuth(handler, { role: ['admin', 'internal'] })(mockRequest())
        expect(res.status).toBe(403)
    })

    it('returns 403 for an archived account even with no role requirement', async () => {
        // /api/** jest wycięte z matchera middleware, więc to jedyne miejsce,
        // w którym zarchiwizowane konto może zostać odrzucone na API.
        mockUser = { id: 'u1', email: 'a@b.com' }
        mockProfile = { role: 'internal', employment_status: 'exited' }
        const handler = vi.fn(async () => new Response('ok'))
        const res = await withAuth(handler)(mockRequest())
        expect(res.status).toBe(403)
        expect(handler).not.toHaveBeenCalled()
    })

    it('returns 403 for an archived account whose role would otherwise pass', async () => {
        mockUser = { id: 'u1', email: 'a@b.com' }
        mockProfile = { role: 'admin', employment_status: 'exited' }
        const handler = vi.fn(async () => new Response('ok'))
        const res = await withAuth(handler, { role: 'admin' })(mockRequest())
        expect(res.status).toBe(403)
        expect(handler).not.toHaveBeenCalled()
    })

    it('lets an offboarding account through — still employed until the last day', async () => {
        mockUser = { id: 'u1', email: 'a@b.com' }
        mockProfile = { role: 'internal', employment_status: 'offboarding' }
        const handler = vi.fn(async () => new Response('ok'))
        const res = await withAuth(handler)(mockRequest())
        expect(res.status).toBe(200)
        expect(handler).toHaveBeenCalledOnce()
    })

    it('passes user + role to handler', async () => {
        mockUser = { id: 'u1', email: 'admin@b.com' }
        mockProfile = { role: 'admin' }
        let ctx: { user?: { id: string }; role?: string } = {}
        const handler = async (_req: NextRequest, c: { user: { id: string }; role: string | null }) => {
            ctx = { user: c.user, role: c.role ?? undefined }
            return new Response('ok')
        }
        await withAuth(handler, { role: 'admin' })(mockRequest())
        expect(ctx.user?.id).toBe('u1')
        expect(ctx.role).toBe('admin')
    })
})
