/** Wersja prosta: nagrania edycji jako materiał biblioteki. Czyste funkcje, bez dostępu do bazy. */

import type { AcademyRunDTO } from '@/lib/types/academy-sessions'

export interface LibraryRecording {
    assetId: string
    runId: string
    courseId: string
    courseSlug: string
    courseTitle: string
    topic: string | null
    category: string | null
    filename: string
    addedAt: string
    durationSeconds: number | null
    /** Własna zapisana pozycja; null, gdy jeszcze nie oglądano. */
    positionSeconds: number | null
    watchedAt: string | null
    captionAssetId: string | null
}

export interface LibraryFile {
    assetId: string
    runId: string
    filename: string
    mimeType: string
    sizeBytes: number
}

/** Wiersz katalogu materiałów, tak jak go zwraca academy_material_catalog (kolumny mogą jeszcze nie istnieć). */
export interface CatalogRow {
    id: string
    course_id: string
    run_id: string | null
    filename: string
    mime_type: string
    size_bytes: number
    status: string
    review_status: string | null
    created_at: string
    caption_for_asset_id?: string | null
}

export const RECORDING_MIME = 'video/mp4'
const CAPTION_MIME = 'text/vtt'
/** Poniżej tego progu „Kontynuuj” nie ma sensu, powyżej nagranie jest obejrzane. */
const CONTINUE_MIN_SECONDS = 10
const CONTINUE_MAX_SHARE = 0.95

export function isPublishedRunMaterial(row: CatalogRow): boolean {
    return row.run_id !== null && row.status === 'ready' && row.review_status === 'published'
}

/** Napisy przypięte do nagrania nie są osobnym materiałem do pobrania. */
export function splitRunMaterials(rows: CatalogRow[]): { videos: CatalogRow[]; files: LibraryFile[]; captions: Map<string, string> } {
    const published = rows.filter(isPublishedRunMaterial)
    const captions = new Map<string, string>()
    for (const row of published) if (row.mime_type === CAPTION_MIME && row.caption_for_asset_id) captions.set(row.caption_for_asset_id, row.id)
    const videos = published.filter(row => row.mime_type === RECORDING_MIME)
    const files = published
        .filter(row => row.mime_type !== RECORDING_MIME && !(row.mime_type === CAPTION_MIME && row.caption_for_asset_id))
        .map(row => ({ assetId: row.id, runId: row.run_id!, filename: row.filename, mimeType: row.mime_type, sizeBytes: Number(row.size_bytes) }))
    return { videos, files, captions }
}

export function isContinuable(recording: Pick<LibraryRecording, 'positionSeconds' | 'durationSeconds'>): boolean {
    const { positionSeconds: position, durationSeconds: duration } = recording
    if (position === null || position < CONTINUE_MIN_SECONDS) return false
    return duration === null || position < duration * CONTINUE_MAX_SHARE
}

export function continueWatching(recordings: LibraryRecording[], limit = 4): LibraryRecording[] {
    return recordings
        .filter(isContinuable)
        .sort((a, b) => (b.watchedAt ?? '').localeCompare(a.watchedAt ?? ''))
        .slice(0, limit)
}

function fold(value: string): string {
    return value.toLocaleLowerCase('pl').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l')
}

/** Szukanie po tytule szkolenia, nazwie pliku i temacie; bez rozróżniania wielkości liter i ogonków. */
export function filterRecordings(recordings: LibraryRecording[], filters: { search?: string; topic?: string }): LibraryRecording[] {
    const needle = filters.search ? fold(filters.search.trim()) : ''
    return recordings.filter(item => {
        if (filters.topic && item.topic !== filters.topic) return false
        if (!needle) return true
        return [item.courseTitle, item.filename, item.topic ?? '', item.category ?? ''].some(text => fold(text).includes(needle))
    })
}

export function formatDuration(seconds: number | null): string | null {
    if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) return null
    const minutes = Math.max(1, Math.round(seconds / 60))
    if (minutes < 60) return `${minutes} min`
    const hours = Math.floor(minutes / 60)
    const rest = minutes % 60
    return rest ? `${hours} h ${rest} min` : `${hours} h`
}

/** Nazwa pliku bez rozszerzenia, jako podpis kafla. */
export function recordingLabel(filename: string): string {
    return filename.replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[_-]+/g, ' ').trim() || filename
}

export function recordingHref(recording: Pick<LibraryRecording, 'courseSlug' | 'assetId'>): string {
    return `/learning/${encodeURIComponent(recording.courseSlug)}?nagranie=${recording.assetId}`
}

/** Wybrane nagranie z adresu albo najnowsze. */
export function pickRecording<T extends { assetId: string; addedAt: string }>(recordings: T[], requested?: string): T | null {
    if (!recordings.length) return null
    return recordings.find(item => item.assetId === requested)
        ?? [...recordings].sort((a, b) => b.addedAt.localeCompare(a.addedAt))[0]
}

export interface LibraryLiveRun {
    runId: string
    courseSlug: string
    courseTitle: string
    startsAt: string
    timeZone: string
    registered: boolean
    full: boolean
}

/** Najbliższa opublikowana edycja, której pierwsze spotkanie jeszcze się nie zaczęło (wtedy zamyka się zapis). */
export function nearestLive(runs: AcademyRunDTO[], now: number): LibraryLiveRun | null {
    let best: LibraryLiveRun | null = null
    for (const run of runs) {
        if (run.status !== 'published') continue
        const first = run.sessions.filter(session => session.status !== 'cancelled').sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))[0]
        if (!first || Date.parse(first.startsAt) <= now) continue
        if (best && Date.parse(best.startsAt) <= Date.parse(first.startsAt)) continue
        best = { runId: run.id, courseSlug: run.courseSlug, courseTitle: run.courseTitle, startsAt: first.startsAt, timeZone: first.timeZone,
            registered: run.myRegistration?.status === 'confirmed' || run.myRegistration?.status === 'waitlisted', full: run.confirmedCount >= run.capacity }
    }
    return best
}

