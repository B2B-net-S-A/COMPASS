import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ACADEMY_ONLY_DENIED_MESSAGE, isAcademyOnlyPathAllowed, isAcademyOnlyUser } from '../academy-only'

// B1.4: konto nauki widzi tylko Akademię. Biała lista ścieżek nie wystarcza, bo akcję
// można wywołać POST-em z dozwolonej strony, a `/api` w ogóle nie przechodzi przez
// middleware. Ten test czyta źródło: nowy plik `'use server'` albo nowa trasa bez
// jawnej klasyfikacji albo bez odmowy przerywa CI.

const ROOT = join(__dirname, '..', '..', '..')

function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
        if (entry === 'node_modules' || entry === '.next' || entry === '__tests__') continue
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) walk(full, out)
        else if (/\.tsx?$/.test(entry)) out.push(full)
    }
    return out
}

const sources = ['lib', 'app', 'components'].flatMap(dir => walk(join(ROOT, dir)))
const rel = (file: string) => relative(ROOT, file).split('\\').join('/')
const read = (file: string) => readFileSync(file, 'utf8')
const useServerFiles = sources.filter(file => /^\s*['"]use server['"]/m.test(read(file).slice(0, 400)))
const routeFiles = walk(join(ROOT, 'app', 'api')).filter(file => file.endsWith('/route.ts'))

const ACADEMY_ACTION_FILE = /^lib\/actions\/(academy-[\w-]+|course-[\w-]+|courses|courses-[\w-]+|learning-paths)\.ts$/

/** Eksporty, które konto nauki wolno wywołać bez guarda Akademii. Każda pozycja z powodem. */
const LEARNER_ALLOWED: Record<string, { exports: string[] | '*'; why: string }> = {
    'app/login/actions.ts': { exports: '*', why: 'logowanie, przed powstaniem sesji' },
    'lib/auth/security.ts': { exports: '*', why: 'limit prób i dziennik logowania, przed powstaniem sesji' },
    'lib/actions/notifications.ts': {
        exports: ['getRecentNotifications', 'getUnreadNotificationCount', 'markNotificationAsRead', 'markAllNotificationsAsRead', 'deleteNotification'],
        why: 'wyłącznie własne powiadomienia, dzwonek w górnym pasku',
    },
    'lib/actions/permissions.ts': { exports: ['getPermissions'], why: 'mapa uprawnień per rola, bez danych osobowych, czyta ją layout' },
    'lib/actions/course-learning.ts': { exports: ['submitRating', 'getRecommendedCourses'], why: 'ścieżka uczestnika, zakres pilnuje RLS' },
    'lib/actions/course-qa.ts': { exports: ['listAnswersForQuestion'], why: 'dyskusja w lekcji uczestnika' },
    'lib/actions/courses.ts': { exports: ['listPublishedCourses'], why: 'katalog kursów uczestnika' },
}

type RouteRule = 'machine' | 'public' | 'learner' | 'explicit' | 'delegated'

const ROUTE_RULES: Record<string, RouteRule> = {
    'app/api/health/route.ts': 'public',
    'app/api/akademia/health/route.ts': 'public',
    'app/api/auth/auto-login/route.ts': 'public',
    'app/api/public/consultant-pulse/[token]/route.ts': 'public',
    'app/api/akademia/attachment/route.ts': 'learner',
    'app/api/akademia/certificate/route.ts': 'learner',
    'app/api/academy/sessions/[id]/calendar/route.ts': 'learner',
    'app/api/admin/email-preview/route.ts': 'explicit',
    'app/api/admin/snapshot/route.ts': 'explicit',
    'app/api/digest/route.ts': 'delegated',
    'app/api/migrate-compliance/route.ts': 'machine',
}

function parse(file: string): ts.SourceFile {
    return ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
}

function importedFrom(source: ts.SourceFile, module: string): Set<string> {
    const names = new Set<string>()
    source.forEachChild(node => {
        if (!ts.isImportDeclaration(node) || (node.moduleSpecifier as ts.StringLiteral).text !== module) return
        const bindings = node.importClause?.namedBindings
        if (bindings && ts.isNamedImports(bindings)) bindings.elements.forEach(element => names.add(element.name.text))
    })
    return names
}

function reachableCalls(root: ts.Node, locals: Map<string, ts.Node>, seen = new Set<string>()): Set<string> {
    const calls = new Set<string>()
    const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
            const name = node.expression.text
            calls.add(name)
            const local = locals.get(name)
            if (local && !seen.has(name)) {
                seen.add(name)
                reachableCalls(local, locals, seen).forEach(call => calls.add(call))
            }
        }
        ts.forEachChild(node, visit)
    }
    visit(root)
    return calls
}

function firstStatementIsDeny(fn: ts.FunctionDeclaration): boolean {
    const first = fn.body?.statements[0]
    if (!first || !ts.isExpressionStatement(first) || !ts.isAwaitExpression(first.expression)) return false
    const call = first.expression.expression
    return ts.isCallExpression(call) && ts.isIdentifier(call.expression) && call.expression.text === 'assertNotAcademyOnly'
}

function exportsMissingDenial(file: string): string[] {
    const source = parse(file)
    const name = rel(file)
    const allowed = LEARNER_ALLOWED[name]
    const locals = new Map<string, ts.Node>()
    source.forEachChild(node => {
        if (ts.isFunctionDeclaration(node) && node.name) locals.set(node.name.text, node)
    })
    const guards = importedFrom(source, '@/lib/auth/internal-guard')
    const missing: string[] = []
    source.forEachChild(node => {
        if (!ts.isFunctionDeclaration(node) || !node.name) return
        if (!node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) return
        if (allowed && (allowed.exports === '*' || allowed.exports.includes(node.name.text))) return
        if (firstStatementIsDeny(node)) return
        const calls = reachableCalls(node, locals)
        if (Array.from(calls).some(call => guards.has(call))) return
        if (ACADEMY_ACTION_FILE.test(name) && calls.has('requireAcademyContext')) return
        missing.push(`${name}#${node.name.text}`)
    })
    return missing
}

describe('izolacja konta nauki: kontrola źródła', () => {
    it('znajduje pliki do sprawdzenia', () => {
        expect(useServerFiles.length).toBeGreaterThan(60)
        expect(routeFiles.length).toBeGreaterThan(30)
    })

    it('każdy eksport akcji serwerowej odmawia kontu nauki albo jest jawnie dozwolony', () => {
        expect(useServerFiles.flatMap(exportsMissingDenial)).toEqual([])
    })

    it('pliki akcji eksportują tylko deklaracje funkcji, które ten test umie sprawdzić', () => {
        const unchecked: string[] = []
        for (const file of useServerFiles) {
            parse(file).forEachChild(node => {
                const exported = ts.canHaveModifiers(node) && ts.getModifiers(node)?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)
                if (ts.isExportDeclaration(node) && !node.isTypeOnly) unchecked.push(`${rel(file)}: export { }`)
                if (ts.isExportAssignment(node)) unchecked.push(`${rel(file)}: export default`)
                if (exported && ts.isVariableStatement(node)) unchecked.push(`${rel(file)}: export const`)
            })
        }
        expect(unchecked).toEqual([])
    })

    it('lista dozwolonych nie zawiera pozycji, których już nie ma', () => {
        for (const [file, rule] of Object.entries(LEARNER_ALLOWED)) {
            expect(rule.why.length).toBeGreaterThan(0)
            if (rule.exports === '*') continue
            const text = read(join(ROOT, file))
            for (const name of rule.exports) expect(text).toContain(`function ${name}`)
        }
    })

    it('guardy z internal-guard mają jedno wejście i ono odmawia kontu nauki', () => {
        const text = read(join(ROOT, 'lib/auth/internal-guard.ts'))
        expect(text.match(/await \w+\.auth\.getUser\(/g)).toHaveLength(1)
        const body = text.slice(text.indexOf('const loadAuthContext'), text.indexOf('function buildCtx'))
        expect(body).toContain('isAcademyOnlyUser(user)')
        expect(body).toContain('auth.getUser()')
    })

    it('każda trasa API jest sklasyfikowana i odmawia kontu nauki', () => {
        const problems: string[] = []
        for (const file of routeFiles) {
            const name = rel(file)
            const text = read(file)
            const rule = ROUTE_RULES[name]
            if (name.startsWith('app/api/cron/')) {
                if (!text.includes('withCronAuth')) problems.push(`${name}: cron bez withCronAuth`)
            } else if (name.startsWith('app/api/internal/')) {
                if (!/SECRET|API_KEY|withCronAuth|isBearer|bearer/i.test(text)) problems.push(`${name}: trasa maszynowa bez sekretu`)
            } else if (rule === 'learner') {
                if (!text.includes('allowAcademyOnly: true') && !text.includes('requireAcademyContext')) problems.push(`${name}: bez jawnej zgody`)
            } else if (rule === 'explicit') {
                if (!text.includes('isAcademyOnlyUser(')) problems.push(`${name}: bez jawnej odmowy`)
            } else if (rule === 'machine') {
                if (!/SECRET/.test(text)) problems.push(`${name}: bez sekretu`)
            } else if (rule === 'delegated' || rule === 'public') {
                continue
            } else if (!text.includes('withAuth(')) {
                problems.push(`${name}: brak klasyfikacji`)
            } else if (text.includes('allowAcademyOnly')) {
                problems.push(`${name}: zgoda bez wpisu na liście`)
            }
        }
        expect(problems).toEqual([])
    })

    it('trasa delegująca korzysta z akcji z odmową', () => {
        expect(read(join(ROOT, 'app/api/digest/route.ts'))).toContain('@/lib/actions/email-digest')
        expect(exportsMissingDenial(join(ROOT, 'lib/actions/email-digest.ts'))).toEqual([])
    })
})

describe('izolacja konta nauki: znacznik i ścieżki', () => {
    it.each([
        [{ app_metadata: { academy_only: true } }, true],
        [{ app_metadata: { academy_only: 'true' } }, false],
        [{ app_metadata: {} }, false],
        [{ user_metadata: { academy_only: true } }, false],
        [{}, false],
        [null, false],
        [undefined, false],
    ])('znacznik %j daje %s', (user, expected) => {
        expect(isAcademyOnlyUser(user as never)).toBe(expected)
    })

    it.each(['/learning', '/learning/moje', '/learning/kurs-x', '/learning/certyfikaty/abc', '/notifications'])('wpuszcza na %s', pathname => {
        expect(isAcademyOnlyPathAllowed(pathname)).toBe(true)
    })

    it.each(['/', '/home', '/internal', '/internal/admin', '/admin/learning', '/profile', '/settings', '/onboarding', '/news', '/documents', '/learningx', '/learning/tworze', '/learning/tworze/nowy', '/notificationsx'])('odmawia %s', pathname => {
        expect(isAcademyOnlyPathAllowed(pathname)).toBe(false)
    })
})

const auth = vi.hoisted(() => ({ user: null as unknown, error: null as unknown, profile: { role: 'consultant', employment_status: 'active' } as Record<string, unknown> }))
const learner = { id: 'learner', email: 'uczestnik@example.test', app_metadata: { academy_only: true } }

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock('@/lib/supabase/admin', () => ({ createServiceClient: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({
    createClient: () => ({
        auth: { getUser: async () => ({ data: { user: auth.user }, error: auth.error }) },
        from: () => {
            const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: auth.profile, error: null }), single: async () => ({ data: auth.profile, error: null }) }
            return query
        },
    }),
}))

describe('izolacja konta nauki: odmowa w guardach i trasach', () => {
    beforeEach(() => { auth.user = learner; auth.error = null; auth.profile = { role: 'consultant', employment_status: 'active' } })

    it('assertNotAcademyOnly odmawia kontu nauki', async () => {
        const { assertNotAcademyOnly } = await import('../academy-only-guard')
        await expect(assertNotAcademyOnly()).rejects.toThrow(ACADEMY_ONLY_DENIED_MESSAGE)
    })

    it('assertNotAcademyOnly przepuszcza zwykłe konto i brak sesji', async () => {
        const { assertNotAcademyOnly } = await import('../academy-only-guard')
        auth.user = { id: 'staff', email: 's@example.test', app_metadata: {} }
        await expect(assertNotAcademyOnly()).resolves.toBeUndefined()
        auth.user = null
        await expect(assertNotAcademyOnly()).resolves.toBeUndefined()
    })

    it('awaria Auth zamyka akcję, a brak sesji zostawia decyzję akcji', async () => {
        const { assertNotAcademyOnly } = await import('../academy-only-guard')
        auth.user = null
        auth.error = { name: 'AuthRetryableFetchError', message: 'upstream down' }
        await expect(assertNotAcademyOnly()).rejects.toThrow('Nie udało się sprawdzić sesji')
        auth.error = { name: 'AuthSessionMissingError', message: 'no session' }
        await expect(assertNotAcademyOnly()).resolves.toBeUndefined()
    })

    it('guard akcji dla każdego zalogowanego też odmawia kontu nauki', async () => {
        const { requireAuthenticatedAction } = await import('../internal-guard')
        await expect(requireAuthenticatedAction()).rejects.toThrow(ACADEMY_ONLY_DENIED_MESSAGE)
    })

    it('withAuth domyślnie zwraca 403, a dozwolona trasa działa', async () => {
        const { withAuth } = await import('@/lib/api/with-auth')
        const handler = vi.fn(async () => new Response('ok'))
        const request = new Request('https://compass.test/api/x') as never
        expect((await withAuth(handler)(request)).status).toBe(403)
        expect(handler).not.toHaveBeenCalled()
        expect((await withAuth(handler, { allowAcademyOnly: true })(request)).status).toBe(200)
        expect(handler).toHaveBeenCalledTimes(1)
    })

    it('zwykłe konto przechodzi przez withAuth bez zmian', async () => {
        auth.user = { id: 'staff', email: 's@example.test', app_metadata: {} }
        const { withAuth } = await import('@/lib/api/with-auth')
        const handler = vi.fn(async () => new Response('ok'))
        expect((await withAuth(handler)(new Request('https://compass.test/api/x') as never)).status).toBe(200)
    })
})
