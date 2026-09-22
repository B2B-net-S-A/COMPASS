/** Keep each learner link attached to the selected enrollment and immutable version. */
export function academyCourseHref(slug: string, enrollmentId?: string | null, suffix = ''): string {
    const path = `/learning/${encodeURIComponent(slug)}${suffix}`
    return enrollmentId ? `${path}?enrollment=${encodeURIComponent(enrollmentId)}` : path
}

export function academyCertificateHref(courseId: string, enrollmentId: string): string {
    return `/api/akademia/certificate?${new URLSearchParams({ courseId, enrollmentId })}`
}

export function academyCompletionMessage(reason?: string): string {
    switch (reason) {
        case 'completion_revoked': return 'To ukończenie zostało unieważnione przez administratora. Sprawdź uzasadnienie w historii szkolenia.'
        case 'required_lessons': return 'Ukończ wszystkie wymagane lekcje.'
        case 'quiz_not_passed': return 'Zdaj wymagany quiz końcowy.'
        case 'attendance_missing': return 'Obecność na wymaganych spotkaniach nie została jeszcze potwierdzona. Sprawdź szczegóły edycji.'
        default: return 'Nie wszystkie warunki ukończenia są jeszcze spełnione.'
    }
}

/** A live/blended enrollment resumes in its group; self-paced preserves its version. */
export function academyResumeHref(enrollment: {
    enrollment_id: string
    run_id?: string | null
    course: { slug: string }
    total_lessons: number
    last_accessed_lesson_id: string | null
}): string {
    return enrollment.run_id ? `/learning/edycje/${enrollment.run_id}` : academyCourseHref(
        enrollment.course.slug, enrollment.enrollment_id,
        enrollment.total_lessons ? `/lekcja/${enrollment.last_accessed_lesson_id ?? 'first'}` : '',
    )
}
