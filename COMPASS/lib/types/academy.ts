export type AcademyDeliveryMode = 'self_paced' | 'live' | 'blended'
export type AcademyVersionStatus = 'draft' | 'pending_review' | 'published' | 'rejected'

export interface AcademyCompletionRules {
    quiz_required: boolean
    quiz_pass_percent: number
    require_all_lessons: boolean
    attendance_percent: number
}

export const DEFAULT_ACADEMY_COMPLETION_RULES: AcademyCompletionRules = {
    quiz_required: true,
    quiz_pass_percent: 80,
    require_all_lessons: true,
    attendance_percent: 80,
}

export interface AcademyCourseMetadata {
    title: string
    description: string | null
    category: string
    tags: string[]
    level: 'beginner' | 'intermediate' | 'advanced'
    duration_minutes: number | null
    cover_image_url: string | null
    delivery_mode: AcademyDeliveryMode
    course_type: 'consultant' | 'company'
    is_official: boolean
    prerequisite_course_ids: string[]
}

export interface AcademyCourseVersion {
    id: string
    course_id: string
    version_number: number
    status: AcademyVersionStatus
    metadata: AcademyCourseMetadata
    completion_rules: AcademyCompletionRules
    created_by: string | null
    created_at: string
    submitted_at: string | null
    reviewed_by: string | null
    reviewed_at: string | null
    published_at: string | null
    rejection_reason: string | null
    legacy: boolean
}

export interface AcademyTrainerCapability {
    user_id: string
    can_train: boolean
    granted_by: string | null
    granted_at: string
    revoked_by: string | null
    revoked_at: string | null
}

export interface AcademyCertificateSnapshot {
    course_title: string
    version_number: number
    participant_name: string
    author_name: string | null
    completed_at: string
    certificate_hash: string
}

export interface AcademyCompletion {
    id: string
    enrollment_id: string
    user_id: string
    course_id: string
    version_id: string
    completed_at: string
    certificate_snapshot: AcademyCertificateSnapshot
    legacy: boolean
}

export type AcademyCompletionResult =
    | { completed: true; completion_id: string; already_completed: boolean }
    | { completed: false; reason: 'required_lessons' | 'quiz_not_passed' | 'attendance_missing' }

export interface AcademyQuizResult {
    score_percent: number
    passed: boolean
    attempt_id: string
    already_awarded: boolean
    award_status: 'completed' | 'requirements_pending' | 'not_passed'
    completion: AcademyCompletionResult | null
}

export interface AcademyQuizQuestionInput {
    question_text: string
    options: Array<{ option_text: string; is_correct: boolean }>
}

export interface AcademyQuizAnswerInput {
    question_id: string
    selected_option_id: string
}

export interface AcademyAccess {
    can_access: boolean
    can_train: boolean
    is_admin: boolean
}

// Short aliases retained for consumers that treat the version as an LMS domain type.
export type CourseVersion = AcademyCourseVersion
export type CourseCompletion = AcademyCompletion

export interface AcademyLearningStreak {
    current: number
    milestone_reached: boolean
}

export interface AcademyLessonCompletionResult {
    completed: true
    already_completed: boolean
    completion: AcademyCompletionResult
    streak: AcademyLearningStreak | null
}

export interface AcademyQuestionScope {
    version_id: string
    /** Historical questions may predate a learner enrollment. */
    enrollment_id: string | null
}

export interface AcademyPathCompletionResult {
    completed: boolean
    now_completed: boolean
}
