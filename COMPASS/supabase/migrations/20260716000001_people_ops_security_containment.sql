-- ============================================================================
-- People Ops / Consultant Success — security containment (Faza 0 audytu
-- docs/people-ops-consultant-success-audit-and-unification-plan-2026-07-16.md)
--
-- Zamyka:
--   P0.1  — lifecycle_events: INSERT `WITH CHECK (true)` pozwalał każdemu
--           zalogowanemu dopisać nieusuwalny (append-only) wpis audytowy
--           dowolnej osobie. Jedyna user-context ścieżka zapisu w aplikacji
--           (assignBuddy) przechodzi na service-role w tym samym PR, więc
--           polityka INSERT znika bez zamiennika — zapis wyłącznie przez
--           service_role i SECURITY DEFINER RPC (start_onboarding_for_user,
--           start_offboarding_for_user).
--   P0.2  — support_ticket_comments: gałąź `NOT is_internal` w INSERT nie
--           wymagała dostępu do ticketu — każdy authenticated znający UUID
--           mógł dopisać komentarz do cudzego ticketu. Wspólny, testowalny
--           predykat can_access_support_ticket() (SECURITY INVOKER →
--           deleguje do RLS support_tickets = jeden kontrakt dostępu)
--           obowiązkowy w SELECT i INSERT.
--   P1.14 — funkcje triggerowe sync Fazy 37 (SECURITY DEFINER) były
--           EXECUTE-owalne przez anon/authenticated.
--   P1.13 (częściowo) — mirrory Fazy 37 (onboarding_cases, exit_cases) miały
--           polityki write dla użytkowników = drugie źródło zapisu obok
--           triggerów legacy→mirror. Mirror staje się read-only dla ról API.
--   P1.15 (częściowo) — `FOR ALL` (w tym DELETE) na contractors i tabelach
--           historii pozwalał TCM/adminowi hard-delete'ować historię osoby
--           bezpośrednio przez Data API (FK mają ON DELETE CASCADE).
--           Polityki rozdzielone na SELECT/INSERT/UPDATE — bez DELETE.
--           Aplikacja pisze przez service-role (bypass RLS), więc żaden
--           istniejący flow nie traci uprawnień.
--
-- Rollback: zaostrzenie dostępu — NIE przywracać podatnych polityk; w razie
-- regresji dostępu skorygować kolejną migracją (patrz plan §7 Faza 0).
-- ============================================================================

-- ─── 1. P0.1 — lifecycle_events: koniec z INSERT dla authenticated ─────────
DROP POLICY IF EXISTS "lifecycle_events_insert_authenticated" ON lifecycle_events;
-- Brak zamiennika: RLS włączone + brak polityki INSERT = deny dla ról API.
-- service_role omija RLS; SECURITY DEFINER RPC (owner postgres) też.

COMMENT ON TABLE lifecycle_events IS
    'Phase 22. Immutable audit timeline for employee lifecycle. INSERT wyłącznie przez service-role/SECURITY DEFINER RPC (Faza 0 audytu 2026-07-16); UPDATE/DELETE blokuje trigger.';

-- ─── 2. P0.2 — wspólny predykat dostępu do ticketu ──────────────────────────
-- SECURITY INVOKER (default): EXISTS przechodzi przez RLS support_tickets
-- wołającego użytkownika → definicja dostępu do ticketu jest DOKŁADNIE tą
-- samą, którą egzekwuje support_tickets_select_user_or_inbox. Jeden kontrakt.
CREATE OR REPLACE FUNCTION public.can_access_support_ticket(p_ticket_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public, pg_catalog
AS $$
    SELECT EXISTS (SELECT 1 FROM support_tickets t WHERE t.id = p_ticket_id);
$$;

REVOKE EXECUTE ON FUNCTION public.can_access_support_ticket(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_support_ticket(UUID) TO authenticated, service_role;

COMMENT ON FUNCTION public.can_access_support_ticket(UUID) IS
    'Wspólny predykat RLS: czy bieżący użytkownik widzi ticket (deleguje do RLS support_tickets). Używany w SELECT i INSERT support_ticket_comments.';

-- SELECT: dostęp do ticketu obowiązkowy; komentarze internal tylko dla
-- admin / inbox handler / assignee / TCM przy kategorii contractor_%.
DROP POLICY IF EXISTS "support_comments_select_via_ticket_access" ON support_ticket_comments;
CREATE POLICY "support_comments_select_via_ticket_access" ON support_ticket_comments
    FOR SELECT TO authenticated
    USING (
        can_access_support_ticket(ticket_id)
        AND (
            NOT is_internal
            OR is_admin()
            OR is_inbox_handler()
            OR EXISTS (
                SELECT 1 FROM support_tickets t
                WHERE t.id = support_ticket_comments.ticket_id
                  AND (
                    t.assignee_id = auth.uid()
                    OR (is_contractor_category(t.category_id) AND has_lifecycle_access())
                  )
            )
        )
    );

-- INSERT: author = aktor ORAZ dostęp do ticketu — również dla is_internal=false
-- (dotychczas gałąź nieinternalowa przechodziła bez sprawdzenia ticket_id).
DROP POLICY IF EXISTS "support_comments_insert_via_ticket_access" ON support_ticket_comments;
CREATE POLICY "support_comments_insert_via_ticket_access" ON support_ticket_comments
    FOR INSERT TO authenticated
    WITH CHECK (
        author_id = auth.uid()
        AND can_access_support_ticket(ticket_id)
        AND (
            NOT is_internal
            OR is_admin()
            OR is_inbox_handler()
            OR EXISTS (
                SELECT 1 FROM support_tickets t
                WHERE t.id = support_ticket_comments.ticket_id
                  AND (
                    t.assignee_id = auth.uid()
                    OR (is_contractor_category(t.category_id) AND has_lifecycle_access())
                  )
            )
        )
    );

-- ─── 3. P1.14 — funkcje triggerowe sync Fazy 37 bez publicznego EXECUTE ────
-- (sync_task_ticket ma już revoke z wcześniejszej migracji; search_path
-- wszystkie mają pinowany na public, pg_temp.)
REVOKE EXECUTE ON FUNCTION public.sync_conversation_ticket() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_exit_case_contractor() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_exit_case_employee() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_onboarding_case_contractor() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_onboarding_case_employee() FROM PUBLIC, anon, authenticated;
-- Trigger-only funkcja z Phase 22 — ta sama higiena:
REVOKE EXECUTE ON FUNCTION public.block_lifecycle_events_mutation() FROM PUBLIC, anon, authenticated;
-- Higiena: jedyny helper RLS bez pinowanego search_path:
ALTER FUNCTION public.is_contractor_category(UUID) SET search_path = public, pg_catalog;

-- Znalezisko Advisora przy re-run (Faza 0 wymaga klasyfikacji wyników):
-- admin_hard_delete_user to SECURITY DEFINER kasujący auth.users BEZ wewnętrznego
-- sprawdzenia aktora — a był wykonywalny przez anon/authenticated przez
-- /rest/v1/rpc/. Aplikacja woła go wyłącznie service-rolem po guardzie
-- Super Admina (deleteUserAccount), więc revoke niczego nie psuje.
REVOKE EXECUTE ON FUNCTION public.admin_hard_delete_user(UUID) FROM PUBLIC, anon, authenticated;

-- ─── 4. P1.13 — mirrory Fazy 37 read-only dla ról API ──────────────────────
-- Jedyny legalny writer mirrora to sync-triggery legacy→mirror (SECURITY
-- DEFINER, owner postgres → bypass RLS). Aplikacja mirrorów nie czyta ani
-- nie pisze (people-ops.ts liczy z tabel legacy). Polityki SELECT zostają.
DROP POLICY IF EXISTS "onboarding_cases_write_tcm_or_admin" ON onboarding_cases;
DROP POLICY IF EXISTS "onboarding_cases_update_manager_team" ON onboarding_cases;
DROP POLICY IF EXISTS "onboarding_cases_update_owner_checkin" ON onboarding_cases;

DROP POLICY IF EXISTS "exit_cases_insert" ON exit_cases;
DROP POLICY IF EXISTS "exit_cases_update_owner_submit" ON exit_cases;
DROP POLICY IF EXISTS "exit_cases_update_tcm_or_admin" ON exit_cases;

COMMENT ON TABLE onboarding_cases IS
    'Faza 37 mirror (legacy = źródło prawdy). Read-only dla ról API od Fazy 0 audytu 2026-07-16 — pisze wyłącznie sync-trigger.';
COMMENT ON TABLE exit_cases IS
    'Faza 37 mirror (legacy = źródło prawdy). Read-only dla ról API od Fazy 0 audytu 2026-07-16 — pisze wyłącznie sync-trigger.';

-- ─── 5. P1.15 — bez DELETE na contractors i tabelach historii ──────────────
-- FOR ALL → SELECT/INSERT/UPDATE. Aplikacja pisze service-rolem po guardach,
-- więc jedyny realny efekt to zablokowanie hard-delete przez Data API
-- (contractors ma FK ON DELETE CASCADE do rozmów/wywiadów/Success/feedback).

-- contractors
DROP POLICY IF EXISTS "contractors_all_lifecycle" ON contractors;
CREATE POLICY "contractors_select_lifecycle" ON contractors
    FOR SELECT TO authenticated USING (has_lifecycle_access());
CREATE POLICY "contractors_insert_lifecycle" ON contractors
    FOR INSERT TO authenticated WITH CHECK (has_lifecycle_access());
CREATE POLICY "contractors_update_lifecycle" ON contractors
    FOR UPDATE TO authenticated USING (has_lifecycle_access()) WITH CHECK (has_lifecycle_access());

-- contractor_conversations (historia rozmów)
DROP POLICY IF EXISTS "contractor_conv_all_lifecycle" ON contractor_conversations;
CREATE POLICY "contractor_conv_select_lifecycle" ON contractor_conversations
    FOR SELECT TO authenticated USING (has_lifecycle_access());
CREATE POLICY "contractor_conv_insert_lifecycle" ON contractor_conversations
    FOR INSERT TO authenticated WITH CHECK (has_lifecycle_access());
CREATE POLICY "contractor_conv_update_lifecycle" ON contractor_conversations
    FOR UPDATE TO authenticated USING (has_lifecycle_access()) WITH CHECK (has_lifecycle_access());

-- contractor_onboarding_interviews
DROP POLICY IF EXISTS "contractor_onb_all_lifecycle" ON contractor_onboarding_interviews;
CREATE POLICY "contractor_onb_select_lifecycle" ON contractor_onboarding_interviews
    FOR SELECT TO authenticated USING (has_lifecycle_access());
CREATE POLICY "contractor_onb_insert_lifecycle" ON contractor_onboarding_interviews
    FOR INSERT TO authenticated WITH CHECK (has_lifecycle_access());
CREATE POLICY "contractor_onb_update_lifecycle" ON contractor_onboarding_interviews
    FOR UPDATE TO authenticated USING (has_lifecycle_access()) WITH CHECK (has_lifecycle_access());

-- contractor_exit_interviews
DROP POLICY IF EXISTS "contractor_exit_all_lifecycle" ON contractor_exit_interviews;
CREATE POLICY "contractor_exit_select_lifecycle" ON contractor_exit_interviews
    FOR SELECT TO authenticated USING (has_lifecycle_access());
CREATE POLICY "contractor_exit_insert_lifecycle" ON contractor_exit_interviews
    FOR INSERT TO authenticated WITH CHECK (has_lifecycle_access());
CREATE POLICY "contractor_exit_update_lifecycle" ON contractor_exit_interviews
    FOR UPDATE TO authenticated USING (has_lifecycle_access()) WITH CHECK (has_lifecycle_access());

-- client_entries (archiwum Wejść)
DROP POLICY IF EXISTS "client_entries_all_lifecycle" ON client_entries;
CREATE POLICY "client_entries_select_lifecycle" ON client_entries
    FOR SELECT TO authenticated USING (has_lifecycle_access());
CREATE POLICY "client_entries_insert_lifecycle" ON client_entries
    FOR INSERT TO authenticated WITH CHECK (has_lifecycle_access());
CREATE POLICY "client_entries_update_lifecycle" ON client_entries
    FOR UPDATE TO authenticated USING (has_lifecycle_access()) WITH CHECK (has_lifecycle_access());

-- client_departures (Zejścia)
DROP POLICY IF EXISTS "client_departures_all_lifecycle" ON client_departures;
CREATE POLICY "client_departures_select_lifecycle" ON client_departures
    FOR SELECT TO authenticated USING (has_lifecycle_access());
CREATE POLICY "client_departures_insert_lifecycle" ON client_departures
    FOR INSERT TO authenticated WITH CHECK (has_lifecycle_access());
CREATE POLICY "client_departures_update_lifecycle" ON client_departures
    FOR UPDATE TO authenticated USING (has_lifecycle_access()) WITH CHECK (has_lifecycle_access());

-- contractor_bench (dismiss = UPDATE dismissed_at, nie DELETE)
DROP POLICY IF EXISTS "contractor_bench_all_lifecycle" ON contractor_bench;
CREATE POLICY "contractor_bench_select_lifecycle" ON contractor_bench
    FOR SELECT TO authenticated USING (has_lifecycle_access());
CREATE POLICY "contractor_bench_insert_lifecycle" ON contractor_bench
    FOR INSERT TO authenticated WITH CHECK (has_lifecycle_access());
CREATE POLICY "contractor_bench_update_lifecycle" ON contractor_bench
    FOR UPDATE TO authenticated USING (has_lifecycle_access()) WITH CHECK (has_lifecycle_access());

-- contractor_tasks (app hard-delete idzie service-rolem — defense-in-depth
-- przeciw DELETE bezpośrednio przez Data API; soft-cancel kontrakt = Faza 2)
DROP POLICY IF EXISTS "contractor_tasks_all_lifecycle" ON contractor_tasks;
CREATE POLICY "contractor_tasks_select_lifecycle" ON contractor_tasks
    FOR SELECT TO authenticated USING (has_lifecycle_access());
CREATE POLICY "contractor_tasks_insert_lifecycle" ON contractor_tasks
    FOR INSERT TO authenticated WITH CHECK (has_lifecycle_access());
CREATE POLICY "contractor_tasks_update_lifecycle" ON contractor_tasks
    FOR UPDATE TO authenticated USING (has_lifecycle_access()) WITH CHECK (has_lifecycle_access());
