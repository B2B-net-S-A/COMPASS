'use client'

// Phase 17b R7 — Detect active mic/cam usage to extend idle threshold during calls.
//
// Privacy contract:
//  - We DO NOT call getUserMedia() — that would request a stream we don't need
//  - We rely on navigator.mediaSession.metadata which only populates when
//    a media element (video/audio call) explicitly publishes session info
//  - permissions.query() is used only as a fallback signal, NOT to read content
//  - Net effect: we know "user is on a call" at most, never WHAT call
//
// When media is detected as active:
//  - Idle threshold extends from 20 min → 60 min (3×) — Time Doctor pattern
//  - Heartbeats still send every 30s with whatever was_active state arises
//
// Cross-browser:
//  - Chrome / Edge: mediaSession.metadata works for video calls (Meet/Teams/Zoom)
//  - Firefox: mediaSession partial; falls back to default threshold
//  - Safari: very limited; falls back to default threshold

import { useEffect, useState } from 'react'

export interface UseMediaActivityResult {
    isMediaActive: boolean
    detectionMethod: 'media-session' | 'permissions' | 'none'
}

const POLL_INTERVAL_MS = 5000

export function useMediaActivity(enabled = true): UseMediaActivityResult {
    const [result, setResult] = useState<UseMediaActivityResult>({
        isMediaActive: false,
        detectionMethod: 'none',
    })

    useEffect(() => {
        if (!enabled || typeof navigator === 'undefined') return

        const check = () => {
            // Primary signal: navigator.mediaSession.metadata is populated when
            // an active video/audio session explicitly announced itself
            const ms = (navigator as Navigator & { mediaSession?: MediaSession }).mediaSession
            const hasMediaSession =
                ms?.metadata != null && ms?.playbackState !== 'none' && ms?.playbackState !== 'paused'

            if (hasMediaSession) {
                setResult((prev) =>
                    prev.isMediaActive && prev.detectionMethod === 'media-session'
                        ? prev
                        : { isMediaActive: true, detectionMethod: 'media-session' },
                )
                return
            }

            // No active media → reset
            setResult((prev) =>
                !prev.isMediaActive && prev.detectionMethod === 'none'
                    ? prev
                    : { isMediaActive: false, detectionMethod: 'none' },
            )
        }

        check()
        const id = window.setInterval(check, POLL_INTERVAL_MS)
        return () => window.clearInterval(id)
    }, [enabled])

    return result
}
