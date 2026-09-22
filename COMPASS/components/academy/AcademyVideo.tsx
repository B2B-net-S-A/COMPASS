'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { CourseAttachment } from '@/lib/types/learning'

type Props = ({ lessonId: string; runId?: never } | { runId: string; lessonId?: never }) & { video: CourseAttachment; captions?: CourseAttachment }
interface SignedSource { url: string; expiresIn: number }
interface PlaybackPosition { time: number; paused: boolean; captions: boolean }

function materialEndpoint(scope: { lessonId?: string; runId?: string }, assetId?: string, path?: string, json = true) {
    return `/api/akademia/attachment?${new URLSearchParams({ ...(scope.runId ? { runId: scope.runId } : { lessonId: scope.lessonId! }), ...(assetId ? { assetId } : { path: path ?? '' }), ...(json ? { format: 'json' } : {}) })}`
}

async function signedSource(endpoint: string, signal: AbortSignal): Promise<SignedSource> {
    const response = await fetch(endpoint, { signal, cache: 'no-store', credentials: 'same-origin' })
    if (!response.ok) throw new Error(response.status === 401 || response.status === 403 || response.status === 404
        ? 'Nagranie jest niedostępne lub nie masz już do niego dostępu.'
        : 'Nie udało się pobrać nagrania. Sprawdź połączenie i spróbuj ponownie.')
    const data: unknown = await response.json()
    if (!data || typeof data !== 'object' || !('url' in data) || typeof data.url !== 'string' || !('expiresIn' in data) || typeof data.expiresIn !== 'number' || !Number.isFinite(data.expiresIn) || data.expiresIn <= 0) throw new Error('Nie udało się przygotować bezpiecznego odtwarzania.')
    const url = new URL(data.url)
    if (url.protocol !== 'https:') throw new Error('Nie udało się przygotować bezpiecznego odtwarzania.')
    return { url: url.href, expiresIn: data.expiresIn }
}

export function AcademyVideo({ lessonId, runId, video, captions }: Props) {
    const player = useRef<HTMLVideoElement>(null)
    const refresh = useRef<(manual?: boolean) => void>(() => {})
    const stopScheduledRefresh = useRef<() => void>(() => {})
    const playback = useRef<PlaybackPosition | null>(null)
    const autoRetryUsed = useRef(false)
    const [sources, setSources] = useState<{ video: string; captions?: string; revision: number } | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [captionError, setCaptionError] = useState(false)
    const [resumeMessage, setResumeMessage] = useState(false)
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
        autoRetryUsed.current = false
        setSources(null)
        setError(null)
        setCaptionError(false)
        setResumeMessage(false)

        async function load(manual = false) {
            if (disposed || fetching) return
            fetching = true
            if (manual) autoRetryUsed.current = false
            if (timer) clearTimeout(timer)
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
                if (hasSource && element && !playback.current) playback.current = { time: element.currentTime, paused: element.paused, captions: Array.from(element.textTracks ?? []).some(track => track.mode === 'showing') }
                setSources({ video: nextVideo.url, captions: nextCaption?.url, revision: ++revision })
                hasSource = true
                const ttl = Math.min(nextVideo.expiresIn, nextCaption?.expiresIn ?? nextVideo.expiresIn)
                // Renew before expiration so later range requests and seeking stay authorized.
                timer = setTimeout(() => { void load() }, Math.max(1000, (ttl - Math.min(60, ttl / 5)) * 1000))
            } catch (cause) {
                if (!disposed && !(cause instanceof DOMException && cause.name === 'AbortError')) setError(cause instanceof Error ? cause.message : 'Nie udało się wczytać nagrania.')
            } finally {
                fetching = false
                if (!disposed) setLoading(false)
            }
        }

        stopScheduledRefresh.current = () => { if (timer) clearTimeout(timer) }
        refresh.current = (manual = false) => { void load(manual) }
        void load()
        return () => {
            disposed = true
            controller?.abort()
            if (timer) clearTimeout(timer)
            refresh.current = () => {}
            stopScheduledRefresh.current = () => {}
        }
    }, [lessonId, runId, video.asset_id, video.storage_path, captionAssetId, captionPath])

    function restorePlayback() {
        const element = player.current
        const previous = playback.current
        if (!element || !previous) return
        playback.current = null
        element.currentTime = Number.isFinite(element.duration) ? Math.min(previous.time, Math.max(0, element.duration)) : previous.time
        for (const track of Array.from(element.textTracks ?? [])) track.mode = previous.captions ? 'showing' : 'hidden'
        if (!previous.paused) void element.play().catch(() => { if (player.current === element) setResumeMessage(true) })
    }

    function playbackError() {
        if (!sources || loading) return
        if (!autoRetryUsed.current) {
            autoRetryUsed.current = true
            refresh.current()
        } else {
            stopScheduledRefresh.current()
            setError('Nie można odtworzyć nagrania. Spróbuj ponownie lub pobierz materiał.')
        }
    }

    return <section className="space-y-3" aria-label={`Nagranie: ${video.name}`}>
        <div className="overflow-hidden rounded-xl border border-border bg-muted">
            {sources ? <video key={sources.revision} ref={player} src={sources.video} controls playsInline preload="metadata" crossOrigin="anonymous" aria-label={video.name} className="aspect-video w-full" onLoadedMetadata={restorePlayback} onError={playbackError} onPlay={() => setResumeMessage(false)}>
                {sources.captions && <track key={sources.captions} kind="captions" src={sources.captions} srcLang="und" label="Napisy" onError={() => setCaptionError(true)} />}
                Twoja przeglądarka nie obsługuje odtwarzania tego nagrania.
            </video> : <div className="flex aspect-video items-center justify-center p-6 text-sm text-muted-foreground">{loading ? 'Przygotowanie nagrania…' : 'Nagranie nie jest dostępne.'}</div>}
        </div>
        {loading && <p role="status" className="inline-flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden="true" />{sources ? 'Odświeżanie dostępu do nagrania…' : 'Wczytywanie nagrania…'}</p>}
        {resumeMessage && <p role="status" className="text-sm text-muted-foreground">Dostęp odświeżony. Naciśnij odtwarzaj, aby kontynuować od zapamiętanego miejsca.</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {captionError && <p role="status" className="text-sm text-muted-foreground">Nie udało się wczytać napisów. Możesz ponowić pobranie materiałów.</p>}
        {(error || captionError) && <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => refresh.current(true)} disabled={loading}><RefreshCw className="size-4" aria-hidden="true" />Spróbuj ponownie</Button><Button asChild variant="ghost"><a href={materialEndpoint({ lessonId, runId }, video.asset_id, video.storage_path, false)}>Otwórz nagranie osobno</a></Button></div>}
    </section>
}
