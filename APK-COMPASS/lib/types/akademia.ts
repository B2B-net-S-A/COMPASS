// ============================================================
// LMS „Akademia" — typy współdzielone między server actions a komponentami.
// Plik wydzielony bo Next.js 14 'use server' pliki mogą eksportować
// tylko async functions.
// ============================================================

export type CourseStatus = 'draft' | 'pending_review' | 'published' | 'archived' | 'rejected'
export type CourseLevel = 'beginner' | 'intermediate' | 'advanced'

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
}

export interface CourseListItem extends Course {
    author_name: string | null
    author_avatar_url: string | null
}

export interface CourseAttachment {
    name: string
    storage_path: string
    size_bytes: number
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
}

export interface CreateCourseInput {
    title: string
    description?: string
    category: string
    tags?: string[]
    level?: CourseLevel
    duration_minutes?: number
}

export interface UpdateCoursePatch {
    title?: string
    description?: string | null
    category?: string
    tags?: string[]
    level?: CourseLevel
    duration_minutes?: number | null
    cover_image_url?: string | null
}

export interface ListCoursesFilters {
    category?: string
    tag?: string
    level?: CourseLevel
    search?: string
    page?: number
    limit?: number
    orderBy?: 'newest' | 'popular' | 'top_rated'
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
    points_awarded: boolean
    progress_percent: number
}

export interface RecommendedCourse {
    course: CourseListItem
    overlap_count: number
    reason: string
}

export type ActionResult<T> = { success: true; data: T } | { success: false; error: string }

// Quiz constraints
export const QUIZ_MIN_QUESTIONS = 4
export const QUIZ_MAX_QUESTIONS = 10
export const QUIZ_OPTIONS_PER_QUESTION = 4
