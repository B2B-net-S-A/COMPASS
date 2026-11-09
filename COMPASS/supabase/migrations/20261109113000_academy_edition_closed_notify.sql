-- B3.8: in-app bell after an edition closes. No e-mail and no outbox row.
-- Rollback: supabase/rollbacks/20261109113000_academy_edition_closed_notify.sql
BEGIN;

CREATE FUNCTION public.academy_notify_edition_closed(p_run_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.course_runs; reg record; v_notified integer:=0;
BEGIN
 IF NOT public.academy_can_access() OR NOT public.academy_is_global_editor() THEN RAISE EXCEPTION 'Wymagany administrator lub TCM.' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM public.course_runs WHERE id=p_run_id;
 IF NOT FOUND OR r.status<>'published' THEN RAISE EXCEPTION 'Powiadomienie dotyczy opublikowanej edycji.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.course_sessions WHERE run_id=r.id AND status='scheduled') OR EXISTS(SELECT 1 FROM public.course_sessions WHERE run_id=r.id AND status='scheduled' AND COALESCE(actual_ends_at,ends_at)>now()) THEN
  RAISE EXCEPTION 'Powiadomienie będzie dostępne po zakończeniu wszystkich spotkań.';
 END IF;
 FOR reg IN SELECT user_id FROM public.course_run_registrations WHERE run_id=r.id AND status='confirmed' AND enrollment_id IS NOT NULL ORDER BY id LOOP
  IF academy_private.notify('edition-closed:'||r.id||':'||reg.user_id,reg.user_id,r.id,'Szkolenie zakończone: ankieta i dokument','Wypełnij ankietę edycji. Dokument znajdziesz na stronie szkolenia po spełnieniu warunków.') THEN
   v_notified:=v_notified+1;
  END IF;
 END LOOP;
 INSERT INTO public.academy_audit_events(actor_id,action,course_id,details) VALUES(auth.uid(),'ACADEMY_EDITION_CLOSED_NOTIFIED',r.course_id,jsonb_build_object('run_id',r.id,'notified',v_notified));
 RETURN v_notified;
END $$;
REVOKE ALL ON FUNCTION public.academy_notify_edition_closed(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.academy_notify_edition_closed(uuid) TO authenticated;

DO $$
BEGIN
 IF to_regprocedure('public.academy_notify_edition_closed(uuid)') IS NULL THEN RAISE EXCEPTION 'B3.8: brak funkcji powiadomienia.'; END IF;
 IF has_function_privilege('anon','public.academy_notify_edition_closed(uuid)','EXECUTE') THEN RAISE EXCEPTION 'B3.8: anon nie może wykonywać funkcji.'; END IF;
 IF NOT has_function_privilege('authenticated','public.academy_notify_edition_closed(uuid)','EXECUTE') THEN RAISE EXCEPTION 'B3.8: brak uprawnienia authenticated.'; END IF;
END $$;
COMMIT;
