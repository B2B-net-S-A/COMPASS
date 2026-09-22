import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AcademyVideo } from '../AcademyVideo'

const video = { asset_id: 'video-id', name: 'Warsztat.mp4', storage_path: 'private/video.mp4', size_bytes: 1000 }
const fetchMock = vi.fn()
const response = (url = 'https://storage.example.test/video.mp4?token=first') => ({ ok: true, json: async () => ({ url, expiresIn: 300 }) })

beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal('fetch', fetchMock); fetchMock.mockReset() })
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })

it('renews expiring URLs, preserving playback position and paused state', async () => {
    fetchMock.mockResolvedValueOnce(response()).mockResolvedValueOnce(response('https://storage.example.test/video.mp4?token=renewed'))
    const { container } = render(<AcademyVideo lessonId="lesson" video={video} />)
    await act(async () => {})
    const first = container.querySelector('video')!
    Object.defineProperty(first, 'currentTime', { configurable: true, value: 91, writable: true })
    Object.defineProperty(first, 'paused', { configurable: true, value: false })
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    await act(async () => { await vi.advanceTimersByTimeAsync(240000) })
    const next = container.querySelector('video')!
    expect(next).not.toBe(first)
    Object.defineProperty(next, 'duration', { configurable: true, value: 600 })
    fireEvent.loadedMetadata(next)
    expect(next.currentTime).toBe(91)
    expect(play).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(next).toHaveAttribute('playsinline')
    play.mockRestore()
})

it('limits automatic recovery after playback errors and offers a manual retry', async () => {
    fetchMock.mockResolvedValue(response())
    const { container } = render(<AcademyVideo lessonId="lesson" video={video} />)
    await act(async () => {})
    await act(async () => { fireEvent.error(container.querySelector('video')!) })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await act(async () => { fireEvent.error(container.querySelector('video')!) })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('alert')).toHaveTextContent('Nie można odtworzyć')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Spróbuj ponownie' })) })
    expect(fetchMock).toHaveBeenCalledTimes(3)
})

it('allows video playback when optional captions fail and cancels scheduled refresh on unmount', async () => {
    fetchMock.mockResolvedValueOnce(response()).mockResolvedValueOnce({ ok: false, status: 503 })
    const { container, unmount } = render(<AcademyVideo lessonId="lesson" video={video} captions={{ ...video, asset_id: 'captions-id', name: 'Napisy.vtt' }} />)
    await act(async () => {})
    expect(container.querySelector('video')).toBeInTheDocument()
    expect(screen.getByText(/Nie udało się wczytać napisów/)).toBeInTheDocument()
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal
    unmount()
    expect(signal.aborted).toBe(true)
    await act(async () => { await vi.advanceTimersByTimeAsync(300000) })
    expect(fetchMock).toHaveBeenCalledTimes(2)
})

it('does not create a signed URL retry loop on denied access', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403 })
    render(<AcademyVideo lessonId="lesson" video={video} />)
    await act(async () => {})
    expect(screen.getByRole('alert')).toHaveTextContent('nie masz już do niego dostępu')
    await act(async () => { await vi.advanceTimersByTimeAsync(600000) })
    expect(fetchMock).toHaveBeenCalledTimes(1)
})
