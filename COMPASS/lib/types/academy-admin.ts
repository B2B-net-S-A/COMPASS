import type { CourseStatus } from './learning'

export const ACADEMY_COURSE_STATUS_LABELS: Record<CourseStatus, string> = {
    draft: 'Szkic',
    pending_review: 'W moderacji',
    published: 'Opublikowany',
    rejected: 'Do poprawy',
    archived: 'Zarchiwizowany',
}

export type AcademyAdminCourseStatus = CourseStatus | 'all'
export interface AcademyAdminCourse {
    id: string
    title: string
    status: CourseStatus
    authorName: string | null
    publishedVersionNumber: number | null
    draftVersion: { title: string; number: number; status: CourseStatus } | null
    legacyReviewRequired: boolean
}
export interface AcademyAdminCoursePage {
    items: AcademyAdminCourse[]
    total: number
    page: number
    pageSize: number
}
