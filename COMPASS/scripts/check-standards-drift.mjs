#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

const FULL_GIT_SHA = /^[0-9a-f]{40}$/

function safePath(root, relativePath, label) {
    if (typeof relativePath !== 'string' || !relativePath || relativePath.startsWith('/')) {
        throw new Error(`${label} must be a non-empty relative path`)
    }
    const absolute = resolve(root, relativePath)
    const prefix = `${resolve(root)}${sep}`
    if (!absolute.startsWith(prefix)) throw new Error(`${label} escapes its root`)
    return absolute
}

export function checkStandardsDrift({ repoRoot, standardsDir = null }) {
    const manifestPath = resolve(repoRoot, '.github/standards/manifest.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

    if (manifest.schemaVersion !== 1) throw new Error('Unsupported standards manifest schema')
    if (manifest.sourceRepository !== 'artur-t-96/engineering-standards') {
        throw new Error('Standards source repository is not approved')
    }
    if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
        throw new Error('Standards manifest must declare at least one tracked file')
    }

    if (manifest.mode === 'scaffold') {
        if (manifest.sourceRef !== null) throw new Error('Scaffold mode must not claim a pinned source ref')
        return { mode: 'scaffold', compared: 0 }
    }
    if (manifest.mode !== 'enforced') throw new Error('Standards manifest mode must be scaffold or enforced')
    if (!FULL_GIT_SHA.test(manifest.sourceRef ?? '')) {
        throw new Error('Enforced standards sourceRef must be a full Git SHA')
    }
    if (!standardsDir) throw new Error('STANDARDS_DIR is required in enforced mode')

    for (const entry of manifest.files) {
        const expected = readFileSync(safePath(standardsDir, entry.source, 'source'), 'utf8')
        const actual = readFileSync(safePath(repoRoot, entry.target, 'target'), 'utf8')
        if (actual !== expected) throw new Error(`Standards drift detected in ${entry.target}`)
    }

    return { mode: 'enforced', compared: manifest.files.length }
}

function main() {
    try {
        const result = checkStandardsDrift({
            repoRoot: process.env.REPO_ROOT ? resolve(process.env.REPO_ROOT) : process.cwd(),
            standardsDir: process.env.STANDARDS_DIR ? resolve(process.env.STANDARDS_DIR) : null,
        })
        if (result.mode === 'scaffold') {
            process.stdout.write('::notice::Standards drift integration is scaffolded; pin sourceRef and switch mode to enforced after the central repository is provisioned.\n')
        } else {
            process.stdout.write(`Standards drift check passed for ${result.compared} file(s).\n`)
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown standards drift error'
        process.stderr.write(`Standards drift check failed: ${message}\n`)
        process.exitCode = 1
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main()
}
