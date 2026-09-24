import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { RunMaterials } from '../RunMaterials'

const mocks = vi.hoisted(() => ({ list: vi.fn(), assign: vi.fn(), review: vi.fn() }))
vi.mock('@/lib/actions/academy-materials', () => ({
    listAcademyRunMaterials: mocks.list, assignAcademyRunCaption: mocks.assign, reviewAcademyRunMaterial: mocks.review,
}))
vi.mock('../MaterialUploader', () => ({ MaterialUploader: () => null }))
vi.mock('../AcademyVideo', () => ({
    AcademyVideo: ({ video, captions }: { video: { asset_id: string }; captions?: { asset_id: string } }) =>
        <div data-testid={`video-${video.asset_id}`} data-caption={captions?.asset_id ?? ''} />,
}))

const runId = '10000000-0000-4000-8000-000000000001'
const courseId = '20000000-0000-4000-8000-000000000001'
const asset = (id: string, filename: string, mime_type: string, caption_for_asset_id: string | null = null) => ({
    id, filename, mime_type, caption_for_asset_id, storage_path: `course/${id}/${filename}`,
    size_bytes: 100, status: 'ready', review_status: 'published', review_note: null, uploaded_by: 'trainer',
})
const first = asset('video-1', 'Pierwsze nagranie.mp4', 'video/mp4')
const second = asset('video-2', 'Drugie nagranie.mp4', 'video/mp4')
const firstCaption = asset('caption-1', 'Pierwsze napisy.vtt', 'text/vtt', 'video-1')
const secondCaption = asset('caption-2', 'Drugie napisy.vtt', 'text/vtt')

beforeEach(() => {
    mocks.list.mockReset().mockResolvedValue({ success: true, data: [first, second, firstCaption, secondCaption] })
    mocks.assign.mockReset().mockResolvedValue({ success: true })
    mocks.review.mockReset()
})
afterEach(cleanup)

describe('run recording captions', () => {
    it('attaches only the explicitly linked VTT and never guesses by order', async () => {
        render(<RunMaterials runId={runId} courseId={courseId} canManage={false} isAdmin={false} userId="learner" />)
        expect(await screen.findByTestId('video-video-1')).toHaveAttribute('data-caption', 'caption-1')
        expect(screen.getByTestId('video-video-2')).toHaveAttribute('data-caption', '')
        expect(screen.queryByLabelText('Nagranie dla napisów')).not.toBeInTheDocument()
    })

    it('lets an administrator assign a published VTT and refreshes playback mapping', async () => {
        const rows = [first, second, firstCaption, secondCaption]
        mocks.list.mockImplementation(async () => ({ success: true, data: rows }))
        mocks.assign.mockImplementation(async () => {
            rows[3] = { ...secondCaption, caption_for_asset_id: 'video-2' }
            return { success: true }
        })
        render(<RunMaterials runId={runId} courseId={courseId} canManage isAdmin userId="admin" />)
        await screen.findByTestId('video-video-1')
        const selects = screen.getAllByLabelText('Nagranie dla napisów', { selector: 'select', exact: true })
        expect(selects[0]).toHaveValue('video-1')
        expect(selects[1]).toHaveValue('')
        fireEvent.change(selects[1], { target: { value: 'video-2' } })
        await waitFor(() => expect(mocks.assign).toHaveBeenCalledWith({ captionId: 'caption-2', videoId: 'video-2' }))
        await waitFor(() => expect(screen.getByTestId('video-video-2')).toHaveAttribute('data-caption', 'caption-2'))
    })
})
