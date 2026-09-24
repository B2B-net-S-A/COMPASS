import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { LessonPlayer } from '../LessonPlayer'
import type { CourseLesson } from '@/lib/types/learning'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/components/academy/useAcademyAction', () => ({ useAcademyAction: () => [false, vi.fn()] }))
vi.mock('@/components/academy/AcademyVideo', () => ({ AcademyVideo: ({ video, captions }: { video: { asset_id: string }; captions?: { asset_id: string } }) =>
    <div data-testid={`learner-video-${video.asset_id}`} data-caption={captions?.asset_id ?? ''} /> }))
vi.mock('@/components/academy/CourseCompletion', () => ({ CourseCompletion: () => null }))

afterEach(cleanup)

const attachment = (id: string, mime_type: string, caption_for_asset_id?: string) => ({
    asset_id: id, name: id, storage_path: `course/${id}`, size_bytes: 100, mime_type, caption_for_asset_id,
})
const lesson: CourseLesson = {
    id: 'lesson', course_id: 'course', title: 'Dwa nagrania', order_index: 0,
    content_md: null, video_url: null, estimated_minutes: 20, unlock_after_days: 0,
    attachments: [
        attachment('video-1', 'video/mp4'), attachment('video-2', 'video/mp4'),
        attachment('caption-2', 'text/vtt', 'video-2'), attachment('caption-1', 'text/vtt', 'video-1'),
    ],
}

it('plays the correct VTT with each video in a multi-video lesson', () => {
    render(<LessonPlayer courseId="course" courseSlug="kurs" lesson={lesson} allLessons={[lesson]}
        completedLessonIds={[]} quizAvailable={false} enrollmentId="enrollment" />)
    expect(screen.getByTestId('learner-video-video-1')).toHaveAttribute('data-caption', 'caption-1')
    expect(screen.getByTestId('learner-video-video-2')).toHaveAttribute('data-caption', 'caption-2')
})

it('does not guess a caption for either video when an old multi-video lesson has no links', () => {
    const unlinked = { ...lesson, attachments: lesson.attachments.map(({ caption_for_asset_id, ...item }) => item) }
    render(<LessonPlayer courseId="course" courseSlug="kurs" lesson={unlinked} allLessons={[unlinked]}
        completedLessonIds={[]} quizAvailable={false} enrollmentId="enrollment" />)
    expect(screen.getByTestId('learner-video-video-1')).toHaveAttribute('data-caption', '')
    expect(screen.getByTestId('learner-video-video-2')).toHaveAttribute('data-caption', '')
})

it('preserves only a legacy one-to-one pair and respects an explicit unassignment', () => {
    const oldPair = { ...lesson, attachments: [attachment('video-1', 'video/mp4'),
        { asset_id: 'caption-1', name: 'caption-1', storage_path: 'course/caption-1', mime_type: 'text/vtt', size_bytes: 100 }] }
    const { rerender } = render(<LessonPlayer courseId="course" courseSlug="kurs" lesson={oldPair} allLessons={[oldPair]}
        completedLessonIds={[]} quizAvailable={false} enrollmentId="enrollment" />)
    expect(screen.getByTestId('learner-video-video-1')).toHaveAttribute('data-caption', 'caption-1')
    const detached = { ...oldPair, attachments: [oldPair.attachments[0], { ...oldPair.attachments[1], caption_for_asset_id: null }] }
    rerender(<LessonPlayer courseId="course" courseSlug="kurs" lesson={detached} allLessons={[detached]}
        completedLessonIds={[]} quizAvailable={false} enrollmentId="enrollment" />)
    expect(screen.getByTestId('learner-video-video-1')).toHaveAttribute('data-caption', '')
})
