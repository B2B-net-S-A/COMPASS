import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { executeRelease, parseReleaseConfig } from '../coolify-release.mjs'

const TARGET_SHA = 'd'.repeat(40)
const PREVIOUS_SHA = 'e'.repeat(40)
const BUILT_AT = '2026-07-13T12:34:56Z'

function config(overrides = {}) {
    return parseReleaseConfig({
        COOLIFY_URL: 'https://coolify.example.com',
        COOLIFY_TOKEN: 'mutation-token',
        COOLIFY_READ_TOKEN: 'read-token',
        COOLIFY_APP_UUID: 'compass-app-uuid',
        APP_URL: 'https://compass.example.com',
        TARGET_SHA,
        BUILT_AT,
        DEPLOYMENT_POLL_MS: '0',
        DEPLOYMENT_TIMEOUT_MS: '10',
        READINESS_POLL_MS: '0',
        READINESS_TIMEOUT_MS: '10',
        READINESS_SUCCESSES: '3',
        MONITOR_DURATION_MS: '0',
        ...overrides,
    })
}

function json(status, body) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    })
}

function successfulFetch(requests) {
    let deploymentPoll = 0
    return async (input, init = {}) => {
        const url = new URL(input)
        const method = init.method ?? 'GET'
        requests.push({ url, method, init })

        if (url.pathname === '/api/v1/applications/compass-app-uuid' && method === 'GET') {
            const alreadyPatched = requests.some((request) => request.method === 'PATCH'
                && request.url.pathname === '/api/v1/applications/compass-app-uuid')
            return json(200, { git_commit_sha: alreadyPatched ? TARGET_SHA : PREVIOUS_SHA })
        }
        if (url.pathname === '/api/v1/applications/compass-app-uuid' && method === 'PATCH') {
            return json(200, { uuid: 'compass-app-uuid' })
        }
        if (url.pathname === '/api/v1/applications/compass-app-uuid/envs' && method === 'PATCH') {
            return json(201, { uuid: 'env-uuid' })
        }
        if (url.pathname === '/api/v1/deploy' && method === 'GET') {
            return json(200, { deployments: [{ deployment_uuid: 'deployment-uuid' }] })
        }
        if (url.pathname === '/api/v1/deployments/deployment-uuid') {
            deploymentPoll += 1
            return json(200, deploymentPoll === 1
                ? { status: 'in_progress', commit: TARGET_SHA }
                : { status: 'finished', commit: TARGET_SHA })
        }
        if (url.pathname === '/api/health') {
            return json(200, {
                status: 'healthy',
                version: TARGET_SHA,
                deployedAt: BUILT_AT,
                checks: { database: 'healthy' },
            })
        }
        throw new Error(`Unexpected request: ${method} ${url}`)
    }
}

describe('Coolify exact-SHA release', () => {
    it('rejects abbreviated SHAs before making a request', () => {
        assert.throws(
            () => config({ TARGET_SHA: 'abc1234' }),
            /full lowercase 40-character Git SHA/,
        )
    })

    it('patches and verifies the exact SHA, polls the deployment, and checks readiness three times', async () => {
        const requests = []
        const manifest = await executeRelease(config({ ROLLBACK_FLOOR_SHA: PREVIOUS_SHA }), {
            fetchImpl: successfulFetch(requests),
            sleep: async () => {},
            now: () => new Date('2026-07-13T13:00:00Z'),
        })

        assert.equal(manifest.sha, TARGET_SHA)
        assert.equal(manifest.previousSha, PREVIOUS_SHA)
        assert.equal(manifest.oldestSafeRollback, PREVIOUS_SHA)
        assert.equal(manifest.deploymentUuid, 'deployment-uuid')
        assert.equal(requests.filter((request) => request.url.pathname === '/api/health').length, 3)

        const applicationPatch = requests.find((request) => request.method === 'PATCH'
            && request.url.pathname === '/api/v1/applications/compass-app-uuid')
        assert.deepEqual(JSON.parse(applicationPatch.init.body), { git_commit_sha: TARGET_SHA })
        assert.equal(applicationPatch.init.headers.Authorization, 'Bearer mutation-token')

        const applicationRead = requests.find((request) => request.method === 'GET'
            && request.url.pathname === '/api/v1/applications/compass-app-uuid')
        assert.equal(applicationRead.init.headers.Authorization, 'Bearer read-token')

        const environmentBodies = requests
            .filter((request) => request.url.pathname.endsWith('/envs'))
            .map((request) => JSON.parse(request.init.body))
        assert.deepEqual(environmentBodies.map(({ key, value }) => ({ key, value })), [
            { key: 'GIT_SHA', value: TARGET_SHA },
            { key: 'BUILT_AT', value: BUILT_AT },
        ])
        assert.ok(environmentBodies.every((body) => body.is_buildtime === true && body.is_runtime === true))
    })

    it('fails when the completed deployment reports another commit', async () => {
        const requests = []
        const fetchImpl = successfulFetch(requests)

        await assert.rejects(
            executeRelease(config(), {
                fetchImpl: async (input, init) => {
                    const url = new URL(input)
                    if (url.pathname === '/api/v1/deployments/deployment-uuid') {
                        return json(200, { status: 'finished', commit: 'f'.repeat(40) })
                    }
                    return fetchImpl(input, init)
                },
                sleep: async () => {},
            }),
            /different commit/,
        )
    })

    it('fails closed when readiness returns a stale version', async () => {
        const requests = []
        const fetchImpl = successfulFetch(requests)

        await assert.rejects(
            executeRelease(config({ READINESS_TIMEOUT_MS: '1' }), {
                fetchImpl: async (input, init) => {
                    const url = new URL(input)
                    if (url.pathname === '/api/health') {
                        return json(200, {
                            status: 'healthy',
                            version: PREVIOUS_SHA,
                            deployedAt: BUILT_AT,
                            checks: { database: 'healthy' },
                        })
                    }
                    return fetchImpl(input, init)
                },
                sleep: async () => {},
            }),
            /Readiness did not reach/,
        )
    })
})
