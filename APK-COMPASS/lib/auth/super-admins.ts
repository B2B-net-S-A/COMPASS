// ─── Super Admin Configuration ───────────────────────────────────────────────
// Super admin emails are provided at runtime via `SUPER_ADMIN_EMAILS` env var
// (comma-separated list). Keeping them out of source keeps the list private
// when the repo is public and lets us rotate without a redeploy by updating
// the secret and restarting.
// ─────────────────────────────────────────────────────────────────────────────

let cached: readonly string[] | null = null

function parseSuperAdmins(): readonly string[] {
    const raw = process.env.SUPER_ADMIN_EMAILS ?? ''
    return raw
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean)
}

export function getSuperAdmins(): readonly string[] {
    if (cached === null) {
        cached = parseSuperAdmins()
    }
    return cached
}

export function isSuperAdmin(email: string | null | undefined): boolean {
    if (!email) return false
    return getSuperAdmins().includes(email.toLowerCase())
}
