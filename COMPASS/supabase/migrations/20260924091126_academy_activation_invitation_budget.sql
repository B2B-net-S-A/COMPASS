-- Re-enabling an instructor through profile or rollout changes must respect
-- the same 500-person Teams limit as an explicit trainer grant.
BEGIN;

CREATE OR REPLACE FUNCTION academy_private.check_user_invitation_budgets(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_run uuid;
BEGIN
    -- A new run can appear after the scan. Its first managed session takes
    -- this lock too, so either it sees the new eligibility or this scan sees
    -- the committed session. Drafts and runs without sessions are included.
    PERFORM pg_advisory_xact_lock(hashtextextended('academy-managed-invitation-budget',0));
    FOR v_run IN
      SELECT DISTINCT r.id FROM public.course_runs r JOIN public.courses c ON c.id=r.course_id
      WHERE c.author_id=p_user_id
        OR EXISTS(SELECT 1 FROM public.course_staff s WHERE s.course_id=c.id
          AND s.user_id=p_user_id AND s.role='facilitator' AND s.revoked_at IS NULL)
        OR EXISTS(SELECT 1 FROM public.course_run_staff s WHERE s.run_id=r.id
          AND s.user_id=p_user_id AND s.revoked_at IS NULL)
      ORDER BY r.id
    LOOP
      PERFORM 1 FROM public.course_runs WHERE id=v_run FOR UPDATE;
      PERFORM academy_private.check_invitation_budget(v_run);
    END LOOP;
END $$;
REVOKE ALL ON FUNCTION academy_private.check_user_invitation_budgets(uuid) FROM PUBLIC,anon,authenticated;

-- Service-role INSERT/host changes bypass the RPC. A statement trigger takes
-- the mutex before the existing row-level obligation trigger locks the run.
CREATE FUNCTION academy_private.lock_managed_invitation_budget_statement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended('academy-managed-invitation-budget',0));
    RETURN NULL;
END $$;
CREATE TRIGGER academy_session_budget_statement_lock
BEFORE INSERT OR UPDATE OF meeting_mode,organizer_id ON public.course_sessions
FOR EACH STATEMENT EXECUTE FUNCTION academy_private.lock_managed_invitation_budget_statement();
REVOKE ALL ON FUNCTION academy_private.lock_managed_invitation_budget_statement()
    FROM PUBLIC,anon,authenticated;

-- A cancelled draft cannot be revived through direct service-role DML. The
-- supported workflow creates a replacement session with its own budget check.
CREATE FUNCTION academy_private.prevent_cancelled_session_reactivation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
    IF OLD.status='cancelled' AND NEW.status<>'cancelled' THEN
        RAISE EXCEPTION 'Odwołanego spotkania nie można przywrócić; utwórz nowy termin.';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER academy_cancelled_session_reactivation
BEFORE UPDATE OF status ON public.course_sessions
FOR EACH ROW EXECUTE FUNCTION academy_private.prevent_cancelled_session_reactivation();
REVOKE ALL ON FUNCTION academy_private.prevent_cancelled_session_reactivation()
    FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION academy_private.guard_invitation_budget()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_capacity integer; v_course uuid;
BEGIN
    IF TG_TABLE_NAME='course_runs' THEN
        IF NEW.status='published' AND EXISTS(
            SELECT 1 FROM public.courses WHERE id=NEW.course_id AND legacy_review_required
        ) THEN RAISE EXCEPTION 'legacy_admin_review_required'; END IF;
        IF EXISTS (
            SELECT 1 FROM public.course_sessions s
            WHERE s.run_id=NEW.id AND s.meeting_mode='managed_teams' AND s.status='scheduled'
              AND academy_private.managed_invitation_budget(NEW.id,NEW.course_id,NEW.capacity,s.organizer_id)>500
        ) THEN
            RAISE EXCEPTION 'Teams: limit 500 obejmuje miejsca uczestników, prowadzących i gospodarza. Zmniejsz liczbę miejsc.';
        END IF;
    ELSIF NEW.meeting_mode='managed_teams' AND NEW.status='scheduled' THEN
        IF TG_OP='UPDATE' AND OLD.meeting_mode IS NOT DISTINCT FROM NEW.meeting_mode
            AND OLD.organizer_id IS NOT DISTINCT FROM NEW.organizer_id
            AND OLD.status IS NOT DISTINCT FROM NEW.status THEN
            RETURN NEW;
        END IF;
        PERFORM pg_advisory_xact_lock(hashtextextended('academy-managed-invitation-budget',0));
        SELECT capacity,course_id INTO v_capacity,v_course
        FROM public.course_runs WHERE id=NEW.run_id FOR UPDATE;
        PERFORM 1 FROM public.academy_organizers WHERE id=NEW.organizer_id FOR SHARE;
        IF academy_private.managed_invitation_budget(NEW.run_id,v_course,v_capacity,NEW.organizer_id)>500 THEN
            RAISE EXCEPTION 'Teams: limit 500 obejmuje miejsca uczestników, prowadzących i gospodarza. Zmniejsz liczbę miejsc.';
        END IF;
    END IF;
    RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION academy_private.refresh_trainer_invites_after_profile_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
    IF OLD.role IS DISTINCT FROM NEW.role OR OLD.is_external IS DISTINCT FROM NEW.is_external
        OR OLD.employment_status IS DISTINCT FROM NEW.employment_status THEN
        IF academy_private.trainer_eligible(NEW.id) THEN
            PERFORM academy_private.check_user_invitation_budgets(NEW.id);
        END IF;
        PERFORM academy_private.refresh_user_invitations(NEW.id);
    END IF;
    RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION academy_private.refresh_trainer_invites_after_profile_change()
    FROM PUBLIC,anon,authenticated;

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
          WHERE p.role::text='consultant' AND NOT COALESCE(p.is_external,false)
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
REVOKE ALL ON FUNCTION academy_private.refresh_invites_after_rollout_change()
    FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.academy_save_session(p_input jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.course_runs; s public.course_sessions; v_id uuid; v_mode text:=p_input->>'mode'; v_organizer uuid;
BEGIN
    -- Take the shared budget mutex before the run row lock. The trigger also
    -- takes it for direct table writes outside this RPC.
    PERFORM pg_advisory_xact_lock(hashtextextended('academy-managed-invitation-budget',0));
    IF NOT public.academy_can_manage_run((p_input->>'runId')::uuid) THEN RAISE EXCEPTION 'Brak uprawnień do spotkania.' USING ERRCODE='42501'; END IF;
    SELECT * INTO r FROM public.course_runs WHERE id=(p_input->>'runId')::uuid FOR UPDATE;
    IF r.status='cancelled' THEN RAISE EXCEPTION 'Edycja jest odwołana.'; END IF;
    IF EXISTS(SELECT 1 FROM public.course_enrollments WHERE run_id=r.id AND completed_at IS NOT NULL) THEN
        RAISE EXCEPTION 'Nie można zmieniać sesji edycji z wystawionym certyfikatem.';
    END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=p_input->>'timeZone') THEN RAISE EXCEPTION 'Nieprawidłowa strefa czasowa.'; END IF;
    IF (p_input->>'startsAt')::timestamptz<=now() THEN RAISE EXCEPTION 'Nowy termin musi być w przyszłości.'; END IF;
    IF v_mode='external_link' THEN
        IF NOT COALESCE(academy_private.valid_teams_url(p_input->>'externalJoinUrl'),false) THEN RAISE EXCEPTION 'Wprowadź prawidłowy link spotkania Teams HTTPS.'; END IF;
    ELSIF v_mode='managed_teams' THEN
        IF r.capacity>499 THEN RAISE EXCEPTION 'Zmniejsz limit edycji do 499 uczestników, aby zostawić miejsce na zaproszenie prowadzącego Teams.'; END IF;
        v_organizer:=(p_input->>'organizerId')::uuid;
        IF NOT EXISTS(SELECT 1 FROM public.academy_organizers o JOIN public.profiles p ON p.id=o.profile_id
            WHERE o.id=v_organizer AND o.enabled AND NOT COALESCE(p.is_external,false)
            AND COALESCE(p.employment_status::text,'active')<>'exited') THEN RAISE EXCEPTION 'Brak aktywnego organizatora Teams. Użyj linku zewnętrznego.'; END IF;
    ELSE RAISE EXCEPTION 'Nieprawidłowy tryb spotkania.';
    END IF;
    IF NULLIF(p_input->>'id','') IS NOT NULL AND NULLIF(p_input->>'replacesSessionId','') IS NOT NULL THEN
        RAISE EXCEPTION 'Zastępstwo tworzy nową sesję z zachowaniem historii.';
    END IF;
    IF NULLIF(p_input->>'id','') IS NOT NULL THEN
        SELECT * INTO s FROM public.course_sessions WHERE id=(p_input->>'id')::uuid AND run_id=r.id FOR UPDATE;
        IF NOT FOUND OR s.status='cancelled' THEN RAISE EXCEPTION 'Spotkanie nie istnieje lub jest odwołane.'; END IF;
        IF s.window_confirmed_at IS NOT NULL OR s.starts_at<=now() THEN RAISE EXCEPTION 'Rozpoczęte spotkanie wymaga potwierdzenia obecności zamiast edycji terminu.'; END IF;
        IF r.status='published' AND (s.meeting_mode<>v_mode OR s.organizer_id IS DISTINCT FROM v_organizer) THEN
            RAISE EXCEPTION 'Zmiana organizatora lub trybu wymaga odwołania i utworzenia nowego spotkania.';
        END IF;
        UPDATE public.course_sessions SET title=btrim(p_input->>'title'),starts_at=(p_input->>'startsAt')::timestamptz,
            ends_at=(p_input->>'endsAt')::timestamptz,time_zone=p_input->>'timeZone',meeting_mode=v_mode,
            organizer_id=v_organizer,external_join_url=CASE WHEN v_mode='external_link' THEN p_input->>'externalJoinUrl' END,
            required=(p_input->>'required')::boolean,revision=revision+1,updated_at=now(),
            sync_status=CASE WHEN r.status='draft' THEN 'draft' WHEN v_mode='external_link' THEN 'ready' ELSE 'pending' END
            WHERE id=s.id RETURNING id INTO v_id;
    ELSE
        INSERT INTO public.course_sessions(run_id,title,starts_at,ends_at,time_zone,meeting_mode,organizer_id,external_join_url,required,created_by,sync_status,replaces_session_id,replacement_reason,external_cancellation_confirmed)
        VALUES(r.id,btrim(p_input->>'title'),(p_input->>'startsAt')::timestamptz,(p_input->>'endsAt')::timestamptz,p_input->>'timeZone',
            v_mode,v_organizer,CASE WHEN v_mode='external_link' THEN p_input->>'externalJoinUrl' END,(p_input->>'required')::boolean,auth.uid(),
            CASE WHEN r.status='draft' THEN 'draft' WHEN v_mode='external_link' THEN 'ready' ELSE 'pending' END,
            NULLIF(p_input->>'replacesSessionId','')::uuid,NULLIF(btrim(p_input->>'replacementReason'),''),
            COALESCE((p_input->>'externalCancellationConfirmed')::boolean,false)) RETURNING id INTO v_id;
    END IF;
    IF r.status='published' AND v_mode='managed_teams' THEN PERFORM academy_private.enqueue_session(v_id,'sync_meeting'); END IF;
    INSERT INTO public.academy_audit_events(actor_id,action,course_id,details)
        VALUES(auth.uid(),'ACADEMY_SESSION_SAVED',r.course_id,jsonb_build_object('session_id',v_id,'run_id',r.id));
    RETURN v_id;
END $$;

COMMIT;
