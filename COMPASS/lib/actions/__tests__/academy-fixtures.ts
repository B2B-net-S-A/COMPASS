import { createMockSupabaseClient, type MockSupabaseConfig, type Row } from '@/test/mocks/supabase'

export const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
export const USER = id(1), OTHER = id(2), COURSE = id(10), VERSION = id(20), DRAFT = id(21), OLD_VERSION = id(22), ENROLLMENT = id(30), RUN_ENROLLMENT = id(31), LESSON = id(40), RUN = id(50), QUESTION = id(60), OPTION = id(70), ATTEMPT = id(80)
export const rules = { quiz_required: true, quiz_pass_percent: 80, require_all_lessons: true, attendance_percent: 80 }
export const courseRow = (patch: Row = {}): Row => ({ id: COURSE, author_id: USER, slug: 'warsztat', title: 'Opublikowany program', category: 'Backend', tags: ['typescript'], level: 'beginner', course_type: 'consultant', delivery_mode: 'self_paced', status: 'published', legacy_review_required: false, published_version_id: VERSION, draft_version_id: DRAFT, updated_at: '2026-09-22T08:00:00Z', published_at: '2026-09-20T08:00:00Z', ...patch })
export const versionRow = (patch: Row = {}): Row => ({ id: VERSION, course_id: COURSE, version_number: 2, status: 'published', metadata: { title: 'Program wersji 2', delivery_mode: 'self_paced', category: 'Backend' }, completion_rules: rules, rejection_reason: null, reviewed_by: null, reviewed_at: null, ...patch })
export const enrollmentRow = (patch: Row = {}): Row => ({ id: ENROLLMENT, course_id: COURSE, user_id: USER, version_id: OLD_VERSION, run_id: null, completed_lessons: [], completed_at: null, lesson_completion_dates: {}, enrolled_at: '2026-09-10T10:00:00Z', ...patch })

/** Fixtures exercise TypeScript filters/payloads; SQL tests cover database transitions. */
export function academyFixture(config: MockSupabaseConfig = {}) {
    return createMockSupabaseClient({
        user: { id: USER, email: 'trainer@example.test' }, ...config,
        tables: {
            profiles: [{ id: USER, full_name: 'Trener', avatar_url: null, role: 'consultant', is_external: false, employment_status: 'active' }],
            academy_user_capabilities: [{ user_id: USER, can_train: true, revoked_at: null }],
            courses: [courseRow()],
            course_versions: [versionRow(), versionRow({ id: DRAFT, status: 'draft', version_number: 3, metadata: { title: 'Roboczy program', category: 'Backend' } }), versionRow({ id: OLD_VERSION, version_number: 1, metadata: { title: 'Zapisana wersja 1', category: 'Backend' } })],
            course_enrollments: [], course_lessons: [], course_ratings: [], course_quiz_questions: [], course_quiz_options: [], ...config.tables,
            course_completions: (config.tables?.course_completions ?? []).map(row => ({ revoked_at: null, ...row })),
        },
        rpcs: { academy_rollout_access: () => ({ mode: 'open', allowed: true, isPilot: false }), academy_can_manage_course: () => true, academy_can_preview_version: () => true, academy_teaching_courses: () => (config.tables?.courses ?? [courseRow()]).filter(course => course.author_id === USER).map(course => ({ ...course, can_edit: true, can_lead: true })), ...config.rpcs },
    })
}
