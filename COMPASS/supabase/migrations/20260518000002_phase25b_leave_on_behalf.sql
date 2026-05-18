-- Phase 25b — Manager/Admin wpisuje urlop w imieniu pracownika.
-- Pracownik czasem zapomina wysłać wniosek — manager (dla swojego zespołu via
-- profiles.manager_id) lub admin (globalnie) może wpisać urlop post-factum
-- z auto-approve. Audyt: kolumny created_by + created_on_behalf.
--
-- Side-effecty (Outlook event, OOF, email do zastępcy, Teams alert) są
-- dostosowane do daty w warstwie aplikacji (przeszły urlop = tylko attendance + email),
-- a w tym migracie skupiamy się wyłącznie na schema i RLS.
--
-- Wymaga (zależności):
--   - 20260507120001_phase11b_hr_internal_schema.sql (leave_requests table + bazowe policies)
--   - 20260516000002_phase20b_manager_id_and_helpers.sql (profiles.manager_id, is_manager_of(), is_admin())
--
-- Bezpieczeństwo: server-action `createLeaveOnBehalf` używa service-role
-- (omija RLS po sprawdzeniu uprawnień w kodzie). Policies poniżej działają
-- jako defense-in-depth dla bezpośrednich operacji przez user-token.

BEGIN;

-- ─── 1. Schema: kolumny audytowe ────────────────────────────────────────────
ALTER TABLE leave_requests
    ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS created_on_behalf BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill: dotąd wszystkie wnioski były self-service, więc created_by = user_id.
UPDATE leave_requests SET created_by = user_id WHERE created_by IS NULL;

-- Po backfillu wymuś NOT NULL — każdy nowy wpis musi mieć autora.
ALTER TABLE leave_requests ALTER COLUMN created_by SET NOT NULL;

-- Indeks ułatwia wyszukiwanie "wszystkie wpisy wykonane on-behalf" oraz audyt
-- per-actor (np. "wszystkie wpisy managera X za ostatni miesiąc").
CREATE INDEX IF NOT EXISTS idx_leave_created_by ON leave_requests(created_by)
    WHERE created_by <> user_id;

COMMENT ON COLUMN leave_requests.created_by IS
    'Phase 25b. Autor wpisu (user_id dla self-service; manager/admin id dla on-behalf).';
COMMENT ON COLUMN leave_requests.created_on_behalf IS
    'Phase 25b. TRUE gdy manager/admin wpisał urlop za pracownika.';

-- ─── 2. RLS INSERT — rozszerzenie o on-behalf ───────────────────────────────
-- Stara policy `leave_insert_self` wymagała auth.uid() = user_id.
-- Nowa pozwala 3 ścieżki:
--   a) self-service (jak dotąd)
--   b) admin globalnie (created_on_behalf = TRUE, created_by = auth.uid())
--   c) manager zespołu (is_manager_of + created_on_behalf = TRUE)
DROP POLICY IF EXISTS "leave_insert_self" ON leave_requests;
CREATE POLICY "leave_insert_self_or_on_behalf" ON leave_requests
    FOR INSERT TO authenticated
    WITH CHECK (
        (auth.uid() = user_id AND is_internal_or_admin() AND created_on_behalf = FALSE)
        OR (is_admin() AND created_by = auth.uid() AND created_on_behalf = TRUE)
        OR (is_manager_of(user_id) AND created_by = auth.uid() AND created_on_behalf = TRUE)
    );

-- ─── 3. RLS UPDATE — manager może później skorygować swój wpis ──────────────
-- Stara policy `leave_update_owner_pending_or_admin` zostaje dla owner+admin,
-- rozszerzamy o managera (tylko dla swoich on-behalf wpisów).
DROP POLICY IF EXISTS "leave_update_owner_pending_or_admin" ON leave_requests;
CREATE POLICY "leave_update_owner_pending_admin_or_manager" ON leave_requests
    FOR UPDATE TO authenticated
    USING (
        (auth.uid() = user_id AND status = 'pending')
        OR is_admin()
        OR (is_manager_of(user_id) AND created_by = auth.uid())
    )
    WITH CHECK (
        (auth.uid() = user_id AND status IN ('pending', 'cancelled'))
        OR is_admin()
        OR (is_manager_of(user_id) AND created_by = auth.uid())
    );

-- ─── 4. RLS SELECT — manager widzi wszystkie statusy swojego zespołu ────────
-- Istniejąca policy `leave_select_team_for_internal_admin` filtruje status='approved'
-- dla HR-zone employees. Manager powinien widzieć też pending/rejected/cancelled
-- swoich bezpośrednich podwładnych (zeby wiedzieć co już sam wpisał i co czeka na akcept).
DROP POLICY IF EXISTS "leave_select_manager_team_all_statuses" ON leave_requests;
CREATE POLICY "leave_select_manager_team_all_statuses" ON leave_requests
    FOR SELECT TO authenticated
    USING (is_manager_of(user_id));

COMMIT;
