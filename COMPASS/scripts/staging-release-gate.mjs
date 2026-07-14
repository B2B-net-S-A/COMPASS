#!/usr/bin/env node

import { appendFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const FULL_GIT_SHA = /^[0-9a-f]{40}$/
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
const APPLICATION_UUID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/
const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/
const SENSITIVE_HEALTH_VALUE = /(?:password|secret|token|authorization|postgres(?:ql)?:\/\/|select\s+.+\s+from|traceback|stack\s*trace)/i

const defaultSleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

function required(env, key) {
    const value = env[key]?.trim()
    if (!value) throw new Error(`${key} is required`)
    return value
}

function httpsUrl(value, key, { allowedPaths } = {}) {
    const url = new URL(value)
    if (url.protocol !== 'https:') throw new Error(`${key} must use HTTPS`)
    if (url.username || url.password || url.search || url.hash) {
        throw new Error(`${key} must not contain credentials, a query, or a fragment`)
    }
    if (allowedPaths && !allowedPaths.has(url.pathname)) {
        throw new Error(`${key} has an unsupported path`)
    }
    return url
}

export function parsePreflightConfig(env = process.env) {
    if (required(env, 'COMPASS_STAGING_RELEASE_ENABLED') !== 'true') {
        throw new Error('COMPASS_STAGING_RELEASE_ENABLED must be exactly true')
    }
    const applicationUuid = required(env, 'STAGING_APPLICATION_UUID')
    if (!APPLICATION_UUID.test(applicationUuid)) {
        throw new Error('STAGING_APPLICATION_UUID has an invalid format')
    }

    const coolifyUrl = httpsUrl(required(env, 'STAGING_COOLIFY_URL'), 'STAGING_COOLIFY_URL', {
        allowedPaths: new Set(['', '/', '/api/v1', '/api/v1/']),
    })
    const healthUrl = httpsUrl(required(env, 'STAGING_HEALTH_URL'), 'STAGING_HEALTH_URL')
    if (healthUrl.pathname === '/' || healthUrl.pathname === '') {
        throw new Error('STAGING_HEALTH_URL must identify the readiness endpoint')
    }

    const coolifyToken = required(env, 'COOLIFY_TOKEN')
    const coolifyReadToken = required(env, 'COOLIFY_READ_TOKEN')
    if (coolifyToken === coolifyReadToken) {
        throw new Error('COOLIFY_TOKEN and COOLIFY_READ_TOKEN must be different')
    }

    return {
        applicationUuid,
        coolifyUrl: coolifyUrl.toString(),
        healthUrl: healthUrl.toString(),
        coolifyToken,
        coolifyReadToken,
        migrationDatabaseUrl: required(env, 'MIGRATION_DATABASE_URL'),
        accessClientId: required(env, 'CF_ACCESS_CLIENT_ID'),
        accessClientSecret: required(env, 'CF_ACCESS_CLIENT_SECRET'),
    }
}

export function parseQualityGateConfig(env = process.env) {
    const repository = required(env, 'GITHUB_REPOSITORY')
    const targetSha = required(env, 'TARGET_SHA')
    if (!REPOSITORY.test(repository)) throw new Error('GITHUB_REPOSITORY has an invalid format')
    if (!FULL_GIT_SHA.test(targetSha)) {
        throw new Error('TARGET_SHA must be a full lowercase 40-character Git SHA')
    }

    const apiUrl = httpsUrl(env.GITHUB_API_URL?.trim() || 'https://api.github.com', 'GITHUB_API_URL')
    return {
        repository,
        targetSha,
        token: required(env, 'GITHUB_TOKEN'),
        apiUrl: apiUrl.toString().replace(/\/$/, ''),
    }
}

async function githubJson(config, fetchImpl, path, label) {
    let response
    try {
        response = await fetchImpl(`${config.apiUrl}${path}`, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${config.token}`,
                Accept: 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
                'User-Agent': 'compass-staging-release-gate/1',
            },
            redirect: 'error',
            signal: AbortSignal.timeout(20_000),
        })
    } catch (error) {
        throw new Error(`${label} is unavailable`, { cause: error })
    }
    if (response.status !== 200) throw new Error(`${label} returned HTTP ${response.status}`)
    try {
        return await response.json()
    } catch (error) {
        throw new Error(`${label} returned invalid JSON`, { cause: error })
    }
}

export async function verifyQualityGate(config, { fetchImpl = fetch } = {}) {
    const [owner, repositoryName] = config.repository.split('/')
    const repositoryPath = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repositoryName)}`
    const query = new URLSearchParams({
        head_sha: config.targetSha,
        status: 'completed',
        per_page: '100',
    })
    const runsPayload = await githubJson(
        config,
        fetchImpl,
        `${repositoryPath}/actions/workflows/build-check.yml/runs?${query}`,
        'GitHub Build check lookup',
    )
    const candidates = Array.isArray(runsPayload?.workflow_runs)
        ? runsPayload.workflow_runs.filter((run) => run
            && run.head_sha === config.targetSha
            && run.head_repository?.full_name === config.repository
            && ['pull_request', 'push'].includes(run.event)
            && run.status === 'completed'
            && run.conclusion === 'success')
        : []

    for (const run of candidates) {
        const runId = String(run.id ?? '')
        if (!/^\d+$/.test(runId)) continue
        const jobsPayload = await githubJson(
            config,
            fetchImpl,
            `${repositoryPath}/actions/runs/${runId}/jobs?filter=latest&per_page=100`,
            'GitHub quality-gate job lookup',
        )
        const passed = Array.isArray(jobsPayload?.jobs)
            && jobsPayload.jobs.some((job) => job
                && job.name === 'quality-gate'
                && job.status === 'completed'
                && job.conclusion === 'success')
        if (passed) return runId
    }

    throw new Error('The exact target SHA has no successful quality-gate job from this repository')
}

function checkNoSensitiveHealthValues(value, path = '$') {
    if (Array.isArray(value)) {
        value.forEach((child, index) => checkNoSensitiveHealthValues(child, `${path}[${index}]`))
        return
    }
    if (value && typeof value === 'object') {
        for (const [key, child] of Object.entries(value)) {
            if (SENSITIVE_HEALTH_VALUE.test(key)) {
                throw new Error(`Health payload contains a sensitive key at ${path}.${key}`)
            }
            checkNoSensitiveHealthValues(child, `${path}.${key}`)
        }
        return
    }
    if (typeof value === 'string' && SENSITIVE_HEALTH_VALUE.test(value)) {
        throw new Error(`Health payload exposes sensitive implementation detail at ${path}`)
    }
}

export function validateReadinessResponse(response, body, expectedSha) {
    if (response.status !== 200) throw new Error(`Readiness returned HTTP ${response.status}`)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new Error('Readiness response must be a JSON object')
    }
    checkNoSensitiveHealthValues(body)
    if (body.status !== 'healthy') throw new Error('Readiness status is not healthy')
    if (body.version !== expectedSha) throw new Error('Readiness version does not match the exact target SHA')
    const deployedAt = new Date(body.deployedAt ?? '')
    if (!UTC_TIMESTAMP.test(body.deployedAt ?? '')
        || Number.isNaN(deployedAt.getTime())
        || deployedAt.toISOString() !== body.deployedAt.replace(/Z$/, '.000Z')) {
        throw new Error('Readiness deployedAt is not a real UTC deployment timestamp')
    }
    if (!body.checks || typeof body.checks !== 'object' || Array.isArray(body.checks)) {
        throw new Error('Readiness checks must be an object')
    }
    for (const [name, check] of Object.entries(body.checks)) {
        if (!check || typeof check !== 'object' || Array.isArray(check)
            || !['healthy', 'degraded', 'unhealthy'].includes(check.status)) {
            throw new Error(`Readiness checks.${name} is invalid`)
        }
    }
    if (body.checks.database?.status !== 'healthy') {
        throw new Error('Readiness database check is not healthy')
    }
    if (Object.values(body.checks).some((check) => check.status !== 'healthy')) {
        throw new Error('Readiness contains a non-healthy dependency check')
    }
    const cacheControl = response.headers.get('cache-control') ?? ''
    if (!cacheControl.toLowerCase().includes('no-store')) {
        throw new Error('Readiness Cache-Control must contain no-store')
    }
}

export function parseReadinessConfig(env = process.env) {
    const expectedSha = required(env, 'TARGET_SHA')
    if (!FULL_GIT_SHA.test(expectedSha)) {
        throw new Error('TARGET_SHA must be a full lowercase 40-character Git SHA')
    }
    return {
        healthUrl: httpsUrl(required(env, 'STAGING_HEALTH_URL'), 'STAGING_HEALTH_URL').toString(),
        expectedSha,
        accessClientId: required(env, 'CF_ACCESS_CLIENT_ID'),
        accessClientSecret: required(env, 'CF_ACCESS_CLIENT_SECRET'),
    }
}

async function readinessSample(config, fetchImpl) {
    let response
    try {
        response = await fetchImpl(config.healthUrl, {
            method: 'GET',
            headers: {
                Accept: 'application/json',
                'CF-Access-Client-Id': config.accessClientId,
                'CF-Access-Client-Secret': config.accessClientSecret,
                'User-Agent': 'compass-staging-release-gate/1',
            },
            cache: 'no-store',
            redirect: 'error',
            signal: AbortSignal.timeout(10_000),
        })
    } catch (error) {
        throw new Error('Readiness endpoint is unavailable', { cause: error })
    }
    let body
    try {
        body = await response.json()
    } catch (error) {
        throw new Error('Readiness endpoint returned invalid JSON', { cause: error })
    }
    validateReadinessResponse(response, body, config.expectedSha)
}

export async function verifyThreeReadinessSamples(config, {
    fetchImpl = fetch,
    sleep = defaultSleep,
    intervalMs = 20_000,
} = {}) {
    for (let sample = 1; sample <= 3; sample += 1) {
        try {
            await readinessSample(config, fetchImpl)
        } catch (error) {
            throw new Error(`Readiness sample ${sample} of 3 failed`, { cause: error })
        }
        process.stdout.write(`Readiness sample ${sample} of 3 passed\n`)
        if (sample < 3) await sleep(intervalMs)
    }
}

async function main() {
    const mode = process.argv[2]
    if (mode === 'preflight') {
        parsePreflightConfig()
        process.stdout.write('Staging release preflight passed\n')
        return
    }
    if (mode === 'quality-gate') {
        const runId = await verifyQualityGate(parseQualityGateConfig())
        if (process.env.GITHUB_OUTPUT) {
            appendFileSync(process.env.GITHUB_OUTPUT, `quality_gate_run_id=${runId}\n`, { encoding: 'utf8' })
        }
        process.stdout.write(`Exact-SHA quality-gate verified (run ${runId})\n`)
        return
    }
    if (mode === 'readiness') {
        await verifyThreeReadinessSamples(parseReadinessConfig())
        return
    }
    throw new Error('Usage: staging-release-gate.mjs <preflight|quality-gate|readiness>')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        await main()
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown staging release gate error'
        process.stderr.write(`Staging release gate failed: ${message}\n`)
        process.exitCode = 1
    }
}
