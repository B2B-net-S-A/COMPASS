import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { LessonPlayer } from '../LessonPlayer'
import type { VideoProgressResult } from '@/lib/actions/academy-video-progress'
import type { CourseLesson } from '@/lib/types/learning'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('@/components/academy/useAcademyAction', () => ({ useAcademyAction: () => [false, vi.fn()] }))
vi.mock('@/components/academy/CourseCompletion', () => ({ CourseCompletion: () => null }))
vi.mock('@/lib/actions/course-learning', () => ({ markLessonComplete: vi.fn() }))
vi.mock('@/lib/actions/academy-video-progress', () => ({ saveVideoProgress: vi.fn() }))
vi.mock('@/components/academy/AcademyVideo', () => ({ AcademyVideo: ({ video }: { video: { asset_id: string } }) => <div data-testid={`plain-${video.asset_id}`} /> }))
let reportResult: ((result: VideoProgressResult) => void) | undefined
vi.mock('@/components/academy/LessonVideo', () => ({ LessonVideo: ({ video, saved, onResult }: { video: { asset_id: string }; saved?: { position: number }; onResult: (result: VideoProgressResult) => void }) => { reportResult = onResult; return <div data-testid={`tracked-${video.asset_id}`} data-position={saved?.position ?? ''} /> } }))

afterEach(() => { cleanup(); refresh.mockClear() })

const video = { asset_id: 'video-1', name: 'video', storage_path: 'c/v', size_bytes: 100, mime_type: 'video/mp4' }
const base: CourseLesson = { id: 'lesson', course_id: 'course', title: 'Moduł', order_index: 0, content_md: null, video_url: null, estimated_minutes: 20, unlock_after_days: 0, attachments: [video] }
const show = (lesson: CourseLesson, extra: Partial<Parameters<typeof LessonPlayer>[0]> = {}) => render(<LessonPlayer courseId="course" courseSlug="kurs" lesson={lesson} allLessons={[lesson]} completedLessonIds={[]} quizAvailable={false} enrollmentId="enrollment" {...extra} />)
const button = () => screen.queryByRole('button', { name: 'Oznacz jako ukończoną' })

it('hides the manual button on a recording and passes the saved position', () => {
    show(base, { videoProgress: { available: true, items: { 'video-1': { position: 120, duration: 600 } } } })
    expect(button()).toBeNull()
    expect(screen.getByTestId('tracked-video-1')).toHaveAttribute('data-position', '120')
    expect(screen.getByText(/zaliczy się automatycznie po obejrzeniu 90%/)).toBeInTheDocument()
})

it('uses the threshold configured for the version', () => {
    show(base, { videoProgress: { available: true, items: {} }, videoWatchPercent: 75 })
    expect(screen.getByText(/obejrzeniu 75%/)).toBeInTheDocument()
})

it('labels the parts of one session and leaves a single recording unlabelled', () => {
    const { unmount } = show({ ...base, attachments: [video, { ...video, asset_id: 'video-2', name: 'part2' }] }, { videoProgress: { available: true, items: {} } })
    expect(screen.getByText('Część 1 z 2')).toBeInTheDocument()
    expect(screen.getByText('Część 2 z 2')).toBeInTheDocument()
    unmount()
    show(base, { videoProgress: { available: true, items: {} } })
    expect(screen.queryByText(/Część 1/)).toBeNull()
})

it('keeps the manual button until the migration is applied', () => {
    show(base, { videoProgress: { available: false, items: {} } })
    expect(button()).toBeInTheDocument()
    expect(screen.getByTestId('plain-video-1')).toBeInTheDocument()
})

it('keeps the manual button for a lesson without a recording', () => {
    show({ ...base, attachments: [], content_md: 'Tekst' }, { videoProgress: { available: true, items: {} } })
    expect(button()).toBeInTheDocument()
})

it('marks the lesson done when the server completes it and shows progress before that', () => {
    show(base, { videoProgress: { available: true, items: {} } })
    act(() => reportResult!({ available: true, accepted: true, completed: false, watchedPercent: 42, streak: null }))
    expect(screen.getByText(/obejrzano 42%/)).toBeInTheDocument()
    expect(refresh).not.toHaveBeenCalled()
    act(() => reportResult!({ available: true, accepted: true, completed: true, watchedPercent: 91, streak: null }))
    expect(screen.getByRole('button', { name: 'Lekcja ukończona' })).toBeDisabled()
    expect(refresh).toHaveBeenCalledTimes(1)
})
