import { describe, expect, it } from 'vitest'
import {
    deleteProjectInputSchema,
    deleteProjectsInputSchema,
    updateProjectInputSchema,
} from '../projects'

const VALID_UUID = '00000000-0000-4000-8000-000000000001'

describe('updateProjectInputSchema (privilege-escalation guard)', () => {
    it('accepts a valid title update', () => {
        const result = updateProjectInputSchema.safeParse({
            projectId: VALID_UUID,
            updates: { title: 'New title' },
        })
        expect(result.success).toBe(true)
    })

    it('rejects unknown fields (privilege escalation attempt)', () => {
        const result = updateProjectInputSchema.safeParse({
            projectId: VALID_UUID,
            updates: { role: 'admin', owner_id: VALID_UUID },
        })
        expect(result.success).toBe(false)
    })

    it('rejects empty updates object', () => {
        const result = updateProjectInputSchema.safeParse({
            projectId: VALID_UUID,
            updates: {},
        })
        expect(result.success).toBe(false)
    })

    it('rejects non-UUID projectId', () => {
        const result = updateProjectInputSchema.safeParse({
            projectId: 'not-a-uuid',
            updates: { title: 'X' },
        })
        expect(result.success).toBe(false)
    })

    it('enforces title max length (200 chars)', () => {
        const longTitle = 'x'.repeat(201)
        const result = updateProjectInputSchema.safeParse({
            projectId: VALID_UUID,
            updates: { title: longTitle },
        })
        expect(result.success).toBe(false)
    })

    it('rejects invalid status enum value', () => {
        const result = updateProjectInputSchema.safeParse({
            projectId: VALID_UUID,
            updates: { status: 'made_up_status' },
        })
        expect(result.success).toBe(false)
    })

    it('accepts all valid status values', () => {
        for (const s of ['draft', 'open', 'matched', 'closed', 'archived']) {
            const r = updateProjectInputSchema.safeParse({
                projectId: VALID_UUID,
                updates: { status: s },
            })
            expect(r.success).toBe(true)
        }
    })
})

describe('deleteProjectInputSchema', () => {
    it('accepts valid UUID', () => {
        expect(deleteProjectInputSchema.safeParse({ projectId: VALID_UUID }).success).toBe(true)
    })

    it('rejects non-UUID', () => {
        expect(deleteProjectInputSchema.safeParse({ projectId: '12345' }).success).toBe(false)
    })
})

describe('deleteProjectsInputSchema', () => {
    it('accepts list of valid UUIDs', () => {
        const result = deleteProjectsInputSchema.safeParse({
            projectIds: [VALID_UUID, '00000000-0000-4000-8000-000000000002'],
        })
        expect(result.success).toBe(true)
    })

    it('rejects empty list', () => {
        expect(deleteProjectsInputSchema.safeParse({ projectIds: [] }).success).toBe(false)
    })

    it('rejects list with too many items (>500)', () => {
        const ids = Array.from({ length: 501 }, () => VALID_UUID)
        expect(deleteProjectsInputSchema.safeParse({ projectIds: ids }).success).toBe(false)
    })

    it('rejects list with one non-UUID', () => {
        expect(
            deleteProjectsInputSchema.safeParse({
                projectIds: [VALID_UUID, 'bad'],
            }).success,
        ).toBe(false)
    })
})
