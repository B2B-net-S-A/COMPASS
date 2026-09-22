import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { CourseDetail, CourseLesson } from '@/lib/types/learning'
import AdminCourseReviewPage from '@/app/(protected)/admin/learning/[id]/page'
import { getCourseDetail, getCourseLessons, getCourseQuizForAuthor } from '@/lib/actions/courses'
import { canReviewCourseVersion } from '@/lib/actions/courses-admin'

vi.mock('@/lib/actions/courses', () => ({ getCourseDetail: vi.fn(), getCourseLessons: vi.fn(), getCourseQuizForAuthor: vi.fn() }))
vi.mock('@/lib/actions/courses-admin', () => ({ canReviewCourseVersion: vi.fn() }))
vi.mock('@/components/learning/AdminReviewActions', () => ({ AdminReviewActions: ({ canReview, submissionId }: { canReview: boolean; submissionId?: string }) => <button data-submission={submissionId} disabled={!canReview}>Zatwierdź i opublikuj</button> }))
vi.mock('@/components/academy/AcademyVideo', () => ({ AcademyVideo: ({ lessonId, video, captions }: { lessonId: string; video: { asset_id: string }; captions?: { asset_id: string } }) => <div data-testid="review-video" data-lesson={lessonId} data-video={video.asset_id} data-captions={captions?.asset_id} /> }))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('not-found') } }))

const lesson = { id: 'lesson', course_id: 'course', version_id: 'version', title: 'Właściwy program', order_index: 0, content_md: 'Treść do sprawdzenia', video_url: null, estimated_minutes: 15, unlock_after_days: 0,
    attachments: [
        { asset_id: 'pdf', name: 'Instrukcja.pdf', storage_path: 'course/pdf/file.pdf', mime_type: 'application/pdf', size_bytes: 100 },
        { asset_id: 'video', name: 'Nagranie.mp4', storage_path: 'course/video/file.mp4', mime_type: 'video/mp4', size_bytes: 100 },
        { asset_id: 'captions', name: 'Napisy.vtt', storage_path: 'course/captions/file.vtt', mime_type: 'text/vtt', size_bytes: 100 },
    ],
} as CourseLesson
const course: CourseDetail = {
    id: 'course', author_id: 'author', slug: 'program', version_id: 'version', submission_id: 'rendered-submission', version_number: 2,
    title: 'Szkolenie do sprawdzenia', description: 'Cel szkolenia', cover_image_url: null, category: 'IT', tags: [], level: 'beginner', duration_minutes: 15,
    delivery_mode: 'self_paced', status: 'pending_review', course_type: 'consultant', is_official: false,
    rejection_reason: null, reviewed_by: null, reviewed_at: null, published_at: null,
    avg_rating: 0, ratings_count: 0, enrollments_count: 0, completions_count: 0, created_at: '2026-09-22T10:00:00Z', updated_at: '2026-09-22T10:00:00Z',
    prerequisite_course_ids: [], author_name: 'Autorka', author_avatar_url: null, lessons: [lesson], quiz_questions_count: 0, is_enrolled: false, user_rating: null,
    completion_rules: { quiz_required: true, quiz_pass_percent: 80, require_all_lessons: true, attendance_percent: 80 },
}
beforeEach(() => {
    vi.mocked(getCourseDetail).mockResolvedValue({ success: true, data: course })
    vi.mocked(getCourseLessons).mockResolvedValue({ success: true, data: [lesson] })
    vi.mocked(getCourseQuizForAuthor).mockResolvedValue({ success: true, data: [] })
    vi.mocked(canReviewCourseVersion).mockResolvedValue({ success: true, data: true })
})
afterEach(cleanup)
async function show(legacy = false) { render(await AdminCourseReviewPage({ params: { id: 'course' }, searchParams: legacy ? { legacy: '1' } : {} })) }
describe('complete administrator moderation preview', () => {
    it('exposes scoped PDF links, video with captions, content and completion rules before a decision', async () => {
        await show()
        expect(screen.getByRole('link', { name: /Instrukcja.pdf/ })).toHaveAttribute('href', '/api/akademia/attachment?lessonId=lesson&assetId=pdf')
        expect(screen.getByTestId('review-video')).toHaveAttribute('data-lesson', 'lesson')
        expect(screen.getByTestId('review-video')).toHaveAttribute('data-video', 'video')
        expect(screen.getByTestId('review-video')).toHaveAttribute('data-captions', 'captions')
        expect(screen.getByText('Treść do sprawdzenia')).toBeInTheDocument()
        expect(screen.getByText(/Quiz: przynajmniej 80%/)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Zatwierdź i opublikuj' })).toBeEnabled()
        expect(screen.getByRole('button', { name: 'Zatwierdź i opublikuj' })).toHaveAttribute('data-submission', 'rendered-submission')
    })
    it.each(['lessons', 'quiz', 'permission'])('blocks publication if %s cannot be loaded', async failed => {
        if (failed === 'lessons') vi.mocked(getCourseLessons).mockResolvedValue({ success: false, error: 'Temporary read failure' })
        if (failed === 'quiz') vi.mocked(getCourseQuizForAuthor).mockResolvedValue({ success: false, error: 'Temporary read failure' })
        if (failed === 'permission') vi.mocked(canReviewCourseVersion).mockResolvedValue({ success: false, error: 'Temporary read failure' })
        await show()
        expect(screen.getByRole('alert')).toHaveTextContent('Decyzja jest zablokowana')
        expect(screen.queryByRole('button', { name: 'Zatwierdź i opublikuj' })).not.toBeInTheDocument()
        expect(screen.queryByTestId('review-video')).not.toBeInTheDocument()
    })
    it('blocks a normal decision when the rendered detail lacks a submission token', async () => {
        vi.mocked(getCourseDetail).mockResolvedValue({ success: true, data: { ...course, submission_id: null } })
        await show()
        expect(screen.queryByRole('button', { name: 'Zatwierdź i opublikuj' })).not.toBeInTheDocument()
    })
    it('keeps an author administrator unable to approve their own fully loaded program', async () => {
        vi.mocked(canReviewCourseVersion).mockResolvedValue({ success: true, data: false })
        await show()
        expect(screen.getByRole('button', { name: 'Zatwierdź i opublikuj' })).toBeDisabled()
    })
    it('loads legacy published evidence explicitly rather than a working draft', async () => {
        await show(true)
        expect(getCourseDetail).toHaveBeenCalledWith('course', { publishedOnly: true })
        expect(getCourseLessons).toHaveBeenCalledWith('course', { publishedOnly: true })
        expect(getCourseQuizForAuthor).toHaveBeenCalledWith('course', { publishedOnly: true })
    })
})
