-- B3.5: late activation. A learner who appears after the Teams import is linked to the
-- private roster by the address the pass was delivered to, never by name. Their seat is
-- confirmed and already imported attendance moves to session_attendance.
-- Order: after 20261110090000_academy_b1_2_learner_accounts.
-- Rollback: supabase/rollbacks/20261110100000_academy_bind_learner_to_run.sql
BEGIN;

CREATE FUNCTION academy_private.bind_learner_to_run(p_user_id uuid,p_email text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_roster uuid; x public.academy_webinar_roster; r public.course_runs; reg public.course_run_registrations; att record; v_changed integer; v_moved integer; v_linked integer:=0; v_confirmed integer:=0; v_attendance integer:=0; v_failed integer:=0;
BEGIN
 FOR v_roster IN SELECT id FROM public.academy_webinar_roster WHERE status='confirmed' AND user_id IS NULL AND (email=p_email OR p_email=ANY(aliases)) ORDER BY run_id,created_at,id LOOP
  -- One run that cannot be processed must not cost the learner their other editions.
  BEGIN
   -- Same parent-first lock order as every other caller of the registration helpers.
   PERFORM 1 FROM public.courses WHERE id=(SELECT run.course_id FROM public.course_runs run JOIN public.academy_webinar_roster row_item ON row_item.run_id=run.id WHERE row_item.id=v_roster) FOR NO KEY UPDATE;
   SELECT * INTO x FROM public.academy_webinar_roster WHERE id=v_roster;
   SELECT * INTO r FROM public.course_runs WHERE id=x.run_id FOR UPDATE;
   SELECT * INTO x FROM public.academy_webinar_roster WHERE id=v_roster FOR UPDATE;
   -- A second matching row in the same edition (address and alias) is the same person.
   IF x.status<>'confirmed' OR x.user_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.academy_webinar_roster other WHERE other.run_id=x.run_id AND other.user_id=p_user_id) THEN CONTINUE; END IF;
   UPDATE public.academy_webinar_roster SET user_id=p_user_id,updated_at=now() WHERE id=x.id;
   v_linked:=v_linked+1;
   -- A draft run enrols linked roster rows on publication (webinar_enroll_on_publish).
   IF r.status<>'published' THEN CONTINUE; END IF;
   reg:=NULL;
   SELECT * INTO reg FROM public.course_run_registrations WHERE run_id=r.id AND user_id=p_user_id FOR UPDATE;
   -- A resignation is a decision of that person; an entry link does not undo it.
   IF reg.status='cancelled' OR NOT academy_private.user_may_register(p_user_id,r.version_id) THEN CONTINUE; END IF;
   IF reg.id IS NULL THEN
    INSERT INTO public.course_run_registrations(run_id,user_id,status) VALUES(r.id,p_user_id,'waitlisted') RETURNING * INTO reg;
   END IF;
   IF reg.status='waitlisted' THEN
    -- The roster row already holds this seat, so confirming consumes no extra place.
    PERFORM academy_private.confirm_registration(reg.id);
    SELECT * INTO reg FROM public.course_run_registrations WHERE id=reg.id;
    v_confirmed:=v_confirmed+1;
   END IF;
   v_moved:=0;
   FOR att IN SELECT a.session_id,a.attended_seconds,a.status,a.imported_by,b.source_hash FROM public.academy_webinar_attendance a JOIN public.academy_webinar_import_batches b ON b.id=a.batch_id WHERE a.roster_id=x.id LOOP
    -- ON CONFLICT DO NOTHING keeps a human decision already recorded for this session.
    INSERT INTO public.session_attendance(session_id,enrollment_id,status,attended_seconds,source,reviewed_by,note,report_ids)
    VALUES(att.session_id,reg.enrollment_id,att.status,att.attended_seconds,'teams',att.imported_by,'Obecność z importu przeniesiona przy pierwszym wejściu.',jsonb_build_array('csv:'||att.source_hash))
    ON CONFLICT(session_id,enrollment_id) DO NOTHING;
    GET DIAGNOSTICS v_changed=ROW_COUNT;
    v_moved:=v_moved+v_changed;
   END LOOP;
   IF v_moved>0 THEN
    PERFORM academy_private.finalize_enrollment(reg.enrollment_id);
    v_attendance:=v_attendance+v_moved;
   END IF;
   INSERT INTO public.academy_audit_events(actor_id,action,course_id,details) VALUES(NULL,'ACADEMY_LEARNER_BOUND_TO_RUN',r.course_id,jsonb_build_object('run_id',r.id,'roster_id',x.id,'user_id',p_user_id,'attendance',v_moved));
  EXCEPTION WHEN OTHERS THEN
   v_failed:=v_failed+1;
  END;
 END LOOP;
 RETURN jsonb_build_object('linked',v_linked,'confirmed',v_confirmed,'attendance',v_attendance,'failed',v_failed);
END $$;
REVOKE ALL ON FUNCTION academy_private.bind_learner_to_run(uuid,text) FROM PUBLIC,anon,authenticated;

-- Service role only: called by the entry route after the single-use pass is claimed.
CREATE FUNCTION public.academy_bind_learner_on_entry(p_account_id uuid,p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_email text;
BEGIN
 SELECT a.email INTO v_email FROM public.academy_learner_accounts a JOIN auth.users u ON u.id=a.user_id AND lower(u.email)=a.email WHERE a.id=p_account_id AND a.user_id=p_user_id AND a.ended_at IS NULL;
 IF v_email IS NULL THEN RETURN jsonb_build_object('linked',0,'confirmed',0,'attendance',0,'failed',0); END IF;
 RETURN academy_private.bind_learner_to_run(p_user_id,v_email);
END $$;
REVOKE ALL ON FUNCTION public.academy_bind_learner_on_entry(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.academy_bind_learner_on_entry(uuid,uuid) TO service_role;

DO $$
BEGIN
 IF to_regprocedure('academy_private.bind_learner_to_run(uuid,text)') IS NULL OR to_regprocedure('public.academy_bind_learner_on_entry(uuid,uuid)') IS NULL THEN RAISE EXCEPTION 'B3.5: brak funkcji.'; END IF;
 IF has_function_privilege('authenticated','public.academy_bind_learner_on_entry(uuid,uuid)','EXECUTE') OR has_function_privilege('anon','public.academy_bind_learner_on_entry(uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'B3.5: funkcja dostępna tylko dla service role.'; END IF;
 IF NOT has_function_privilege('service_role','public.academy_bind_learner_on_entry(uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'B3.5: brak uprawnienia service role.'; END IF;
 IF has_function_privilege('authenticated','academy_private.bind_learner_to_run(uuid,text)','EXECUTE') THEN RAISE EXCEPTION 'B3.5: funkcja prywatna jest dostępna.'; END IF;
END $$;
COMMIT;
