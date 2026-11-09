import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '../../..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')
const workflow = () => read('../.github/workflows/academy-acceptance.yml')
const specs = () => readdirSync(resolve(root, 'e2e/academy-acceptance')).map(file => read(`e2e/academy-acceptance/${file}`)).join('\n')

describe('harness E2E Akademii: zasady z planu B0.7', () => {
    it('workflow startuje tylko ręcznie', () => {
        expect(workflow()).toContain('workflow_dispatch')
        expect(workflow()).not.toMatch(/^\s*(schedule|push|pull_request):/m)
    })
    it('workflow nie zna service role i nie wypuszcza artefaktów', () => {
        expect(workflow()).not.toMatch(/SERVICE_ROLE|upload-artifact/)
    })
    it('osobny config ogranicza się do katalogu akceptacji i wyłącza nagrania', () => {
        const config = read('playwright.academy.config.ts')
        expect(config).toContain("testDir: './e2e/academy-acceptance'")
        expect(config).toContain('dynaminds-smoke-test')
        for (const option of ['screenshot', 'video', 'trace']) expect(config).toContain(`${option}: 'off'`)
    })
    it('główny config pomija katalog akceptacji', () => {
        expect(read('playwright.config.ts')).toContain("testIgnore: ['**/academy-acceptance/**']")
    })
    it('testy nie używają haseł, kont uprzywilejowanych ani service role', () => {
        expect(specs()).not.toMatch(/helpers\/test-users|SERVICE_ROLE|password|BYPASS_/i)
    })
    it('każdy bieg kończy się asercją o wiadomościach', () => {
        const files = readdirSync(resolve(root, 'e2e/academy-acceptance')).filter(file => file.endsWith('.spec.ts')).sort()
        expect(files.at(-1)).toBe('zz-brak-wiadomosci.spec.ts')
    })
})
