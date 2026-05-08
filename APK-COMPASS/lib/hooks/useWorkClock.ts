'use client'

// Phase 17 — useWorkClock hook.
// Tracks live work-clock session state on the client, sends heartbeats to the
// server every ~30s, detects idle/sleep, syncs across multi-tab via
// BroadcastChannel + localStorage leader election, and uses sendBeacon for
// reliable session-close on unload.

import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import {
    detectorReducer,
    DEFAULT_IDLE_THRESHOLD_MS,
    DEFAULT_HEARTBEAT_INTERVAL_MS,
    isSleepGap,
    shouldSendActive,
    type ClockSnapshot,
} from '@/lib/clock/idle-detector'

const LEADER_KEY = 'compass-work-clock-leader'
const LEADER_TTL_MS = 90_000
const BROADCAST_CHANNEL = 'compass-work-clock'
const ACTIVITY_DEBOUNCE_MS = 500

export interface ActiveSessionDTO {
    id: string
    started_at: string
    last_heartbeat: string
    active_seconds: number
    idle_seconds: number
    location: 'onsite' | 'remote'
    device_label: string | null
    recomputedActiveSeconds: number
    isSustainedIdle: boolean
}

export interface WorkClockState {
    loading: boolean
    sessionId: string | null
    startedAt: string | null
    /** Local tick — increments every second when active, frozen otherwise. Server is source of truth on read. */
    elapsedSeconds: number
    state: 'stopped' | 'active' | 'idle' | 'paused_hidden'
    isLeader: boolean
    error: string | null
}

interface BroadcastMessage {
    type: 'state_changed' | 'leader_ping' | 'session_ended'
    sessionId?: string | null
    elapsedSeconds?: number
    state?: WorkClockState['state']
    timestamp: number
}

const initialSnapshot: ClockSnapshot = {
    state: 'stopped',
    lastActivityMs: 0,
    lastTickMs: 0,
    pageVisible: typeof document !== 'undefined' ? !document.hidden : true,
}

function generateClientId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function isTabLeader(myId: string): boolean {
    if (typeof window === 'undefined') return false
    try {
        const raw = window.localStorage.getItem(LEADER_KEY)
        if (!raw) return false
        const parsed = JSON.parse(raw) as { id: string; ts: number }
        return parsed.id === myId && Date.now() - parsed.ts < LEADER_TTL_MS
    } catch {
        return false
    }
}

function claimLeadership(myId: string): boolean {
    if (typeof window === 'undefined') return false
    try {
        const raw = window.localStorage.getItem(LEADER_KEY)
        if (raw) {
            const parsed = JSON.parse(raw) as { id: string; ts: number }
            if (parsed.id !== myId && Date.now() - parsed.ts < LEADER_TTL_MS) return false
        }
        window.localStorage.setItem(LEADER_KEY, JSON.stringify({ id: myId, ts: Date.now() }))
        return true
    } catch {
        return false
    }
}

function refreshLeadership(myId: string): void {
    try {
        window.localStorage.setItem(LEADER_KEY, JSON.stringify({ id: myId, ts: Date.now() }))
    } catch {
        /* ignore */
    }
}

function detectDevice(): string {
    if (typeof navigator === 'undefined') return 'unknown'
    const ua = navigator.userAgent
    let browser = 'browser'
    if (ua.includes('Firefox')) browser = 'Firefox'
    else if (ua.includes('Edg')) browser = 'Edge'
    else if (ua.includes('Chrome')) browser = 'Chrome'
    else if (ua.includes('Safari')) browser = 'Safari'
    let os = ''
    if (ua.includes('Mac')) os = 'macOS'
    else if (ua.includes('Windows')) os = 'Windows'
    else if (ua.includes('Linux')) os = 'Linux'
    else if (ua.includes('Android')) os = 'Android'
    else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS'
    return os ? `${browser} on ${os}` : browser
}

export interface UseWorkClockOptions {
    /** Override idle threshold (default 20 min) */
    idleThresholdMs?: number
    /** Override heartbeat interval (default 30 s) */
    heartbeatIntervalMs?: number
    /** Disable the hook entirely (for SSR or non-internal users) */
    enabled?: boolean
}

export interface UseWorkClockReturn extends WorkClockState {
    start: (input?: { location?: 'onsite' | 'remote' }) => Promise<void>
    stop: () => Promise<void>
    transfer: (input?: { location?: 'onsite' | 'remote' }) => Promise<void>
    refreshFromServer: () => Promise<void>
}

export function useWorkClock(options: UseWorkClockOptions = {}): UseWorkClockReturn {
    const enabled = options.enabled ?? true
    const idleThresholdMs = options.idleThresholdMs ?? DEFAULT_IDLE_THRESHOLD_MS
    const heartbeatIntervalMs = options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS

    const [state, setState] = useState<WorkClockState>({
        loading: true,
        sessionId: null,
        startedAt: null,
        elapsedSeconds: 0,
        state: 'stopped',
        isLeader: false,
        error: null,
    })

    const [snapshot, dispatch] = useReducer(detectorReducer, initialSnapshot)
    const clientIdRef = useRef<string>('')
    const channelRef = useRef<BroadcastChannel | null>(null)
    const lastActivityDispatchRef = useRef<number>(0)
    const sessionIdRef = useRef<string | null>(null)

    // Mount: initialise IDs + channel + load active session
    useEffect(() => {
        if (!enabled || typeof window === 'undefined') return
        clientIdRef.current = generateClientId()
        try {
            channelRef.current = new BroadcastChannel(BROADCAST_CHANNEL)
        } catch {
            channelRef.current = null
        }
        return () => {
            channelRef.current?.close()
            channelRef.current = null
        }
    }, [enabled])

    const refreshFromServer = useCallback(async (): Promise<void> => {
        try {
            const res = await fetch('/api/clock/active', { method: 'GET', credentials: 'same-origin' })
            if (!res.ok) {
                setState((prev) => ({ ...prev, loading: false, sessionId: null, state: 'stopped', error: null }))
                dispatch({ type: 'stop' })
                sessionIdRef.current = null
                return
            }
            const data = (await res.json()) as { session: ActiveSessionDTO | null }
            if (!data.session) {
                setState((prev) => ({ ...prev, loading: false, sessionId: null, state: 'stopped', error: null }))
                dispatch({ type: 'stop' })
                sessionIdRef.current = null
                return
            }
            sessionIdRef.current = data.session.id
            const startedAtMs = new Date(data.session.started_at).getTime()
            const recomputed = data.session.recomputedActiveSeconds ?? data.session.active_seconds
            setState((prev) => ({
                ...prev,
                loading: false,
                sessionId: data.session!.id,
                startedAt: data.session!.started_at,
                elapsedSeconds: recomputed,
                state: data.session!.isSustainedIdle ? 'idle' : 'active',
                error: null,
            }))
            dispatch({ type: 'start', ts: startedAtMs })
        } catch (e) {
            setState((prev) => ({
                ...prev,
                loading: false,
                error: e instanceof Error ? e.message : 'unknown_error',
            }))
        }
    }, [])

    useEffect(() => {
        if (!enabled) return
        refreshFromServer()
    }, [enabled, refreshFromServer])

    // Activity listeners (passive, debounced)
    useEffect(() => {
        if (!enabled || typeof window === 'undefined') return
        const handler = (ev: Event) => {
            const now = Date.now()
            // MouseEvent.isTrusted gate — programmatic events get logged but still counted
            const evWithTrust = ev as Event & { isTrusted?: boolean }
            const trusted = evWithTrust.isTrusted !== false
            // Debounce
            if (now - lastActivityDispatchRef.current < ACTIVITY_DEBOUNCE_MS) return
            lastActivityDispatchRef.current = now
            dispatch({ type: 'activity', ts: now })
            ;(window as Window & { __compassClockTrusted?: boolean }).__compassClockTrusted = trusted
        }
        const visibility = () => {
            dispatch({ type: 'visibility', visible: !document.hidden, ts: Date.now() })
        }
        window.addEventListener('mousemove', handler, { passive: true })
        window.addEventListener('keydown', handler, { passive: true })
        window.addEventListener('touchstart', handler, { passive: true })
        document.addEventListener('visibilitychange', visibility)
        return () => {
            window.removeEventListener('mousemove', handler)
            window.removeEventListener('keydown', handler)
            window.removeEventListener('touchstart', handler)
            document.removeEventListener('visibilitychange', visibility)
        }
    }, [enabled])

    // 1-second tick for UI counter + state transitions
    useEffect(() => {
        if (!enabled) return
        const id = window.setInterval(() => {
            const now = Date.now()
            dispatch({ type: 'tick', ts: now, config: { idleThresholdMs, heartbeatIntervalMs } })
            setState((prev) => {
                if (!prev.sessionId || prev.state === 'stopped') return prev
                if (prev.state === 'active' && !document.hidden) {
                    return { ...prev, elapsedSeconds: prev.elapsedSeconds + 1 }
                }
                return prev
            })
        }, 1000)
        return () => window.clearInterval(id)
    }, [enabled, idleThresholdMs, heartbeatIntervalMs])

    // Sync local state from snapshot
    useEffect(() => {
        setState((prev) => {
            if (!prev.sessionId) return prev
            if (prev.state === snapshot.state) return prev
            return { ...prev, state: snapshot.state }
        })
    }, [snapshot.state])

    // Sleep detection — if a tick gap > 5× heartbeat occurred, refresh from server
    useEffect(() => {
        if (!enabled || !state.sessionId) return
        if (isSleepGap({ nowMs: Date.now(), snapshot, config: { heartbeatIntervalMs } })) {
            refreshFromServer()
        }
    }, [enabled, snapshot.lastTickMs, snapshot.state, state.sessionId, refreshFromServer, heartbeatIntervalMs, snapshot])

    // Heartbeat sender — only when leader
    useEffect(() => {
        if (!enabled) return
        if (!state.sessionId) return

        const claim = () => {
            const ok = claimLeadership(clientIdRef.current)
            setState((prev) => (prev.isLeader === ok ? prev : { ...prev, isLeader: ok }))
            return ok
        }
        if (!claim()) {
            const id = window.setInterval(claim, 5000)
            return () => window.clearInterval(id)
        }

        const sendHeartbeat = async (final = false) => {
            if (!state.sessionId) return
            if (!isTabLeader(clientIdRef.current)) return
            refreshLeadership(clientIdRef.current)
            const trusted = (window as Window & { __compassClockTrusted?: boolean }).__compassClockTrusted !== false
            const wasActive = shouldSendActive({
                nowMs: Date.now(),
                snapshot,
                config: { idleThresholdMs },
            })
            try {
                await fetch('/api/clock/heartbeat', {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sessionId: state.sessionId,
                        ts: new Date().toISOString(),
                        wasActive,
                        pageVisible: !document.hidden,
                        isTrusted: trusted,
                        final,
                    }),
                    keepalive: final,
                })
            } catch (e) {
                console.warn('[useWorkClock] heartbeat failed:', e)
            }
        }

        const intervalId = window.setInterval(() => {
            sendHeartbeat(false)
        }, heartbeatIntervalMs)

        const beforeUnload = () => {
            try {
                const trusted =
                    (window as Window & { __compassClockTrusted?: boolean }).__compassClockTrusted !== false
                navigator.sendBeacon(
                    '/api/clock/heartbeat',
                    new Blob(
                        [
                            JSON.stringify({
                                sessionId: state.sessionId,
                                ts: new Date().toISOString(),
                                wasActive: false,
                                pageVisible: false,
                                isTrusted: trusted,
                                final: false, // don't auto-close on tab close — other tabs may still be live
                            }),
                        ],
                        { type: 'application/json' },
                    ),
                )
            } catch {
                /* ignore */
            }
        }
        window.addEventListener('beforeunload', beforeUnload)

        return () => {
            window.clearInterval(intervalId)
            window.removeEventListener('beforeunload', beforeUnload)
        }
    }, [enabled, state.sessionId, snapshot, idleThresholdMs, heartbeatIntervalMs])

    // BroadcastChannel sync between tabs
    useEffect(() => {
        if (!enabled || !channelRef.current) return
        const ch = channelRef.current
        const onMessage = (ev: MessageEvent<BroadcastMessage>) => {
            const msg = ev.data
            if (!msg) return
            if (msg.type === 'state_changed' && msg.sessionId) {
                setState((prev) => ({
                    ...prev,
                    sessionId: msg.sessionId ?? prev.sessionId,
                    elapsedSeconds: msg.elapsedSeconds ?? prev.elapsedSeconds,
                    state: msg.state ?? prev.state,
                }))
            } else if (msg.type === 'session_ended') {
                setState((prev) => ({
                    ...prev,
                    sessionId: null,
                    state: 'stopped',
                    elapsedSeconds: 0,
                    startedAt: null,
                }))
                dispatch({ type: 'stop' })
                sessionIdRef.current = null
            }
        }
        ch.addEventListener('message', onMessage)
        return () => ch.removeEventListener('message', onMessage)
    }, [enabled])

    // Broadcast every second for non-leader tabs to mirror counter
    useEffect(() => {
        if (!enabled || !channelRef.current) return
        if (!state.isLeader) return
        const id = window.setInterval(() => {
            channelRef.current?.postMessage({
                type: 'state_changed',
                sessionId: state.sessionId,
                elapsedSeconds: state.elapsedSeconds,
                state: state.state,
                timestamp: Date.now(),
            } satisfies BroadcastMessage)
        }, 1000)
        return () => window.clearInterval(id)
    }, [enabled, state.isLeader, state.sessionId, state.elapsedSeconds, state.state])

    const start = useCallback(
        async (input?: { location?: 'onsite' | 'remote' }) => {
            setState((prev) => ({ ...prev, loading: true, error: null }))
            try {
                const { startClockSession } = await import('@/lib/actions/internal-clock')
                const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Warsaw'
                const result = await startClockSession({
                    deviceLabel: detectDevice(),
                    clientTz: tz,
                    location: input?.location,
                })
                sessionIdRef.current = result.sessionId
                dispatch({ type: 'start', ts: Date.now() })
                setState((prev) => ({
                    ...prev,
                    loading: false,
                    sessionId: result.sessionId,
                    startedAt: result.startedAt,
                    elapsedSeconds: 0,
                    state: 'active',
                    error: null,
                }))
            } catch (e) {
                setState((prev) => ({
                    ...prev,
                    loading: false,
                    error: e instanceof Error ? e.message : 'start_failed',
                }))
                throw e
            }
        },
        [],
    )

    const stop = useCallback(async () => {
        if (!state.sessionId) return
        setState((prev) => ({ ...prev, loading: true, error: null }))
        try {
            const { stopClockSession } = await import('@/lib/actions/internal-clock')
            await stopClockSession(state.sessionId, 'manual')
            channelRef.current?.postMessage({ type: 'session_ended', timestamp: Date.now() } satisfies BroadcastMessage)
            dispatch({ type: 'stop' })
            sessionIdRef.current = null
            setState({
                loading: false,
                sessionId: null,
                startedAt: null,
                elapsedSeconds: 0,
                state: 'stopped',
                isLeader: false,
                error: null,
            })
            try {
                window.localStorage.removeItem(LEADER_KEY)
            } catch {
                /* ignore */
            }
        } catch (e) {
            setState((prev) => ({
                ...prev,
                loading: false,
                error: e instanceof Error ? e.message : 'stop_failed',
            }))
            throw e
        }
    }, [state.sessionId])

    const transfer = useCallback(async (input?: { location?: 'onsite' | 'remote' }) => {
        setState((prev) => ({ ...prev, loading: true, error: null }))
        try {
            const { transferClockSession } = await import('@/lib/actions/internal-clock')
            const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Warsaw'
            const result = await transferClockSession(detectDevice(), tz, input?.location)
            sessionIdRef.current = result.sessionId
            dispatch({ type: 'start', ts: Date.now() })
            setState((prev) => ({
                ...prev,
                loading: false,
                sessionId: result.sessionId,
                startedAt: result.startedAt,
                elapsedSeconds: 0,
                state: 'active',
                error: null,
            }))
        } catch (e) {
            setState((prev) => ({
                ...prev,
                loading: false,
                error: e instanceof Error ? e.message : 'transfer_failed',
            }))
            throw e
        }
    }, [])

    return {
        ...state,
        start,
        stop,
        transfer,
        refreshFromServer,
    }
}
