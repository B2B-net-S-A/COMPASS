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
        ROLLBACK_FLOOR_SHA: PREVIOUS_SHA,
        ...overrides,
    })
}

function json(status, body, headers = {}) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
            ...headers,
        },
    })
}

function successfulFetch(requests) {
    let applicationSha = PREVIOUS_SHA
    let builtAt = BUILT_AT
    let deploymentCount = 0
    const deployments = new Map()
    const deploymentPolls = new Map()

    return async (input, init = {}) => {
        const url = new URL(input)
        const method = init.method ?? 'GET'
        requests.push({ url, method, init })

        if (url.pathname === '/api/v1/applications/compass-app-uuid' && method === 'GET') {
            return json(200, { git_commit_sha: applicationSha })
        }
        if (url.pathname === '/api/v1/applications/compass-app-uuid' && method === 'PATCH') {
            applicationSha = JSON.parse(init.body).git_commit_sha
            return json(200, { uuid: 'compass-app-uuid' })
        }
        if (url.pathname === '/api/v1/applications/compass-app-uuid/envs' && method === 'PATCH') {
            const body = JSON.parse(init.body)
            if (body.key === 'BUILT_AT') builtAt = body.value
            return json(201, { uuid: 'env-uuid' })
        }
        if (url.pathname === '/api/v1/deploy' && method === 'GET') {
            deploymentCount += 1
            const deploymentUuid = `deployment-${deploymentCount}`
            deployments.set(deploymentUuid, applicationSha)
            return json(200, { deployments: [{ deployment_uuid: deploymentUuid }] })
        }
        if (url.pathname.startsWith('/api/v1/deployments/')) {
            const deploymentUuid = url.pathname.split('/').at(-1)
            const deploymentSha = deployments.get(deploymentUuid)
            if (!deploymentSha) throw new Error(`Unknown deployment: ${deploymentUuid}`)
            const poll = (deploymentPolls.get(deploymentUuid) ?? 0) + 1
            deploymentPolls.set(deploymentUuid, poll)
            return json(200, poll === 1
                ? { status: 'in_progress', commit: deploymentSha }
                : { status: 'finished', commit: deploymentSha })
        }
        if (url.pathname === '/api/health') {
            return json(200, {
                status: 'healthy',
                version: applicationSha,
                deployedAt: builtAt,
                checks: {
                    database: { status: 'healthy' },
                    release: { status: 'healthy' },
                },
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

    it('rejects normalized but nonexistent UTC dates', () => {
        assert.throws(
            () => config({ BUILT_AT: '2026-02-31T12:34:56Z' }),
            /valid ISO-8601 UTC timestamp/,
        )
    })

    it('patches and verifies the exact SHA, polls the deployment, and checks readiness three times', async () => {
        const requests = []
        const manifest = await executeRelease(config(), {
            fetchImpl: successfulFetch(requests),
            sleep: async () => {},
            now: () => new Date('2026-07-13T13:00:00Z'),
            isAncestor: () => true,
        })

        assert.equal(manifest.sha, TARGET_SHA)
        assert.equal(manifest.previousSha, PREVIOUS_SHA)
        assert.equal(manifest.oldestSafeRollback, PREVIOUS_SHA)
        assert.equal(manifest.deploymentUuid, 'deployment-1')
        assert.equal(manifest.outcome, 'succeeded')
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
                    if (url.pathname === '/api/v1/deployments/deployment-1') {
                        return json(200, { status: 'finished', commit: 'f'.repeat(40) })
                    }
                    return fetchImpl(input, init)
                },
                sleep: async () => {},
                isAncestor: () => true,
            }),
            /automatically rolled back: Coolify completed a deployment for a different commit/,
        )

        const appPatches = requests
            .filter((request) => request.method === 'PATCH'
                && request.url.pathname === '/api/v1/applications/compass-app-uuid')
            .map((request) => JSON.parse(request.init.body).git_commit_sha)
        assert.deepEqual(appPatches, [TARGET_SHA, PREVIOUS_SHA])
    })

    it('fails closed when readiness returns a stale version', async () => {
        const requests = []
        const fetchImpl = successfulFetch(requests)

        await assert.rejects(
            executeRelease(config({
                READINESS_TIMEOUT_MS: '1',
                READINESS_SUCCESSES: '1',
            }), {
                fetchImpl: async (input, init) => {
                    const url = new URL(input)
                    const lastApplicationPatch = requests.findLast((request) => request.method === 'PATCH'
                        && request.url.pathname === '/api/v1/applications/compass-app-uuid')
                    const configuredSha = lastApplicationPatch
                        ? JSON.parse(lastApplicationPatch.init.body).git_commit_sha
                        : PREVIOUS_SHA
                    if (url.pathname === '/api/health' && configuredSha === TARGET_SHA) {
                        return json(200, {
                            status: 'healthy',
                            version: PREVIOUS_SHA,
                            deployedAt: BUILT_AT,
                            checks: {
                                database: { status: 'healthy' },
                                release: { status: 'healthy' },
                            },
                        })
                    }
                    return fetchImpl(input, init)
                },
                sleep: async () => {},
                isAncestor: () => true,
            }),
            /automatically rolled back: Readiness did not reach/,
        )
    })

    it('refuses to mutate Coolify without an approved rollback floor', async () => {
        const requests = []

        await assert.rejects(
            executeRelease(config({ ROLLBACK_FLOOR_SHA: '' }), {
                fetchImpl: successfulFetch(requests),
                sleep: async () => {},
                isAncestor: () => true,
            }),
            /ROLLBACK_FLOOR_SHA is required/,
        )

        assert.equal(requests.some((request) => request.method === 'PATCH'), false)
    })

    it('rolls back when readiness is cacheable', async () => {
        const requests = []
        const fetchImpl = successfulFetch(requests)

        await assert.rejects(
            executeRelease(config({
                READINESS_TIMEOUT_MS: '1',
                READINESS_SUCCESSES: '1',
            }), {
                fetchImpl: async (input, init) => {
                    const url = new URL(input)
                    const latestPatch = requests.findLast((request) => request.method === 'PATCH'
                        && request.url.pathname === '/api/v1/applications/compass-app-uuid')
                    const configuredSha = latestPatch
                        ? JSON.parse(latestPatch.init.body).git_commit_sha
                        : PREVIOUS_SHA
                    if (url.pathname === '/api/health' && configuredSha === TARGET_SHA) {
                        return json(200, {
                            status: 'healthy',
                            version: TARGET_SHA,
                            deployedAt: BUILT_AT,
                            checks: {
                                database: { status: 'healthy' },
                                release: { status: 'healthy' },
                            },
                        }, { 'Cache-Control': 'public, max-age=60' })
                    }
                    return fetchImpl(input, init)
                },
                sleep: async () => {},
                isAncestor: () => true,
            }),
            /automatically rolled back: Readiness did not reach/,
        )
    })

    it('rolls back when readiness uses legacy scalar checks', async () => {
        const requests = []
        const fetchImpl = successfulFetch(requests)

        await assert.rejects(
            executeRelease(config({
                READINESS_TIMEOUT_MS: '1',
                READINESS_SUCCESSES: '1',
            }), {
                fetchImpl: async (input, init) => {
                    const url = new URL(input)
                    const latestPatch = requests.findLast((request) => request.method === 'PATCH'
                        && request.url.pathname === '/api/v1/applications/compass-app-uuid')
                    const configuredSha = latestPatch
                        ? JSON.parse(latestPatch.init.body).git_commit_sha
                        : PREVIOUS_SHA
                    if (url.pathname === '/api/health' && configuredSha === TARGET_SHA) {
                        return json(200, {
                            status: 'healthy',
                            version: TARGET_SHA,
                            deployedAt: BUILT_AT,
                            checks: {
                                database: 'healthy',
                                release: 'healthy',
                            },
                        })
                    }
                    return fetchImpl(input, init)
                },
                sleep: async () => {},
                isAncestor: () => true,
            }),
            /automatically rolled back: Readiness did not reach/,
        )
    })

    it('refuses a previous SHA outside the rollback ancestry window', async () => {
        const requests = []

        await assert.rejects(
            executeRelease(config(), {
                fetchImpl: successfulFetch(requests),
                sleep: async () => {},
                isAncestor: () => false,
            }),
            /older than or unrelated to the approved rollback floor/,
        )

        assert.equal(requests.some((request) => request.method === 'PATCH'), false)
    })
})
