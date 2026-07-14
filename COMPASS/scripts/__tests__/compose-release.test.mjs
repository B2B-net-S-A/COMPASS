import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const repositoryRoot = fileURLToPath(new URL('../../..', import.meta.url))
const productionCompose = `${repositoryRoot}/docker-compose.yml`
const localCompose = `${repositoryRoot}/docker-compose.local.yml`
const targetSha = 'd'.repeat(40)

function composeEnvironment(release = {}) {
    return {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        DOCKER_CONFIG: process.env.DOCKER_CONFIG,
        BUILT_AT: '2026-07-14T12:34:56Z',
        NEXT_PUBLIC_SUPABASE_URL: 'https://example.invalid',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
        NEXT_PUBLIC_APP_URL: 'https://example.invalid',
        OPENAI_API_KEY: 'test-openai-key',
        CRON_SECRET: 'test-cron-secret',
        SUPER_ADMIN_EMAILS: 'admin@example.invalid',
        SENTRY_AUTH_TOKEN: 'test-sentry-token',
        GRAFANA_LOKI_URL: 'https://example.invalid',
        GRAFANA_LOKI_USER: 'test-user',
        GRAFANA_LOKI_TOKEN: 'test-token',
        ...release,
    }
}

function renderCompose({ release, local = false }) {
    const files = ['-f', productionCompose]
    if (local) files.push('-f', localCompose)
    const result = spawnSync(
        'docker',
        ['compose', '--project-directory', repositoryRoot, ...files, 'config', '--format', 'json'],
        {
            cwd: repositoryRoot,
            encoding: 'utf8',
            env: composeEnvironment(release),
        },
    )
    return result
}

function requireRenderedCompose(options) {
    const result = renderCompose(options)
    assert.equal(result.status, 0, result.stderr || result.stdout)
    return JSON.parse(result.stdout)
}

function assertImmutableProductionApp(app) {
    assert.equal(app.image, `compass-app:${targetSha}`)
    assert.equal(app.build.args.GIT_SHA, targetSha)
    assert.deepEqual(app.expose, ['10000'])
    assert.equal(Object.hasOwn(app, 'ports'), false)
    assert.doesNotMatch(app.image, /:latest$/)
}

describe('production Compose release wiring', () => {
    it('uses the checked-out SOURCE_COMMIT even when a stale GIT_SHA exists', () => {
        const rendered = requireRenderedCompose({
            release: { GIT_SHA: 'e'.repeat(40), SOURCE_COMMIT: targetSha },
        })
        assertImmutableProductionApp(rendered.services.app)
    })

    it('renders an immutable image directly from Coolify SOURCE_COMMIT', () => {
        const rendered = requireRenderedCompose({ release: { SOURCE_COMMIT: targetSha } })
        assertImmutableProductionApp(rendered.services.app)
    })

    it('fails closed when neither exact source identifier is available', () => {
        const result = renderCompose({ release: {} })
        assert.notEqual(result.status, 0)
        assert.match(result.stderr, /SOURCE_COMMIT must be a full 40-character commit SHA/)
    })

    it('publishes the application port only through the local loopback override', () => {
        const rendered = requireRenderedCompose({
            release: { SOURCE_COMMIT: targetSha, APP_PORT: '11000' },
            local: true,
        })
        const [binding] = rendered.services.app.ports

        assert.equal(binding.host_ip, '127.0.0.1')
        assert.equal(binding.published, '11000')
        assert.equal(binding.target, 10000)
    })

    it('keeps the Dockerfile full-SHA build validation wired', async () => {
        const [compose, dockerfile] = await Promise.all([
            readFile(productionCompose, 'utf8'),
            readFile(`${repositoryRoot}/COMPASS/Dockerfile`, 'utf8'),
        ])

        assert.match(compose, /GIT_SHA: \$\{SOURCE_COMMIT:\?SOURCE_COMMIT must be/)
        assert.doesNotMatch(compose, /\$\{GIT_SHA:-\$\{SOURCE_COMMIT:/)
        assert.match(dockerfile, /\^\[0-9a-f\]\{40\}\$/)
        assert.match(dockerfile, /process\.exit\(1\)/)
    })
})
