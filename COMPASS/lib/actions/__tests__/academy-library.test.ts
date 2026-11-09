import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/academy/server', () => ({ requireAcademyContext: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }))

import * as Sentry from '@sentry/nextjs'
import { revalidatePath } from 'next/cache'
import { requireAcademyContext } from '@/lib/academy/server'
import { getCourseLibraryFields, setCourseLibraryFields } from '../academy-library'

const courseId = '11111111-1111-4111-8111-111111111111'
const programmeId = '22222222-2222-4222-8222-222222222222'

type Result = { data: unknown; error: { code?: string; message: string } | null }
const db = vi.hoisted(() => ({
    course: { data: null, error: null } as Result,
    programmes: { data: [], error: null } as Result,
    canManage: { data: true, error: null } as Result,
    setFields: { data: null, error: null } as Result,
}))
const rpc = vi.fn(async (name: string) => name === 'academy_can_manage_course' ? db.canManage : db.setFields)
const from = vi.fn((table: string) => {
    if (table === 'courses') {
        const query = { select: () => query, eq: () => query, maybeSingle: async () => db.course }
        return query
    }
    const query = { select: () => query, order: () => query, limit: async () => db.programmes }
    return query
})
const client = { rpc, from }

beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireAcademyContext).mockResolvedValue({ client, access: { userId: 'author', canTeach: true } } as never)
    db.course = { data: { topic: 'Kubernetes', programme_id: programmeId }, error: null }
    db.programmes = { data: [{ id: programmeId, title: 'Chmura od podstaw' }], error: null }
    db.canManage = { data: true, error: null }
    db.setFields = { data: null, error: null }
})

describe('setCourseLibraryFields', () => {
    it('refuses an account without the trainer right (also a learner-only account) before touching the database', async () => {
        vi.mocked(requireAcademyContext).mockRejectedValue(new Error('Tworzenie szkoleń jest dostępne dla uprawnionych trenerów.'))
        await expect(setCourseLibraryFields({ courseId, topic: 'Java', programmeId: null }))
            .resolves.toEqual({ success: false, error: 'Tworzenie szkoleń jest dostępne dla uprawnionych trenerów.' })
        expect(requireAcademyContext).toHaveBeenCalledWith({ trainer: true })
        expect(rpc).not.toHaveBeenCalled()
        expect(Sentry.captureException).not.toHaveBeenCalled()
    })

    it('passes a person who may not edit this course to the database refusal with a readable message', async () => {
        db.setFields = { data: null, error: { code: '42501', message: 'trainer_course_required' } }
        await expect(setCourseLibraryFields({ courseId, topic: 'Java', programmeId: null }))
            .resolves.toEqual({ success: false, error: 'Nie masz uprawnień do edycji tego szkolenia.' })
        expect(revalidatePath).not.toHaveBeenCalled()
        expect(Sentry.captureException).not.toHaveBeenCalled()
    })

    it('saves through the RPC with a trimmed topic and the chosen programme', async () => {
        await expect(setCourseLibraryFields({ courseId, topic: '  Java  ', programmeId })).resolves.toEqual({ success: true, data: null })
        expect(rpc).toHaveBeenCalledWith('academy_set_course_library_fields', { p_course_id: courseId, p_topic: 'Java', p_programme_id: programmeId })
        expect(from).not.toHaveBeenCalled()
        expect(revalidatePath).toHaveBeenCalledWith('/learning', 'layout')
    })

    it.each([['', null], ['   ', null], [null, null]])('sends %j as no topic, because the RPC rejects an empty string', async (topic, expected) => {
        await setCourseLibraryFields({ courseId, topic, programmeId: null })
        expect(rpc).toHaveBeenCalledWith('academy_set_course_library_fields', { p_course_id: courseId, p_topic: expected, p_programme_id: null })
    })

    it('accepts a topic of exactly 100 characters and rejects 101', async () => {
        expect((await setCourseLibraryFields({ courseId, topic: 'a'.repeat(100), programmeId: null })).success).toBe(true)
        rpc.mockClear()
        const result = await setCourseLibraryFields({ courseId, topic: 'a'.repeat(101), programmeId: null })
        expect(result).toEqual({ success: false, error: 'Temat może mieć najwyżej 100 znaków.' })
        expect(rpc).not.toHaveBeenCalled()
    })

    it.each([
        [{ courseId: 'x', topic: 'Java', programmeId: null }],
        [{ courseId, topic: 'Java', programmeId: 'nie-uuid' }],
    ])('rejects malformed identifiers %j', async input => {
        expect((await setCourseLibraryFields(input)).success).toBe(false)
        expect(rpc).not.toHaveBeenCalled()
    })

    it('says the migration is pending when the RPC does not exist', async () => {
        db.setFields = { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }
        const result = await setCourseLibraryFields({ courseId, topic: 'Java', programmeId: null })
        expect(result.success).toBe(false)
        if (!result.success) expect(result.error).toContain('czeka na migrację')
        expect(Sentry.captureException).not.toHaveBeenCalled()
    })

    it('explains a programme removed in the meantime', async () => {
        db.setFields = { data: null, error: { code: 'P0001', message: 'programme_not_found' } }
        await expect(setCourseLibraryFields({ courseId, topic: null, programmeId }))
            .resolves.toEqual({ success: false, error: 'Wybrany program już nie istnieje. Odśwież stronę.' })
    })

    it('reports an unknown database failure to Sentry without leaking details', async () => {
        db.setFields = { data: null, error: { code: 'XX000', message: 'relation internals exploded' } }
        const result = await setCourseLibraryFields({ courseId, topic: 'Java', programmeId: null })
        expect(result.success).toBe(false)
        if (!result.success) expect(result.error).not.toContain('internals')
        expect(Sentry.captureException).toHaveBeenCalled()
    })
})

describe('getCourseLibraryFields', () => {
    it('refuses an account without the trainer right before reading anything', async () => {
        vi.mocked(requireAcademyContext).mockRejectedValue(new Error('Tworzenie szkoleń jest dostępne dla uprawnionych trenerów.'))
        expect((await getCourseLibraryFields(courseId)).success).toBe(false)
        expect(requireAcademyContext).toHaveBeenCalledWith({ trainer: true })
        expect(from).not.toHaveBeenCalled()
    })

    it('returns the current fields, the programme list and the edit right', async () => {
        await expect(getCourseLibraryFields(courseId)).resolves.toEqual({
            success: true,
            data: { migrated: true, canEdit: true, topic: 'Kubernetes', programmeId, programmes: [{ id: programmeId, title: 'Chmura od podstaw' }] },
        })
        expect(rpc).toHaveBeenCalledWith('academy_can_manage_course', { p_course_id: courseId })
    })

    it('marks the fields read-only for a person who may open but not edit the course', async () => {
        db.canManage = { data: false, error: null }
        const result = await getCourseLibraryFields(courseId)
        expect(result.success && result.data.canEdit).toBe(false)
    })

    it.each(['42703', 'PGRST204'])('reports missing columns (%s) as waiting for the migration, not as an empty topic', async code => {
        db.course = { data: null, error: { code, message: 'column courses.topic does not exist' } }
        await expect(getCourseLibraryFields(courseId)).resolves.toEqual({
            success: true,
            data: { migrated: false, canEdit: false, topic: null, programmeId: null, programmes: [] },
        })
    })

    it('reports a missing programme table as waiting for the migration', async () => {
        db.programmes = { data: null, error: { code: 'PGRST205', message: 'academy_programmes' } }
        const result = await getCourseLibraryFields(courseId)
        expect(result.success && result.data.migrated).toBe(false)
    })

    it('does not turn a failed programme read into an empty list', async () => {
        db.programmes = { data: null, error: { code: '42501', message: 'denied' } }
        expect((await getCourseLibraryFields(courseId)).success).toBe(false)
        db.programmes = { data: null, error: null }
        expect((await getCourseLibraryFields(courseId)).success).toBe(false)
    })

    it('says the course is unavailable when the row is not visible', async () => {
        db.course = { data: null, error: null }
        await expect(getCourseLibraryFields(courseId)).resolves.toEqual({ success: false, error: 'Szkolenie nie istnieje lub nie masz do niego dostępu.' })
    })

    it('rejects a malformed identifier', async () => {
        expect((await getCourseLibraryFields('x')).success).toBe(false)
        expect(from).not.toHaveBeenCalled()
    })
})
