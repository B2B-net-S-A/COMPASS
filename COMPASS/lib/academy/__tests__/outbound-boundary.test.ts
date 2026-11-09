import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const app = process.cwd()
const AREA = [
    'lib/academy',
    'app/api/akademia',
    'app/api/cron/academy-health',
    'app/api/cron/academy-material-cleanup',
    'app/api/cron/academy-materials',
    'app/api/cron/academy-sync',
    'app/api/cron/course-inactivity',
    'components/academy',
    'components/learning',
    'app/(protected)/learning',
    'app/(protected)/admin/learning',
]
const ACTIONS = /^(academy|course|learning-paths)/
const FORBIDDEN = /\bsendEmail(Many)?\b|\bsendCourseInactivityReminder\b|\bgetResend\b|\/sendMail\b|from\s+['"]@\/lib\/email\/sender['"]/
const GATE = 'lib/academy/outbound.ts'
// Do czasu B0.3 jedyny znany wyjątek. B0.3 usuwa ten wpis razem z wywołaniem w trasie.
const NOT_YET_GATED = new Set(['app/api/cron/course-inactivity/route.ts'])

function sourceFiles(relative: string): string[] {
    const absolute = path.join(app, relative)
    return readdirSync(absolute).flatMap(name => {
        if (name === '__tests__') return []
        const child = path.join(relative, name)
        if (statSync(path.join(app, child)).isDirectory()) return sourceFiles(child)
        return /\.(ts|tsx)$/.test(name) ? [child] : []
    })
}

const files = [
    ...AREA.flatMap(sourceFiles),
    ...readdirSync(path.join(app, 'lib/actions')).filter(name => ACTIONS.test(name) && /\.tsx?$/.test(name)).map(name => `lib/actions/${name}`),
]

describe('jedyna droga poczty Akademii', () => {
    it('skan obejmuje realny obszar Akademii', () => {
        expect(files).toContain(GATE)
        expect(files).toContain('lib/actions/academy-sessions.ts')
        expect(files.length).toBeGreaterThan(100)
    })

    it('nic poza bramką nie woła wysyłki poczty', () => {
        const offenders = files.filter(file => file !== GATE && !NOT_YET_GATED.has(file) && FORBIDDEN.test(readFileSync(path.join(app, file), 'utf8')))
        expect(offenders).toEqual([])
    })
})
