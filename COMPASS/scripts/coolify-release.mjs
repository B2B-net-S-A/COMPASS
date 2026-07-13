#!/usr/bin/env node

import { writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const FULL_GIT_SHA = /^[0-9a-f]{40}$/
const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/
const TERMINAL_SUCCESS = new Set(['finished', 'success', 'completed'])
const TERMINAL_FAILURE = new Set(['failed', 'cancelled', 'cancelled-by-user', 'error'])

const defaultSleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

function required(env, key) {
    const value = env[key]?.trim()
    if (!value) throw new Error(`${key} is required`)
    return value
}

function positiveInteger(env, key, fallback) {
    const raw = env[key]
    if (raw === undefined || raw === '') return fallback
    const value = Number(raw)
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${key} must be a non-negative integer`)
    return value
}

function normalizedHttpsUrl(value, key) {
    const url = new URL(value)
    if (url.protocol !== 'https:') throw new Error(`${key} must use https`)
    if (url.username || url.password || url.search || url.hash) {
        throw new Error(`${key} must not contain credentials, a query, or a fragment`)
    }
    if (url.pathname !== '/' && url.pathname !== '') throw new Error(`${key} must not contain a path`)
    return url.toString().replace(/\/$/, '')
}

export function parseReleaseConfig(env = process.env) {
    const targetSha = required(env, 'TARGET_SHA')
    const deployedAt = required(env, 'BUILT_AT')
    const appUuid = required(env, 'COOLIFY_APP_UUID')

    if (!FULL_GIT_SHA.test(targetSha)) throw new Error('TARGET_SHA must be a full lowercase 40-character Git SHA')
    if (!UTC_TIMESTAMP.test(deployedAt) || Number.isNaN(Date.parse(deployedAt))) {
        throw new Error('BUILT_AT must be a valid ISO-8601 UTC timestamp without milliseconds')
    }
    if (!/^[a-zA-Z0-9-]+$/.test(appUuid)) throw new Error('COOLIFY_APP_UUID has an invalid format')

    const rollbackFloor = env.ROLLBACK_FLOOR_SHA?.trim() || null
    if (rollbackFloor && !FULL_GIT_SHA.test(rollbackFloor)) {
        throw new Error('ROLLBACK_FLOOR_SHA must be a full lowercase 40-character Git SHA')
    }

    return {
        coolifyUrl: normalizedHttpsUrl(required(env, 'COOLIFY_URL'), 'COOLIFY_URL'),
        appUrl: normalizedHttpsUrl(required(env, 'APP_URL'), 'APP_URL'),
        mutationToken: required(env, 'COOLIFY_TOKEN'),
        readToken: required(env, 'COOLIFY_READ_TOKEN'),
        appUuid,
        targetSha,
        deployedAt,
        migrationHead: env.MIGRATION_HEAD?.trim() || null,
        rollbackFloor,
        manifestPath: env.RELEASE_MANIFEST_PATH?.trim() || 'release-manifest.json',
        deploymentPollMs: positiveInteger(env, 'DEPLOYMENT_POLL_MS', 10_000),
        deploymentTimeoutMs: positiveInteger(env, 'DEPLOYMENT_TIMEOUT_MS', 15 * 60_000),
        readinessPollMs: positiveInteger(env, 'READINESS_POLL_MS', 20_000),
        readinessTimeoutMs: positiveInteger(env, 'READINESS_TIMEOUT_MS', 10 * 60_000),
        readinessSuccesses: positiveInteger(env, 'READINESS_SUCCESSES', 3),
        monitorPollMs: positiveInteger(env, 'MONITOR_POLL_MS', 30_000),
        monitorDurationMs: positiveInteger(env, 'MONITOR_DURATION_MS', 5 * 60_000),
    }
}

function coolifyUrl(config, path) {
    return `${config.coolifyUrl}/api/v1${path}`
}

async function readJsonResponse(response) {
    const text = await response.text()
    if (!text) return null
    try {
        return JSON.parse(text)
    } catch {
        throw new Error(`Received invalid JSON from HTTP ${response.status}`)
    }
}

async function requestJson(config, deps, {
    method = 'GET',
    path,
    token,
    body,
    expected = [200],
    retryMutation = true,
}) {
    const attempts = retryMutation ? 3 : 1
    let lastError

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            const response = await deps.fetchImpl(coolifyUrl(config, path), {
                method,
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: 'application/json',
                    ...(body ? { 'Content-Type': 'application/json' } : {}),
                },
                body: body ? JSON.stringify(body) : undefined,
                redirect: 'error',
                signal: AbortSignal.timeout(30_000),
            })

            if (expected.includes(response.status)) return await readJsonResponse(response)

            if ((response.status === 429 || response.status >= 500) && attempt < attempts) {
                await deps.sleep(1_000 * (2 ** (attempt - 1)))
                continue
            }
            throw new Error(`Coolify ${method} ${path} returned HTTP ${response.status}`)
        } catch (error) {
            lastError = error
            if (attempt >= attempts) break
            await deps.sleep(1_000 * (2 ** (attempt - 1)))
        }
    }

    throw lastError instanceof Error ? lastError : new Error(`Coolify ${method} ${path} failed`)
}

async function updateReleaseEnvironment(config, deps, key, value) {
    await requestJson(config, deps, {
        method: 'PATCH',
        path: `/applications/${config.appUuid}/envs`,
        token: config.mutationToken,
        expected: [200, 201],
        body: {
            key,
            value,
            is_buildtime: true,
            is_runtime: true,
            is_preview: false,
            is_literal: true,
        },
    })
}

async function waitForDeployment(config, deps, deploymentUuid) {
    const maxPolls = Math.max(1, Math.ceil(config.deploymentTimeoutMs / Math.max(1, config.deploymentPollMs)))

    for (let poll = 0; poll < maxPolls; poll += 1) {
        const deployment = await requestJson(config, deps, {
            path: `/deployments/${encodeURIComponent(deploymentUuid)}`,
            token: config.readToken,
        })
        const status = String(deployment?.status ?? '').toLowerCase()

        if (TERMINAL_FAILURE.has(status)) throw new Error(`Coolify deployment ended with status ${status}`)
        if (TERMINAL_SUCCESS.has(status)) {
            if (deployment?.commit !== config.targetSha) {
                throw new Error('Coolify completed a deployment for a different commit')
            }
            return deployment
        }

        if (poll + 1 < maxPolls) await deps.sleep(config.deploymentPollMs)
    }

    throw new Error('Timed out while waiting for Coolify deployment')
}

async function getReadiness(config, deps) {
    try {
        const response = await deps.fetchImpl(`${config.appUrl}/api/health`, {
            method: 'GET',
            headers: {
                Accept: 'application/json',
                'User-Agent': 'dynaminds-release-gate/1.0 (+github-actions; compass)',
            },
            cache: 'no-store',
            redirect: 'error',
            signal: AbortSignal.timeout(10_000),
        })
        if (response.status !== 200) return false
        const body = await readJsonResponse(response)

        return (body?.status === 'healthy' || body?.status === 'degraded')
            && body?.version === config.targetSha
            && body?.deployedAt === config.deployedAt
            && body?.checks?.database === 'healthy'
    } catch {
        return false
    }
}

async function waitForReadiness(config, deps) {
    if (config.readinessSuccesses < 1) throw new Error('READINESS_SUCCESSES must be at least 1')
    const maxPolls = Math.max(1, Math.ceil(config.readinessTimeoutMs / Math.max(1, config.readinessPollMs)))
    let consecutiveSuccesses = 0

    for (let poll = 0; poll < maxPolls; poll += 1) {
        if (await getReadiness(config, deps)) {
            consecutiveSuccesses += 1
            if (consecutiveSuccesses >= config.readinessSuccesses) return
        } else {
            consecutiveSuccesses = 0
        }

        if (poll + 1 < maxPolls) await deps.sleep(config.readinessPollMs)
    }

    throw new Error('Readiness did not reach the required consecutive healthy state')
}

async function monitorRelease(config, deps) {
    if (config.monitorDurationMs === 0) return
    const checks = Math.max(1, Math.ceil(config.monitorDurationMs / Math.max(1, config.monitorPollMs)))
    let consecutiveFailures = 0

    for (let check = 0; check < checks; check += 1) {
        await deps.sleep(config.monitorPollMs)
        if (await getReadiness(config, deps)) {
            consecutiveFailures = 0
        } else {
            consecutiveFailures += 1
            if (consecutiveFailures >= 2) {
                throw new Error('Release monitoring detected two consecutive critical failures')
            }
        }
    }
}

export async function executeRelease(config, injected = {}) {
    const deps = {
        fetchImpl: injected.fetchImpl ?? fetch,
        sleep: injected.sleep ?? defaultSleep,
        now: injected.now ?? (() => new Date()),
    }

    const before = await requestJson(config, deps, {
        path: `/applications/${config.appUuid}`,
        token: config.readToken,
    })
    const previousSha = FULL_GIT_SHA.test(before?.git_commit_sha ?? '') ? before.git_commit_sha : null

    await requestJson(config, deps, {
        method: 'PATCH',
        path: `/applications/${config.appUuid}`,
        token: config.mutationToken,
        body: { git_commit_sha: config.targetSha },
    })

    const after = await requestJson(config, deps, {
        path: `/applications/${config.appUuid}`,
        token: config.readToken,
    })
    if (after?.git_commit_sha !== config.targetSha) {
        throw new Error('Coolify did not persist the requested git_commit_sha')
    }

    await updateReleaseEnvironment(config, deps, 'GIT_SHA', config.targetSha)
    await updateReleaseEnvironment(config, deps, 'BUILT_AT', config.deployedAt)

    // The deploy endpoint is intentionally not retried: a lost response may
    // still have queued work, and retrying could create a duplicate deployment.
    const trigger = await requestJson(config, deps, {
        path: `/deploy?uuid=${encodeURIComponent(config.appUuid)}`,
        token: config.mutationToken,
        retryMutation: false,
    })
    const deploymentUuid = trigger?.deployments?.[0]?.deployment_uuid
    if (!deploymentUuid || typeof deploymentUuid !== 'string') {
        throw new Error('Coolify did not return a deployment UUID')
    }

    await waitForDeployment(config, deps, deploymentUuid)
    await waitForReadiness(config, deps)
    await monitorRelease(config, deps)

    return {
        schemaVersion: 1,
        applicationUuid: config.appUuid,
        sha: config.targetSha,
        deployedAt: config.deployedAt,
        verifiedAt: deps.now().toISOString(),
        migrationHead: config.migrationHead,
        previousSha,
        oldestSafeRollback: config.rollbackFloor,
        deploymentUuid,
    }
}

async function main() {
    try {
        const config = parseReleaseConfig()
        const manifest = await executeRelease(config)
        writeFileSync(config.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 })
        process.stdout.write(`Verified COMPASS release ${manifest.sha} (${manifest.deploymentUuid})\n`)
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown release error'
        process.stderr.write(`Release failed: ${message}\n`)
        process.exitCode = 1
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    await main()
}
