import { describe, expect, it } from 'vitest'
import { continueWatching, filterRecordings, formatDuration, isContinuable, nearestLive, pickRecording, recordingHref, recordingLabel, splitRunMaterials, type CatalogRow, type LibraryRecording } from '../recording-library'
import type { AcademyRunDTO } from '@/lib/types/academy-sessions'

const row = (over: Partial<CatalogRow>): CatalogRow => ({ id: 'a', course_id: 'c', run_id: 'r', filename: 'Nagranie.mp4', mime_type: 'video/mp4', size_bytes: 10, status: 'ready', review_status: 'published', created_at: '2026-11-01T10:00:00Z', ...over })
const recording = (over: Partial<LibraryRecording>): LibraryRecording => ({ assetId: 'a', runId: 'r', courseId: 'c', courseSlug: 'dora', courseTitle: 'DORA w praktyce', topic: 'DORA', category: 'Prawo', filename: 'Webinar_DORA.mp4', addedAt: '2026-11-01T10:00:00Z', durationSeconds: 3600, positionSeconds: null, watchedAt: null, captionAssetId: null, ...over })

describe('splitRunMaterials', () => {
    it('pokazuje tylko zatwierdzone i gotowe materiały edycji', () => {
        const { videos, files } = splitRunMaterials([
            row({ id: 'ok' }),
            row({ id: 'pending', review_status: 'pending_review' }),
            row({ id: 'scan', status: 'scanning' }),
            row({ id: 'withdrawn', review_status: 'withdrawn' }),
            row({ id: 'lesson', run_id: null, review_status: null }),
            row({ id: 'pdf', mime_type: 'application/pdf', filename: 'Slajdy.pdf' }),
        ])
        expect(videos.map(item => item.id)).toEqual(['ok'])
        expect(files.map(item => item.assetId)).toEqual(['pdf'])
    })

    it('napisy przypięte do nagrania nie są plikiem do pobrania', () => {
        const { files, captions } = splitRunMaterials([row({ id: 'v' }), row({ id: 'vtt', mime_type: 'text/vtt', caption_for_asset_id: 'v' }), row({ id: 'loose', mime_type: 'text/vtt' })])
        expect(captions.get('v')).toBe('vtt')
        expect(files.map(item => item.assetId)).toEqual(['loose'])
    })
})

describe('kontynuuj oglądanie', () => {
    it('pomija nieoglądane, ledwo zaczęte i obejrzane do końca', () => {
        expect(isContinuable(recording({ positionSeconds: null }))).toBe(false)
        expect(isContinuable(recording({ positionSeconds: 5 }))).toBe(false)
        expect(isContinuable(recording({ positionSeconds: 3500 }))).toBe(false)
        expect(isContinuable(recording({ positionSeconds: 600 }))).toBe(true)
        expect(isContinuable(recording({ positionSeconds: 600, durationSeconds: null }))).toBe(true)
    })

    it('najpierw ostatnio oglądane, najwyżej limit', () => {
        const items = [
            recording({ assetId: 'old', positionSeconds: 60, watchedAt: '2026-11-01T00:00:00Z' }),
            recording({ assetId: 'new', positionSeconds: 60, watchedAt: '2026-11-09T00:00:00Z' }),
            recording({ assetId: 'none' }),
        ]
        expect(continueWatching(items).map(item => item.assetId)).toEqual(['new', 'old'])
        expect(continueWatching(items, 1).map(item => item.assetId)).toEqual(['new'])
    })
})

describe('filterRecordings', () => {
    const items = [recording({ assetId: 'dora' }), recording({ assetId: 'k8s', courseTitle: 'Kubernetes od zera', topic: 'Chmura', filename: 'k8s.mp4', category: 'IT' })]

    it('szuka bez ogonków i wielkości liter', () => {
        expect(filterRecordings(items, { search: 'kubernetes' }).map(item => item.assetId)).toEqual(['k8s'])
        expect(filterRecordings([recording({ courseTitle: 'Zarządzanie ryzykiem' })], { search: 'zarzadzanie' })).toHaveLength(1)
        expect(filterRecordings(items, { search: '   ' })).toHaveLength(2)
    })

    it('filtruje po temacie i łączy z szukaniem', () => {
        expect(filterRecordings(items, { topic: 'DORA' }).map(item => item.assetId)).toEqual(['dora'])
        expect(filterRecordings(items, { topic: 'DORA', search: 'kubernetes' })).toEqual([])
    })
})

describe('formatowanie', () => {
    it('czas trwania', () => {
        expect(formatDuration(null)).toBeNull()
        expect(formatDuration(0)).toBeNull()
        expect(formatDuration(Number.NaN)).toBeNull()
        expect(formatDuration(20)).toBe('1 min')
        expect(formatDuration(45 * 60)).toBe('45 min')
        expect(formatDuration(3600)).toBe('1 h')
        expect(formatDuration(5400)).toBe('1 h 30 min')
    })

    it('podpis i adres nagrania', () => {
        expect(recordingLabel('Webinar_DORA-cz1.mp4')).toBe('Webinar DORA cz1')
        expect(recordingHref({ courseSlug: 'dora ąę', assetId: 'x' })).toBe('/learning/dora%20%C4%85%C4%99?nagranie=x')
    })

    it('wybiera nagranie z adresu albo najnowsze', () => {
        const items = [{ assetId: 'a', addedAt: '2026-01-01' }, { assetId: 'b', addedAt: '2026-02-01' }]
        expect(pickRecording(items, 'a')?.assetId).toBe('a')
        expect(pickRecording(items, 'nieznane')?.assetId).toBe('b')
        expect(pickRecording([], 'a')).toBeNull()
    })
})

describe('nearestLive', () => {
    const session = (startsAt: string, status: 'scheduled' | 'cancelled' = 'scheduled') => ({ id: startsAt, runId: 'r', title: 'S', startsAt, endsAt: startsAt, timeZone: 'Europe/Warsaw', mode: 'external_link' as const, required: true, status, joinUrl: null, syncStatus: 'ready' as const, organizerId: null, actualStartsAt: null, actualEndsAt: null, attendanceWindowConfirmed: false })
    const run = (id: string, sessions: ReturnType<typeof session>[], over: Partial<AcademyRunDTO> = {}): AcademyRunDTO => ({ id, courseId: 'c', versionId: 'v', versionNumber: 1, courseTitle: `Kurs ${id}`, courseSlug: id, title: id, capacity: 10, status: 'published', confirmedCount: 0, waitlistCount: 0, canManage: false, canPublish: false, myRegistration: null, sessions, ...over })
    const now = Date.parse('2026-11-10T12:00:00Z')

    it('wybiera najwcześniejszą przyszłą edycję', () => {
        const live = nearestLive([run('pozno', [session('2026-12-01T10:00:00Z')]), run('wczesnie', [session('2026-11-20T10:00:00Z')])], now)
        expect(live?.runId).toBe('wczesnie')
        expect(live?.registered).toBe(false)
    })

    it('pomija szkice, zaczęte i odwołane spotkania; pełna edycja to lista rezerwowa', () => {
        expect(nearestLive([run('szkic', [session('2026-11-20T10:00:00Z')], { status: 'draft' })], now)).toBeNull()
        expect(nearestLive([run('trwa', [session('2026-11-09T10:00:00Z'), session('2026-11-20T10:00:00Z')])], now)).toBeNull()
        expect(nearestLive([run('odwolane', [session('2026-11-20T10:00:00Z', 'cancelled')])], now)).toBeNull()
        expect(nearestLive([run('pelna', [session('2026-11-20T10:00:00Z')], { capacity: 2, confirmedCount: 2 })], now)?.full).toBe(true)
    })

    it('zapis lub lista rezerwowa to „jesteś zapisany”, rezygnacja nie', () => {
        const reg = (status: 'confirmed' | 'waitlisted' | 'cancelled') => ({ id: 'x', status, enrollmentId: null, completedAt: null })
        expect(nearestLive([run('a', [session('2026-11-20T10:00:00Z')], { myRegistration: reg('confirmed') })], now)?.registered).toBe(true)
        expect(nearestLive([run('a', [session('2026-11-20T10:00:00Z')], { myRegistration: reg('waitlisted') })], now)?.registered).toBe(true)
        expect(nearestLive([run('a', [session('2026-11-20T10:00:00Z')], { myRegistration: reg('cancelled') })], now)?.registered).toBe(false)
    })
})
