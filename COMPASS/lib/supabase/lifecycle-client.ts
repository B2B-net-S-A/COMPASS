// Phase 22 (2026-05-17) — Untyped Supabase clients for the lifecycle module.
//
// New tables (onboarding_*, exit_interviews, offboarding_*, lifecycle_events) and
// RPCs (start_onboarding_for_user, start_offboarding_for_user) are not yet in the
// generated database.types.ts. Until `supabase gen types` runs post-deploy, the
// strict typed client refuses these table names.
//
// This module provides explicit `any`-typed wrappers so server actions / pages
// can call new tables/RPCs without `as any` noise on every line. Removal plan:
// 1. Apply migrations to production.
// 2. Run `supabase gen types typescript --linked --schema public` to refresh types.
// 3. Replace `createLifecycleClient` / `createLifecycleAdminClient` with the strict
//    `createClient` / `createServiceClient` and drop this file.
//
// Server-side guards + RLS still enforce authorization — type erosion is purely
// TypeScript-level and does not affect runtime safety.

import 'server-only'

import { createClient as createTyped } from '@/lib/supabase/server'
import { createServiceClient as createServiceTyped } from '@/lib/supabase/admin'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createLifecycleClient(): any {
    return createTyped()
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createLifecycleAdminClient(): any {
    return createServiceTyped()
}
