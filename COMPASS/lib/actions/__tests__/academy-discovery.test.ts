import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getAcademyCatalogOptions, getAcademyPrerequisiteStatus, listAcademyPrerequisiteChoices } from '../academy-discovery'
import { academyFixture, COURSE, USER, OTHER, VERSION, OLD_VERSION, ENROLLMENT, courseRow, versionRow, enrollmentRow, id } from './academy-fixtures'
import type { MockSupabase, MockSupabaseConfig } from '@/test/mocks/supabase'

let client: MockSupabase
vi.mock('@/lib/supabase/server', () => ({ createClient: () => client }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))
function setup(config: MockSupabaseConfig = {}) { client = academyFixture(config); return client }
beforeEach(() => setup())
const prerequisite = id(11)
const published = (patch = {}) => courseRow({ id: prerequisite, title: 'Podstawy', slug: 'podstawy', legacy_review_required: false, ...patch })

describe('academy discovery read access', () => {
    it('requires an authenticated Academy participant even for catalog filters', async () => {
        setup({ user: null })
        expect((await getAcademyCatalogOptions()).success).toBe(false)
        expect(client.rpc).not.toHaveBeenCalled()
    })
    it('requires trainer access to search prerequisites', async () => {
        setup({ tables: { academy_user_capabilities: [] } })
        expect((await listAcademyPrerequisiteChoices()).success).toBe(false)
    })
    it('provides only categories of available publications and minimal instructor fields', async () => {
        setup({ tables: { courses: [published({ category: 'Cloud' }), published({ id: id(12), category: 'Backend' }), published({ id: id(13), category: 'Hidden', status: 'draft' }), published({ id: id(14), category: 'Legacy', legacy_review_required: true })] }, rpcs: { academy_catalog_instructors: () => [{ id: USER, name: 'Żaneta', courseIds: [COURSE], email: 'private@example.test' }] } })
        expect(await getAcademyCatalogOptions()).toEqual({ success: true, data: { categories: ['Backend', 'Cloud'], instructors: [{ id: USER, name: 'Żaneta' }] } })
    })
    it('searches only available published targets, excludes self, and preserves selected target names', async () => {
        setup({ tables: { courses: [published(), published({ id: COURSE, title: 'Podstawy własne' }), published({ id: id(12), status: 'draft' }), published({ id: id(13), legacy_review_required: true })] } })
        const found = await listAcademyPrerequisiteChoices({ search: 'Podstawy', excludeCourseId: COURSE })
        expect(found.success && found.data.map((row) => row.id)).toEqual([prerequisite])
        const selected = await listAcademyPrerequisiteChoices({ selectedIds: [prerequisite] })
        expect(selected.success && selected.data[0].title).toBe('Podstawy')
    })
    it('rejects malformed IDs before issuing target reads', async () => {
        expect((await listAcademyPrerequisiteChoices({ selectedIds: ['not-a-uuid'] })).success).toBe(false)
        expect((await getAcademyPrerequisiteStatus({ courseId: COURSE, versionId: 'bad' })).success).toBe(false)
    })
})

describe('pinned prerequisite state', () => {
    it('uses completion evidence belonging to the current user, not an enrollment marker or another user', async () => {
        setup({ tables: { courses: [courseRow(), published()], course_versions: [versionRow({ metadata: { prerequisite_course_ids: [prerequisite] } })], course_completions: [{ course_id: prerequisite, user_id: OTHER }], course_enrollments: [enrollmentRow({ course_id: prerequisite, completed_at: '2026-09-01' })] } })
        const result = await getAcademyPrerequisiteStatus({ courseId: COURSE, versionId: VERSION })
        expect(result.success && result.data).toMatchObject({ allCompleted: false, items: [{ title: 'Podstawy', completed: false, available: true, slug: 'podstawy' }] })
    })
    it('retains old prerequisites for a pinned enrollment after a new publication', async () => {
        setup({ tables: { courses: [courseRow(), published()], course_enrollments: [enrollmentRow()], course_versions: [versionRow({ metadata: { prerequisite_course_ids: [id(12)] } }), versionRow({ id: OLD_VERSION, metadata: { prerequisite_course_ids: [prerequisite] } })], course_completions: [{ course_id: prerequisite, user_id: USER }] } })
        const result = await getAcademyPrerequisiteStatus({ courseId: COURSE, enrollmentId: ENROLLMENT })
        expect(result.success && result.data).toMatchObject({ allCompleted: true, items: [{ id: prerequisite, completed: true }] })
    })
    it('does not treat a missing target as complete or link it into an unavailable route', async () => {
        setup({ tables: { course_versions: [versionRow({ metadata: { prerequisite_course_ids: [prerequisite] } })], course_completions: [] } })
        const result = await getAcademyPrerequisiteStatus({ courseId: COURSE, versionId: VERSION })
        expect(result.success && result.data).toMatchObject({ allCompleted: false, items: [{ title: 'Niedostępne szkolenie', slug: null, available: false, completed: false }] })
    })
    it('rejects a version belonging to a different course or unknown enrollment', async () => {
        expect((await getAcademyPrerequisiteStatus({ courseId: id(99), versionId: VERSION })).success).toBe(false)
        expect((await getAcademyPrerequisiteStatus({ courseId: COURSE, enrollmentId: id(99) })).success).toBe(false)
    })
})
