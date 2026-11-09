-- B1.1: role biurowe (internal, manager, finanse) w Akademii, wyłącznie przez rollout.
-- Przy trybie closed nic się nikomu nie zmienia: osoba spoza edytorów wchodzi tylko
-- z listy pilota albo w trybie open. Pilot przyjmuje konto dowolnej roli.
--
-- Kolejność: po B0.4 (blokada trybu open i limit 20 kont pilota). academy_set_rollout
-- jest tu łatany jednym warunkiem, a nie przepisywany, bo zmienia ją też B0.4.
-- Odwrotna kolejność cofnęłaby tę zmianę po cichu, gdyby B0.4 podmieniał całą funkcję.
-- Cofnięcie: supabase/rollbacks/20261109210000_academy_b1_1_office_roles.sql
BEGIN;

CREATE OR REPLACE FUNCTION academy_private.rollout_allows_user(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT public.academy_is_global_editor(p_user_id) OR EXISTS (
  SELECT 1 FROM public.profiles p JOIN auth.users u ON u.id=p.id
  CROSS JOIN public.academy_rollout_settings s WHERE p.id=p_user_id
   AND p.role::text IN ('consultant','internal','manager','finanse') AND NOT COALESCE(p.is_external,false)
   AND COALESCE(p.employment_status::text,'active')<>'exited'
   AND (s.mode='open' OR (s.mode='pilot' AND p.id=ANY(s.pilot_user_ids)))
 );
$$;

CREATE OR REPLACE FUNCTION academy_private.trainer_eligible(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT academy_private.rollout_allows_user(p_user_id) AND (
  public.academy_is_global_editor(p_user_id) OR EXISTS (
   SELECT 1 FROM public.profiles p JOIN public.academy_user_capabilities g ON g.user_id=p.id
   WHERE p.id=p_user_id AND p.role::text IN ('consultant','internal','manager','finanse')
    AND g.can_train AND g.revoked_at IS NULL
  )
 );
$$;

CREATE OR REPLACE FUNCTION academy_private.refresh_invites_after_rollout_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_run uuid; v_status text;
BEGIN
    IF OLD.mode IS NOT DISTINCT FROM NEW.mode
        AND OLD.pilot_user_ids IS NOT DISTINCT FROM NEW.pilot_user_ids THEN RETURN NEW; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('academy-managed-invitation-budget',0));
    FOR v_run IN
      SELECT DISTINCT r.id FROM public.course_runs r JOIN public.courses c ON c.id=r.course_id
      WHERE EXISTS (
          SELECT 1 FROM (
            SELECT c.author_id AS user_id
            UNION SELECT reg.user_id FROM public.course_run_registrations reg
              WHERE reg.run_id=r.id AND reg.status='confirmed'
            UNION SELECT staff.user_id FROM public.course_staff staff
              WHERE staff.course_id=c.id AND staff.role='facilitator' AND staff.revoked_at IS NULL
            UNION SELECT staff.user_id FROM public.course_run_staff staff
              WHERE staff.run_id=r.id AND staff.revoked_at IS NULL
          ) roster JOIN public.profiles p ON p.id=roster.user_id
          JOIN auth.users u ON u.id=p.id
          WHERE p.role::text IN ('consultant','internal','manager','finanse') AND NOT COALESCE(p.is_external,false)
            AND COALESCE(p.employment_status::text,'active')<>'exited'
            AND (OLD.mode='open' OR (OLD.mode='pilot' AND p.id=ANY(OLD.pilot_user_ids)))
              IS DISTINCT FROM
                (NEW.mode='open' OR (NEW.mode='pilot' AND p.id=ANY(NEW.pilot_user_ids)))
        )
      ORDER BY r.id
    LOOP
      -- Capacity writers lock the same run. Recheck after that lock so a
      -- concurrent capacity increase and rollout expansion cannot both pass.
      SELECT status::text INTO v_status FROM public.course_runs WHERE id=v_run FOR UPDATE;
      PERFORM academy_private.check_invitation_budget(v_run);
      IF v_status='published' AND EXISTS(SELECT 1 FROM public.course_sessions cs
          WHERE cs.run_id=v_run AND cs.status='scheduled'
            AND cs.meeting_mode='managed_teams' AND cs.ends_at>now()) THEN
        PERFORM academy_private.refresh_run_meetings(v_run);
      END IF;
    END LOOP;
    RETURN NEW;
END $$;

-- trainer_eligible przyjmuje już role biurowe, więc nadanie musi przyjmować te same.
CREATE OR REPLACE FUNCTION public.academy_set_trainer(p_user_id uuid, p_enabled boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
    IF NOT public.academy_can_access() OR NOT public.is_admin() THEN RAISE EXCEPTION 'admin_required' USING ERRCODE='42501'; END IF;
    IF p_enabled IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=p_user_id
        AND (NOT p_enabled OR (p.role::text IN ('consultant','internal','manager','finanse') AND NOT COALESCE(p.is_external,false)
        AND COALESCE(p.employment_status::text,'active')<>'exited'))) THEN RAISE EXCEPTION 'eligible_consultant_required'; END IF;
    INSERT INTO public.academy_user_capabilities(user_id,can_train,granted_by,granted_at,revoked_by,revoked_at)
    VALUES(p_user_id,p_enabled,auth.uid(),now(),CASE WHEN NOT p_enabled THEN auth.uid() END,CASE WHEN NOT p_enabled THEN now() END)
    ON CONFLICT(user_id) DO UPDATE SET can_train=EXCLUDED.can_train,
        granted_by=CASE WHEN p_enabled THEN auth.uid() ELSE academy_user_capabilities.granted_by END,
        granted_at=CASE WHEN p_enabled THEN now() ELSE academy_user_capabilities.granted_at END,
        revoked_by=EXCLUDED.revoked_by,revoked_at=EXCLUDED.revoked_at;
    INSERT INTO public.academy_audit_events(actor_id,action,details) VALUES(auth.uid(),
        CASE WHEN p_enabled THEN 'TRAINER_GRANTED' ELSE 'TRAINER_REVOKED' END,jsonb_build_object('user_id',p_user_id));
END $$;

-- Pilot: zdejmujemy wyłącznie warunek roli. Reszta funkcji (także limit i blokada z B0.4)
-- zostaje taka, jaka jest w bazie.
DO $migration$
DECLARE v_def text; v_new text;
BEGIN
    v_def := pg_get_functiondef('public.academy_set_rollout(text,uuid[])'::regprocedure);
    v_new := replace(v_def, $old$p.role::text IN ('consultant','admin') AND $old$, '');
    IF v_new = v_def THEN RAISE EXCEPTION 'b1_1_set_rollout_role_condition_not_found'; END IF;
    EXECUTE v_new;
END $migration$;

DO $check$
DECLARE v_fn text; v_def text;
BEGIN
    FOREACH v_fn IN ARRAY ARRAY[
        'academy_private.rollout_allows_user(uuid)',
        'academy_private.trainer_eligible(uuid)',
        'academy_private.refresh_invites_after_rollout_change()',
        'public.academy_set_trainer(uuid,boolean)'
    ] LOOP
        v_def := pg_get_functiondef(v_fn::regprocedure);
        IF v_def NOT LIKE $$%'consultant','internal','manager','finanse'%$$ THEN
            RAISE EXCEPTION 'b1_1_office_roles_missing_in %', v_fn;
        END IF;
    END LOOP;
    v_def := pg_get_functiondef('academy_private.rollout_allows_user(uuid)'::regprocedure);
    IF v_def NOT LIKE $$%s.mode='open' OR (s.mode='pilot' AND p.id=ANY(s.pilot_user_ids))%$$ THEN
        RAISE EXCEPTION 'b1_1_rollout_gate_lost';
    END IF;
    v_def := pg_get_functiondef('public.academy_set_rollout(text,uuid[])'::regprocedure);
    IF v_def LIKE $$%p.role::text IN%$$ THEN RAISE EXCEPTION 'b1_1_pilot_still_limits_roles'; END IF;
    IF v_def NOT LIKE '%pilot_requires_active_academy_accounts%' THEN RAISE EXCEPTION 'b1_1_pilot_activity_check_lost'; END IF;
END $check$;

COMMIT;
