// ============================================================
// LMS „Akademia" — typy współdzielone między server actions a komponentami.
// Plik wydzielony bo Next.js 14 'use server' pliki mogą eksportować
// tylko async functions.
// ============================================================

export type CourseStatus = 'draft' | 'pending_review' | 'published' | 'archived' | 'rejected'
export type CourseLevel = 'beginner' | 'intermediate' | 'advanced'
// Phase 1.1 (2026-05-04): course_type ENUM in DB; consultant=peer-authored (admin moderation),
// company=B2Bnetwork-authored (admin/trainer creates, no peer-author bonus).
export type CourseType = 'consultant' | 'company'
export type CourseDeliveryMode = 'self_paced' | 'live' | 'blended'
export interface CourseCompletionRules {
    quiz_required: boolean
    quiz_pass_percent: number
    require_all_lessons: boolean
    attendance_percent: number
}

export interface Course {
    id: string
    author_id: string
    title: string
    slug: string
    description: string | null
    cover_image_url: string | null
    category: string
    tags: string[]
    level: CourseLevel
    duration_minutes: number | null
    status: CourseStatus
    course_type: CourseType
    is_official: boolean
    rejection_reason: string | null
    reviewed_by: string | null
    reviewed_at: string | null
    published_at: string | null
    avg_rating: number
    ratings_count: number
    enrollments_count: number
    completions_count: number
    created_at: string
    updated_at: string
    /** A2.2: kursy wymagane przed zapisem (musi być completed). */
    prerequisite_course_ids: string[]
    delivery_mode?: CourseDeliveryMode
    published_version_id?: string | null
    draft_version_id?: string | null
    version_id?: string
    /** Status of the selected version; status remains the course lifecycle state. */
    version_status?: CourseStatus
    submission_id?: string | null
    legacy_review_required?: boolean
    can_edit?: boolean
    can_lead?: boolean
    can_manage_assigned_runs?: boolean
    version_number?: number
    completion_rules?: CourseCompletionRules
    /** Null for versions published before the attempt policy was introduced. */
    quiz_attempt_limit?: number | null
    quiz_attempt_window_hours?: number | null
}

export interface CourseListItem extends Course {
    author_name: string | null
    author_avatar_url: string | null
}

export interface CourseAttachment {
    name: string
    storage_path: string
    size_bytes: number
    asset_id?: string
    mime_type?: string
    /** Explicit VTT association within this lesson version. */
    caption_for_asset_id?: string | null
}

export interface CourseLesson {
    id: string
    course_id: string
    order_index: number
    title: string
    content_md: string | null
    video_url: string | null
    attachments: CourseAttachment[]
    estimated_minutes: number | null
    /** A2.4: drip release — odblokuj X dni po ukończeniu poprzedniej lekcji. 0 = od razu. */
    unlock_after_days: number
    version_id?: string
    content_available?: boolean
}

export interface CourseQuizQuestionPublic {
    id: string
    order_index: number
    question_text: string
    options_count: number
}

export interface CourseDetail extends Course {
    author_name: string | null
    author_avatar_url: string | null
    lessons: CourseLesson[]
    quiz_questions_count: number
    is_enrolled: boolean
    user_rating: { rating: number; comment: string | null } | null
    enrollment_id?: string | null
    run_id?: string | null
    completed_at?: string | null
    completion_revoked_at?: string | null
    completion_revoked_reason?: string | null
    completed_lesson_ids?: string[]
    lesson_completion_dates?: Record<string, string>
}

export interface CreateCourseInput {
    prerequisite_course_ids?: string[]
    title: string
    description?: string
    category: string
    tags?: string[]
    level?: CourseLevel
    duration_minutes?: number
    /** Admin/trainer can pick 'company'; consultant defaults to 'consultant' regardless. */
    course_type?: CourseType
    /** Admin/trainer can mark a company course as 'official' (badge surface). */
    is_official?: boolean
    delivery_mode?: CourseDeliveryMode
    completion_rules?: CourseCompletionRules
}

export interface UpdateCoursePatch {
    prerequisite_course_ids?: string[]
    title?: string
    description?: string | null
    category?: string
    tags?: string[]
    level?: CourseLevel
    duration_minutes?: number | null
    cover_image_url?: string | null
    delivery_mode?: CourseDeliveryMode
    completion_rules?: CourseCompletionRules
}

export interface ListCoursesFilters {
    author_id?: string
    instructor_id?: string
    category?: string
    tag?: string
    level?: CourseLevel
    course_type?: CourseType
    search?: string
    page?: number
    limit?: number
    orderBy?: 'newest' | 'popular' | 'top_rated'
    delivery_mode?: CourseDeliveryMode
}

export interface CreateLessonInput {
    title: string
    content_md?: string | null
    video_url?: string | null
    estimated_minutes?: number | null
    attachments?: CourseAttachment[]
}

export interface UpdateLessonPatch {
    title?: string
    content_md?: string | null
    video_url?: string | null
    estimated_minutes?: number | null
    attachments?: CourseAttachment[]
}

export interface QuizQuestionInput {
    question_text: string
    options: { option_text: string; is_correct: boolean }[]
}

export interface CourseQuizQuestionAuthor {
    id: string
    order_index: number
    question_text: string
    options: { id: string; order_index: number; option_text: string; is_correct: boolean }[]
}

export interface QuizQuestionForAttempt {
    question_id: string
    question_order: number
    question_text: string
    options: { id: string; order_index: number; option_text: string }[]
}

export interface QuizSubmissionResult {
    score_percent: number
    passed: boolean
    attempt_id: string
    already_awarded: boolean
    award_status: string | null
}

export interface CourseEnrollmentWithProgress {
    enrollment_id: string
    course: Course
    enrolled_at: string
    completed_lessons: string[]
    total_lessons: number
    completed_at: string | null
    completion_revoked_at?: string | null
    completion_revoked_reason?: string | null
    points_awarded: boolean
    progress_percent: number
    /** A1.1: ID ostatnio odwiedzonej lekcji (NULL gdy user nigdy nie wszedł). */
    last_accessed_lesson_id: string | null
    /** A1.1: Timestamp ostatniej wizyty w lekcji. */
    last_accessed_at: string | null
    version_id?: string
    run_id?: string | null
}

export interface RecommendedCourse {
    course: CourseListItem
    overlap_count: number
    reason: string
}

// Audyt 2026-08 (B1): ten sam kształt był zdefiniowany niezależnie w trzech
// plikach typów. Kanoniczna definicja mieszka teraz w lib/actions/action-result.ts
// razem z `runAction` i `ExpectedError`; ten alias zostaje, żeby nie przepisywać
// całych modułów naraz. Nowy kod importuje bezpośrednio stamtąd.
export type ActionResult<T> = import('@/lib/actions/action-result').ActionResult<T>

// Quiz constraints
export const QUIZ_MIN_QUESTIONS = 4
export const QUIZ_MAX_QUESTIONS = 10
export const QUIZ_OPTIONS_PER_QUESTION = 4

// ============================================================
// A2.1 — Learning Paths
// ============================================================

export type LearningPathStatus = 'draft' | 'published' | 'archived'

export interface LearningPath {
    id: string
    slug: string
    title: string
    description: string | null
    cover_image_url: string | null
    level: CourseLevel
    estimated_hours: number | null
    status: LearningPathStatus
    author_id: string
    enrollments_count: number
    completions_count: number
    created_at: string
    updated_at: string
}

export interface LearningPathCourseLink {
    course_id: string
    order_index: number
    is_required: boolean
}

export interface LearningPathDetail extends LearningPath {
    courses: Array<{
        course_id: string
        course: Course | null
        order_index: number
        is_required: boolean
        is_completed: boolean
        is_enrolled: boolean
        enrollment_id: string | null
        run_id: string | null
    }>
    is_enrolled_in_path: boolean
    completed_courses_count: number
    total_courses_count: number
    progress_percent: number
    completed_at: string | null
}

export interface LearningPathListItem extends LearningPath {
    course_count: number
    is_enrolled: boolean
    progress_percent: number
}
