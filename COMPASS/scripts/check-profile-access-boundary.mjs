#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'

const SAFE_DIRECTORY_COLUMNS = new Set([
    'id',
    'full_name',
    'avatar_url',
    'job_title',
    'department',
])

const SOURCE_ROOTS = ['app', 'components', 'lib']
const EXCLUDED_PARTS = new Set(['__tests__', 'node_modules', '.next', 'coverage'])
const MANIFEST_PATH = 'security/profile-access-inventory.json'

function normalizeQuery(value) {
    return value.replace(/\s+/g, ' ').trim()
}

function fingerprint(relativePath, query) {
    return createHash('sha256')
        .update(`${relativePath}\0${normalizeQuery(query)}`)
        .digest('hex')
        .slice(0, 20)
}

function propertyName(call) {
    if (!ts.isCallExpression(call) || !ts.isPropertyAccessExpression(call.expression)) return null
    return call.expression.name.text
}

function invokedName(expression) {
    if (!ts.isCallExpression(expression)) return null
    if (ts.isIdentifier(expression.expression)) return expression.expression.text
    if (ts.isPropertyAccessExpression(expression.expression)) return expression.expression.name.text
    return null
}

function outerChain(node) {
    let current = node
    for (;;) {
        const parent = current.parent
        if (
            (ts.isPropertyAccessExpression(parent) && parent.expression === current)
            || (ts.isCallExpression(parent) && parent.expression === current)
            || ts.isAwaitExpression(parent)
            || ts.isParenthesizedExpression(parent)
            || ts.isAsExpression(parent)
            || ts.isNonNullExpression(parent)
            || ts.isSatisfiesExpression(parent)
        ) {
            current = parent
            continue
        }
        return current
    }
}

function selectedColumns(query) {
    const match = query.match(/\.select(?:<[^>]*>)?\(\s*(['"`])([^'"`]*)\1/)
    if (!match) return []
    if (match[2].trim() === '*') return ['*']
    return match[2]
        .split(',')
        .map((column) => column.trim())
        .filter(Boolean)
        .map((column) => column.replace(/:.*/, '').replace(/!.*$/, '').trim())
}

function predicateColumns(query) {
    return [...query.matchAll(/\.(?:eq|neq|gt|gte|lt|lte|like|ilike|is|in|contains|order)\(\s*['"]([^'"]+)['"]/g)]
        .map((match) => match[1])
}

function receiverIdentifier(call, sourceFile) {
    const receiver = call.expression.expression.getText(sourceFile)
    const match = receiver.match(/[A-Za-z_$][\w$]*/)
    return { receiver, identifier: match?.[0] ?? receiver }
}

function containingFunctionName(node) {
    let current = node.parent
    while (current) {
        if (ts.isFunctionDeclaration(current) && current.name) return current.name.text
        if (
            (ts.isArrowFunction(current) || ts.isFunctionExpression(current))
            && ts.isVariableDeclaration(current.parent)
            && ts.isIdentifier(current.parent.name)
        ) return current.parent.name.text
        current = current.parent
    }
    return null
}

function collectClientBindings(sourceFile) {
    const service = new Set()
    const session = new Set()

    function classifyBinding(name, initializerOrType) {
        const text = initializerOrType?.getText(sourceFile) ?? ''
        if (/create(?:Lifecycle)?(?:Service|Admin)Client|createPrivilegedClient|\bServiceClient\b/.test(text)) {
            service.add(name)
        }
        for (const serviceName of service) {
            if (new RegExp(`\\b${serviceName}\\b`).test(text)) service.add(name)
        }
        if (/create(?:Lifecycle)?Client/.test(text) && !/(?:Service|Admin)Client/.test(text)) session.add(name)
    }

    function collectCronAdminBinding(node) {
        if (!ts.isParameter(node) || !ts.isObjectBindingPattern(node.name)) return
        const fn = node.parent
        const wrapper = fn?.parent
        if (!fn || !wrapper || !ts.isCallExpression(wrapper) || invokedName(wrapper) !== 'withCronAuth') return
        for (const element of node.name.elements) {
            const property = element.propertyName?.getText(sourceFile) ?? element.name.getText(sourceFile)
            if (property === 'admin' && ts.isIdentifier(element.name)) service.add(element.name.text)
        }
    }

    function visit(node) {
        collectCronAdminBinding(node)
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
            classifyBinding(node.name.text, node.initializer ?? node.type)
        }
        if (ts.isParameter(node) && ts.isIdentifier(node.name)) {
            classifyBinding(node.name.text, node.type)
        }
        ts.forEachChild(node, visit)
    }
    visit(sourceFile)
    return { service, session }
}

function isSelfScoped(query) {
    return /\.eq\(\s*['"]id['"]\s*,\s*(?:user\.id|ctx\.userId|auth\.userId|data\.user\.id)\s*\)/.test(query)
}

function classify({ identifier, receiver, query, columns, predicates, clients, functionName }) {
    const directService = /create(?:Lifecycle)?(?:Service|Admin)Client\s*\(|createPrivilegedClient\s*\(/.test(receiver)
    if (directService || clients.service.has(identifier)) return 'protected_backend'

    const sessionLike = clients.session.has(identifier)
        || identifier === 'supabase'
        || identifier === 'session'
    if (!sessionLike) return 'unknown_client'
    if (isSelfScoped(query)) return 'self'
    if (
        /\.eq\(\s*['"]id['"]\s*,\s*userId\s*\)/.test(query)
        && /^(?:isCaller|isAdminOr)/.test(functionName ?? '')
    ) return 'self'
    if (
        columns.length > 0
        && columns.every((column) => SAFE_DIRECTORY_COLUMNS.has(column))
        && predicates.every((column) => SAFE_DIRECTORY_COLUMNS.has(column))
        && !/\.(?:or|textSearch)\s*\(/.test(query)
    ) {
        return 'directory_candidate'
    }
    return 'legacy_cross_user'
}

async function sourceFiles(root) {
    const result = []
    async function walk(directory) {
        let entries
        try {
            entries = await readdir(directory, { withFileTypes: true })
        } catch (error) {
            if (error?.code === 'ENOENT') return
            throw error
        }
        for (const entry of entries) {
            if (EXCLUDED_PARTS.has(entry.name)) continue
            const absolute = path.join(directory, entry.name)
            if (entry.isDirectory()) {
                await walk(absolute)
            } else if (
                /\.(?:ts|tsx)$/.test(entry.name)
                && !/\.test\.(?:ts|tsx)$/.test(entry.name)
                && entry.name !== 'database.types.ts'
            ) {
                result.push(absolute)
            }
        }
    }
    for (const sourceRoot of SOURCE_ROOTS) await walk(path.join(root, sourceRoot))
    return result.sort()
}

export async function buildInventory(root) {
    const entries = []
    for (const absolute of await sourceFiles(root)) {
        const relativePath = path.relative(root, absolute).split(path.sep).join('/')
        const content = await readFile(absolute, 'utf8')
        const kind = absolute.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
        const sourceFile = ts.createSourceFile(absolute, content, ts.ScriptTarget.Latest, true, kind)
        const clients = collectClientBindings(sourceFile)

        function visit(node) {
            if (
                ts.isCallExpression(node)
                && propertyName(node) === 'from'
                && node.arguments.length === 1
                && (ts.isStringLiteral(node.arguments[0]) || ts.isNoSubstitutionTemplateLiteral(node.arguments[0]))
                && node.arguments[0].text === 'profiles'
            ) {
                const chain = outerChain(node)
                const query = normalizeQuery(chain.getText(sourceFile))
                const { receiver, identifier } = receiverIdentifier(node, sourceFile)
                const columns = selectedColumns(query)
                const predicates = predicateColumns(query)
                const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
                entries.push({
                    fingerprint: fingerprint(relativePath, query),
                    path: relativePath,
                    line,
                    receiver,
                    selected_columns: columns,
                    classification: classify({
                        identifier,
                        receiver,
                        query,
                        columns,
                        predicates,
                        clients,
                        functionName: containingFunctionName(node),
                    }),
                    query,
                })
            }
            ts.forEachChild(node, visit)
        }
        visit(sourceFile)
    }
    return entries.sort((left, right) =>
        left.path.localeCompare(right.path) || left.line - right.line || left.fingerprint.localeCompare(right.fingerprint),
    )
}

function occurrenceCounts(entries) {
    const counts = new Map()
    for (const entry of entries) {
        counts.set(entry.fingerprint, (counts.get(entry.fingerprint) ?? 0) + 1)
    }
    return counts
}

export function compareWithBaseline(actual, baseline) {
    const failures = []
    const baselineEntries = baseline.entries ?? Object.entries(baseline.files ?? {}).flatMap(
        ([entryPath, classifications]) => Object.entries(classifications).flatMap(
            ([classification, fingerprints]) => fingerprints.map((entryFingerprint) => ({
                fingerprint: entryFingerprint,
                path: entryPath,
                classification,
            })),
        ),
    )
    const allowed = occurrenceCounts(baselineEntries)
    const seen = new Map()
    for (const entry of actual) {
        const count = (seen.get(entry.fingerprint) ?? 0) + 1
        seen.set(entry.fingerprint, count)
        if (count > (allowed.get(entry.fingerprint) ?? 0)) {
            failures.push(`new profiles query ${entry.path}:${entry.line} (${entry.classification})`)
        }
        if (entry.classification === 'directory_candidate') {
            failures.push(`safe cross-user fields must use profile_directory at ${entry.path}:${entry.line}`)
        }
        if (entry.classification === 'unknown_client') {
            failures.push(`unclassified profiles client at ${entry.path}:${entry.line}: ${entry.receiver}`)
        }
    }
    return failures
}

function summary(entries) {
    return entries.reduce((result, entry) => {
        result[entry.classification] = (result[entry.classification] ?? 0) + 1
        return result
    }, {})
}

function buildManifest(entries) {
    const files = {}
    for (const entry of entries) {
        files[entry.path] ??= {}
        files[entry.path][entry.classification] ??= []
        files[entry.path][entry.classification].push(entry.fingerprint)
    }
    return {
        schema_version: 1,
        generated_from: 'TypeScript AST; fingerprints are enforced and removals are allowed',
        summary: summary(entries),
        files,
        c2_blockers: entries
            .filter((entry) => entry.classification === 'legacy_cross_user')
            .map(({ fingerprint: entryFingerprint, path: entryPath, line, selected_columns, query }) => ({
                fingerprint: entryFingerprint,
                path: entryPath,
                line,
                selected_columns,
                status: 'open',
                reason: 'Move behind a guarded backend action or narrow to the authenticated user before C2 contract.',
                query,
            })),
    }
}

async function main() {
    const root = process.cwd()
    const inventory = await buildInventory(root)
    if (process.argv.includes('--manifest')) {
        process.stdout.write(`${JSON.stringify(buildManifest(inventory), null, 2)}\n`)
        return
    }
    if (process.argv.includes('--report')) {
        process.stdout.write(`${JSON.stringify({
            schema_version: 1,
            generated_from: 'AST inventory; line numbers are informational and fingerprints are enforced',
            summary: summary(inventory),
            entries: inventory,
        }, null, 2)}\n`)
        return
    }

    const baseline = JSON.parse(await readFile(path.join(root, MANIFEST_PATH), 'utf8'))
    const failures = compareWithBaseline(inventory, baseline)
    if (failures.length > 0) {
        for (const failure of failures) process.stderr.write(`profile access boundary: ${failure}\n`)
        process.exitCode = 1
        return
    }
    process.stdout.write(`Profile access boundary passed: ${inventory.length} reviewed profiles queries; ${JSON.stringify(summary(inventory))}\n`)
}

const isMain = process.argv[1]
    && pathToFileURL(path.resolve(process.argv[1])).href === pathToFileURL(fileURLToPath(import.meta.url)).href
if (isMain) await main()
