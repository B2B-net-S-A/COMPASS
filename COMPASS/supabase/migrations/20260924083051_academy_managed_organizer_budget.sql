-- A managed meeting reserves every seat plus each distinct instructor and host.
-- The host is not an event attendee, but still occupies a Teams meeting place.
BEGIN;

CREATE FUNCTION academy_private.managed_invitation_budget(
    p_run_id uuid, p_course_id uuid, p_capacity integer, p_organizer_id uuid
)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
    SELECT p_capacity + count(*)::integer FROM (
        SELECT user_id FROM academy_private.run_instructors(p_run_id,p_course_id)
        UNION
        SELECT profile_id FROM public.academy_organizers WHERE id=p_organizer_id
    ) participants;
$$;
REVOKE ALL ON FUNCTION academy_private.managed_invitation_budget(uuid,uuid,integer,uuid)
    FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION academy_private.check_invitation_budget(p_run_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.course_runs;
BEGIN
    SELECT * INTO r FROM public.course_runs WHERE id=p_run_id;
    IF EXISTS (
        SELECT 1 FROM public.course_sessions s
        WHERE s.run_id=r.id AND s.meeting_mode='managed_teams' AND s.status='scheduled'
          AND academy_private.managed_invitation_budget(r.id,r.course_id,r.capacity,s.organizer_id)>500
    ) THEN
        RAISE EXCEPTION 'Teams: limit 500 obejmuje miejsca uczestników, prowadzących i gospodarza. Zmniejsz liczbę miejsc.';
    END IF;
END $$;

-- Fail the migration rather than silently leaving a previously accepted
-- overbooked managed session in production.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.course_sessions s
        JOIN public.course_runs r ON r.id=s.run_id
        WHERE s.meeting_mode='managed_teams' AND s.status='scheduled'
          AND academy_private.managed_invitation_budget(r.id,r.course_id,r.capacity,s.organizer_id)>500
    ) THEN
        RAISE EXCEPTION 'academy_existing_managed_invitation_budget_exceeded';
    END IF;
END $$;

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
        SELECT capacity,course_id INTO v_capacity,v_course
        FROM public.course_runs WHERE id=NEW.run_id FOR UPDATE;
        -- Serialize with organizer reassignment before reading its profile.
        PERFORM 1 FROM public.academy_organizers WHERE id=NEW.organizer_id FOR SHARE;
        IF academy_private.managed_invitation_budget(NEW.run_id,v_course,v_capacity,NEW.organizer_id)>500 THEN
            RAISE EXCEPTION 'Teams: limit 500 obejmuje miejsca uczestników, prowadzących i gospodarza. Zmniejsz liczbę miejsc.';
        END IF;
    END IF;
    RETURN NEW;
END $$;

-- A draft session can switch host, so its organizer_id must run the same guard.
DROP TRIGGER academy_session_invitation_budget ON public.course_sessions;
CREATE TRIGGER academy_session_invitation_budget
    BEFORE INSERT OR UPDATE OF meeting_mode,status,organizer_id ON public.course_sessions
    FOR EACH ROW EXECUTE FUNCTION academy_private.guard_invitation_budget();

-- Repointing an organizer that owns any managed session also breaks cancellation
-- recovery: the worker would search a different mailbox for the original event.
CREATE FUNCTION academy_private.guard_managed_organizer_reassignment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
    IF (NEW.profile_id,NEW.tenant_id,NEW.object_id) IS DISTINCT FROM
       (OLD.profile_id,OLD.tenant_id,OLD.object_id)
       AND EXISTS (
           SELECT 1 FROM public.course_sessions
           WHERE organizer_id=OLD.id AND meeting_mode='managed_teams'
       ) THEN
        RAISE EXCEPTION 'Organizator ma powiązane spotkania Teams. Dodaj nowe konto organizatora i przeplanuj spotkania.';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER academy_managed_organizer_reassignment
    BEFORE UPDATE OF profile_id,tenant_id,object_id ON public.academy_organizers
    FOR EACH ROW EXECUTE FUNCTION academy_private.guard_managed_organizer_reassignment();
REVOKE ALL ON FUNCTION academy_private.guard_managed_organizer_reassignment()
    FROM PUBLIC,anon,authenticated;

COMMIT;
