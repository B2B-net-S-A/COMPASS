export type AcademyRunStatus = 'draft' | 'published' | 'cancelled'
export type AcademyRegistrationStatus = 'confirmed' | 'waitlisted' | 'cancelled'
export type AcademyMeetingMode = 'managed_teams' | 'external_link'
export type AcademyAttendanceStatus = 'present' | 'insufficient' | 'needs_review'
export interface AcademyIntegrationConfigDTO {
    managedTeamsAvailable: boolean
    reason?: string
    rawAttendanceRetentionDays: number | null
    retentionWarning?: string
}

export interface AcademySessionDTO {
    id: string
    runId: string
    title: string
    startsAt: string
    endsAt: string
    timeZone: string
    mode: AcademyMeetingMode
    required: boolean
    status: 'scheduled' | 'cancelled'
    joinUrl: string | null
    syncStatus: 'draft' | 'pending' | 'ready' | 'error' | 'cancelled'
    organizerId: string | null
    externalJoinUrl?: string | null
    actualStartsAt: string | null
    actualEndsAt: string | null
    attendanceWindowConfirmed: boolean
    replacesSessionId?: string | null
    replacementSessionId?: string | null
    canReplace?: boolean
}
export interface AcademyRunDTO {
    id: string
    courseId: string
    versionId: string
    versionNumber: number
    courseTitle: string
    courseSlug: string
    title: string
    capacity: number
    status: AcademyRunStatus
    confirmedCount: number
    waitlistCount: number
    canManage: boolean
    canPublish: boolean
    myRegistration: { id: string; status: AcademyRegistrationStatus; enrollmentId: string | null; completedAt: string | null; completionRevokedAt?: string | null; completionRevokedReason?: string | null } | null
    sessions: AcademySessionDTO[]
}
export interface AcademyRunParticipantDTO {
    registrationId: string
    userId: string
    enrollmentId: string | null
    fullName: string | null
    email: string
    status: AcademyRegistrationStatus
    completedAt: string | null
    attendance: Array<{
        sessionId: string
        status: AcademyAttendanceStatus
        attendedSeconds: number
        source: 'manual' | 'teams'
        note: string | null
    }>
}
export interface AcademyOrganizerDTO {
    id: string
    profileId: string
    fullName: string | null
    email: string
    tenantId: string
    objectId: string
    enabled: boolean
}
export interface AcademyM365IdentityDTO {
    id: string
    userId: string
    fullName: string | null
    email: string
    tenantId: string
    objectId: string
    verifiedEmail: string | null
    verifiedAt: string
}
export interface AcademyIntegrationIssueDTO {
    id: string
    sessionId: string
    sessionTitle: string
    runId: string
    kind: 'sync_meeting' | 'cancel_meeting' | 'sync_attendance'
    status: 'pending' | 'processing' | 'retry' | 'done' | 'failed' | 'skipped'
    attempts: number
    lastError: string | null
    nextAttemptAt: string
    updatedAt: string
}
export interface SaveAcademySessionInput {
    id?: string
    runId: string
    title: string
    startsAt: string
    endsAt: string
    timeZone: string
    mode: AcademyMeetingMode
    organizerId?: string | null
    externalJoinUrl?: string | null
    required: boolean
}

export interface ReplaceAcademySessionInput {
    sessionId: string
    session: Omit<SaveAcademySessionInput, 'id'>
    reason: string
    externalCancellationConfirmed: boolean
}
