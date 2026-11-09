import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ACADEMY_SWITCHES, academySwitchStates, isAcademySwitchOn } from '../switches'

const app = process.cwd()
const env = (values: Record<string, string>) => values as unknown as NodeJS.ProcessEnv

function sources(relative: string): string[] {
    return readdirSync(path.join(app, relative)).flatMap(name => {
        if (name === '__tests__' || name === 'node_modules') return []
        const child = path.join(relative, name)
        if (statSync(path.join(app, child)).isDirectory()) return sources(child)
        return /\.(ts|tsx)$/.test(name) ? [child] : []
    })
}

describe('rejestr przełączników Akademii', () => {
    it('zawiera dziewięć przełączników z planu', () => {
        expect(ACADEMY_SWITCHES).toHaveLength(9)
    })

    it('domyślnie wszystkie są wyłączone', () => {
        expect(academySwitchStates(env({})).every(item => !item.enabled)).toBe(true)
    })

    it.each(['false', 'TRUE', 'True', '1', 'yes', 'on', ' true', ''])('wartość %j nie włącza', value => {
        for (const name of ACADEMY_SWITCHES) expect(isAcademySwitchOn(name, env({ [name]: value }))).toBe(false)
    })

    it('włącza wyłącznie dosłowne true i tylko wskazany przełącznik', () => {
        const states = academySwitchStates(env({ ACADEMY_MAIL_ENABLED: 'true' }))
        expect(states.filter(item => item.enabled).map(item => item.name)).toEqual(['ACADEMY_MAIL_ENABLED'])
    })

    it('moduł tylko czyta env', () => {
        const source = readFileSync(path.join(app, 'lib/academy/switches.ts'), 'utf8')
        expect(source).not.toMatch(/(process\.)?env(\.\w+|\[[^\]]+\])\s*=[^=]/)
        expect(source).not.toMatch(/'use server'|createClient|\.rpc\(|\.from\(/)
    })

    it('nikt poza rejestrem nie rozstrzyga przełącznika sam', () => {
        const pattern = /\benv\.ACADEMY_\w+_ENABLED\s*[!=]==|\benv\[['"]ACADEMY_\w+_ENABLED['"]\]\s*[!=]==/
        const offenders = ['lib', 'app', 'components'].flatMap(sources)
            .filter(file => file !== 'lib/academy/switches.ts' && pattern.test(readFileSync(path.join(app, file), 'utf8')))
        expect(offenders).toEqual([])
    })

    it('każdy przełącznik dociera do kontenera i jest domyślnie wyłączony', () => {
        const compose = readFileSync(path.resolve(app, '..', 'docker-compose.yml'), 'utf8')
        for (const name of ACADEMY_SWITCHES) expect(compose).toContain(`${name}: \${${name}:-false}`)
    })
})
