// Phase 17 + 17b — Work-clock server actions (barrel).
//
// The 22 server actions are organised by domain in lib/actions/internal-clock/*.
// This barrel is a thin re-export module so existing call sites
// (`import { ... } from '@/lib/actions/internal-clock'`) keep working.
//
// Each sub-file declares 'use server' itself, so re-exports here preserve the
// server-action identity Next.js tracks. The barrel does NOT use 'use server'
// because Next 14 forbids non-declaration exports (re-exports) in those files.
//
// Pure logic (no DB access) lives in lib/clock/*.ts. DB access stays in the
// per-domain sub-files in lib/actions/internal-clock/.

export { getWorkMonitoringTermsVersion } from './internal-clock/consent'

// ─── Server-action re-exports (functions) ───────────────────────────────────

export {
    getMyConsentState,
    acceptMonitoringConsent,
    revokeMonitoringConsent,
} from './internal-clock/consent'

export {
    startClockSession,
    getActiveClockSession,
    stopClockSession,
    transferClockSession,
} from './internal-clock/sessions'

export {
    getMyClockMonth,
    getMyClockSessionsForMonth,
} from './internal-clock/aggregates'

export { suggestTimesheetEntriesFromClock } from './internal-clock/suggest'

export {
    listClockSessionsForReview,
    approveCorrection,
    rejectCorrection,
    applyCorrectionFlag,
} from './internal-clock/corrections'

export { setMyClockSummaryEmailPreference } from './internal-clock/preferences'

export {
    getMyTimelineForDay,
    recordRouteVisit,
    enableRouteTrackingForSession,
} from './internal-clock/timeline'

export {
    markTimesheetAutoFilled,
    clearAutoFilledTimesheet,
} from './internal-clock/auto-fill'

export { getMyActivityRateForDay } from './internal-clock/activity-rate'

export {
    getRecentlyAutoClosedSession,
    discardAutoClosedSession,
    mergeWithPreviousSession,
} from './internal-clock/idle-resume'

export { pauseClockSession, resumeClockSession } from './internal-clock/pause'

// ─── DTO type re-exports (erased at runtime) ────────────────────────────────

export type { TimelineBlockDTO } from './internal-clock/timeline'
export type { RecentlyClosedSessionDTO } from './internal-clock/idle-resume'
export type { ActivityRateBucket } from '@/lib/clock/daily-summary'
export type { PauseClockInput, PauseClockResult } from '@/lib/clock/pause-resume'
