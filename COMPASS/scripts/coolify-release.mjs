#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const FULL_GIT_SHA = /^[0-9a-f]{40}$/
const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/
const TERMINAL_SUCCESS = new Set(['finished', 'success', 'completed'])
const TERMINAL_FAILURE = new Set(['failed', 'cancelled', 'cancelled-by-user', 'error'])

const defaultSleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

export class ReleaseFailure extends Error {
    constructor(message, manifest, cause) {
        super(message, { cause })
        this.name = 'ReleaseFailure'
        this.releaseManifest = manifest
    }
}

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

function utcSeconds(value) {
    const date = value instanceof Date ? value : new Date(value)
    if (Number.isNaN(date.getTime())) throw new Error('Release clock returned an invalid date')
    return new Date(Math.floor(date.getTime() / 1_000) * 1_000)
        .toISOString()
        .replace('.000Z', 'Z')
}

function gitIsAncestor(ancestor, descendant) {
    const result = spawnSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], {
        stdio: 'ignore',
    })
    if (result.error) throw new Error(`Cannot validate rollback ancestry: ${result.error.message}`)
    return result.status === 0
}

export function assertRollbackAllowed(config, previousSha, isAncestor = gitIsAncestor) {
    if (!FULL_GIT_SHA.test(previousSha ?? '')) {
        throw new Error('Current production SHA is missing or invalid; refusing to deploy without a rollback target')
    }
    if (!config.rollbackFloor) {
        throw new Error('ROLLBACK_FLOOR_SHA is required before the release gate can be activated')
    }
    if (previousSha === config.targetSha) {
        throw new Error('Target SHA is already configured in production')
    }
    if (!isAncestor(config.rollbackFloor, previousSha)) {
        throw new Error('Current production SHA is older than or unrelated to the approved rollback floor')
    }
    if (!isAncestor(previousSha, config.targetSha)) {
        throw new Error('Current production SHA is not an ancestor of the release candidate')
    }
}

export function parseReleaseConfig(env = process.env) {
    const targetSha = required(env, 'TARGET_SHA')
    const deployedAt = required(env, 'BUILT_AT')
    const appUuid = required(env, 'COOLIFY_APP_UUID')

    if (!FULL_GIT_SHA.test(targetSha)) throw new Error('TARGET_SHA must be a full lowercase 40-character Git SHA')
    const parsedDeployedAt = new Date(deployedAt)
    if (!UTC_TIMESTAMP.test(deployedAt)
        || Number.isNaN(parsedDeployedAt.getTime())
        || parsedDeployedAt.toISOString() !== deployedAt.replace(/Z$/, '.000Z')) {
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
        let response
        try {
            response = await deps.fetchImpl(coolifyUrl(config, path), {
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
        } catch (error) {
            lastError = error
            if (attempt >= attempts) break
            await deps.sleep(1_000 * (2 ** (attempt - 1)))
            continue
        }

        if (expected.includes(response.status)) return await readJsonResponse(response)

        lastError = new Error(`Coolify ${method} ${path.split('?')[0]} returned HTTP ${response.status}`)
        if ((response.status === 429 || response.status >= 500) && attempt < attempts) {
            await deps.sleep(1_000 * (2 ** (attempt - 1)))
            continue
        }
        break
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

async function waitForDeployment(config, deps, deploymentUuid, expectedSha) {
    const maxPolls = Math.max(1, Math.ceil(config.deploymentTimeoutMs / Math.max(1, config.deploymentPollMs)))

    for (let poll = 0; poll < maxPolls; poll += 1) {
        const deployment = await requestJson(config, deps, {
            path: `/deployments/${encodeURIComponent(deploymentUuid)}`,
            token: config.readToken,
        })
        const status = String(deployment?.status ?? '').toLowerCase()

        if (TERMINAL_FAILURE.has(status)) throw new Error(`Coolify deployment ended with status ${status}`)
        if (TERMINAL_SUCCESS.has(status)) {
            if (deployment?.commit !== expectedSha) {
                throw new Error('Coolify completed a deployment for a different commit')
            }
            return deployment
        }

        if (poll + 1 < maxPolls) await deps.sleep(config.deploymentPollMs)
    }

    throw new Error('Timed out while waiting for Coolify deployment')
}

async function getReadiness(config, deps, expectedRelease) {
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
        const cacheControl = response.headers.get('cache-control') ?? ''
        const checks = body?.checks
        const checksAreValid = checks
            && typeof checks === 'object'
            && !Array.isArray(checks)
            && Object.values(checks).every((check) => check
                && typeof check === 'object'
                && !Array.isArray(check)
                && ['healthy', 'degraded', 'unhealthy'].includes(check.status))

        return (body?.status === 'healthy' || body?.status === 'degraded')
            && body?.version === expectedRelease.sha
            && body?.deployedAt === expectedRelease.deployedAt
            && checksAreValid
            && checks.database?.status === 'healthy'
            && checks.release?.status === 'healthy'
            && cacheControl.toLowerCase().includes('no-store')
    } catch {
        return false
    }
}

async function waitForReadiness(config, deps, expectedRelease) {
    if (config.readinessSuccesses < 1) throw new Error('READINESS_SUCCESSES must be at least 1')
    const maxPolls = Math.max(1, Math.ceil(config.readinessTimeoutMs / Math.max(1, config.readinessPollMs)))
    let consecutiveSuccesses = 0

    for (let poll = 0; poll < maxPolls; poll += 1) {
        if (await getReadiness(config, deps, expectedRelease)) {
            consecutiveSuccesses += 1
            if (consecutiveSuccesses >= config.readinessSuccesses) return
        } else {
            consecutiveSuccesses = 0
        }

        if (poll + 1 < maxPolls) await deps.sleep(config.readinessPollMs)
    }

    throw new Error('Readiness did not reach the required consecutive healthy state')
}

async function monitorRelease(config, deps, expectedRelease) {
    if (config.monitorDurationMs === 0) return
    const checks = Math.max(1, Math.ceil(config.monitorDurationMs / Math.max(1, config.monitorPollMs)))
    let consecutiveFailures = 0

    for (let check = 0; check < checks; check += 1) {
        await deps.sleep(config.monitorPollMs)
        if (await getReadiness(config, deps, expectedRelease)) {
            consecutiveFailures = 0
        } else {
            consecutiveFailures += 1
            if (consecutiveFailures >= 2) {
                throw new Error('Release monitoring detected two consecutive critical failures')
            }
        }
    }
}

async function readApplicationSha(config, deps) {
    const application = await requestJson(config, deps, {
        path: `/applications/${config.appUuid}`,
        token: config.readToken,
    })
    const sha = application?.git_commit_sha
    return FULL_GIT_SHA.test(sha ?? '') ? sha : null
}

async function setApplicationSha(config, deps, expectedCurrentSha, nextSha) {
    const currentSha = await readApplicationSha(config, deps)
    if (currentSha !== expectedCurrentSha) {
        throw new Error('Coolify application SHA changed concurrently; refusing to overwrite it')
    }

    await requestJson(config, deps, {
        method: 'PATCH',
        path: `/applications/${config.appUuid}`,
        token: config.mutationToken,
        body: { git_commit_sha: nextSha },
    })

    if (await readApplicationSha(config, deps) !== nextSha) {
        throw new Error('Coolify did not persist the requested git_commit_sha')
    }
}

async function triggerDeployment(config, deps) {
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
    return deploymentUuid
}

async function deployExactRelease(config, deps, {
    sha,
    deployedAt,
    expectedCurrentSha,
    monitor,
}) {
    await setApplicationSha(config, deps, expectedCurrentSha, sha)
    await updateReleaseEnvironment(config, deps, 'GIT_SHA', sha)
    await updateReleaseEnvironment(config, deps, 'BUILT_AT', deployedAt)

    const deploymentUuid = await triggerDeployment(config, deps)
    await waitForDeployment(config, deps, deploymentUuid, sha)
    await waitForReadiness(config, deps, { sha, deployedAt })
    if (monitor) await monitorRelease(config, deps, { sha, deployedAt })
    return deploymentUuid
}

function releaseManifest(config, deps, previousSha, values) {
    return {
        schemaVersion: 1,
        applicationUuid: config.appUuid,
        sha: config.targetSha,
        deployedAt: config.deployedAt,
        verifiedAt: utcSeconds(deps.now()).replace('.000Z', 'Z'),
        migrationHead: config.migrationHead,
        previousSha,
        oldestSafeRollback: config.rollbackFloor,
        deploymentUuid: values.deploymentUuid ?? null,
        outcome: values.outcome,
        rollbackToSha: values.rollbackToSha ?? null,
        rollbackDeploymentUuid: values.rollbackDeploymentUuid ?? null,
    }
}

export async function executeRelease(config, injected = {}) {
    const deps = {
        fetchImpl: injected.fetchImpl ?? fetch,
        sleep: injected.sleep ?? defaultSleep,
        now: injected.now ?? (() => new Date()),
        isAncestor: injected.isAncestor ?? gitIsAncestor,
    }

    const previousSha = await readApplicationSha(config, deps)
    assertRollbackAllowed(config, previousSha, deps.isAncestor)

    let deploymentUuid = null
    try {
        deploymentUuid = await deployExactRelease(config, deps, {
            sha: config.targetSha,
            deployedAt: config.deployedAt,
            expectedCurrentSha: previousSha,
            monitor: true,
        })
    } catch (releaseError) {
        const currentSha = await readApplicationSha(config, deps)
        if (currentSha === previousSha) throw releaseError
        if (currentSha !== config.targetSha) {
            throw new ReleaseFailure(
                'Release failed and automatic rollback was refused because Coolify changed concurrently',
                releaseManifest(config, deps, previousSha, {
                    deploymentUuid,
                    outcome: 'failed',
                }),
                releaseError,
            )
        }

        const rollbackAt = utcSeconds(deps.now())
        let rollbackDeploymentUuid = null
        try {
            rollbackDeploymentUuid = await deployExactRelease(config, deps, {
                sha: previousSha,
                deployedAt: rollbackAt,
                expectedCurrentSha: config.targetSha,
                monitor: false,
            })
        } catch (rollbackError) {
            throw new ReleaseFailure(
                `Release failed and automatic rollback also failed: ${rollbackError.message}`,
                releaseManifest(config, deps, previousSha, {
                    deploymentUuid,
                    outcome: 'failed',
                    rollbackToSha: previousSha,
                    rollbackDeploymentUuid,
                }),
                releaseError,
            )
        }

        throw new ReleaseFailure(
            `Release failed and was automatically rolled back: ${releaseError.message}`,
            releaseManifest(config, deps, previousSha, {
                deploymentUuid,
                outcome: 'rolled_back',
                rollbackToSha: previousSha,
                rollbackDeploymentUuid,
            }),
            releaseError,
        )
    }

    return releaseManifest(config, deps, previousSha, {
        deploymentUuid,
        outcome: 'succeeded',
    })
}

async function main() {
    try {
        const config = parseReleaseConfig()
        const manifest = await executeRelease(config)
        writeFileSync(config.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 })
        process.stdout.write(`Verified COMPASS release ${manifest.sha} (${manifest.deploymentUuid})\n`)
    } catch (error) {
        if (error instanceof ReleaseFailure) {
            const manifestPath = process.env.RELEASE_MANIFEST_PATH?.trim() || 'release-manifest.json'
            writeFileSync(manifestPath, `${JSON.stringify(error.releaseManifest, null, 2)}\n`, { mode: 0o600 })
        }
        const message = error instanceof Error ? error.message : 'Unknown release error'
        process.stderr.write(`Release failed: ${message}\n`)
        process.exitCode = 1
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    await main()
}
