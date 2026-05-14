// Client-side Sentry init (browser bundle). DSN must be a NEXT_PUBLIC_* env so
// it's embedded at build time. Conditional so the SDK is a no-op when the DSN
// is not set (no extra bundle weight at runtime beyond the import).
import * as Sentry from '@sentry/nextjs'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
    Sentry.init({
        dsn,
        environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? 'production',
        release: process.env.NEXT_PUBLIC_GIT_SHA,
        // Security/RODO: don't auto-attach IP / user-agent / form fields.
        // Replay below already masks all text + blocks all media.
        sendDefaultPii: false,
        tracesSampleRate: 0.1,
        // Session Replay: sample 0% of all sessions, but 100% of error sessions.
        // Privacy: mask all text + block all media so HR data does not leak.
        replaysSessionSampleRate: 0,
        replaysOnErrorSampleRate: 1.0,
        integrations: [
            Sentry.replayIntegration({
                maskAllText: true,
                blockAllMedia: true,
            }),
        ],
    })
}
