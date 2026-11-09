import { describe, expect, it } from 'vitest'
import { completionConditions, courseMaterials, editionDateParts, formatMinutes, lessonProgress, programSummary } from '../course-card-model'
import type { CourseAttachment, CourseDetail, CourseLesson } from '@/lib/types/learning'
import type { AcademySessionDTO } from '@/lib/types/academy-sessions'

const lesson = (id: string, minutes: number | null, attachments: CourseAttachment[] = []) => ({ id, title: id, estimated_minutes: minutes, attachments, content_available: true }) as CourseLesson
const course = (patch: Partial<CourseDetail>) => ({ lessons: [], quiz_questions_count: 0, is_enrolled: false, delivery_mode: 'self_paced', completion_rules: { quiz_required: false, quiz_pass_percent: 70, require_all_lessons: false, attendance_percent: 80 }, ...patch }) as CourseDetail
const session = (patch: Partial<AcademySessionDTO>) => ({ startsAt: '2027-01-19T09:00:00Z', endsAt: '2027-01-19T12:00:00Z', timeZone: 'Europe/Warsaw', ...patch }) as AcademySessionDTO

describe('course card model', () => {
    it('does not invent a duration when lessons have none', () => {
        expect(formatMinutes(0)).toBeNull()
        expect(formatMinutes(null)).toBeNull()
        expect(programSummary([lesson('a', null)])).toEqual({ count: 1, label: '1 moduł' })
    })
    it('formats hours and Polish module plurals', () => {
        expect(formatMinutes(45)).toBe('45 min')
        expect(formatMinutes(120)).toBe('2 h')
        expect(formatMinutes(130)).toBe('2 h 10 min')
        expect(programSummary([lesson('a', 60), lesson('b', 70)]).label).toBe('2 moduły, 2 h 10 min')
        expect(programSummary(Array.from({ length: 12 }, (_, i) => lesson(String(i), 5))).label).toBe('12 modułów, 1 h')
    })
    it('marks the first unfinished lesson as current and never reports progress without an enrollment', () => {
        const lessons = [lesson('a', 5), lesson('b', 5), lesson('c', 5)]
        expect(lessonProgress(course({ lessons, is_enrolled: false, completed_lesson_ids: ['a'] }))).toBeNull()
        expect(lessonProgress(course({ lessons, is_enrolled: true, completed_lesson_ids: ['a'] }))).toEqual({ completed: 1, total: 3, percent: 33, currentLessonId: 'b' })
        expect(lessonProgress(course({ lessons, is_enrolled: true, completed_lesson_ids: ['a', 'b', 'c'] }))).toEqual({ completed: 3, total: 3, percent: 100, currentLessonId: null })
        expect(lessonProgress(course({ lessons: [], is_enrolled: true }))).toBeNull()
    })
    it('lists only conditions that really apply to the delivery mode', () => {
        expect(completionConditions(course({ delivery_mode: 'self_paced' }))).toEqual([])
        const live = completionConditions(course({ delivery_mode: 'live' }))
        expect(live.map(item => item.title)).toEqual(['Obecność'])
        expect(live[0].detail).toContain('80%')
        const blended = completionConditions(course({ delivery_mode: 'blended', lessons: [lesson('a', 5), lesson('b', 5)], quiz_questions_count: 10, quiz_attempt_limit: 3, quiz_attempt_window_hours: 24, completion_rules: { quiz_required: true, quiz_pass_percent: 70, require_all_lessons: true, attendance_percent: 90 } }))
        expect(blended.map(item => item.title)).toEqual(['Obecność', 'Wszystkie moduły', 'Test końcowy, próg 70%'])
        expect(blended[0].detail).toContain('90%')
        expect(blended[1].detail).toContain('2 moduły')
        expect(blended[2].detail).toBe('10 pytań. 3 próby w ciągu 24 godzin.')
    })
    it('skips the module condition for a course without lessons and the attempt policy when unset', () => {
        const items = completionConditions(course({ delivery_mode: 'self_paced', lessons: [], quiz_questions_count: 1, quiz_attempt_limit: null, completion_rules: { quiz_required: true, quiz_pass_percent: 50, require_all_lessons: true, attendance_percent: 80 } }))
        expect(items).toEqual([{ title: 'Test końcowy, próg 50%', detail: '1 pytanie.' }])
    })
    it('falls back to the safe default attendance when rules are missing', () => {
        expect(completionConditions(course({ delivery_mode: 'live', completion_rules: undefined }))[0].detail).toContain('80%')
    })
    it('shows the date in the session time zone, not the server zone', () => {
        expect(editionDateParts(session({}))).toMatchObject({ month: 'STY', day: '19', year: '2027', weekday: 'Wtorek', time: '10:00–13:00' })
        expect(editionDateParts(session({ startsAt: '2027-01-19T23:30:00Z', endsAt: '2027-01-20T01:00:00Z' }))).toMatchObject({ day: '20', weekday: 'Środa', time: '00:30–02:00' })
    })
    it('lists downloadable files only, without media and captions', () => {
        const pdf: CourseAttachment = { name: 'Slajdy.pdf', storage_path: 'a', size_bytes: 2048, asset_id: 'pdf', mime_type: 'application/pdf' }
        const mp4: CourseAttachment = { name: 'Film.mp4', storage_path: 'b', size_bytes: 1, asset_id: 'mp4', mime_type: 'video/mp4' }
        const mp3: CourseAttachment = { name: 'Audio.mp3', storage_path: 'c', size_bytes: 1, asset_id: 'mp3', mime_type: 'audio/mpeg' }
        const vtt: CourseAttachment = { name: 'Napisy.vtt', storage_path: 'd', size_bytes: 1, asset_id: 'vtt', mime_type: 'text/vtt', caption_for_asset_id: 'mp4' }
        const legacy: CourseAttachment = { name: 'Stary.docx', storage_path: 'old/path', size_bytes: 1_500_000 }
        const items = courseMaterials(course({ is_enrolled: true, lessons: [lesson('l1', 5, [pdf, mp4, mp3, vtt]), lesson('l2', 5, [legacy])] }))
        expect(items.map(item => item.name)).toEqual(['Slajdy.pdf', 'Stary.docx'])
        expect(items[0].href).toBe('/api/akademia/attachment?lessonId=l1&assetId=pdf')
        expect(items[0].size).toBe('2 KB')
        expect(items[1].href).toBe('/api/akademia/attachment?lessonId=l2&path=old%2Fpath')
        expect(items[1].size).toBe('1,4 MB')
    })
    it('hides materials from anyone without access to lesson content', () => {
        const pdf: CourseAttachment = { name: 'Slajdy.pdf', storage_path: 'a', size_bytes: 2048 }
        expect(courseMaterials(course({ is_enrolled: false, lessons: [{ ...lesson('l1', 5, [pdf]), content_available: false }] }))).toEqual([])
    })
})
