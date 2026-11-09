export interface VideoChapter {
    position_seconds: number
    title: string
}

/** Accepts `m:ss`, `mm:ss` and `h:mm:ss`. Returns null for anything else. */
export function parseChapterTime(value: string): number | null {
    const match = /^(?:(\d{1,2}):)?(\d{1,3}):([0-5]\d)$/.exec(value.trim())
    if (!match) return null
    const [, hours, minutes, seconds] = match
    if (hours !== undefined && Number(minutes) > 59) return null
    return Number(hours ?? 0) * 3600 + Number(minutes) * 60 + Number(seconds)
}

export function formatChapterTime(totalSeconds: number): string {
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = Math.floor(totalSeconds % 60)
    const tail = `${String(minutes).padStart(hours ? 2 : 1, '0')}:${String(seconds).padStart(2, '0')}`
    return hours ? `${hours}:${tail}` : tail
}

export function activeChapterIndex(chapters: VideoChapter[], time: number): number {
    let active = -1
    chapters.forEach((chapter, index) => { if (chapter.position_seconds <= time) active = index })
    return active
}
