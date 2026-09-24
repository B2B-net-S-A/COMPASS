-- Send managed Teams invitations to one administrator-verified address per person.
-- Existing identity rows remain valid; a sole verified alias is selected automatically.
BEGIN;

ALTER TABLE public.academy_m365_identities
    ADD COLUMN invitation_target boolean NOT NULL DEFAULT false,
    ADD CONSTRAINT academy_identity_invitation_email_required
        CHECK (NOT invitation_target OR verified_email IS NOT NULL);
CREATE UNIQUE INDEX academy_identity_one_invitation_target
    ON public.academy_m365_identities(user_id) WHERE invitation_target;

CREATE FUNCTION academy_private.invitation_email(p_user_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_primary text; v_aliases text[]; v_auth text;
BEGIN
    SELECT lower(btrim(verified_email)) INTO v_primary
      FROM public.academy_m365_identities
      WHERE user_id=p_user_id AND invitation_target;
    IF v_primary IS NOT NULL THEN RETURN v_primary; END IF;
    SELECT array_agg(email ORDER BY email) INTO v_aliases FROM (
      SELECT DISTINCT lower(btrim(verified_email)) AS email
      FROM public.academy_m365_identities
      WHERE user_id=p_user_id AND verified_email IS NOT NULL
    ) aliases;
    IF cardinality(v_aliases)>1 THEN RAISE EXCEPTION 'academy_invitation_address_ambiguous'; END IF;
    IF cardinality(v_aliases)=1 THEN RETURN v_aliases[1]; END IF;
    SELECT lower(btrim(email)) INTO v_auth FROM auth.users
      WHERE id=p_user_id AND email_confirmed_at IS NOT NULL AND email IS NOT NULL;
    RETURN v_auth;
END $$;
REVOKE ALL ON FUNCTION academy_private.invitation_email(uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION academy_private.refresh_user_invitations(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_run uuid;
BEGIN
    FOR v_run IN
      SELECT DISTINCT r.id FROM public.course_runs r
      JOIN public.courses c ON c.id=r.course_id
      WHERE r.status='published'
        AND EXISTS(SELECT 1 FROM public.course_sessions cs WHERE cs.run_id=r.id
          AND cs.status='scheduled' AND cs.meeting_mode='managed_teams' AND cs.ends_at>now())
        AND (
          c.author_id=p_user_id
          OR EXISTS(SELECT 1 FROM public.course_staff s WHERE s.course_id=r.course_id
                    AND s.user_id=p_user_id AND s.role='facilitator' AND s.revoked_at IS NULL)
          OR EXISTS(SELECT 1 FROM public.course_run_staff s WHERE s.run_id=r.id
                    AND s.user_id=p_user_id AND s.revoked_at IS NULL)
          OR EXISTS(SELECT 1 FROM public.course_run_registrations reg WHERE reg.run_id=r.id
                    AND reg.user_id=p_user_id AND reg.status='confirmed')
        )
      ORDER BY r.id
    LOOP
      PERFORM academy_private.refresh_run_meetings(v_run);
    END LOOP;
END $$;
REVOKE ALL ON FUNCTION academy_private.refresh_user_invitations(uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION academy_private.check_user_invitation_budgets(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_run uuid;
BEGIN
    FOR v_run IN
      SELECT DISTINCT r.id FROM public.course_runs r JOIN public.courses c ON c.id=r.course_id
      WHERE r.status='published'
        AND EXISTS(SELECT 1 FROM public.course_sessions cs WHERE cs.run_id=r.id
          AND cs.status='scheduled' AND cs.meeting_mode='managed_teams' AND cs.ends_at>now())
        AND (c.author_id=p_user_id
          OR EXISTS(SELECT 1 FROM public.course_staff s WHERE s.course_id=c.id
              AND s.user_id=p_user_id AND s.role='facilitator' AND s.revoked_at IS NULL)
          OR EXISTS(SELECT 1 FROM public.course_run_staff s WHERE s.run_id=r.id
              AND s.user_id=p_user_id AND s.revoked_at IS NULL))
      ORDER BY r.id
    LOOP
      -- Serialize trainer activation with capacity and staff changes, which
      -- already lock the run before checking this same limit.
      PERFORM 1 FROM public.course_runs WHERE id=v_run FOR UPDATE;
      PERFORM academy_private.check_invitation_budget(v_run);
    END LOOP;
END $$;
REVOKE ALL ON FUNCTION academy_private.check_user_invitation_budgets(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION academy_private.run_instructors(p_run_id uuid,p_course_id uuid)
RETURNS TABLE(user_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT author_id FROM public.courses WHERE id=p_course_id AND academy_private.trainer_eligible(author_id)
 UNION SELECT s.user_id FROM public.course_staff s WHERE s.course_id=p_course_id AND s.role='facilitator'
 AND s.revoked_at IS NULL AND academy_private.trainer_eligible(s.user_id)
 UNION SELECT s.user_id FROM public.course_run_staff s WHERE s.run_id=p_run_id AND s.revoked_at IS NULL
 AND academy_private.trainer_eligible(s.user_id);
$$;

CREATE FUNCTION academy_private.refresh_trainer_invites_after_capability_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
    IF TG_OP='INSERT' THEN
        IF academy_private.trainer_eligible(NEW.user_id) THEN
            PERFORM academy_private.check_user_invitation_budgets(NEW.user_id);
        END IF;
        PERFORM academy_private.refresh_user_invitations(NEW.user_id);
    ELSIF OLD.can_train IS DISTINCT FROM NEW.can_train
        OR OLD.revoked_at IS DISTINCT FROM NEW.revoked_at THEN
        IF academy_private.trainer_eligible(NEW.user_id) THEN
            PERFORM academy_private.check_user_invitation_budgets(NEW.user_id);
        END IF;
        PERFORM academy_private.refresh_user_invitations(NEW.user_id);
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER academy_trainer_invites_refresh
AFTER INSERT OR UPDATE OF can_train,revoked_at ON public.academy_user_capabilities
FOR EACH ROW EXECUTE FUNCTION academy_private.refresh_trainer_invites_after_capability_change();
REVOKE ALL ON FUNCTION academy_private.refresh_trainer_invites_after_capability_change()
    FROM PUBLIC,anon,authenticated;

CREATE FUNCTION academy_private.refresh_trainer_invites_after_profile_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
    IF OLD.role IS DISTINCT FROM NEW.role OR OLD.is_external IS DISTINCT FROM NEW.is_external
        OR OLD.employment_status IS DISTINCT FROM NEW.employment_status THEN
        PERFORM academy_private.refresh_user_invitations(NEW.id);
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER academy_trainer_invites_profile_refresh
AFTER UPDATE OF role,is_external,employment_status ON public.profiles
FOR EACH ROW EXECUTE FUNCTION academy_private.refresh_trainer_invites_after_profile_change();
REVOKE ALL ON FUNCTION academy_private.refresh_trainer_invites_after_profile_change()
    FROM PUBLIC,anon,authenticated;

CREATE FUNCTION academy_private.refresh_invites_after_rollout_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_run uuid;
BEGIN
    IF OLD.mode IS NOT DISTINCT FROM NEW.mode
        AND OLD.pilot_user_ids IS NOT DISTINCT FROM NEW.pilot_user_ids THEN RETURN NEW; END IF;
    FOR v_run IN
      SELECT DISTINCT r.id FROM public.course_runs r JOIN public.courses c ON c.id=r.course_id
      WHERE r.status='published' AND EXISTS(SELECT 1 FROM public.course_sessions cs
        WHERE cs.run_id=r.id AND cs.status='scheduled'
          AND cs.meeting_mode='managed_teams' AND cs.ends_at>now())
        AND EXISTS (
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
      PERFORM academy_private.refresh_run_meetings(v_run);
    END LOOP;
    RETURN NEW;
END $$;
CREATE TRIGGER academy_rollout_invites_refresh
AFTER UPDATE OF mode,pilot_user_ids ON public.academy_rollout_settings
FOR EACH ROW EXECUTE FUNCTION academy_private.refresh_invites_after_rollout_change();
REVOKE ALL ON FUNCTION academy_private.refresh_invites_after_rollout_change()
    FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.academy_save_m365_identity(p_input jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user uuid; v_email text; v_target boolean; v_previous_target uuid; v_identity_id uuid;
BEGIN
    IF NOT public.academy_can_access() OR NOT public.is_admin() THEN
      RAISE EXCEPTION 'Wymagany administrator.' USING ERRCODE='42501';
    END IF;
    v_user:=(p_input->>'userId')::uuid;
    SELECT p.id INTO v_user FROM public.profiles p JOIN auth.users u ON u.id=p.id
      WHERE p.id=v_user FOR NO KEY UPDATE OF p;
    IF NOT FOUND THEN RAISE EXCEPTION 'Nieprawidłowe konto Compass.'; END IF;
    v_email:=NULLIF(lower(btrim(p_input->>'verifiedEmail')),'');
    IF p_input ? 'invitationTarget' THEN
      IF jsonb_typeof(p_input->'invitationTarget')<>'boolean' THEN
        RAISE EXCEPTION 'invalid_invitation_target';
      END IF;
      v_target:=(p_input->>'invitationTarget')::boolean;
      IF v_target AND v_email IS NULL THEN RAISE EXCEPTION 'invitation_email_required'; END IF;
    END IF;
    IF EXISTS(SELECT 1 FROM public.academy_m365_identities WHERE tenant_id=(p_input->>'tenantId')::uuid
        AND object_id=(p_input->>'objectId')::uuid AND user_id<>v_user) THEN
      RAISE EXCEPTION 'Tożsamość jest przypisana do innego uczestnika.';
    END IF;
    SELECT id INTO v_previous_target FROM public.academy_m365_identities
      WHERE user_id=v_user AND invitation_target;
    IF v_target THEN
      UPDATE public.academy_m365_identities SET invitation_target=false
        WHERE user_id=v_user AND invitation_target;
    END IF;
    INSERT INTO public.academy_m365_identities(
        user_id,tenant_id,object_id,verified_email,verified_by,invitation_target)
      VALUES(v_user,(p_input->>'tenantId')::uuid,(p_input->>'objectId')::uuid,
        v_email,auth.uid(),COALESCE(v_target,false))
    ON CONFLICT(tenant_id,object_id) DO UPDATE SET
      verified_email=EXCLUDED.verified_email,verified_by=auth.uid(),verified_at=now(),
      invitation_target=COALESCE(v_target,academy_m365_identities.invitation_target)
      WHERE academy_m365_identities.user_id=EXCLUDED.user_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Tożsamość jest przypisana do innego uczestnika.'; END IF;
    PERFORM academy_private.refresh_user_invitations(v_user);
    SELECT id,invitation_target INTO v_identity_id,v_target FROM public.academy_m365_identities
      WHERE tenant_id=(p_input->>'tenantId')::uuid AND object_id=(p_input->>'objectId')::uuid;
    INSERT INTO public.academy_audit_events(actor_id,action,details)
      VALUES(auth.uid(),'ACADEMY_IDENTITY_VERIFIED',
        jsonb_build_object('user_id',v_user,'identity_id',v_identity_id,
          'previous_target_id',v_previous_target,'invitation_target',v_target,
          'target_changed',v_previous_target IS DISTINCT FROM
            (SELECT id FROM public.academy_m365_identities WHERE user_id=v_user AND invitation_target)));
END $$;

CREATE OR REPLACE FUNCTION public.academy_list_m365_identities(p_search text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
    IF NOT public.academy_can_access() OR NOT public.is_admin() THEN
      RAISE EXCEPTION 'Wymagany administrator.' USING ERRCODE='42501';
    END IF;
    RETURN(SELECT COALESCE(jsonb_agg(item ORDER BY verified_at DESC),'[]') FROM (
        SELECT x.verified_at,jsonb_build_object('id',x.id,'userId',p.id,'fullName',p.full_name,
            'email',p.email,'tenantId',x.tenant_id,'objectId',x.object_id,
            'verifiedEmail',x.verified_email,'verifiedAt',x.verified_at,
            'invitationTarget',x.invitation_target) item
        FROM public.academy_m365_identities x JOIN public.profiles p ON p.id=x.user_id
        WHERE COALESCE(p_search,'')='' OR position(lower(left(p_search,100)) IN
            lower(COALESCE(p.full_name,'')||' '||p.email||' '||COALESCE(x.verified_email,'')))>0
        ORDER BY x.verified_at DESC LIMIT 100) rows);
END $$;

CREATE OR REPLACE FUNCTION public.academy_remove_m365_identity(p_identity_id uuid,p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE x public.academy_m365_identities;
BEGIN
    IF NOT public.academy_can_access() OR NOT public.is_admin() THEN
      RAISE EXCEPTION 'Wymagany administrator.' USING ERRCODE='42501';
    END IF;
    IF COALESCE(length(btrim(p_note)),0) NOT BETWEEN 5 AND 2000 THEN
      RAISE EXCEPTION 'Podaj uzasadnienie usunięcia mapowania.';
    END IF;
    SELECT * INTO x FROM public.academy_m365_identities WHERE id=p_identity_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Mapowanie nie istnieje.'; END IF;
    PERFORM 1 FROM public.profiles WHERE id=x.user_id FOR NO KEY UPDATE;
    DELETE FROM public.academy_m365_identities WHERE id=p_identity_id RETURNING * INTO x;
    IF NOT FOUND THEN RAISE EXCEPTION 'Mapowanie nie istnieje.'; END IF;
    PERFORM academy_private.refresh_user_invitations(x.user_id);
    INSERT INTO public.academy_audit_events(actor_id,action,details)
      VALUES(auth.uid(),'ACADEMY_IDENTITY_REMOVED',
        jsonb_build_object('user_id',x.user_id,'identity_id',x.id,'tenant_id',x.tenant_id,
            'object_id',x.object_id,'note',p_note));
END $$;

CREATE OR REPLACE FUNCTION public.academy_job_context(p_job_id uuid,p_lease_token uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j public.academy_integration_jobs; s public.course_sessions; r public.course_runs; o public.academy_organizers;
    i public.academy_session_integrations; v public.course_versions; v_attendees jsonb; v_participants jsonb; v_missing bigint; v_count bigint; v_unique bigint;
BEGIN
    IF NOT public.academy_job_lease_current(p_job_id,p_lease_token) THEN RAISE EXCEPTION 'lease_lost'; END IF;
    SELECT * INTO j FROM public.academy_integration_jobs WHERE id=p_job_id;
    SELECT * INTO s FROM public.course_sessions WHERE id=j.session_id;
    IF NOT FOUND THEN RETURN NULL; END IF;
    SELECT * INTO r FROM public.course_runs WHERE id=s.run_id;
    SELECT * INTO v FROM public.course_versions WHERE id=r.version_id;
    SELECT * INTO o FROM public.academy_organizers WHERE id=s.organizer_id;
    SELECT * INTO i FROM public.academy_session_integrations WHERE session_id=s.id;
    -- Resolve one invitation address per person. Graph sends invitations immediately;
    -- an ambiguous or shared alias must never be guessed or silently de-duplicated.
    v_attendees:='[]'::jsonb;
    IF s.meeting_mode='managed_teams' AND j.kind='sync_meeting' THEN
      WITH roster AS (
        SELECT reg.user_id FROM public.course_run_registrations reg
          WHERE reg.run_id=r.id AND reg.status='confirmed'
            AND academy_private.rollout_allows_user(reg.user_id)
        UNION
        SELECT staff.user_id FROM academy_private.run_instructors(r.id,r.course_id) staff
      ), addresses AS (
        SELECT roster.user_id,p.full_name,academy_private.invitation_email(roster.user_id) AS email
          FROM roster JOIN public.profiles p ON p.id=roster.user_id
          WHERE roster.user_id IS DISTINCT FROM o.profile_id
      )
      SELECT COALESCE(jsonb_agg(jsonb_build_object('email',mail.email,'name',mail.full_name)
                   ORDER BY mail.email) FILTER (WHERE mail.email IS NOT NULL),'[]'::jsonb),
             count(*) FILTER (WHERE mail.email IS NULL),count(mail.email),count(DISTINCT mail.email)
        INTO v_attendees,v_missing,v_count,v_unique FROM addresses mail;
      IF v_missing>0 THEN RAISE EXCEPTION 'academy_invitation_address_missing'; END IF;
      IF v_count<>v_unique THEN RAISE EXCEPTION 'academy_invitation_address_shared'; END IF;
    END IF;
    SELECT COALESCE(jsonb_agg(jsonb_build_object('profileId',p.id,
        'identities',(SELECT COALESCE(jsonb_agg(jsonb_build_object('tenantId',x.tenant_id,'objectId',x.object_id)),'[]') FROM public.academy_m365_identities x WHERE x.user_id=p.id),
        'verifiedEmails',(SELECT COALESCE(jsonb_agg(email),'[]') FROM (
            SELECT u.email WHERE u.email_confirmed_at IS NOT NULL AND u.email IS NOT NULL
            UNION SELECT x.verified_email FROM public.academy_m365_identities x WHERE x.user_id=p.id AND x.verified_email IS NOT NULL) verified)
        )),'[]') INTO v_participants FROM public.course_run_registrations reg JOIN public.profiles p ON p.id=reg.user_id
        JOIN auth.users u ON u.id=p.id WHERE reg.run_id=r.id AND reg.status='confirmed';
    RETURN jsonb_build_object('id',s.id,'revision',s.revision,'approved',v.status='published',
        'published',r.status='published','cancelled',s.status='cancelled' OR r.status='cancelled',
        'mode',s.meeting_mode,'externalJoinUrl',s.external_join_url,'organizerEnabled',COALESCE(o.enabled,false)
            AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=o.profile_id AND NOT COALESCE(p.is_external,false)
                AND COALESCE(p.employment_status::text,'active')<>'exited'),
        'meeting',CASE WHEN i.session_id IS NULL THEN NULL ELSE jsonb_build_object('eventId',i.event_id,'joinUrl',i.join_url,
            'transactionId',i.transaction_id,'organizerId',i.organizer_object_id) END,
        'onlineMeetingId',i.online_meeting_id,'attendanceWindowConfirmed',s.window_confirmed_at IS NOT NULL,
        'input',jsonb_build_object('sessionId',s.id,'organizer',jsonb_build_object('tenantId',COALESCE(o.tenant_id,'00000000-0000-0000-0000-000000000000'::uuid),
            'userId',COALESCE(o.object_id,'00000000-0000-0000-0000-000000000000'::uuid)),
            'subject',s.title,'startDateTime',s.starts_at,'endDateTime',s.ends_at,'timeZone',s.time_zone,
            'descriptionText','Szkolenie w Akademii Compass. Materiały i zasady ukończenia znajdziesz w swoim panelu szkolenia.', 'attendees',v_attendees),
        'attendanceWindow',jsonb_build_object('start',COALESCE(s.actual_starts_at,s.starts_at),'end',COALESCE(s.actual_ends_at,s.ends_at)),
        'attendanceThresholdPercent',(v.completion_rules->>'attendance_percent')::integer,'participants',v_participants);
END $$;

-- An upgrade must also correct already scheduled Graph events with a divergent
-- verified address. Enqueue only; the worker sends the invitation after commit.
DO $$
DECLARE v_session uuid;
BEGIN
    FOR v_session IN
      SELECT DISTINCT cs.id FROM public.course_sessions cs
      JOIN public.course_runs r ON r.id=cs.run_id
      JOIN public.courses c ON c.id=r.course_id
      WHERE r.status='published' AND cs.status='scheduled'
        AND cs.meeting_mode='managed_teams' AND cs.ends_at>now()
        AND (EXISTS(SELECT 1 FROM public.academy_m365_identities x
          JOIN auth.users u ON u.id=x.user_id
          WHERE x.verified_email IS NOT NULL
            AND lower(btrim(x.verified_email)) IS DISTINCT FROM lower(btrim(u.email))
            AND (c.author_id=x.user_id
          OR EXISTS(SELECT 1 FROM public.course_staff s WHERE s.course_id=c.id
              AND s.user_id=x.user_id AND s.role='facilitator' AND s.revoked_at IS NULL)
          OR EXISTS(SELECT 1 FROM public.course_run_staff s WHERE s.run_id=r.id
              AND s.user_id=x.user_id AND s.revoked_at IS NULL)
          OR EXISTS(SELECT 1 FROM public.course_run_registrations reg WHERE reg.run_id=r.id
              AND reg.user_id=x.user_id AND reg.status='confirmed')))
          OR EXISTS(SELECT 1 FROM public.course_run_registrations reg
              WHERE reg.run_id=r.id AND reg.status='confirmed'
                AND NOT academy_private.rollout_allows_user(reg.user_id))
          OR NOT academy_private.trainer_eligible(c.author_id))
      ORDER BY cs.id
    LOOP
      UPDATE public.course_sessions SET revision=revision+1,sync_status='pending',updated_at=now()
        WHERE id=v_session;
      PERFORM academy_private.enqueue_session(v_session,'sync_meeting');
    END LOOP;
END $$;

NOTIFY pgrst,'reload schema';

COMMIT;
