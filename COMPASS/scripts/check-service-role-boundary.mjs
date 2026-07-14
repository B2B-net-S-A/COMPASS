#!/usr/bin/env node

import { readdirSync, readFileSync } from 'node:fs'
import { resolve, relative, extname } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const ADMIN_MODULE = 'lib/supabase/admin.ts'
const THIS_SCRIPT = 'scripts/check-service-role-boundary.mjs'
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])
const SKIPPED_DIRECTORIES = new Set([
    '.git',
    '.next',
    '.cursor',
    'coverage',
    'docs',
    'e2e',
    'node_modules',
    'test',
    '__tests__',
])

const PRIVILEGED_KEY_IDENTIFIER = /\bSUPABASE_(?:SERVICE_ROLE|SECRET)_KEY\b/
const RAW_CREATE_CLIENT_IMPORT = /import\s*\{[^}]*\bcreateClient\b[^}]*\}\s*from\s*['"]@supabase\/supabase-js['"]/s
const RAW_NAMESPACE_IMPORT = /import\s+\*\s+as\s+\w+\s+from\s*['"]@supabase\/supabase-js['"]/
const RAW_RUNTIME_LOAD = /require\s*\(\s*['"]@supabase\/supabase-js['"]\s*\)/
const ADMIN_IMPORT = /(?:from\s+|import\s*\()\s*['"]@\/lib\/supabase\/admin['"]/
const ADMIN_REEXPORT = /export\s+(?:\*|\{[^}]*\})\s+from\s+['"]@\/lib\/supabase\/admin['"]/s
const CLIENT_DIRECTIVE = /^['"]use client['"]\s*;?/

function sourceFiles(root) {
    const files = []

    function visit(directory) {
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
            if (entry.isSymbolicLink()) continue
            if (entry.isDirectory()) {
                if (!SKIPPED_DIRECTORIES.has(entry.name)) visit(resolve(directory, entry.name))
                continue
            }
            if (entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name))) {
                files.push(resolve(directory, entry.name))
            }
        }
    }

    visit(root)
    return files
}

function normalizedRelative(root, file) {
    return relative(root, file).split('\\').join('/')
}

function isClientModule(source) {
    const header = source.slice(0, 2_048).replace(
        /^\s*(?:(?:\/\*[\s\S]*?\*\/|\/\/[^\n]*(?:\r?\n|$))\s*)*/,
        '',
    )
    return CLIENT_DIRECTIVE.test(header)
}

export function checkServiceRoleBoundary(rootDirectory) {
    const root = resolve(rootDirectory)
    const violations = []
    const adminPath = resolve(root, ADMIN_MODULE)
    let adminSource = ''

    try {
        adminSource = readFileSync(adminPath, 'utf8')
    } catch {
        violations.push(`${ADMIN_MODULE}: privileged Supabase boundary is missing`)
    }

    if (adminSource && !/^\s*import\s+['"]server-only['"]/m.test(adminSource)) {
        violations.push(`${ADMIN_MODULE}: must import the server-only marker`)
    }
    if (adminSource && !PRIVILEGED_KEY_IDENTIFIER.test(adminSource)) {
        violations.push(`${ADMIN_MODULE}: must own privileged Supabase credential resolution`)
    }

    for (const file of sourceFiles(root)) {
        const path = normalizedRelative(root, file)
        if (path === ADMIN_MODULE || path === THIS_SCRIPT) continue

        const source = readFileSync(file, 'utf8')

        if (source.includes('SUPABASE_') && PRIVILEGED_KEY_IDENTIFIER.test(source)) {
            violations.push(`${path}: privileged Supabase credential referenced outside ${ADMIN_MODULE}`)
        }
        if (!path.startsWith('scripts/')
            && source.includes('@supabase/supabase-js')
            && (RAW_CREATE_CLIENT_IMPORT.test(source)
            || RAW_NAMESPACE_IMPORT.test(source)
            || RAW_RUNTIME_LOAD.test(source))) {
            violations.push(`${path}: raw @supabase/supabase-js client creation bypasses the approved boundary`)
        }
        if (source.includes('@/lib/supabase/admin') && ADMIN_REEXPORT.test(source)) {
            violations.push(`${path}: privileged Supabase boundary must not be re-exported`)
        }
        if (source.includes('@/lib/supabase/admin')
            && isClientModule(source)
            && ADMIN_IMPORT.test(source)) {
            violations.push(`${path}: client module imports the server-only Supabase boundary`)
        }
    }

    return violations.sort()
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null
if (invokedPath === import.meta.url) {
    const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
    const violations = checkServiceRoleBoundary(root)
    if (violations.length > 0) {
        process.stderr.write(`Service-role boundary violations:\n- ${violations.join('\n- ')}\n`)
        process.exitCode = 1
    } else {
        process.stdout.write('Service-role boundary: OK\n')
    }
}
