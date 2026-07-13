export type DependencyStatus = 'healthy' | 'unhealthy'
export type ReadinessStatus = 'healthy' | 'degraded' | 'unhealthy'

export const NO_STORE_HEADERS = {
    'Cache-Control': 'no-store, max-age=0',
    Pragma: 'no-cache',
} as const

export interface ReleaseMetadata {
    version: string
    deployedAt: string
}

const FULL_GIT_SHA = /^[0-9a-f]{40}$/
const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/

export function getReleaseMetadata(
    env: NodeJS.ProcessEnv = process.env,
): ReleaseMetadata {
    return {
        version: env.GIT_SHA ?? 'unknown',
        deployedAt: env.BUILT_AT ?? 'unknown',
    }
}

export function hasValidReleaseMetadata(metadata: ReleaseMetadata): boolean {
    if (!FULL_GIT_SHA.test(metadata.version)) return false
    if (!UTC_TIMESTAMP.test(metadata.deployedAt)) return false

    return !Number.isNaN(Date.parse(metadata.deployedAt))
}

export function deriveReadinessStatus(
    criticalChecks: readonly DependencyStatus[],
    optionalChecks: readonly DependencyStatus[] = [],
): ReadinessStatus {
    if (criticalChecks.some((check) => check === 'unhealthy')) return 'unhealthy'
    if (optionalChecks.some((check) => check === 'unhealthy')) return 'degraded'
    return 'healthy'
}
