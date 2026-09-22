-- Smoke test migracji 20260922180000_audit_0922_rls_hardening.sql.
-- Uruchamiać WYŁĄCZNIE w całości — wszystko dzieje się w transakcji zakończonej ROLLBACK,
-- żaden wiersz nie zostaje w bazie. Test działa jako zwykły pracownik (rola internal,
-- bez can_log_overtime) przez rolę `authenticated`, czyli tak jak bezpośredni PATCH/POST
-- na Data API.
BEGIN;
SELECT set_config(
    'request.jwt.claim.sub',
    (SELECT id::text FROM public.profiles
      WHERE role = 'internal' AND COALESCE(can_log_overtime, FALSE) = FALSE
        AND COALESCE(employment_status::text, 'active') <> 'exited'
      ORDER BY created_at LIMIT 1),
    true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
    v_me uuid := auth.uid();
    v_admin uuid;
    v_ts uuid;
    v_rejected boolean;
    v_before_type text;
    v_after_type text;
    v_before_points integer;
    v_after_points integer;
BEGIN
    IF v_me IS NULL THEN RAISE EXCEPTION 'SMOKE: brak użytkownika internal do testu'; END IF;
    SELECT id INTO STRICT v_admin FROM public.profiles WHERE role = 'admin' ORDER BY created_at LIMIT 1;

    -- SEC-04: własny urlop jako approved → odmowa RLS.
    v_rejected := false;
    BEGIN
        INSERT INTO public.leave_requests (user_id, start_date, end_date, leave_type, status, created_by, created_on_behalf)
        VALUES (v_me, '2099-07-01', '2099-07-02', 'vacation', 'approved', v_me, false);
    EXCEPTION WHEN insufficient_privilege THEN v_rejected := true;
    END;
    IF NOT v_rejected THEN RAISE EXCEPTION 'SMOKE SEC-04: approved leave accepted'; END IF;

    -- SEC-04: zwykły wniosek pending nadal przechodzi.
    INSERT INTO public.leave_requests (user_id, start_date, end_date, leave_type, created_by, created_on_behalf)
    VALUES (v_me, '2099-08-03', '2099-08-04', 'vacation', v_me, false);

    -- SEC-05: timesheet approved → odmowa; draft → OK.
    v_rejected := false;
    BEGIN
        INSERT INTO public.timesheets (user_id, year, month, status) VALUES (v_me, 2099, 1, 'approved');
    EXCEPTION WHEN insufficient_privilege THEN v_rejected := true;
    END;
    IF NOT v_rejected THEN RAISE EXCEPTION 'SMOKE SEC-05: approved timesheet accepted'; END IF;
    INSERT INTO public.timesheets (user_id, year, month) VALUES (v_me, 2099, 2) RETURNING id INTO v_ts;

    -- SEC-12: nadgodziny z UUID admina jako zatwierdzającym → odmowa triggera.
    v_rejected := false;
    BEGIN
        INSERT INTO public.timesheet_entries (timesheet_id, work_date, hours, is_overtime_override, override_reason, override_by, override_at)
        VALUES (v_ts, '2099-02-02', 12, true, 'podszycie pod admina', v_admin, now());
    EXCEPTION WHEN raise_exception THEN v_rejected := true;
    END;
    IF NOT v_rejected THEN RAISE EXCEPTION 'SMOKE SEC-12: forged override_by accepted'; END IF;

    -- SEC-03: typ umowy i saldo lojalności nie dają się zmienić przez owner PATCH.
    SELECT employment_type::text, loyalty_points INTO v_before_type, v_before_points FROM public.profiles WHERE id = v_me;
    UPDATE public.profiles
       SET employment_type = CASE WHEN employment_type::text = 'uop' THEN 'b2b' ELSE 'uop' END,
           loyalty_points = COALESCE(loyalty_points, 0) + 100000
     WHERE id = v_me;
    SELECT employment_type::text, loyalty_points INTO v_after_type, v_after_points FROM public.profiles WHERE id = v_me;
    IF v_after_type IS DISTINCT FROM v_before_type THEN RAISE EXCEPTION 'SMOKE SEC-03: employment_type changed'; END IF;
    IF v_after_points IS DISTINCT FROM v_before_points THEN RAISE EXCEPTION 'SMOKE SEC-03: loyalty_points changed'; END IF;

    RAISE NOTICE 'audit_0922 smoke: OK';
END $$;
ROLLBACK;
