import { beforeEach, describe, expect, it, vi } from 'vitest'
import { academyFixture, id, USER } from './academy-fixtures'
import type { MockSupabase } from '@/test/mocks/supabase'
import { listAcademyTrainerPage, listAcademyTrainers } from '../academy-access'

let client: MockSupabase
vi.mock('@/lib/supabase/server', () => ({ createClient: () => client }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))

const consultants = Array.from({ length: 130 }, (_, index) => ({
    id: id(1000 + index), full_name: `Konsultant ${String(index + 1).padStart(3, '0')}`,
    email: `person${index + 1}@example.test`, role: 'consultant', is_external: false,
    employment_status: 'active',
}))

beforeEach(() => {
    client = academyFixture({
        tables: {
            profiles: [
                { id: USER, full_name: 'Administrator', email: 'admin@example.test', role: 'admin', is_external: false, employment_status: 'active' },
                ...consultants,
                { id: id(3000), full_name: 'Nieaktywny', email: 'inactive@example.test', role: 'consultant', is_external: false, employment_status: 'exited' },
                { id: id(3001), full_name: 'Zewnętrzny', email: 'external@example.test', role: 'consultant', is_external: true, employment_status: 'active' },
                { id: id(3002), full_name: 'Manager', email: 'manager@example.test', role: 'manager', is_external: false, employment_status: 'active' },
            ],
            academy_user_capabilities: [
                ...Array.from({ length: 1100 }, (_, index) => ({ user_id: id(5000 + index), can_train: true, revoked_at: null, granted_at: '2026-09-01T08:00:00Z' })),
                { user_id: id(1128), can_train: true, revoked_at: null, granted_at: '2026-09-22T08:00:00Z' },
                { user_id: id(1129), can_train: false, revoked_at: '2026-09-23T08:00:00Z', granted_at: '2026-09-01T08:00:00Z' },
            ],
        },
        user: { id: USER, email: 'admin@example.test' },
    })
})

describe('Academy trainer directory', () => {
    it('pages beyond 100 profiles and resolves grants only for visible consultants', async () => {
        const selectedIds: string[][] = []
        const originalFrom = client.from
        client.from = vi.fn((table: string) => {
            const builder = originalFrom(table)
            if (table === 'academy_user_capabilities') {
                const originalIn = builder.in
                builder.in = vi.fn((column: string, ids: string[]) => {
                    expect(column).toBe('user_id')
                    selectedIds.push(ids)
                    return originalIn(column, ids)
                })
            }
            return builder
        }) as typeof client.from

        const first = await listAcademyTrainerPage({ page: 1 })
        const last = await listAcademyTrainerPage({ page: 6 })
        expect(first.success && first.data).toMatchObject({ page: 1, pageSize: 25, total: 131 })
        expect(last.success && last.data).toMatchObject({ page: 6, pageSize: 25, total: 131 })
        if (!last.success) throw new Error(last.error)
        expect(last.data.items).toHaveLength(6)
        expect(last.data.items.find(person => person.id === id(1128))).toMatchObject({ canTeach: true, grantedAt: '2026-09-22T08:00:00Z' })
        expect(last.data.items.find(person => person.id === id(1129))).toMatchObject({ canTeach: false })
        expect(selectedIds).toHaveLength(2)
        expect(selectedIds[1]).toEqual(last.data.items.map(person => person.id))
    })

    it('searches before paging, omits ineligible roles and keeps the pilot lookup bounded', async () => {
        const matched = await listAcademyTrainerPage({ search: 'Konsultant 129', page: 1 })
        expect(matched.success && matched.data).toMatchObject({ total: 1 })
        if (!matched.success) throw new Error(matched.error)
        expect(matched.data.items.map(person => person.id)).toEqual([id(1128)])

        const pilot = await listAcademyTrainers('')
        expect(pilot.success && pilot.data).toHaveLength(100)
        if (!pilot.success) throw new Error(pilot.error)
        expect(pilot.data[0]).toMatchObject({ id: USER, role: 'admin', canTeach: true })
        expect(pilot.data.some(person => person.id === id(3000) || person.id === id(3001) || person.id === id(3002))).toBe(false)
    })
})
