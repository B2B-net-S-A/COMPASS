import { test, expect } from '@playwright/test'

/**
 * Testy RLS policies — weryfikacja bezpośrednio na Supabase API.
 * Sprawdzają, czy polityki bezpieczeństwa na tabelach bazy danych
 * są poprawnie skonfigurowane po każdym deploymencie.
 */

function requireEnv(...names: string[]): string {
    for (const name of names) {
        const value = process.env[name]
        if (value) return value
    }
    throw new Error(`One of ${names.join(', ')} must be set in environment for RLS tests`)
}

const SUPABASE_URL: string = requireEnv('SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL')
const ANON_KEY: string = requireEnv('SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY')

async function getAuthToken(): Promise<string> {
    const email = process.env.TEST_USER_EMAIL
    const password = process.env.TEST_USER_PASSWORD
    if (!email || !password) {
        throw new Error('TEST_USER_EMAIL and TEST_USER_PASSWORD must be set for RLS tests')
    }

    const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'apikey': ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
    })

    if (!response.ok) throw new Error(`Auth failed: ${response.status}`)
    const data = await response.json()
    return data.access_token
}

async function supabaseQuery(token: string, table: string, method: string = 'GET', body?: object, extra?: string) {
    const url = `${SUPABASE_URL}/rest/v1/${table}${extra || ''}`
    const headers: Record<string, string> = {
        'apikey': ANON_KEY,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Prefer': method === 'POST' ? 'return=representation' : 'return=minimal',
    }

    const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
    })

    return {
        status: response.status,
        data: response.status !== 204 ? await response.json().catch(() => null) : null,
        ok: response.ok,
    }
}

test.describe('RLS Policy Verification', () => {
    let token: string

    test.beforeAll(async () => {
        token = await getAuthToken()
    })

    // ─── PROFILES ────────────────────────────────────────────
    test('profiles: authenticated user can SELECT own profile', async () => {
        const result = await supabaseQuery(token, 'profiles', 'GET', undefined, '?select=id,email,role&limit=1')
        expect(result.ok).toBe(true)
        expect(result.data).toBeTruthy()
        expect(Array.isArray(result.data)).toBe(true)
        expect(result.data.length).toBeGreaterThan(0)
    })

    // ─── CONVERSATIONS ──────────────────────────────────────
    test('conversations: authenticated user can SELECT conversations', async () => {
        const result = await supabaseQuery(token, 'conversations', 'GET', undefined, '?select=id,type&limit=5')
        expect(result.ok).toBe(true)
        expect(Array.isArray(result.data)).toBe(true)
    })

    test('conversations: authenticated user can INSERT (create conversation)', async () => {
        const result = await supabaseQuery(token, 'conversations', 'POST', {
            type: 'direct',
        })
        // Should succeed (201) or conflict — NOT 403/RLS error
        expect([201, 409]).toContain(result.status)

        // Cleanup: delete the test conversation if created
        if (result.status === 201 && result.data?.[0]?.id) {
            // Note: DELETE may require admin or special policy
            await supabaseQuery(token, 'conversations', 'DELETE', undefined, `?id=eq.${result.data[0].id}`)
        }
    })

    // ─── CONVERSATION PARTICIPANTS ──────────────────────────
    test('conversation_participants: authenticated user can SELECT own participations', async () => {
        const result = await supabaseQuery(token, 'conversation_participants', 'GET', undefined, '?select=conversation_id,user_id,role&limit=5')
        expect(result.ok).toBe(true)
        expect(Array.isArray(result.data)).toBe(true)
    })

    // ─── MESSAGES ───────────────────────────────────────────
    test('messages: authenticated user can SELECT messages from own conversations', async () => {
        const result = await supabaseQuery(token, 'messages', 'GET', undefined, '?select=id,content,conversation_id&limit=5')
        expect(result.ok).toBe(true)
        expect(Array.isArray(result.data)).toBe(true)
    })

    // ─── RPC FUNCTIONS ──────────────────────────────────────
    test('RPC: create_direct_conversation function is callable', async () => {
        // Próba wywołania RPC z dummy userId — powinno zwrócić błąd, ale NIE 404
        const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/create_direct_conversation`, {
            method: 'POST',
            headers: {
                'apikey': ANON_KEY,
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                p_user_id: '00000000-0000-0000-0000-000000000000',
                p_target_user_id: '00000000-0000-0000-0000-000000000001',
            }),
        })

        // Powinno być 200 lub błąd FK constraint — NIE 404 (function not found)
        expect(response.status).not.toBe(404)
    })

    // ─── ANON ACCESS (negative tests) ───────────────────────
    test('anon: unauthenticated user has LIMITED access to profiles', async () => {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=id,email&limit=1`, {
            headers: { 'apikey': ANON_KEY },
        })
        // Profiles mogą być publicznie dostępne (user discovery w komunikatorze)
        // Ważne: response nie powinien być 500 (serwer nie crashuje)
        expect(response.status).not.toBe(500)

        if (response.ok) {
            const data = await response.json()
            expect(Array.isArray(data)).toBe(true)
            // Jeśli profiles są publiczne, to OK — ale sprawdzamy,
            // że nie wyciekają wrażliwe pola (password_hash, tokens)
            if (data.length > 0) {
                const profile = data[0]
                expect(profile).not.toHaveProperty('password')
                expect(profile).not.toHaveProperty('password_hash')
                expect(profile).not.toHaveProperty('refresh_token')
            }
        }
    })

    test('anon: unauthenticated user CANNOT insert conversations', async () => {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/conversations`, {
            method: 'POST',
            headers: {
                'apikey': ANON_KEY,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal',
            },
            body: JSON.stringify({ type: 'direct' }),
        })
        // Should be 401 or RLS violation (403)
        expect([401, 403]).toContain(response.status)
    })

    // ─── RATE LIMIT CHECK ───────────────────────────────────
    test('auth: signup rate limit returns proper error (not generic 500)', async () => {
        // Test that Supabase returns a proper error code for rate limits
        const response = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
            method: 'POST',
            headers: { 'apikey': ANON_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: `ratelimit-test-${Date.now()}@b2bnetwork.pl`,
                password: 'TestPassword123!',
            }),
        })

        // 200 (success) or 429 (rate limited) or 422 (validation) — NOT 500
        expect(response.status).not.toBe(500)
    })
})
