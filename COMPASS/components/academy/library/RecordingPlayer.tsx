'use client'

import { useCallback, useEffect, useRef } from 'react'
import { AcademyVideo, type PlaybackEvent } from '@/components/academy/AcademyVideo'
import { saveRecordingProgress } from '@/lib/actions/academy-recordings'
import { PROGRESS_SAVE_INTERVAL_MS, resumePosition, WatchTracker } from '@/lib/academy/video-progress'

interface RecordingPlayerProps {
    runId: string
    assetId: string
    filename: string
    sizeBytes?: number
    captionAssetId?: string | null
    saved?: { position: number; duration: number | null }
}

/** Nagranie edycji w bibliotece: ten sam odtwarzacz co lekcja, pozycja zapisywana bez zaliczania modułu. */
export function RecordingPlayer({ runId, assetId, filename, sizeBytes = 0, captionAssetId, saved }: RecordingPlayerProps) {
    const tracker = useRef(new WatchTracker())
    const element = useRef<HTMLMediaElement | null>(null)
    const lastSave = useRef(0)
    const saving = useRef(false)
    const stopped = useRef(false)

    const flush = useCallback(async () => {
        const media = element.current
        if (!media || saving.current || stopped.current || !Number.isFinite(media.duration) || media.duration <= 0) return
        saving.current = true
        lastSave.current = Date.now()
        const ranges = tracker.current.take()
        try {
            const result = await saveRecordingProgress({ assetId, position: media.currentTime, duration: media.duration, ranges })
            // result bywa undefined, gdy stara karta woła akcję sprzed wdrożenia.
            if (result?.success && result.data.available && result.data.accepted) tracker.current.confirm()
            else tracker.current.restore()
            // Przed migracją kroku 2 nie ma gdzie zapisać pozycji; nagranie gra dalej.
            if (result?.success && !result.data.available) stopped.current = true
        } catch {
            tracker.current.restore()
        } finally {
            saving.current = false
        }
    }, [assetId])

    useEffect(() => {
        const hide = () => { if (document.visibilityState === 'hidden') void flush() }
        document.addEventListener('visibilitychange', hide)
        return () => {
            document.removeEventListener('visibilitychange', hide)
            void flush()
        }
    }, [flush])

    function handleEvent(event: PlaybackEvent, media: HTMLMediaElement) {
        element.current = media
        if (event === 'seek') return tracker.current.interrupt()
        if (event === 'idle') return void flush()
        tracker.current.sample(media.currentTime)
        if (Date.now() - lastSave.current >= PROGRESS_SAVE_INTERVAL_MS) void flush()
    }

    const video = { asset_id: assetId, name: filename, storage_path: '', size_bytes: sizeBytes, mime_type: 'video/mp4' }
    const captions = captionAssetId ? { asset_id: captionAssetId, name: 'Napisy', storage_path: '', size_bytes: 0, mime_type: 'text/vtt' } : undefined
    return <AcademyVideo key={assetId} runId={runId} video={video} captions={captions} startAt={resumePosition(saved?.position, saved?.duration ?? undefined)} onPlaybackEvent={handleEvent} />
}
