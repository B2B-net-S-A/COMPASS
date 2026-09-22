import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MaterialUploader } from '../MaterialUploader'

const mocks = vi.hoisted(() => ({
    prepare: vi.fn(), finish: vi.fn(), lessons: vi.fn(), runs: vi.fn(), discard: vi.fn(), upload: vi.fn(),
}))
vi.mock('@/lib/actions/academy-materials', () => ({
    prepareAcademyUpload: mocks.prepare, finishAcademyUpload: mocks.finish,
    listAcademyLessonUploads: mocks.lessons, listAcademyRunMaterials: mocks.runs, discardAcademyUpload: mocks.discard,
}))
vi.mock('@/lib/academy/resumable-upload', () => ({ uploadAcademyFile: mocks.upload }))

const courseId = '40000000-0000-4000-8000-000000000001'
const lessonId = '20000000-0000-4000-8000-000000000001'
const runId = '20000000-0000-4000-8000-000000000002'
const assetId = '30000000-0000-4000-8000-000000000001'
const file = new File(['%PDF-1.7 harmless test'], 'lesson.pdf', { type: 'application/pdf', lastModified: 1234 })
const prepared = {
    assetId, userId: 'user', storagePath: `${courseId}/${assetId}/lesson.pdf`, status: 'uploading',
    token: 'test-upload-token', endpoint: 'https://project.storage.supabase.co/storage/v1/upload/resumable/sign',
}

beforeEach(() => {
    mocks.prepare.mockReset().mockResolvedValue({ success: true, data: prepared })
    mocks.finish.mockReset().mockResolvedValue({ success: true })
    mocks.lessons.mockReset().mockResolvedValue({ success: true, data: [] })
    mocks.runs.mockReset().mockResolvedValue({ success: true, data: [] })
    mocks.upload.mockReset().mockResolvedValue(undefined)
    mocks.discard.mockReset().mockResolvedValue({ success: true })
})
afterEach(cleanup)

describe('Academy upload finalization recovery', () => {
    it.each(['lesson', 'run'] as const)('shows the safe actionable MP4 rejection for a %s', async scope => {
        const list = scope === 'lesson' ? mocks.lessons : mocks.runs
        const message = 'Segmentowane nagrania MP4 nie są obsługiwane. Wyeksportuj pojedynczy plik MP4 z obrazem H.264 i dźwiękiem AAC-LC.'
        list.mockResolvedValue({ success: true, data: [{ id: assetId, filename: 'video.mp4', status: 'rejected', error: message }] })
        render(<MaterialUploader courseId={courseId} {...(scope === 'lesson' ? { lessonId } : { runId })} onReady={vi.fn()} />)
        expect(await screen.findByText(message)).toBeInTheDocument()
        expect(screen.getByText(/jedna ścieżka obrazu i najwyżej jedna dźwięku AAC-LC/)).toBeInTheDocument()
    })
    it.each(['lesson', 'run'] as const)('reuses the reserved %s asset after a lost finalization response without uploading a duplicate', async scope => {
        const onReady = vi.fn()
        const scopeProps = scope === 'lesson' ? { lessonId } : { runId }
        const list = scope === 'lesson' ? mocks.lessons : mocks.runs
        mocks.finish.mockResolvedValueOnce({ success: false, error: 'Utracono odpowiedź finalizacji.' })
        render(<MaterialUploader courseId={courseId} {...scopeProps} onReady={onReady} />)
        await waitFor(() => expect(list).toHaveBeenCalledTimes(1))
        const input = screen.getByLabelText('Dodaj materiał lub wznów przesyłanie')
        fireEvent.change(input, { target: { files: [file] } })
        await screen.findByText('Utracono odpowiedź finalizacji.')
        expect(mocks.upload).toHaveBeenCalledTimes(1)
        expect(mocks.finish).toHaveBeenCalledExactlyOnceWith(assetId)

        // Reservation RPC reconciles an existing complete Storage object with its DB asset.
        // The second browser attempt must honor that reconciled state, not send the bytes again.
        mocks.prepare.mockResolvedValueOnce({ success: true, data: { ...prepared, status: 'quarantined', token: null } })
        list.mockResolvedValueOnce({ success: true, data: [{ id: assetId, filename: file.name, status: 'quarantined' }] })
        fireEvent.change(input, { target: { files: [file] } })
        await screen.findByText('Oczekuje na weryfikację')
        await waitFor(() => expect(input).not.toBeDisabled())
        expect(mocks.prepare).toHaveBeenCalledTimes(2)
        expect(mocks.prepare.mock.calls[0][0]).toEqual(mocks.prepare.mock.calls[1][0])
        expect(mocks.prepare.mock.calls[1][0]).toEqual({
            courseId, lessonId: scope === 'lesson' ? lessonId : undefined, runId: scope === 'run' ? runId : undefined,
            filename: file.name, mimeType: 'application/pdf', sizeBytes: file.size, fileModifiedAt: file.lastModified,
        })
        expect(mocks.upload).toHaveBeenCalledTimes(1)
        expect(mocks.finish).toHaveBeenCalledTimes(1)
        expect(screen.queryByRole('alert')).not.toBeInTheDocument()
        expect(onReady).not.toHaveBeenCalled()
    })

    it('recognizes an already scanned asset after reconnecting without requiring an upload token', async () => {
        const onReady = vi.fn()
        mocks.prepare.mockResolvedValueOnce({ success: true, data: { ...prepared, status: 'ready', token: null } })
        render(<MaterialUploader courseId={courseId} lessonId={lessonId} onReady={onReady} />)
        await waitFor(() => expect(mocks.lessons).toHaveBeenCalledTimes(1))
        fireEvent.change(screen.getByLabelText('Dodaj materiał lub wznów przesyłanie'), { target: { files: [file] } })
        await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1))
        expect(mocks.upload).not.toHaveBeenCalled()
        expect(mocks.finish).not.toHaveBeenCalled()
        expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
})
