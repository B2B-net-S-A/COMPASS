import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { runAcademyDatabaseSync } from '../db-worker'

// Spis kanałów i powody: docs/academy/kanaly-wyjscia.md.

const app = process.cwd()
const AREA = ['lib/academy', 'app/api/akademia', 'app/api/cron/academy-health', 'app/api/cron/academy-material-cleanup', 'app/api/cron/academy-materials', 'app/api/cron/academy-sync', 'app/api/cron/course-inactivity', 'components/academy', 'components/learning', 'app/(protected)/learning', 'app/(protected)/admin/learning']
const ACTIONS = /^(academy|course|learning-paths)/

function sourceFiles(relative: string): string[] {
    return readdirSync(path.join(app, relative)).flatMap(name => {
        if (name === '__tests__') return []
        const child = path.join(relative, name)
        if (statSync(path.join(app, child)).isDirectory()) return sourceFiles(child)
        return /\.(ts|tsx)$/.test(name) ? [child] : []
    })
}
const files = [...AREA.flatMap(sourceFiles), ...readdirSync(path.join(app, 'lib/actions')).filter(name => ACTIONS.test(name) && /\.tsx?$/.test(name)).map(name => `lib/actions/${name}`)]
const read = (file: string) => readFileSync(path.join(app, file), 'utf8')
const using = (pattern: RegExp) => files.filter(file => pattern.test(read(file)))

describe('kanały wyjścia Akademii', () => {
    it('poczta: szablon Akademii nie wysyła sam', () => {
        const email = read('lib/email.ts')
        expect(email).not.toMatch(/\bsendCourseInactivityReminder\b/)
        expect(email).not.toContain('COMPASS Akademia <')
    })

    it('cron przypomnień idzie przez bramkę', () => {
        const route = read('app/api/cron/course-inactivity/route.ts')
        expect(route).toContain('holdAcademyMail')
        expect(route).not.toMatch(/sendEmail|sendCourseInactivity/)
    })

    it('web push: obszar Akademii go nie używa', () => {
        expect(using(/\bsendPushToUser(Id)?\b|web-push|lib\/push\/|alert-dispatch/)).toEqual([])
    })

    it('webhook Teams: obszar Akademii go nie używa', () => {
        expect(using(/lib\/teams\/webhook|TEAMS_WEBHOOK_URL/)).toEqual([])
    })

    it('maile Supabase Auth: obszar Akademii ich nie wyzwala', () => {
        expect(using(/inviteUserByEmail|resetPasswordForEmail|signInWithOtp|generateLink/)).toEqual([])
    })

    it('wydarzenia Graph z uczestnikami: wyłącznie worker integracji i moduł Teams', () => {
        expect(using(/\b(create|update|cancel)TeamsCalendarEvent\b/).sort()).toEqual(['lib/academy/integration-worker.ts', 'lib/academy/teams.ts'])
        expect(using(/lib\/calendar\/graph-events/)).toEqual([])
    })

    it('wydarzenia Graph: bez ACADEMY_TEAMS_ENABLED worker nie pobiera zadań', async () => {
        const rpc = vi.fn(async () => ({ data: 0, error: null }))
        const result = await runAcademyDatabaseSync({ client: { rpc } as unknown as SupabaseClient, env: {} as NodeJS.ProcessEnv })
        expect(rpc).toHaveBeenCalledExactlyOnceWith('academy_dispatch_reminders', { p_limit: 500 })
        expect(result).toMatchObject({ managedTeamsEnabled: false, claimed: 0 })
    })

    it.each(['false', 'TRUE', '1', 'yes', ''])('wydarzenia Graph: wartość %j nie włącza kanału', async value => {
        const rpc = vi.fn(async () => ({ data: 0, error: null }))
        await runAcademyDatabaseSync({ client: { rpc } as unknown as SupabaseClient, env: { ACADEMY_TEAMS_ENABLED: value, AZURE_TENANT_ID: '00000000-0000-4000-8000-000000000001', AZURE_CLIENT_ID: 'a', AZURE_CLIENT_SECRET: 'b' } as unknown as NodeJS.ProcessEnv })
        expect(rpc).not.toHaveBeenCalledWith('academy_claim_jobs', expect.anything())
    })
})
