-- Smoke test G06, migracja 20261109023000_academy_rollout_open_lock.sql.
-- Uruchamiać w całości, po migracji. Kończy się ROLLBACK, więc nadaje się też na produkcję:
-- wykonuje go właściciel. Lokalnie razem z academy_rollout_lock_stub.sql na postgres:17.
BEGIN;

SELECT set_config('request.jwt.claim.sub',
 (SELECT p.id::text FROM public.profiles p JOIN auth.users u ON u.id = p.id WHERE p.role::text = 'admin' ORDER BY p.id LIMIT 1), true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE v_rejected boolean;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'SMOKE: brak konta admina do testu'; END IF;

 v_rejected := false;
 BEGIN
  PERFORM public.academy_set_rollout('open', '{}');
 EXCEPTION WHEN raise_exception THEN v_rejected := SQLERRM = 'academy_open_locked';
 END;
 IF NOT v_rejected THEN RAISE EXCEPTION 'SMOKE: admin ustawił tryb open'; END IF;

 v_rejected := false;
 BEGIN
  PERFORM public.academy_set_rollout('pilot', ARRAY(SELECT gen_random_uuid() FROM generate_series(1, 21)));
 EXCEPTION WHEN raise_exception THEN v_rejected := SQLERRM = 'pilot_limit_exceeded';
 END;
 IF NOT v_rejected THEN RAISE EXCEPTION 'SMOKE: admin ustawił pilota ponad 20 kont'; END IF;

 PERFORM public.academy_set_rollout('closed', '{}');
END $$;

RESET ROLE;

DO $$
DECLARE v_rejected boolean; v_accounts uuid[];
BEGIN
 v_rejected := false;
 BEGIN
  UPDATE public.academy_rollout_settings SET mode = 'open' WHERE singleton;
 EXCEPTION WHEN check_violation THEN v_rejected := true;
 END;
 IF NOT v_rejected THEN RAISE EXCEPTION 'SMOKE: bezpośredni zapis open przeszedł'; END IF;

 v_accounts := ARRAY(SELECT p.id FROM public.profiles p JOIN auth.users u ON u.id = p.id
  WHERE p.role::text = 'consultant' AND NOT COALESCE(p.is_external, false) AND COALESCE(p.employment_status::text, 'active') <> 'exited' ORDER BY p.id LIMIT 20);
 -- Pełna dwudziestka tylko tam, gdzie tyle kont istnieje (stub lokalny).
 IF cardinality(v_accounts) = 20 THEN
  UPDATE public.academy_rollout_settings SET pilot_user_ids = v_accounts WHERE singleton;
  IF (SELECT cardinality(pilot_user_ids) FROM public.academy_rollout_settings) <> 20 THEN RAISE EXCEPTION 'SMOKE: 20 kont nie przeszło'; END IF;
 END IF;
END $$;

ROLLBACK;
