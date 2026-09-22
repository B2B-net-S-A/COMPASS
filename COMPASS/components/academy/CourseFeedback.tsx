import { CourseSurveyForm } from '@/components/learning/CourseSurveyForm'
import { RatingWidget } from '@/components/learning/RatingWidget'

export function CourseFeedback({ courseId, enrollmentId, completedAt, initialRating, initialComment }: { courseId: string; enrollmentId: string; completedAt?: string | null; initialRating?: number; initialComment?: string | null }) {
    if (!completedAt) return null
    return <section aria-label="Ocena ukończonego szkolenia" className="space-y-4"><RatingWidget courseId={courseId} initialRating={initialRating} initialComment={initialComment ?? undefined} /><CourseSurveyForm courseId={courseId} enrollmentId={enrollmentId} /></section>
}
