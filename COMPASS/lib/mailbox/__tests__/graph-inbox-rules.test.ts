import { beforeEach, describe, expect, it, vi } from 'vitest'

// ─── Module mocks ────────────────────────────────────────────────────────────

const mockGetGraphClient = vi.fn()

vi.mock('@/lib/graph/client', () => ({
    getGraphClient: () => mockGetGraphClient(),
    extractGraphErrorInfo: (err: unknown) => {
        if (typeof err === 'object' && err !== null && 'statusCode' in err) {
            const sc = (err as { statusCode?: unknown }).statusCode
            return typeof sc === 'number' ? { statusCode: sc } : {}
        }
        return {}
    },
    isRetryableGraphStatus: (status: number | undefined) =>
        status === 429 || (status !== undefined && status >= 500 && status < 600),
}))

vi.mock('@/lib/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('@sentry/nextjs', () => ({ captureMessage: vi.fn(), captureException: vi.fn() }))

import {
    buildForwardRuleName,
    createForwardRule,
    deleteForwardRule,
    listCompassForwardRules,
    parseLeaveIdFromRuleName,
    COMPASS_FORWARD_RULE_PREFIX,
} from '../graph-inbox-rules'

const LEAVE_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'
const OTHER_LEAVE_ID = '9c858901-8a57-4791-81fe-4c455b099bc9'

interface GraphCall {
    path: string
    method: 'get' | 'post' | 'delete'
    body?: unknown
}

/** Graph SDK stub that records every call and replays canned outcomes in order. */
function stubGraph(outcomes: Array<{ throws?: unknown; returns?: unknown }>) {
    const calls: GraphCall[] = []
    let i = 0
    const next = () => outcomes[Math.min(i++, outcomes.length - 1)] ?? { returns: null }
    const settle = (o: { throws?: unknown; returns?: unknown }) =>
        o.throws ? Promise.reject(o.throws) : Promise.resolve(o.returns)

    mockGetGraphClient.mockResolvedValue({
        api: (path: string) => ({
            get: () => {
                calls.push({ path, method: 'get' })
                return settle(next())
            },
            post: (body: unknown) => {
                calls.push({ path, method: 'post', body })
                return settle(next())
            },
            delete: () => {
                calls.push({ path, method: 'delete' })
                return settle(next())
            },
        }),
    })
    return calls
}

const graphError = (statusCode: number) =>
    Object.assign(new Error(`graph ${statusCode}`), { statusCode })

beforeEach(() => {
    // credsConfigured() gates every network helper; test/setup.ts does not seed these.
    process.env.AZURE_TENANT_ID = 'tenant'
    process.env.AZURE_CLIENT_ID = 'client'
    process.env.AZURE_CLIENT_SECRET = 'secret'
    mockGetGraphClient.mockReset()
})

// ─── Pure helpers ────────────────────────────────────────────────────────────

describe('buildForwardRuleName / parseLeaveIdFromRuleName', () => {
    it('round-trips a leave id', () => {
        const name = buildForwardRuleName(LEAVE_ID)
        expect(name).toBe(`${COMPASS_FORWARD_RULE_PREFIX}${LEAVE_ID}`)
        expect(parseLeaveIdFromRuleName(name)).toBe(LEAVE_ID)
    })

    it("ignores a user's own rules — the sweep must never delete those", () => {
        expect(parseLeaveIdFromRuleName('Faktury do folderu')).toBeNull()
        expect(parseLeaveIdFromRuleName('COMPASS raport tygodniowy')).toBeNull()
        expect(parseLeaveIdFromRuleName('')).toBeNull()
    })

    it('rejects the Compass prefix without a valid uuid', () => {
        expect(parseLeaveIdFromRuleName(`${COMPASS_FORWARD_RULE_PREFIX}`)).toBeNull()
        expect(parseLeaveIdFromRuleName(`${COMPASS_FORWARD_RULE_PREFIX}not-a-uuid`)).toBeNull()
        expect(parseLeaveIdFromRuleName(`${COMPASS_FORWARD_RULE_PREFIX}123`)).toBeNull()
    })

    it('normalises uppercase uuids so lookups match the database', () => {
        const name = `${COMPASS_FORWARD_RULE_PREFIX}${LEAVE_ID.toUpperCase()}`
        expect(parseLeaveIdFromRuleName(name)).toBe(LEAVE_ID)
    })

    it('tolerates non-string input', () => {
        expect(parseLeaveIdFromRuleName(null)).toBeNull()
        expect(parseLeaveIdFromRuleName(undefined)).toBeNull()
    })
})

// ─── createForwardRule ───────────────────────────────────────────────────────

describe('createForwardRule', () => {
    it('posts a forward-all rule and returns the graph rule id', async () => {
        const calls = stubGraph([{ returns: { id: 'rule-123' } }])

        const res = await createForwardRule({
            userEmail: 'anna@b2bnetwork.pl',
            substituteEmail: 'piotr@b2bnetwork.pl',
            substituteName: 'Piotr Nowak',
            leaveId: LEAVE_ID,
        })

        expect(res).toEqual({ success: true, ruleId: 'rule-123' })
        expect(calls).toHaveLength(1)
        expect(calls[0].path).toBe(
            '/users/anna%40b2bnetwork.pl/mailFolders/inbox/messageRules',
        )

        const body = calls[0].body as Record<string, any>
        expect(body.displayName).toBe(buildForwardRuleName(LEAVE_ID))
        expect(body.isEnabled).toBe(true)
        expect(body.actions.forwardTo[0].emailAddress.address).toBe('piotr@b2bnetwork.pl')
        // The owner's own rules must keep running after ours.
        expect(body.actions.stopProcessingRules).toBe(false)
        // No conditions block — every incoming message matches.
        expect(body.conditions).toBeUndefined()
        // Loop protection.
        expect(body.exceptions).toEqual({ isAutomaticReply: true, isAutomaticForward: true })
    })

    it('falls back to the email as display name when the substitute has no name', async () => {
        const calls = stubGraph([{ returns: { id: 'rule-1' } }])
        await createForwardRule({
            userEmail: 'anna@b2bnetwork.pl',
            substituteEmail: 'piotr@b2bnetwork.pl',
            substituteName: null,
            leaveId: LEAVE_ID,
        })
        const body = calls[0].body as Record<string, any>
        expect(body.actions.forwardTo[0].emailAddress.name).toBe('piotr@b2bnetwork.pl')
    })

    it('fails when Graph returns no rule id — an unaddressable rule must not look OK', async () => {
        stubGraph([{ returns: {} }])
        const res = await createForwardRule({
            userEmail: 'anna@b2bnetwork.pl',
            substituteEmail: 'piotr@b2bnetwork.pl',
            leaveId: LEAVE_ID,
        })
        expect(res.success).toBe(false)
        expect(res.error).toBe('graph_returned_no_rule_id')
    })

    it('retries a 429 and succeeds', async () => {
        const calls = stubGraph([
            { throws: graphError(429) },
            { returns: { id: 'rule-after-retry' } },
        ])
        const res = await createForwardRule({
            userEmail: 'anna@b2bnetwork.pl',
            substituteEmail: 'piotr@b2bnetwork.pl',
            leaveId: LEAVE_ID,
        })
        expect(res).toEqual({ success: true, ruleId: 'rule-after-retry' })
        expect(calls).toHaveLength(2)
    })

    it('does not retry a 403 (RAOP / permission) and reports failure', async () => {
        const calls = stubGraph([{ throws: graphError(403) }])
        const res = await createForwardRule({
            userEmail: 'anna@b2bnetwork.pl',
            substituteEmail: 'piotr@b2bnetwork.pl',
            leaveId: LEAVE_ID,
        })
        expect(res.success).toBe(false)
        expect(calls).toHaveLength(1)
    })

    it('skips instead of failing when Azure credentials are absent (local dev)', async () => {
        delete process.env.AZURE_CLIENT_SECRET
        const res = await createForwardRule({
            userEmail: 'anna@b2bnetwork.pl',
            substituteEmail: 'piotr@b2bnetwork.pl',
            leaveId: LEAVE_ID,
        })
        expect(res).toEqual({ success: true, skipped: true, skipReason: 'no_credentials' })
        expect(mockGetGraphClient).not.toHaveBeenCalled()
    })
})

// ─── deleteForwardRule ───────────────────────────────────────────────────────

describe('deleteForwardRule', () => {
    it('deletes by rule id', async () => {
        const calls = stubGraph([{ returns: null }])
        const res = await deleteForwardRule({
            userEmail: 'anna@b2bnetwork.pl',
            ruleId: 'rule-123',
        })
        expect(res).toEqual({ success: true })
        expect(calls[0].method).toBe('delete')
        expect(calls[0].path).toBe(
            '/users/anna%40b2bnetwork.pl/mailFolders/inbox/messageRules/rule-123',
        )
    })

    it('treats 404 as success — the user may have removed the rule in Outlook', async () => {
        const calls = stubGraph([{ throws: graphError(404) }])
        const res = await deleteForwardRule({
            userEmail: 'anna@b2bnetwork.pl',
            ruleId: 'already-gone',
        })
        expect(res).toEqual({ success: true })
        // 404 must short-circuit, not burn retries.
        expect(calls).toHaveLength(1)
    })

    it('reports failure on 403 so the row keeps its rule id for a retry', async () => {
        stubGraph([{ throws: graphError(403) }])
        const res = await deleteForwardRule({
            userEmail: 'anna@b2bnetwork.pl',
            ruleId: 'rule-123',
        })
        expect(res.success).toBe(false)
        expect(res.error).toContain('403')
    })

    it('retries a 500 before giving up', async () => {
        const calls = stubGraph([{ throws: graphError(500) }, { returns: null }])
        const res = await deleteForwardRule({
            userEmail: 'anna@b2bnetwork.pl',
            ruleId: 'rule-123',
        })
        expect(res).toEqual({ success: true })
        expect(calls).toHaveLength(2)
    })
})

// ─── listCompassForwardRules ─────────────────────────────────────────────────

describe('listCompassForwardRules', () => {
    it('returns only Compass-managed rules with their leave ids', async () => {
        stubGraph([
            {
                returns: {
                    value: [
                        { id: 'r1', displayName: buildForwardRuleName(LEAVE_ID) },
                        { id: 'r2', displayName: 'Newslettery do folderu' },
                        { id: 'r3', displayName: buildForwardRuleName(OTHER_LEAVE_ID) },
                        { id: 'r4', displayName: `${COMPASS_FORWARD_RULE_PREFIX}garbage` },
                    ],
                },
            },
        ])

        const rules = await listCompassForwardRules('anna@b2bnetwork.pl')

        expect(rules).toEqual([
            { id: 'r1', displayName: buildForwardRuleName(LEAVE_ID), leaveId: LEAVE_ID },
            {
                id: 'r3',
                displayName: buildForwardRuleName(OTHER_LEAVE_ID),
                leaveId: OTHER_LEAVE_ID,
            },
        ])
    })

    it('returns an empty array when the mailbox has no Compass rules', async () => {
        stubGraph([{ returns: { value: [] } }])
        expect(await listCompassForwardRules('anna@b2bnetwork.pl')).toEqual([])
    })

    it('returns null on error — "unknown" must not be read as "nothing to clean up"', async () => {
        stubGraph([{ throws: graphError(403) }])
        expect(await listCompassForwardRules('anna@b2bnetwork.pl')).toBeNull()
    })

    it('returns null without credentials', async () => {
        delete process.env.AZURE_TENANT_ID
        expect(await listCompassForwardRules('anna@b2bnetwork.pl')).toBeNull()
    })

    it('skips malformed entries rather than throwing', async () => {
        stubGraph([{ returns: { value: [null, 'nope', { id: 5 }, {}] } }])
        expect(await listCompassForwardRules('anna@b2bnetwork.pl')).toEqual([])
    })
})
