import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

import {
    parsePreflightConfig,
    parseQualityGateConfig,
    parseReadinessConfig,
    verifyQualityGate,
    verifyThreeReadinessSamples,
} from '../staging-release-gate.mjs'

const TARGET_SHA = 'a'.repeat(40)

function json(status, body, headers = {}) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            'Content-Type': 'application/json',
            ...headers,
        },
    })
}

function preflightEnv(overrides = {}) {
    return {
        COMPASS_STAGING_RELEASE_ENABLED: 'true',
        STAGING_COOLIFY_URL: 'https://coolify-staging.example.com',
        STAGING_APPLICATION_UUID: 'compass-staging-uuid',
        STAGING_HEALTH_URL: 'https://staging.compass.example.com/api/health',
        COOLIFY_TOKEN: 'coolify-token',
        MIGRATION_DATABASE_URL: 'postgresql://staging.example.invalid/database',
        CF_ACCESS_CLIENT_ID: 'access-client-id',
        CF_ACCESS_CLIENT_SECRET: 'access-client-secret',
        ...overrides,
    }
}

function readinessBody(overrides = {}) {
    return {
        status: 'healthy',
        version: TARGET_SHA,
        deployedAt: '2026-07-14T12:34:56Z',
        checks: {
            database: { status: 'healthy', critical: true },
            release: { status: 'healthy', critical: true },
        },
        ...overrides,
    }
}

describe('COMPASS staging release gate', () => {
    it('fails preflight before mutation when an Access secret is missing', () => {
        assert.throws(
            () => parsePreflightConfig(preflightEnv({ CF_ACCESS_CLIENT_SECRET: '' })),
            /CF_ACCESS_CLIENT_SECRET is required/,
        )
    })

    it('accepts only a full exact target SHA for quality-gate lookup', () => {
        assert.throws(
            () => parseQualityGateConfig({
                GITHUB_REPOSITORY: 'artur-t-96/COMPASS',
                GITHUB_TOKEN: 'github-token',
                TARGET_SHA: 'abc1234',
            }),
            /full lowercase 40-character Git SHA/,
        )
    })

    it('requires the named quality-gate job from a successful same-repository run', async () => {
        const requests = []
        const config = parseQualityGateConfig({
            GITHUB_REPOSITORY: 'artur-t-96/COMPASS',
            GITHUB_TOKEN: 'github-token',
            TARGET_SHA,
        })
        const runId = await verifyQualityGate(config, {
            fetchImpl: async (input, init) => {
                const url = new URL(input)
                requests.push({ url, init })
                if (url.pathname.endsWith('/actions/workflows/build-check.yml/runs')) {
                    return json(200, {
                        workflow_runs: [{
                            id: 12345,
                            head_sha: TARGET_SHA,
                            head_repository: { full_name: 'artur-t-96/COMPASS' },
                            event: 'pull_request',
                            status: 'completed',
                            conclusion: 'success',
                        }],
                    })
                }
                if (url.pathname.endsWith('/actions/runs/12345/jobs')) {
                    return json(200, {
                        jobs: [{ name: 'quality-gate', status: 'completed', conclusion: 'success' }],
                    })
                }
                throw new Error(`Unexpected URL ${url}`)
            },
        })

        assert.equal(runId, '12345')
        assert.equal(requests.length, 2)
        assert.ok(requests.every(({ init }) => init.headers.Authorization === 'Bearer github-token'))
    })

    it('rejects a successful workflow run whose quality-gate job did not pass', async () => {
        const config = parseQualityGateConfig({
            GITHUB_REPOSITORY: 'artur-t-96/COMPASS',
            GITHUB_TOKEN: 'github-token',
            TARGET_SHA,
        })
        await assert.rejects(
            verifyQualityGate(config, {
                fetchImpl: async (input) => {
                    const url = new URL(input)
                    if (url.pathname.endsWith('/actions/workflows/build-check.yml/runs')) {
                        return json(200, {
                            workflow_runs: [{
                                id: 9,
                                head_sha: TARGET_SHA,
                                head_repository: { full_name: 'artur-t-96/COMPASS' },
                                event: 'push',
                                status: 'completed',
                                conclusion: 'success',
                            }],
                        })
                    }
                    return json(200, {
                        jobs: [{ name: 'quality-gate', status: 'completed', conclusion: 'failure' }],
                    })
                },
            }),
            /no successful quality-gate/,
        )
    })

    it('sends Access headers and requires three healthy samples 20 seconds apart', async () => {
        const requests = []
        const intervals = []
        const config = parseReadinessConfig({
            TARGET_SHA,
            STAGING_HEALTH_URL: 'https://staging.compass.example.com/api/health',
            CF_ACCESS_CLIENT_ID: 'access-client-id',
            CF_ACCESS_CLIENT_SECRET: 'access-client-secret',
        })
        await verifyThreeReadinessSamples(config, {
            fetchImpl: async (input, init) => {
                requests.push({ input, init })
                return json(200, readinessBody(), { 'Cache-Control': 'no-store' })
            },
            sleep: async (milliseconds) => intervals.push(milliseconds),
        })

        assert.equal(requests.length, 3)
        assert.deepEqual(intervals, [20_000, 20_000])
        assert.ok(requests.every(({ init }) => init.headers['CF-Access-Client-Id'] === 'access-client-id'))
        assert.ok(requests.every(({ init }) => init.headers['CF-Access-Client-Secret'] === 'access-client-secret'))
    })

    it('fails closed on a stale readiness SHA without exposing Access secrets', async () => {
        const config = parseReadinessConfig({
            TARGET_SHA,
            STAGING_HEALTH_URL: 'https://staging.compass.example.com/api/health',
            CF_ACCESS_CLIENT_ID: 'access-client-id',
            CF_ACCESS_CLIENT_SECRET: 'access-client-secret',
        })
        let error
        try {
            await verifyThreeReadinessSamples(config, {
                fetchImpl: async () => json(200, readinessBody({ version: 'b'.repeat(40) }), {
                    'Cache-Control': 'no-store',
                }),
                sleep: async () => {},
            })
        } catch (caught) {
            error = caught
        }
        assert.match(error.message, /Readiness sample 1 of 3 failed/)
        assert.doesNotMatch(String(error), /access-client-secret/)
    })

    it('keeps the workflow manual, staging-only, and variable-driven', async () => {
        const workflow = await readFile(
            new URL('../../../.github/workflows/deploy-staging.yml', import.meta.url),
            'utf8',
        )
        assert.match(workflow, /on:\n  workflow_dispatch:/)
        assert.doesNotMatch(workflow, /^\s{2}(?:push|workflow_run|schedule):/m)
        assert.match(workflow, /environment: staging/)
        assert.match(workflow, /vars\.STAGING_COOLIFY_URL/)
        assert.match(workflow, /vars\.STAGING_APPLICATION_UUID/)
        assert.match(workflow, /vars\.STAGING_HEALTH_URL/)
        assert.match(workflow, /secrets\.CF_ACCESS_CLIENT_ID/)
        assert.match(workflow, /secrets\.CF_ACCESS_CLIENT_SECRET/)
        assert.match(workflow, /secrets\.MIGRATION_DATABASE_URL/)
        assert.match(workflow, /supabase db push/)
        assert.doesNotMatch(workflow, /environment: production/)
    })
})
