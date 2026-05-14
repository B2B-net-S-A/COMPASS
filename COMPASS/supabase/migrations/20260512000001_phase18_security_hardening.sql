-- ============================================================
-- Phase 18.1 — Security Hardening
-- Date: 2026-05-12
--
-- Adresuje issue zidentyfikowane przez Supabase advisors + audit kodu:
--
-- A. RLS disabled na 2 wrażliwych tabelach:
--    - login_attempts (email + IP + success — może być scrape'owana)
--    - verification_codes (MFA codes w plaintext — może umożliwić account takeover)
--    Fix: ENABLE ROW LEVEL SECURITY bez policies → access tylko przez service_role.
--    Code refactor (osobno): lib/auth/security.ts, lib/mfa.ts → createServiceClient().
--
-- B. 5 SECURITY DEFINER funkcji bez `SET search_path` (search-path hijack risk):
--    - handle_new_user, is_admin, is_inbox_handler, is_internal_or_admin,
--    - match_courses
--
-- C. 6 SECURITY DEFINER funkcji wystawionych dla `anon` przez REST/RPC,
--    powinny wymagać authenticated:
--    - admin_revoke_user_sessions, award_course_points, award_first_publish_bonus,
--    - get_quiz_for_attempt, submit_quiz_attempt, handle_new_user (internal trigger)
--    REVOKE EXECUTE FROM anon, PUBLIC. Pozostawiamy authenticated + service_role.
--    NIE revoke: is_admin/is_internal_or_admin/is_trainer_or_admin/is_inbox_handler
--    bo są wywoływane przez RLS policy evaluation (anon też musi je móc execute
--    żeby anon-readable policies działały).
--    match_courses zostaje public (intentional RAG search).
--
-- D. View work_clock_daily ma SECURITY DEFINER → recreate as SECURITY INVOKER
--    (każdy widzi swoje sessions via RLS, view nie powinien bypassować).
--
-- Idempotent: ALTER FUNCTION SET search_path nadpisuje;
--             REVOKE jest idempotent;
--             CREATE OR REPLACE VIEW jest idempotent.
-- ============================================================

BEGIN;

-- ─── A. RLS enable na login_attempts + verification_codes ────────────────

ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.login_attempts IS
    'Phase 18.1: RLS enabled (no policies) — access only via service_role client (lib/supabase/admin.ts). App reads/writes via lib/auth/security.ts which uses createServiceClient.';

ALTER TABLE public.verification_codes ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.verification_codes IS
    'Phase 18.1: RLS enabled (no policies) — MFA codes are sensitive (plaintext). Access only via service_role client (lib/supabase/admin.ts). App reads/writes via lib/mfa.ts which uses createServiceClient.';

-- ─── B. SET search_path na SECURITY DEFINER funkcjach ────────────────────

ALTER FUNCTION public.handle_new_user()
    SET search_path = public, auth, pg_catalog;

ALTER FUNCTION public.is_admin()
    SET search_path = public, pg_catalog;

ALTER FUNCTION public.is_inbox_handler()
    SET search_path = public, pg_catalog;

ALTER FUNCTION public.is_internal_or_admin()
    SET search_path = public, pg_catalog;

ALTER FUNCTION public.match_courses(vector, double precision, integer)
    SET search_path = public, extensions, pg_catalog;

-- ─── C. Revoke EXECUTE z anon/PUBLIC dla business-logic funkcji ──────────

-- handle_new_user is a trigger function, never call via REST.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, PUBLIC, authenticated;

-- Admin-only operations
REVOKE EXECUTE ON FUNCTION public.admin_revoke_user_sessions(uuid) FROM anon, PUBLIC;

-- Course business logic — authenticated only
REVOKE EXECUTE ON FUNCTION public.award_course_points(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.award_first_publish_bonus(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_quiz_for_attempt(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.submit_quiz_attempt(uuid, jsonb) FROM anon, PUBLIC;

-- ─── D. work_clock_daily view: SECURITY DEFINER → SECURITY INVOKER ───────
-- Definition zachowana 1:1; tylko zmiana semantics z definer→invoker.

DROP VIEW IF EXISTS public.work_clock_daily;
CREATE VIEW public.work_clock_daily
WITH (security_invoker = true) AS
SELECT user_id,
    ((started_at AT TIME ZONE client_tz))::date AS work_date,
    (sum(active_seconds))::integer AS active_seconds,
    round(((sum(active_seconds))::numeric / 3600.0), 2) AS hours,
    min(started_at) AS first_clock_in,
    max(ended_at) AS last_clock_out,
    (count(*))::integer AS session_count
FROM work_clock_sessions s
WHERE (ended_at IS NOT NULL)
GROUP BY user_id, (((started_at AT TIME ZONE client_tz))::date);

COMMENT ON VIEW public.work_clock_daily IS
    'Phase 18.1: SECURITY INVOKER — each user sees only their own sessions via work_clock_sessions RLS.';

GRANT SELECT ON public.work_clock_daily TO authenticated, anon;

COMMIT;

-- ─── Verification (post-apply, run manually) ─────────────────────────────
--
-- 1. RLS enabled, no policies (write-once via service_role):
--    SELECT tablename, rowsecurity, (SELECT COUNT(*) FROM pg_policies p WHERE p.tablename = c.relname) AS policy_count
--    FROM pg_class c JOIN pg_tables t ON t.tablename = c.relname
--    WHERE c.relname IN ('login_attempts','verification_codes');
--    -> expected: rowsecurity=t, policy_count=0
--
-- 2. SECURITY DEFINER functions all have search_path:
--    SELECT proname FROM pg_proc
--    WHERE pronamespace='public'::regnamespace AND prosecdef AND proconfig IS NULL;
--    -> expected: 0 rows
--
-- 3. anon has no EXECUTE on revoked functions:
--    SELECT routine_name FROM information_schema.routine_privileges
--    WHERE specific_schema='public' AND grantee='anon' AND privilege_type='EXECUTE'
--      AND routine_name IN ('handle_new_user','admin_revoke_user_sessions','award_course_points','award_first_publish_bonus','get_quiz_for_attempt','submit_quiz_attempt');
--    -> expected: 0 rows
--
-- 4. work_clock_daily is SECURITY INVOKER:
--    SELECT relname, reloptions FROM pg_class WHERE relname='work_clock_daily';
--    -> expected: {security_invoker=true}
