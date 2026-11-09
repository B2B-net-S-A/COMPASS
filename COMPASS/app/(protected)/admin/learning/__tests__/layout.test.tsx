import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AdminSectionLayout from '../layout'

const guards = vi.hoisted(() => ({ context: vi.fn(), adminLayout: vi.fn() }))
vi.mock('@/lib/academy/server', () => ({ requireAcademyContext: guards.context }))
vi.mock('@/lib/auth/internal-guard', () => ({ requireAdminLayout: guards.adminLayout }))

const section = path.join(process.cwd(), 'app/(protected)/admin/learning')

beforeEach(() => {
    guards.context.mockReset()
    guards.adminLayout.mockReset()
    guards.adminLayout.mockResolvedValue({})
})

describe('layout sekcji akceptacji', () => {
    it('wpuszcza recenzenta bez bramki administratora', async () => {
        guards.context.mockResolvedValue({ access: { canReview: true } })
        await AdminSectionLayout({ children: null })
        expect(guards.context).toHaveBeenCalledWith({ reviewState: true })
        expect(guards.adminLayout).not.toHaveBeenCalled()
    })

    it('kieruje każdego innego na dotychczasową bramkę administratora', async () => {
        guards.context.mockResolvedValue({ access: { canReview: false } })
        await AdminSectionLayout({ children: null })
        expect(guards.adminLayout).toHaveBeenCalledOnce()
    })

    it('przy odmowie Akademii też kończy na bramce administratora', async () => {
        guards.context.mockRejectedValue(new Error('Nie masz dostępu do Akademii.'))
        await AdminSectionLayout({ children: null })
        expect(guards.adminLayout).toHaveBeenCalledOnce()
    })

    it('nie przepuszcza dalej, gdy bramka administratora odmawia', async () => {
        guards.context.mockResolvedValue({ access: { canReview: false } })
        guards.adminLayout.mockRejectedValue(new Error('NEXT_REDIRECT'))
        await expect(AdminSectionLayout({ children: null })).rejects.toThrow('NEXT_REDIRECT')
    })
})

describe('ekrany administracji poza zasięgiem TCM', () => {
    // Nowy podkatalog bez tej bramki otworzyłby ekran administracji recenzentom TCM.
    const reviewerRoutes = new Set(['[id]', '__tests__'])
    const screens = readdirSync(section).filter(name => statSync(path.join(section, name)).isDirectory() && !reviewerRoutes.has(name))

    it('obejmuje znane ekrany', () => {
        expect(screens).toEqual(expect.arrayContaining(['analytics', 'certificates', 'gotowosc', 'integrations', 'kompetencje', 'szkolenia', 'trainers']))
    })

    it.each(screens)('%s ma własną bramkę administratora', screen => {
        const layout = path.join(section, screen, 'layout.tsx')
        expect(existsSync(layout)).toBe(true)
        expect(readFileSync(layout, 'utf8')).toContain("export { default } from '../admin-only-layout'")
    })

    it('bramka ekranów woła requireAdminLayout', () => {
        expect(readFileSync(path.join(section, 'admin-only-layout.tsx'), 'utf8')).toContain('await requireAdminLayout()')
    })
})
