'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { hasRecovered, MAX_RECOVERY_ATTEMPTS, PLAYBACK_RATES, recoveryDelayMs, STALL_TIMEOUT_MS } from '@/lib/academy/video-playback'
import type { CourseAttachment } from '@/lib/types/learning'

type Props = ({ lessonId: string; runId?: never } | { runId: string; lessonId?: never }) & { video: CourseAttachment; captions?: CourseAttachment; audio?: boolean }
interface SignedSource { url: string; expiresIn: number }
interface PlaybackPosition { time: number; paused: boolean; captions: boolean }

/** A signed URL that was refused will not start working after a retry. */
class AccessDenied extends Error {}

function materialEndpoint(scope: { lessonId?: string; runId?: string }, assetId?: string, path?: string, json = true) {
    return `/api/akademia/attachment?${new URLSearchParams({ ...(scope.runId ? { runId: scope.runId } : { lessonId: scope.lessonId! }), ...(assetId ? { assetId } : { path: path ?? '' }), ...(json ? { format: 'json' } : {}) })}`
}

async function signedSource(endpoint: string, signal: AbortSignal): Promise<SignedSource> {
    const response = await fetch(endpoint, { signal, cache: 'no-store', credentials: 'same-origin' })
    if (response.status === 401 || response.status === 403 || response.status === 404) throw new AccessDenied('Nagranie jest niedostępne lub nie masz już do niego dostępu.')
    if (!response.ok) throw new Error('Nie udało się pobrać nagrania. Sprawdź połączenie i spróbuj ponownie.')
    const data: unknown = await response.json()
    if (!data || typeof data !== 'object' || !('url' in data) || typeof data.url !== 'string' || !('expiresIn' in data) || typeof data.expiresIn !== 'number' || !Number.isFinite(data.expiresIn) || data.expiresIn <= 0) throw new Error('Nie udało się przygotować bezpiecznego odtwarzania.')
    const url = new URL(data.url)
    if (url.protocol !== 'https:') throw new Error('Nie udało się przygotować bezpiecznego odtwarzania.')
    return { url: url.href, expiresIn: data.expiresIn }
}

export function AcademyVideo({ lessonId, runId, video, captions, audio = false }: Props) {
    const player = useRef<HTMLMediaElement | null>(null)
    const refresh = useRef<(manual?: boolean) => void>(() => {})
    const scheduleRecovery = useRef<() => void>(() => {})
    const playback = useRef<PlaybackPosition | null>(null)
    const recovery = useRef({ attempts: 0, errorPosition: 0 })
    const stallTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const failPlayback = useRef<() => void>(() => {})
    const [sources, setSources] = useState<{ video: string; captions?: string; revision: number } | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [captionError, setCaptionError] = useState(false)
    const [resumeMessage, setResumeMessage] = useState(false)
    const [recovering, setRecovering] = useState(false)
    const [rate, setRate] = useState<number>(1)
    const captionAssetId = captions?.asset_id
    const captionPath = captions?.storage_path

    useEffect(() => {
        let disposed = false
        let controller: AbortController | null = null
        let timer: ReturnType<typeof setTimeout> | null = null
        let fetching = false
        let hasSource = false
        let revision = 0
        playback.current = null
        recovery.current = { attempts: 0, errorPosition: 0 }
        setRecovering(false)
        setSources(null)
        setError(null)
        setCaptionError(false)
        setResumeMessage(false)

        function retryLater() {
            if (disposed) return
            if (recovery.current.attempts >= MAX_RECOVERY_ATTEMPTS) {
                setRecovering(false)
                setError('Nie można odtworzyć nagrania. Spróbuj ponownie lub pobierz materiał.')
                return
            }
            recovery.current.attempts += 1
            setRecovering(true)
            if (timer) clearTimeout(timer)
            timer = setTimeout(() => { timer = null; void load() }, recoveryDelayMs(recovery.current.attempts))
        }

        // A browser that reports the network is back should not sit out the backoff.
        function retryNow() {
            if (!timer) return
            clearTimeout(timer)
            timer = null
            void load()
        }

        async function load(manual = false) {
            if (disposed || fetching) return
            fetching = true
            if (manual) recovery.current.attempts = 0
            if (timer) clearTimeout(timer)
            timer = null
            controller = new AbortController()
            setLoading(true)
            setError(null)
            setCaptionError(false)
            try {
                const captionRequested = Boolean(captionAssetId || captionPath)
                const [videoResult, captionResult] = await Promise.allSettled([
                    signedSource(materialEndpoint({ lessonId, runId }, video.asset_id, video.storage_path), controller.signal),
                    captionRequested ? signedSource(materialEndpoint({ lessonId, runId }, captionAssetId, captionPath), controller.signal) : Promise.resolve(null),
                ])
                if (disposed) return
                if (videoResult.status === 'rejected') throw videoResult.reason
                const nextVideo = videoResult.value
                const nextCaption = captionResult.status === 'fulfilled' ? captionResult.value : null
                setCaptionError(captionRequested && !nextCaption)
                const element = player.current
                if (hasSource && element && !playback.current) playback.current = { time: element.currentTime, paused: element.paused, captions: Array.from(element instanceof HTMLVideoElement ? element.textTracks : []).some(track => track.mode === 'showing') }
                // The URL is renewed only after an error. Replacing it on a timer would
                // recreate the element and interrupt playback every few minutes.
                setSources({ video: nextVideo.url, captions: nextCaption?.url, revision: ++revision })
                hasSource = true
                setRecovering(false)
            } catch (cause) {
                if (disposed || (cause instanceof DOMException && cause.name === 'AbortError')) return
                if (recovery.current.attempts > 0 && !(cause instanceof AccessDenied)) { retryLater(); return }
                setRecovering(false)
                setError(cause instanceof Error ? cause.message : 'Nie udało się wczytać nagrania.')
            } finally {
                fetching = false
                if (!disposed) setLoading(false)
            }
        }

        scheduleRecovery.current = retryLater
        refresh.current = (manual = false) => { void load(manual) }
        window.addEventListener('online', retryNow)
        void load()
        return () => {
            disposed = true
            controller?.abort()
            if (timer) clearTimeout(timer)
            if (stallTimer.current) clearTimeout(stallTimer.current)
            window.removeEventListener('online', retryNow)
            refresh.current = () => {}
            scheduleRecovery.current = () => {}
        }
    }, [lessonId, runId, video.asset_id, video.storage_path, captionAssetId, captionPath])

    function restorePlayback() {
        disarmStallWatch()
        const element = player.current
        if (element) element.playbackRate = rate
        const previous = playback.current
        if (!element || !previous) return
        playback.current = null
        element.currentTime = Number.isFinite(element.duration) ? Math.min(previous.time, Math.max(0, element.duration)) : previous.time
        for (const track of Array.from(element instanceof HTMLVideoElement ? element.textTracks : [])) track.mode = previous.captions ? 'showing' : 'hidden'
        if (!previous.paused) void element.play().catch(() => { if (player.current === element) setResumeMessage(true) })
    }

    function playbackError() {
        disarmStallWatch()
        if (!sources || loading) return
        const position = player.current?.currentTime ?? 0
        if (recovery.current.attempts === 0 || hasRecovered(recovery.current.errorPosition, position)) recovery.current = { attempts: 0, errorPosition: position }
        scheduleRecovery.current()
    }

    failPlayback.current = playbackError

    function disarmStallWatch() {
        if (stallTimer.current) clearTimeout(stallTimer.current)
        stallTimer.current = null
    }

    function armStallWatch() {
        disarmStallWatch()
        stallTimer.current = setTimeout(() => { stallTimer.current = null; failPlayback.current() }, STALL_TIMEOUT_MS)
    }

    const mediaEvents = {
        onError: playbackError,
        onLoadStart: armStallWatch,
        onWaiting: armStallWatch,
        onSeeking: armStallWatch,
        onProgress: () => { if (stallTimer.current) armStallWatch() },
        onSeeked: disarmStallWatch,
        onCanPlay: disarmStallWatch,
        onPlaying: disarmStallWatch,
        onTimeUpdate: trackProgress,
        onPlay: () => setResumeMessage(false),
    }

    function trackProgress() {
        const element = player.current
        if (element && recovery.current.attempts > 0 && hasRecovered(recovery.current.errorPosition, element.currentTime)) recovery.current = { attempts: 0, errorPosition: 0 }
    }

    function changeRate(value: number) {
        setRate(value)
        if (player.current) player.current.playbackRate = value
    }

    return <section className="space-y-3" aria-label={`Nagranie: ${video.name}`}>
        <div className="overflow-hidden rounded-xl border border-border bg-muted">
            {sources && audio ? <audio key={sources.revision} ref={element => { player.current = element }} src={sources.video} controls preload="metadata" aria-label={video.name} className="w-full" onLoadedMetadata={restorePlayback} {...mediaEvents} /> : sources ? <video key={sources.revision} ref={element => { player.current = element }} src={sources.video} controls controlsList="noplaybackrate" playsInline preload="metadata" crossOrigin="anonymous" aria-label={video.name} className="aspect-video w-full" onLoadedMetadata={restorePlayback} {...mediaEvents}>
                {sources.captions && <track key={sources.captions} kind="captions" src={sources.captions} srcLang="und" label="Napisy" onError={() => setCaptionError(true)} />}
                Twoja przeglądarka nie obsługuje odtwarzania tego nagrania.
            </video> : <div className={`flex ${audio ? 'min-h-16' : 'aspect-video'} items-center justify-center p-6 text-sm text-muted-foreground`}>{loading ? 'Przygotowanie nagrania…' : 'Nagranie nie jest dostępne.'}</div>}
        </div>
        {sources && <label className="flex w-fit items-center gap-2 text-sm text-muted-foreground">Prędkość<select value={rate} onChange={event => changeRate(Number(event.target.value))} className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground">{PLAYBACK_RATES.map(value => <option key={value} value={value}>{value.toLocaleString('pl-PL')}×</option>)}</select></label>}
        {(loading || recovering) && <p role="status" className="inline-flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden="true" />{recovering ? 'Połączenie przerwane. Ponawiam i wrócę do tego samego miejsca…' : sources ? 'Odświeżanie dostępu do nagrania…' : 'Wczytywanie nagrania…'}</p>}
        {resumeMessage && <p role="status" className="text-sm text-muted-foreground">Dostęp odświeżony. Naciśnij odtwarzaj, aby kontynuować od zapamiętanego miejsca.</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {captionError && <p role="status" className="text-sm text-muted-foreground">Nie udało się wczytać napisów. Możesz ponowić pobranie materiałów.</p>}
        {(error || captionError) && <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => refresh.current(true)} disabled={loading}><RefreshCw className="size-4" aria-hidden="true" />Spróbuj ponownie</Button><Button asChild variant="ghost"><a href={materialEndpoint({ lessonId, runId }, video.asset_id, video.storage_path, false)}>Otwórz nagranie osobno</a></Button></div>}
    </section>
}
