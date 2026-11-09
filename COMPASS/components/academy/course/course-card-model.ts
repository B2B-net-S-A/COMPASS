import type { CourseDetail, CourseLesson } from '@/lib/types/learning'
import type { AcademySessionDTO } from '@/lib/types/academy-sessions'

function plural(count: number, one: string, few: string, many: string): string {
    const tens = count % 100
    const units = count % 10
    if (count === 1) return one
    return units >= 2 && units <= 4 && (tens < 12 || tens > 14) ? few : many
}

/** Null rather than "0 min": an unset duration must not read like a real one. */
export function formatMinutes(minutes: number | null | undefined): string | null {
    if (!minutes || minutes <= 0) return null
    if (minutes < 60) return `${minutes} min`
    const hours = Math.floor(minutes / 60)
    const rest = minutes % 60
    return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`
}

function modules(count: number): string {
    return `${count} ${plural(count, 'moduł', 'moduły', 'modułów')}`
}

export function programSummary(lessons: CourseLesson[]): { count: number; label: string } {
    const total = formatMinutes(lessons.reduce((sum, lesson) => sum + (lesson.estimated_minutes ?? 0), 0))
    return { count: lessons.length, label: total ? `${modules(lessons.length)}, ${total}` : modules(lessons.length) }
}

export interface CourseLessonProgress { completed: number; total: number; percent: number; currentLessonId: string | null }

/** Progress exists only for an enrollment; a catalog visitor has no position in the programme. */
export function lessonProgress(course: CourseDetail): CourseLessonProgress | null {
    if (!course.is_enrolled || course.lessons.length === 0) return null
    const done = new Set(course.completed_lesson_ids ?? [])
    const completed = course.lessons.filter(lesson => done.has(lesson.id)).length
    return {
        completed, total: course.lessons.length,
        percent: Math.round((completed / course.lessons.length) * 100),
        currentLessonId: course.lessons.find(lesson => !done.has(lesson.id))?.id ?? null,
    }
}

export interface CourseCondition { title: string; detail: string }

/** Every listed condition is enforced together by the completion rule of this version. */
export function completionConditions(course: CourseDetail): CourseCondition[] {
    const rules = course.completion_rules
    const items: CourseCondition[] = []
    if ((course.delivery_mode ?? 'self_paced') !== 'self_paced') {
        items.push({ title: 'Obecność', detail: `Co najmniej ${rules?.attendance_percent ?? 80}% czasu każdego wymaganego spotkania.` })
    }
    if (rules?.require_all_lessons && course.lessons.length > 0) {
        items.push({ title: 'Wszystkie moduły', detail: `Ukończ ${modules(course.lessons.length)} tego programu.` })
    }
    if (rules?.quiz_required) {
        const questions = `${course.quiz_questions_count} ${plural(course.quiz_questions_count, 'pytanie', 'pytania', 'pytań')}.`
        const limit = course.quiz_attempt_limit
        const windowHours = course.quiz_attempt_window_hours
        const attempts = limit && windowHours ? ` ${limit} ${plural(limit, 'próba', 'próby', 'prób')} w ciągu ${windowHours} ${plural(windowHours, 'godziny', 'godzin', 'godzin')}.` : ''
        items.push({ title: `Test końcowy, próg ${rules.quiz_pass_percent}%`, detail: `${questions}${attempts}` })
    }
    return items
}

export interface EditionDateParts { month: string; day: string; year: string; weekday: string; time: string }

export function editionDateParts(session: Pick<AcademySessionDTO, 'startsAt' | 'endsAt' | 'timeZone'>): EditionDateParts {
    const zone = session.timeZone
    const at = new Date(session.startsAt)
    const format = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('pl-PL', { ...options, timeZone: zone }).format(at)
    const clock = (value: string) => new Intl.DateTimeFormat('pl-PL', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: zone }).format(new Date(value))
    const weekday = format({ weekday: 'long' })
    return {
        month: format({ month: 'short' }).replace('.', '').toLocaleUpperCase('pl-PL'),
        day: format({ day: 'numeric' }),
        year: format({ year: 'numeric' }),
        weekday: weekday.charAt(0).toLocaleUpperCase('pl-PL') + weekday.slice(1),
        time: `${clock(session.startsAt)}–${clock(session.endsAt)}`,
    }
}

function fileSize(bytes: number): string {
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}

export function filesLabel(count: number): string {
    return `${count} ${plural(count, 'plik', 'pliki', 'plików')}`
}

export interface CourseMaterial { key: string; name: string; size: string; href: string }

/** Files the learner downloads. Video, audio and captions belong to the lesson player. */
export function courseMaterials(course: CourseDetail): CourseMaterial[] {
    return course.lessons.flatMap(lesson => {
        if (!lesson.content_available) return []
        return lesson.attachments
            .filter(item => !item.caption_for_asset_id && !/^(video|audio)\//.test(item.mime_type ?? '') && item.mime_type !== 'text/vtt')
            .map((item, index) => ({
                key: `${lesson.id}-${item.asset_id ?? item.storage_path}-${index}`,
                name: item.name,
                size: fileSize(item.size_bytes),
                href: `/api/akademia/attachment?${new URLSearchParams({ lessonId: lesson.id, ...(item.asset_id ? { assetId: item.asset_id } : { path: item.storage_path }) })}`,
            }))
    })
}
