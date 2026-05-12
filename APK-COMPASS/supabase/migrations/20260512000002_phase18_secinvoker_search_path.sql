-- ============================================================
-- Phase 18.2 — search_path na SECURITY INVOKER funkcjach
-- Date: 2026-05-12
--
-- Drugi etap security hardening: eliminuje `function_search_path_mutable`
-- warnings z Supabase advisora. Funkcje SECURITY INVOKER są mniej krytyczne
-- niż DEFINER (run as caller), ale linter best-practice + defense in depth.
--
-- Idempotent: ALTER FUNCTION SET search_path nadpisuje istniejące.
-- ============================================================

ALTER FUNCTION public.update_updated_at_column() SET search_path = public, pg_catalog;
ALTER FUNCTION public.expire_old_notifications() SET search_path = public, pg_catalog;
ALTER FUNCTION public.create_notification(uuid, text, text, text, text, text, text, text) SET search_path = public, pg_catalog;
ALTER FUNCTION public.update_loyalty_status() SET search_path = public, pg_catalog;
ALTER FUNCTION public.update_doc_timestamp() SET search_path = public, pg_catalog;
ALTER FUNCTION public.update_contracts_updated_at() SET search_path = public, pg_catalog;
ALTER FUNCTION public.is_inbox_category(uuid) SET search_path = public, pg_catalog;
ALTER FUNCTION public.match_assist_knowledge(vector, double precision, integer, text) SET search_path = public, extensions, pg_catalog;
ALTER FUNCTION public.leave_requests_auto_approve_sick() SET search_path = public, pg_catalog;
ALTER FUNCTION public.update_course_ratings_stats() SET search_path = public, pg_catalog;
ALTER FUNCTION public.update_course_enrollment_stats() SET search_path = public, pg_catalog;
ALTER FUNCTION public.support_set_updated_at() SET search_path = public, pg_catalog;
ALTER FUNCTION public.trg_learning_paths_updated_at() SET search_path = public, pg_catalog;
ALTER FUNCTION public.trg_lp_enrollment_stats() SET search_path = public, pg_catalog;
ALTER FUNCTION public.trg_course_qa_updated_at() SET search_path = public, pg_catalog;
ALTER FUNCTION public.trg_course_answers_count() SET search_path = public, pg_catalog;

-- ─── TODO follow-up (osobny plan) ─────────────────────────────
-- 1. extension_in_public: przenieść pgvector z `public` do `extensions` schema.
--    Wymaga refactoru wszystkich funkcji używających `vector` typu (match_*,
--    match_assist_knowledge, embeddings columns).
-- 2. public_bucket_allows_listing: zmienić policies na storage.objects dla
--    `avatars` i `chat-attachments` żeby disallow LIST (zachowując dostęp
--    do konkretnych obiektów via URL).
-- 3. auth_leaked_password_protection: włączyć w Supabase Dashboard
--    (Auth → Security → "Check passwords against HaveIBeenPwned").
-- 4. Pozostałe SECURITY DEFINER funkcje wystawione przez REST (`is_admin`,
--    `is_internal_or_admin`, itp.) — zostawić: są używane przez RLS
--    evaluation, anon też potrzebuje EXECUTE permission dla public-readable
--    table policies używających tych helperów.
