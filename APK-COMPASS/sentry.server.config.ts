// Server-side Sentry init (Node.js runtime — API routes, server components,
// server actions). Conditional on SENTRY_DSN so the SDK is a no-op until the
// DSN is configured in Coolify env vault.
import * as Sentry from '@sentry/nextjs'

const dsn = process.env.SENTRY_DSN

if (dsn) {
    Sentry.init({
        dsn,
        environment: process.env.SENTRY_ENVIRONMENT ?? 'production',
        release: process.env.GIT_SHA,
        tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.1'),
        profilesSampleRate: parseFloat(process.env.SENTRY_PROFILES_SAMPLE_RATE ?? '0.1'),
        // Don't capture transactions for healthcheck — it runs every 30s and
        // would dominate the trace quota.
        beforeSendTransaction(event) {
            if (event.transaction === 'GET /api/health') {
                return null
            }
            return event
        },
    })
}
