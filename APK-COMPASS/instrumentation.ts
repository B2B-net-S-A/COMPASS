// Next.js instrumentation hook — runs once per server worker on boot.
// Sentry init is split per runtime so the right SDK is loaded for Node vs Edge.
// See https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
//
// Sentry init is idempotent and a no-op when SENTRY_DSN is unset, so this file
// is safe to commit before the DSN is provisioned in Coolify env vault.

export async function register(): Promise<void> {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        await import('./sentry.server.config')
    }
    if (process.env.NEXT_RUNTIME === 'edge') {
        await import('./sentry.edge.config')
    }
}

// onRequestError is a Next.js 15 hook — re-exported here for forward compat.
// On Next.js 14 it's a no-op import (the export exists in @sentry/nextjs but
// Next 14 never invokes it). Keeping the line means upgrading Next does not
// require touching instrumentation.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const onRequestError = (...args: unknown[]): void => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sentry = require('@sentry/nextjs') as Record<string, unknown>
    const fn = sentry.captureRequestError as ((...a: unknown[]) => void) | undefined
    if (typeof fn === 'function') {
        fn(...args)
    }
}
