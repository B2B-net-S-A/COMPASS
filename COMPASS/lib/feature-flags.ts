// Phase 26 — feature flags
//
// Two-tier flag layout for invoices:
//   - NEXT_PUBLIC_INVOICES_ENABLED — client/build-time, embedded in bundle (UI hide)
//   - INVOICES_ENABLED              — server-only runtime (server-action guards)
//
// Both default to 'false' (invoices flow disabled). To re-enable, set both to 'true'
// in Coolify env vault (NEXT_PUBLIC_* requires rebuild; server-only just restart).

/** Client-safe (build-time embed). Use in client components + server components rendering UI. */
export function isInvoicesEnabled(): boolean {
    return process.env.NEXT_PUBLIC_INVOICES_ENABLED === 'true'
}

/** Server-only (runtime env). Use in server actions to guard writes. */
export function isInvoicesEnabledServer(): boolean {
    return process.env.INVOICES_ENABLED === 'true'
}

/** Throw if invoices disabled — convenience guard for server actions. */
export function requireInvoicesEnabled(): void {
    if (!isInvoicesEnabledServer()) {
        throw new Error('Faktury są aktualnie wyłączone w tej fazie aplikacji.')
    }
}
