export type WatchRange = [number, number]

export const DEFAULT_VIDEO_WATCH_PERCENT = 90
export const PROGRESS_SAVE_INTERVAL_MS = 15_000
/** Largest gap between `timeupdate` samples still counted as continuous watching at 2x. */
const MAX_CONTINUOUS_GAP_SECONDS = 3
/** Near the end the viewer has finished, so a new visit starts from the beginning. */
const RESTART_WITHIN_SECONDS = 10

export function resumePosition(position: number | undefined, duration: number | undefined): number {
    if (!position || !duration) return 0
    return position < duration - RESTART_WITHIN_SECONDS ? position : 0
}

export function mergeRanges(ranges: WatchRange[]): WatchRange[] {
    const sorted = ranges.filter(([start, end]) => end > start).map(([start, end]): WatchRange => [start, end]).sort((a, b) => a[0] - b[0] || a[1] - b[1])
    const merged: WatchRange[] = []
    for (const [start, end] of sorted) {
        const last = merged[merged.length - 1]
        if (last && start <= last[1]) last[1] = Math.max(last[1], end)
        else merged.push([start, end])
    }
    return merged
}

const round = (value: number) => Math.round(value * 1000) / 1000

/**
 * Collects watched ranges from media samples. Taken ranges stay out of the pending
 * list until the server confirms them, and are restored if the save fails.
 */
export class WatchTracker {
    private pending: WatchRange[] = []
    private current: WatchRange | null = null
    private inFlight: WatchRange[] = []

    sample(time: number) {
        if (this.current && time >= this.current[1] && time - this.current[1] <= MAX_CONTINUOUS_GAP_SECONDS) {
            this.current[1] = time
            return
        }
        this.interrupt()
        this.current = [time, time]
    }

    /** Called on a seek: the jump itself was not watched. */
    interrupt() {
        if (this.current) this.pending.push(this.current)
        this.current = null
    }

    take(): WatchRange[] {
        const last = this.current?.[1]
        this.interrupt()
        if (last !== undefined) this.current = [last, last]
        this.inFlight = mergeRanges([...this.inFlight, ...this.pending])
        this.pending = []
        return this.inFlight.map(([start, end]): WatchRange => [round(start), round(end)])
    }

    confirm() { this.inFlight = [] }

    restore() {
        this.pending = mergeRanges([...this.inFlight, ...this.pending])
        this.inFlight = []
    }
}
