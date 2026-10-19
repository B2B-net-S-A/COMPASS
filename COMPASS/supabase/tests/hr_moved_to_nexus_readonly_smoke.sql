-- Smoke test migracji 20261019020000_hr_moved_to_nexus_db_readonly.sql.
-- Uruchamiać WYŁĄCZNIE w całości i dopiero PO migracji — wszystko dzieje się w transakcji
-- zakończonej ROLLBACK, żaden wiersz (także wartość przełącznika) nie zostaje w bazie.
-- Działa przez rolę `authenticated` z JWT pracownika, czyli tak jak bezpośredni
-- POST/PATCH na Data API z kluczem anon.
--
-- Przełącznik ustawiony na czas testu: `leave,cases` (urlopy i skrzynka w NEXUSIE,
-- czas pracy i helpdesk w Compassie).
BEGIN;

INSERT INTO public.system_settings (key, value)
VALUES ('hr_moved_to_nexus', '"leave, cases"')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- ─── Pracownik (internal) ──────────────────────────────────────────────────
SELECT set_config(
    'request.jwt.claim.sub',
    (SELECT id::text FROM public.profiles
      WHERE role = 'internal' AND COALESCE(employment_status::text, 'active') <> 'exited'
      ORDER BY created_at LIMIT 1),
    true);
-- Wniosek do próby PATCH-a, wstawiony jeszcze jako właściciel bazy (omija RLS).
INSERT INTO public.leave_requests (user_id, start_date, end_date, leave_type, created_by, created_on_behalf)
VALUES (auth.uid(), '2099-10-01', '2099-10-02', 'vacation', auth.uid(), false);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
    v_me uuid := auth.uid();
    v_rejected boolean;
    v_rows integer;
BEGIN
    IF v_me IS NULL THEN RAISE EXCEPTION 'SMOKE: brak użytkownika internal do testu'; END IF;
    IF NOT public.hr_module_moved('leave') OR public.hr_module_moved('time') THEN
        RAISE EXCEPTION 'SMOKE: hr_module_moved nie czyta przełącznika w cudzysłowie';
    END IF;

    -- Urlop w NEXUSIE: wniosek, który przed migracją przechodził (SEC-04: pending), → 42501.
    v_rejected := false;
    BEGIN
        INSERT INTO public.leave_requests (user_id, start_date, end_date, leave_type, created_by, created_on_behalf)
        VALUES (v_me, '2099-08-03', '2099-08-04', 'vacation', v_me, false);
    EXCEPTION WHEN insufficient_privilege THEN v_rejected := true;
    END;
    IF NOT v_rejected THEN RAISE EXCEPTION 'SMOKE leave: insert przy przeniesionym leave przeszedł'; END IF;

    -- Własnego wniosku nie da się też anulować PATCH-em (RESTRICTIVE USING → zero wierszy).
    UPDATE public.leave_requests SET status = 'cancelled'
     WHERE user_id = v_me AND start_date = '2099-10-01' AND status = 'pending';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 0 THEN RAISE EXCEPTION 'SMOKE leave: update przy przeniesionym leave przeszedł'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.leave_requests WHERE user_id = v_me AND start_date = '2099-10-01') THEN
        RAISE EXCEPTION 'SMOKE leave: archiwum urlopów przestało być czytelne';
    END IF;

    -- Czas pracy zostaje w Compassie: szkic timesheetu nadal powstaje.
    INSERT INTO public.timesheets (user_id, year, month) VALUES (v_me, 2099, 3);

    RAISE NOTICE 'hr_moved smoke: pracownik OK';
END $$;

-- ─── Admin (obsługuje skrzynkę i helpdesk) ─────────────────────────────────
RESET ROLE;
SELECT set_config(
    'request.jwt.claim.sub',
    (SELECT id::text FROM public.profiles WHERE role = 'admin' ORDER BY created_at LIMIT 1),
    true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
    v_me uuid := auth.uid();
    v_inbox uuid;
    v_helpdesk uuid;
    v_rejected boolean;
    v_rows integer;
BEGIN
    IF v_me IS NULL THEN RAISE EXCEPTION 'SMOKE: brak admina do testu'; END IF;
    SELECT id INTO STRICT v_inbox FROM public.support_categories WHERE slug LIKE 'inbox_%' ORDER BY slug LIMIT 1;
    SELECT id INTO STRICT v_helpdesk FROM public.support_categories
     WHERE slug NOT LIKE 'inbox_%' AND slug NOT LIKE 'contractor_%' ORDER BY slug LIMIT 1;

    -- Admin też nie zapisze urlopu w imieniu pracownika (polityka on-behalf przepuszczała).
    v_rejected := false;
    BEGIN
        INSERT INTO public.leave_requests (user_id, start_date, end_date, leave_type, created_by, created_on_behalf)
        VALUES (v_me, '2099-09-01', '2099-09-02', 'vacation', v_me, true);
    EXCEPTION WHEN insufficient_privilege THEN v_rejected := true;
    END;
    IF NOT v_rejected THEN RAISE EXCEPTION 'SMOKE leave: insert admina przy przeniesionym leave przeszedł'; END IF;

    -- Sprawa skrzynki (inbox_%) → 42501.
    v_rejected := false;
    BEGIN
        INSERT INTO public.support_tickets (user_id, category_id, subject, body_md)
        VALUES (v_me, v_inbox, 'SMOKE skrzynka', 'smoke');
    EXCEPTION WHEN insufficient_privilege THEN v_rejected := true;
    END;
    IF NOT v_rejected THEN RAISE EXCEPTION 'SMOKE cases: sprawa skrzynki przy przeniesionym cases przeszła'; END IF;

    -- Helpdesk zostaje: zgłoszenie i komentarz przechodzą.
    WITH t AS (
        INSERT INTO public.support_tickets (user_id, category_id, subject, body_md)
        VALUES (v_me, v_helpdesk, 'SMOKE helpdesk', 'smoke')
        RETURNING id
    )
    INSERT INTO public.support_ticket_comments (ticket_id, author_id, body_md)
    SELECT id, v_me, 'smoke' FROM t;

    -- Przełącznika nie zdejmie się przez Data API.
    UPDATE public.system_settings SET value = '' WHERE key = 'hr_moved_to_nexus';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 0 THEN RAISE EXCEPTION 'SMOKE switch: admin zmienił przełącznik przez Data API'; END IF;

    RAISE NOTICE 'hr_moved smoke: admin OK';
END $$;

ROLLBACK;
