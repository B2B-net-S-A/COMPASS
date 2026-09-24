import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { LessonsEditor } from '../LessonsEditor'
import { updateLesson } from '@/lib/actions/courses'
import type { CourseLesson } from '@/lib/types/learning'

vi.mock('@/lib/actions/courses', () => ({ addLesson: vi.fn(), updateLesson: vi.fn(), deleteLesson: vi.fn(), reorderLessons: vi.fn() }))
vi.mock('@/components/academy/MaterialUploader', () => ({ MaterialUploader: () => null }))
vi.mock('@/components/shared/ConfirmDialog', () => ({ useConfirm: () => [vi.fn(), () => null] }))
afterEach(() => { cleanup(); vi.clearAllMocks() })

const attachment = (asset_id: string, mime_type: string, caption_for_asset_id?: string) => ({
    asset_id, name: asset_id, storage_path: `course/${asset_id}`, mime_type, size_bytes: 100, caption_for_asset_id,
})
const lesson: CourseLesson = {
    id: 'lesson', course_id: 'course', order_index: 0, title: 'Lekcja', content_md: null, video_url: null,
    estimated_minutes: 5, unlock_after_days: 0, attachments: [
        attachment('video-1', 'video/mp4'), attachment('video-2', 'video/mp4'),
        attachment('caption-1', 'text/vtt', 'video-1'), attachment('caption-2', 'text/vtt'),
    ],
}

it('lets the author explicitly link the second VTT to the second video', async () => {
    vi.mocked(updateLesson).mockResolvedValue({ success: true, data: { courseId: 'course' } })
    render(<LessonsEditor courseId="course" initialLessons={[lesson]} />)
    const target = screen.getByLabelText('Nagranie dla napisów caption-2')
    expect(target).toHaveValue('')
    expect(screen.getByLabelText('Nagranie dla napisów caption-1')).toHaveValue('video-1')
    fireEvent.change(target, { target: { value: 'video-2' } })
    await waitFor(() => expect(updateLesson).toHaveBeenCalledWith('lesson', expect.objectContaining({ attachments: [
        lesson.attachments[0], lesson.attachments[1], lesson.attachments[2],
        expect.objectContaining({ asset_id: 'caption-2', caption_for_asset_id: 'video-2' }),
    ] })))
})

it('detaches the linked VTT when its recording is removed from the draft', async () => {
    vi.mocked(updateLesson).mockResolvedValue({ success: true, data: { courseId: 'course' } })
    render(<LessonsEditor courseId="course" initialLessons={[lesson]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Usuń załącznik video-1' }))
    await waitFor(() => expect(updateLesson).toHaveBeenCalledWith('lesson', expect.objectContaining({ attachments: [
        lesson.attachments[1],
        expect.objectContaining({ asset_id: 'caption-1', caption_for_asset_id: null }),
        lesson.attachments[3],
    ] })))
})
