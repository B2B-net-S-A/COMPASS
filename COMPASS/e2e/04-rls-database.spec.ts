import { test, expect } from '@playwright/test'

/**
 * Testy RLS policies — weryfikacja bezpośrednio na Supabase API.
 *
 * Audyt 2026-09-22 (O05): poprzednia wersja potrafiła zaliczyć wyciek danych —
 * „własny profil" nie filtrował po własnym id, test anonimowy przechodził przy
 * odpowiedzi 200 z id/email, RPC akceptowało każdy status poza 404, a „rate limit"
 * był pojedynczym signupem. Testowała też tabele komunikatora (conversations,
 * messages), które usunięto w audycie C4.
 *
 * Każda asercja poniżej oczekuje KONKRETNEGO wyniku. PostgREST mapuje brak
 * uprawnień (42501) na 401 dla roli `anon` i 403 dla `authenticated` — dlatego
 * testy negatywne rozróżniają te dwa kody zamiast „cokolwiek poza 500".
 *
 * Wszystkie testy są TYLKO do odczytu albo oczekują odmowy; żaden nie zapisuje.
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

const NIL_UUID = '00000000-0000-0000-0000-000000000000'

interface Session {
    token: string
    userId: string
}

async function signIn(): Promise<Session> {
    const email = process.env.TEST_USER_EMAIL
    const password = process.env.TEST_USER_PASSWORD
    if (!email || !password) {
        throw new Error('TEST_USER_EMAIL and TEST_USER_PASSWORD must be set for RLS tests')
    }

    const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
    })

    if (!response.ok) throw new Error(`Auth failed: ${response.status}`)
    const data = await response.json()
    const userId: unknown = data?.user?.id
    if (typeof data?.access_token !== 'string' || typeof userId !== 'string') {
        throw new Error('Auth response missing access_token or user.id')
    }
    return { token: data.access_token, userId }
}

function authHeaders(token?: string): Record<string, string> {
    const headers: Record<string, string> = {
        apikey: ANON_KEY,
        'Content-Type': 'application/json',
    }
    if (token) headers.Authorization = `Bearer ${token}`
    return headers
}

async function rpc(name: string, body: object, token?: string): Promise<number> {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify(body),
    })
    return response.status
}

test.describe('RLS Policy Verification', () => {
    let session: Session

    test.beforeAll(async () => {
        session = await signIn()
    })

    // ─── PROFILES ────────────────────────────────────────────
    test('profiles: authenticated user can SELECT own profile (filtered by own id)', async () => {
        const response = await fetch(
            `${SUPABASE_URL}/rest/v1/profiles?select=id,email,role&id=eq.${session.userId}`,
            { headers: authHeaders(session.token) },
        )
        expect(response.status).toBe(200)
        const data = await response.json()
        expect(Array.isArray(data)).toBe(true)
        expect(data).toHaveLength(1)
        expect(data[0].id).toBe(session.userId)
    })

    // ─── ANON ACCESS (negative tests) ───────────────────────
    test('anon: unauthenticated user CANNOT read profiles', async () => {
        // Migracja A1 (20260825140000) odbiera anon SELECT na profiles. Dopuszczalne
        // są dokładnie dwa wyniki: 401 (brak grantu) albo 200 z PUSTĄ listą
        // (RLS odfiltrował wszystko). Jakikolwiek wiersz = wyciek kartoteki.
        const response = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=id,email&limit=1`, {
            headers: authHeaders(),
        })
        expect([200, 401]).toContain(response.status)
        if (response.status === 200) {
            const data = await response.json()
            expect(data).toEqual([])
        }
    })

    test('anon: unauthenticated user CANNOT insert audit_logs', async () => {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/audit_logs`, {
            method: 'POST',
            headers: { ...authHeaders(), Prefer: 'return=minimal' },
            body: JSON.stringify({ user_id: null, action: 'E2E_RLS_PROBE' }),
        })
        expect(response.status).toBe(401)
    })

    // ─── RPC FUNCTIONS (SECURITY DEFINER bez kontroli wywołującego) ─────
    test('RPC: authenticated user CANNOT execute sync_user_role', async () => {
        // Migracja A2 (20260825140100) odbiera EXECUTE roli authenticated.
        // Nil-UUID + nieistniejący adres: nawet przy regresji grantu wywołanie
        // nie dotknie żadnego istniejącego profilu.
        const status = await rpc(
            'sync_user_role',
            { p_user_id: NIL_UUID, p_email: 'rls-probe@invalid.example', p_is_super_admin: false },
            session.token,
        )
        expect(status).toBe(403)
    })

    test('RPC: authenticated user CANNOT execute nexus_roster_export', async () => {
        expect(await rpc('nexus_roster_export', {}, session.token)).toBe(403)
    })

    test('RPC: anon CANNOT execute nexus_roster_export', async () => {
        expect(await rpc('nexus_roster_export', {})).toBe(401)
    })
})
