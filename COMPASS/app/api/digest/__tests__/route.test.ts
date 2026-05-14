import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const generateDailyDigest = vi.fn()
const getDigestHtml = vi.fn()

vi.mock('@/lib/actions/email-digest', () => ({
    generateDailyDigest,
    getDigestHtml,
}))

beforeEach(() => {
    generateDailyDigest.mockReset()
    getDigestHtml.mockReset()
})

afterEach(() => {
    vi.clearAllMocks()
})

function makeRequest(body: unknown): Request {
    return new Request('https://compass.test/api/digest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    })
}

describe('POST /api/digest', () => {
    it('returns 401 when user is not authenticated', async () => {
        generateDailyDigest.mockResolvedValue({ success: false, error: 'Nie jesteś zalogowany' })
        const { POST } = await import('../route')
        const response = await POST(makeRequest({}))
        expect(response.status).toBe(401)
        const body = await response.json()
        expect(body.error).toBe('Nie jesteś zalogowany')
    })

    it('returns 500 when generateDailyDigest reports a non-auth failure', async () => {
        generateDailyDigest.mockResolvedValue({ success: false, error: 'DB error' })
        const { POST } = await import('../route')
        const response = await POST(makeRequest({}))
        expect(response.status).toBe(500)
        const body = await response.json()
        expect(body.error).toBe('DB error')
    })

    it('returns success + itemCount + digest items (no HTML when sendEmail=false)', async () => {
        generateDailyDigest.mockResolvedValue({
            success: true,
            digest: [
                { type: 'system', title: 'A', body: 'b', created_at: '2026-04-28T10:00:00Z' },
                { type: 'system', title: 'B', body: 'b', created_at: '2026-04-28T11:00:00Z' },
            ],
        })
        const { POST } = await import('../route')
        const response = await POST(makeRequest({ sendEmail: false }))
        expect(response.status).toBe(200)
        const body = await response.json()
        expect(body.success).toBe(true)
        expect(body.itemCount).toBe(2)
        expect(body.digest).toHaveLength(2)
        expect(body.html).toBeUndefined()
        expect(getDigestHtml).not.toHaveBeenCalled()
    })

    it('returns HTML when sendEmail=true and digest non-empty', async () => {
        generateDailyDigest.mockResolvedValue({
            success: true,
            digest: [{ type: 'system', title: 'A', body: 'b', created_at: '2026-04-28T10:00:00Z' }],
        })
        getDigestHtml.mockResolvedValue('<html>digest</html>')
        const { POST } = await import('../route')
        const response = await POST(makeRequest({ sendEmail: true }))
        const body = await response.json()
        expect(body.success).toBe(true)
        expect(body.itemCount).toBe(1)
        expect(body.html).toBe('<html>digest</html>')
        // Security: getDigestHtml is now called WITHOUT a userId argument; the
        // user is resolved from the session inside the action itself.
        expect(getDigestHtml).toHaveBeenCalledWith()
    })

    it('does NOT call getDigestHtml when sendEmail=true but digest is empty', async () => {
        generateDailyDigest.mockResolvedValue({ success: true, digest: [] })
        const { POST } = await import('../route')
        const response = await POST(makeRequest({ sendEmail: true }))
        const body = await response.json()
        expect(body.success).toBe(true)
        expect(body.itemCount).toBe(0)
        expect(getDigestHtml).not.toHaveBeenCalled()
    })

    it('returns 500 with generic error on unexpected exception in the action', async () => {
        generateDailyDigest.mockRejectedValue(new Error('boom'))
        const { POST } = await import('../route')
        const response = await POST(makeRequest({}))
        expect(response.status).toBe(500)
        const body = await response.json()
        expect(body.error).toBe('Błąd serwera')
    })
})
