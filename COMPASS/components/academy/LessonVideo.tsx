'use client'

import { useCallback, useEffect, useRef } from 'react'
import { AcademyVideo, type PlaybackEvent } from './AcademyVideo'
import { saveVideoProgress, type VideoProgressResult } from '@/lib/actions/academy-video-progress'
import { PROGRESS_SAVE_INTERVAL_MS, resumePosition, WatchTracker } from '@/lib/academy/video-progress'
import type { CourseAttachment } from '@/lib/types/learning'

interface Props {
    lessonId: string
    enrollmentId: string
    video: CourseAttachment & { asset_id: string }
    captions?: CourseAttachment
    saved?: { position: number; duration: number }
    onResult: (result: VideoProgressResult) => void
    onEnded?: () => void
}

/** Connects the player to the saved position and reports what was actually watched. */
export function LessonVideo({ lessonId, enrollmentId, video, captions, saved, onResult, onEnded }: Props) {
    const tracker = useRef(new WatchTracker())
    const element = useRef<HTMLMediaElement | null>(null)
    const lastSave = useRef(0)
    const saving = useRef(false)
    const stopped = useRef(false)
    const report = useRef(onResult)
    report.current = onResult

    const flush = useCallback(async () => {
        const media = element.current
        if (!media || saving.current || stopped.current || !Number.isFinite(media.duration) || media.duration <= 0) return
        saving.current = true
        lastSave.current = Date.now()
        const ranges = tracker.current.take()
        try {
            const result = await saveVideoProgress({ enrollmentId, lessonId, assetId: video.asset_id, position: media.currentTime, duration: media.duration, ranges })
            // result may be undefined when a stale tab calls an action from an older deploy.
            if (result?.success && result.data.available && result.data.accepted) tracker.current.confirm()
            else tracker.current.restore()
            if (result?.success && !result.data.available) stopped.current = true
            if (result?.success) report.current(result.data)
        } catch {
            tracker.current.restore()
        } finally {
            saving.current = false
        }
    }, [enrollmentId, lessonId, video.asset_id])

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
        if (event === 'idle') {
            void flush()
            if (media.ended) onEnded?.()
            return
        }
        tracker.current.sample(media.currentTime)
        if (Date.now() - lastSave.current >= PROGRESS_SAVE_INTERVAL_MS) void flush()
    }

    return <AcademyVideo lessonId={lessonId} video={video} captions={captions} startAt={resumePosition(saved?.position, saved?.duration)} onPlaybackEvent={handleEvent} />
}
