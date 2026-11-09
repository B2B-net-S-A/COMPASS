import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AcademyVideo } from '../AcademyVideo'
import { MAX_RECOVERY_ATTEMPTS, STALL_TIMEOUT_MS } from '@/lib/academy/video-playback'

const chapterList = vi.fn()
vi.mock('@/lib/actions/academy-video-chapters', () => ({ listVideoChapters: (...args: unknown[]) => chapterList(...args) }))
beforeEach(() => { chapterList.mockReset(); chapterList.mockResolvedValue({ success: true, data: { available: true, chapters: [] } }) })

const video = { asset_id: 'video-id', name: 'Warsztat.mp4', storage_path: 'private/video.mp4', size_bytes: 1000 }
const fetchMock = vi.fn()
const response = (url = 'https://storage.example.test/video.mp4?token=first') => ({ ok: true, json: async () => ({ url, expiresIn: 300 }) })
const mediaError = async (container: HTMLElement) => { await act(async () => { fireEvent.error(container.querySelector('video')!) }); await act(async () => { await vi.advanceTimersByTimeAsync(31000) }) }

beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal('fetch', fetchMock); fetchMock.mockReset() })
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })

it('lists chapters and jumps to one on click', async () => {
    chapterList.mockResolvedValue({ success: true, data: { available: true, chapters: [{ position_seconds: 0, title: 'Wstęp' }, { position_seconds: 90, title: 'Główna część' }] } })
    fetchMock.mockResolvedValue(response())
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    const { container } = render(<AcademyVideo lessonId="lesson" video={video} />)
    await act(async () => {})
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /1:30\s*Główna część/ })) })
    expect(container.querySelector('video')!.currentTime).toBe(90)
    expect(play).toHaveBeenCalled()
    play.mockRestore()
})

it('still plays when chapters cannot be loaded and skips them for audio', async () => {
    chapterList.mockRejectedValue(new Error('down'))
    fetchMock.mockResolvedValue(response())
    const { container } = render(<AcademyVideo lessonId="lesson" video={video} />)
    await act(async () => {})
    expect(container.querySelector('video')).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Rozdziały nagrania' })).toBeNull()
    cleanup()
    chapterList.mockClear()
    render(<AcademyVideo runId="run" video={video} audio />)
    await act(async () => {})
    expect(chapterList).not.toHaveBeenCalled()
})

it('does not recreate a playing element when the signed URL ages', async () => {
    fetchMock.mockResolvedValue(response())
    const { container } = render(<AcademyVideo lessonId="lesson" video={video} />)
    await act(async () => {})
    const first = container.querySelector('video')!
    await act(async () => { await vi.advanceTimersByTimeAsync(3 * 60 * 60 * 1000) })
    expect(container.querySelector('video')).toBe(first)
    expect(fetchMock).toHaveBeenCalledTimes(1)
})

it('renews the URL after an error, preserving position, paused state and speed', async () => {
    fetchMock.mockResolvedValueOnce(response()).mockResolvedValueOnce(response('https://storage.example.test/video.mp4?token=renewed'))
    const { container } = render(<AcademyVideo lessonId="lesson" video={video} />)
    await act(async () => {})
    const first = container.querySelector('video')!
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '1.5' } })
    expect(first.playbackRate).toBe(1.5)
    Object.defineProperty(first, 'currentTime', { configurable: true, value: 91, writable: true })
    Object.defineProperty(first, 'paused', { configurable: true, value: false })
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    await act(async () => { fireEvent.error(first); await vi.advanceTimersByTimeAsync(0) })
    const next = container.querySelector('video')!
    expect(next).not.toBe(first)
    expect(next.src).toContain('renewed')
    Object.defineProperty(next, 'duration', { configurable: true, value: 600 })
    fireEvent.loadedMetadata(next)
    expect(next.currentTime).toBe(91)
    expect(next.playbackRate).toBe(1.5)
    expect(play).toHaveBeenCalledTimes(1)
    expect(next).toHaveAttribute('playsinline')
    play.mockRestore()
})

it('survives repeated network errors far apart in a long recording', async () => {
    fetchMock.mockResolvedValue(response())
    const { container } = render(<AcademyVideo lessonId="lesson" video={video} />)
    await act(async () => {})
    for (let cycle = 1; cycle <= MAX_RECOVERY_ATTEMPTS * 2; cycle++) {
        const element = container.querySelector('video')!
        Object.defineProperty(element, 'currentTime', { configurable: true, value: cycle * 600, writable: true })
        await mediaError(container)
        const resumed = container.querySelector('video')!
        Object.defineProperty(resumed, 'currentTime', { configurable: true, value: cycle * 600 + 30, writable: true })
        fireEvent.timeUpdate(resumed)
    }
    expect(screen.queryByRole('alert')).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1 + MAX_RECOVERY_ATTEMPTS * 2)
})

it('recovers from a silent stall, but not while data keeps arriving', async () => {
    fetchMock.mockResolvedValue(response())
    const { container } = render(<AcademyVideo lessonId="lesson" video={video} />)
    await act(async () => {})
    const element = container.querySelector('video')!
    fireEvent.loadedMetadata(element)
    fireEvent.waiting(element)
    for (let i = 0; i < 4; i++) { await act(async () => { await vi.advanceTimersByTimeAsync(STALL_TIMEOUT_MS - 1000) }); fireEvent.progress(element) }
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(STALL_TIMEOUT_MS + 1000) })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(container.querySelector('video')).not.toBe(element)
})

it('does not treat a resumed player or a completed seek as a stall', async () => {
    fetchMock.mockResolvedValue(response())
    const { container } = render(<AcademyVideo lessonId="lesson" video={video} />)
    await act(async () => {})
    const element = container.querySelector('video')!
    fireEvent.loadedMetadata(element)
    fireEvent.waiting(element)
    fireEvent.playing(element)
    fireEvent.seeking(element)
    fireEvent.seeked(element)
    await act(async () => { await vi.advanceTimersByTimeAsync(STALL_TIMEOUT_MS * 3) })
    expect(fetchMock).toHaveBeenCalledTimes(1)
})

it('stops after the budget when the file never plays, then offers a manual retry', async () => {
    fetchMock.mockResolvedValue(response())
    const { container } = render(<AcademyVideo lessonId="lesson" video={video} />)
    await act(async () => {})
    for (let attempt = 0; attempt < MAX_RECOVERY_ATTEMPTS; attempt++) await mediaError(container)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1 + MAX_RECOVERY_ATTEMPTS)
    await act(async () => { fireEvent.error(container.querySelector('video')!) })
    expect(fetchMock).toHaveBeenCalledTimes(1 + MAX_RECOVERY_ATTEMPTS)
    expect(screen.getByRole('alert')).toHaveTextContent('Nie można odtworzyć')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Spróbuj ponownie' })) })
    expect(fetchMock).toHaveBeenCalledTimes(2 + MAX_RECOVERY_ATTEMPTS)
})

it('keeps retrying through an outage when the URL request itself fails, and resumes on reconnect', async () => {
    fetchMock.mockResolvedValueOnce(response())
    const { container } = render(<AcademyVideo lessonId="lesson" video={video} />)
    await act(async () => {})
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await act(async () => { fireEvent.error(container.querySelector('video')!); await vi.advanceTimersByTimeAsync(0) })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText(/Połączenie przerwane/)).toBeInTheDocument()
    const calls = fetchMock.mock.calls.length
    fetchMock.mockResolvedValue(response('https://storage.example.test/video.mp4?token=back'))
    await act(async () => { window.dispatchEvent(new Event('online')); await vi.advanceTimersByTimeAsync(0) })
    expect(fetchMock.mock.calls.length).toBe(calls + 1)
    expect(container.querySelector('video')!.src).toContain('back')
    expect(screen.queryByText(/Połączenie przerwane/)).toBeNull()
})

it('stops at once when access was withdrawn during recovery', async () => {
    fetchMock.mockResolvedValueOnce(response())
    const { container } = render(<AcademyVideo lessonId="lesson" video={video} />)
    await act(async () => {})
    fetchMock.mockResolvedValue({ ok: false, status: 403 })
    await act(async () => { fireEvent.error(container.querySelector('video')!); await vi.advanceTimersByTimeAsync(0) })
    expect(screen.getByRole('alert')).toHaveTextContent('nie masz już do niego dostępu')
    await act(async () => { await vi.advanceTimersByTimeAsync(600000) })
    expect(fetchMock).toHaveBeenCalledTimes(2)
})

it('allows video playback when optional captions fail and aborts on unmount', async () => {
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

it('plays standalone audio and recovers its seek position after an error', async () => {
    fetchMock.mockResolvedValue(response('https://storage.example.test/audio.m4a?token=private'))
    const { container } = render(<AcademyVideo runId="run" video={{ ...video, name: 'Audio.m4a' }} audio />)
    await act(async () => {})
    expect(container.querySelector('video')).toBeNull()
    const first = container.querySelector('audio')!
    expect(first).toHaveAttribute('controls')
    first.currentTime = 77
    await act(async () => { fireEvent.error(first); await vi.advanceTimersByTimeAsync(0) })
    const next = container.querySelector('audio')!
    expect(next).not.toBe(first)
    Object.defineProperty(next, 'duration', { configurable: true, value: 300 })
    fireEvent.loadedMetadata(next)
    expect(next.currentTime).toBe(77)
    expect(fetchMock.mock.calls[0][0]).toContain('runId=run')
})
