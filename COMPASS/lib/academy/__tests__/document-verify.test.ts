import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/email/sender', () => ({ sendEmail: vi.fn() }))
vi.mock('@sentry/nextjs', () => ({ captureMessage: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import { allowVerifyRequest, isVerifyAllowedFor, resetVerifyRateLimit, resolvePublicDocument } from '../document-verify'

const CODE = 'a'.repeat(32)
const ON = { ACADEMY_PUBLIC_VERIFY_ENABLED: 'true' } as unknown as NodeJS.ProcessEnv
const OFF = {} as unknown as NodeJS.ProcessEnv
const TEST_BOX = { ACADEMY_MAIL_TEST_RECIPIENTS: 'owner@example.test' } as unknown as NodeJS.ProcessEnv
const row = { kind: 'certificate', course_title: 'DORA', participant_name: 'Ala Kot', issued_at: '2026-01-01T10:00:00Z', valid_until: null, revoked_at: null, owner_email: 'ala@firma.pl', owner_source: 'nexus' }
const clientWith = (data: unknown, error: { code?: string; message: string } | null = null) => ({ rpc: vi.fn(async () => ({ data, error })) }) as unknown as SupabaseClient
const now = Date.parse('2027-06-01T12:00:00Z')

describe('resolvePublicDocument', () => {
    it('hides every document while the switch is off', async () => {
        await expect(resolvePublicDocument(clientWith(row), CODE, OFF, now)).resolves.toBeNull()
    })

    it('makes an exception only for a trial account on the owner mailbox list', async () => {
        const trial = { ...row, owner_email: 'OWNER@example.test', owner_source: 'proba' }
        await expect(resolvePublicDocument(clientWith(trial), CODE, TEST_BOX, now)).resolves.toMatchObject({ state: 'valid' })
        await expect(resolvePublicDocument(clientWith({ ...trial, owner_source: 'nexus' }), CODE, TEST_BOX, now)).resolves.toBeNull()
        await expect(resolvePublicDocument(clientWith({ ...trial, owner_email: 'inny@example.test' }), CODE, TEST_BOX, now)).resolves.toBeNull()
    })

    it('returns only the public fields, never the score, address or identifiers', async () => {
        const result = await resolvePublicDocument(clientWith({ ...row, score_percent: 12 }), CODE, ON, now)
        expect(Object.keys(result ?? {}).sort()).toEqual(['courseTitle', 'issuedAt', 'kind', 'participantName', 'state', 'validUntil'])
        expect(JSON.stringify(result)).not.toContain('ala@firma.pl')
    })

    it('shows revocation and expiry', async () => {
        await expect(resolvePublicDocument(clientWith({ ...row, revoked_at: '2026-02-01T00:00:00Z' }), CODE, ON, now)).resolves.toMatchObject({ state: 'revoked' })
        await expect(resolvePublicDocument(clientWith({ ...row, valid_until: '2027-05-01T00:00:00Z' }), CODE, ON, now)).resolves.toMatchObject({ state: 'expired', validUntil: '2027-05-01T00:00:00Z' })
        await expect(resolvePublicDocument(clientWith({ ...row, valid_until: '2027-06-10T00:00:00Z' }), CODE, ON, now)).resolves.toMatchObject({ state: 'valid' })
    })

    it('does not ask the database about a malformed code', async () => {
        const client = clientWith(row)
        await expect(resolvePublicDocument(client, 'krotki', ON, now)).resolves.toBeNull()
        expect(client.rpc).not.toHaveBeenCalled()
    })

    it('treats an unknown or disabled code and a pending migration as not found', async () => {
        await expect(resolvePublicDocument(clientWith(null), CODE, ON, now)).resolves.toBeNull()
        await expect(resolvePublicDocument(clientWith(null, { code: 'PGRST202', message: 'x' }), CODE, ON, now)).resolves.toBeNull()
    })

    it('throws on a real database failure so that the page can log it', async () => {
        await expect(resolvePublicDocument(clientWith(null, { code: '42501', message: 'denied' }), CODE, ON, now)).rejects.toThrow('document_verify_failed')
    })
})

describe('isVerifyAllowedFor', () => {
    it('opens for anyone when the switch is on', () => {
        expect(isVerifyAllowedFor({ email: null, source: null }, ON)).toBe(true)
    })
    it('stays closed for a trial account without an address', () => {
        expect(isVerifyAllowedFor({ email: null, source: 'proba' }, TEST_BOX)).toBe(false)
    })
})

describe('allowVerifyRequest', () => {
    beforeEach(() => resetVerifyRateLimit())

    it('limits requests per address within the window and frees them afterwards', () => {
        for (let index = 0; index < 30; index++) expect(allowVerifyRequest('1.1.1.1', now)).toBe(true)
        expect(allowVerifyRequest('1.1.1.1', now)).toBe(false)
        expect(allowVerifyRequest('2.2.2.2', now)).toBe(true)
        expect(allowVerifyRequest('1.1.1.1', now + 16 * 60 * 1000)).toBe(true)
    })
})
