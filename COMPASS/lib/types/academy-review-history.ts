export type AcademyReviewHistoryAction = 'COURSE_REVIEW_SUBMITTED' | 'COURSE_SUBMITTED' | 'COURSE_PUBLISHED' | 'COURSE_REJECTED' | 'LEGACY_COURSE_REVIEWED' | 'COURSE_ARCHIVED'
export interface AcademyReviewHistoryCursor { createdAt: string; id: string }
export interface AcademyReviewHistoryItem {
    id: string
    action: AcademyReviewHistoryAction
    createdAt: string
    actorName: string | null
    versionNumber: number | null
    submissionId: string | null
    reason: string | null
    approved: boolean | null
}
export interface AcademyReviewHistoryPage {
    items: AcademyReviewHistoryItem[]
    nextCursor: AcademyReviewHistoryCursor | null
}
