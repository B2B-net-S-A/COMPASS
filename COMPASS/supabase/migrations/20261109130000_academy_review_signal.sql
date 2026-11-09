-- B0.8: sygnał w dzwonku dla recenzenta i autora oraz wycofanie zgłoszenia przez autora.
-- Wyłącznie powiadomienia in-app (tabela notifications), nic nie wychodzi poza COMPASS.
-- Token submission_id zostaje bez zmian: po wycofaniu nieaktualny podgląd recenzenta dostaje
-- pending_review_required, a po ponownym zgłoszeniu review_submission_changed.
--
-- Cofnięcie: DROP TRIGGER academy_review_signal ON public.course_versions;
--   DROP FUNCTION academy_private.review_signal(), academy_private.review_notify(text,uuid,text,text,text,text),
--   public.academy_withdraw_submission(uuid,uuid); oraz przywrócenie listy akcji w academy_course_review_history
--   z pliku 20260923093432. Wiersze w notifications zostają, są nieszkodliwe.
BEGIN;

CREATE OR REPLACE FUNCTION academy_private.review_notify(p_key text,p_user_id uuid,p_type text,p_title text,p_body text,p_url text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
    INSERT INTO public.academy_notification_receipts(dedupe_key,user_id) VALUES(p_key,p_user_id) ON CONFLICT DO NOTHING;
    IF NOT FOUND THEN RETURN; END IF;
    INSERT INTO public.notifications(user_id,type,title_pl,title_en,body_pl,body_en,action_url,priority)
    VALUES(p_user_id,p_type,p_title,'Academy review update',p_body,p_body,p_url,'normal');
END $$;

CREATE OR REPLACE FUNCTION academy_private.review_signal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
    v_author uuid;
    v_title text := COALESCE(NULLIF(trim(NEW.metadata->>'title'),''),'Szkolenie');
    v_token text := COALESCE(NEW.submission_id::text,NEW.id::text);
    v_user uuid;
    v_decision text;
BEGIN
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
    SELECT author_id INTO v_author FROM public.courses WHERE id=NEW.course_id;

    IF NEW.status='pending_review' OR (OLD.status='pending_review' AND NEW.status='draft') THEN
        v_decision := CASE WHEN NEW.status='pending_review' THEN 'submitted' ELSE 'withdrawn' END;
        -- Autor i współtwórcy tej wersji nie mogą jej zatwierdzić, więc nie dostają wezwania.
        FOR v_user IN SELECT p.id FROM public.profiles p
            WHERE p.role::text='admin' AND COALESCE(p.employment_status::text,'active')<>'exited'
              AND p.id IS DISTINCT FROM v_author
              AND NOT EXISTS(SELECT 1 FROM academy_private.version_contributors x WHERE x.version_id=NEW.id AND x.user_id=p.id)
        LOOP
            PERFORM academy_private.review_notify('review:'||v_decision||':'||v_token||':'||v_user,v_user,'system_announcement',
                CASE WHEN v_decision='submitted' THEN 'Szkolenie czeka na akceptację' ELSE 'Wycofano zgłoszenie do akceptacji' END,
                v_title,'/admin/learning');
        END LOOP;
    ELSIF OLD.status='pending_review' AND NEW.status IN ('published','rejected') THEN
        FOR v_user IN SELECT v_author WHERE v_author IS NOT NULL
            UNION SELECT x.user_id FROM academy_private.version_contributors x WHERE x.version_id=NEW.id
        LOOP
            CONTINUE WHEN v_user IS NOT DISTINCT FROM NEW.reviewed_by;
            PERFORM academy_private.review_notify('review:decided:'||v_token||':'||v_user,v_user,
                CASE WHEN NEW.status='published' THEN 'course_approved' ELSE 'course_rejected' END,
                CASE WHEN NEW.status='published' THEN 'Szkolenie zostało zatwierdzone' ELSE 'Szkolenie wymaga poprawek' END,
                v_title,'/learning/tworze/'||NEW.course_id||'/edit');
        END LOOP;
    END IF;
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Sygnał jest dodatkiem: jego awaria nie może cofnąć zgłoszenia ani decyzji recenzenta.
    RAISE WARNING 'academy review signal failed: %', SQLSTATE;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS academy_review_signal ON public.course_versions;
CREATE TRIGGER academy_review_signal AFTER UPDATE OF status ON public.course_versions
    FOR EACH ROW EXECUTE FUNCTION academy_private.review_signal();
REVOKE ALL ON FUNCTION academy_private.review_notify(text,uuid,text,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION academy_private.review_signal() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.academy_withdraw_submission(p_course_id uuid,p_submission_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c public.courses%ROWTYPE; v public.course_versions%ROWTYPE;
BEGIN
    IF NOT public.academy_can_manage_course(p_course_id) THEN RAISE EXCEPTION 'trainer_course_required' USING ERRCODE='42501'; END IF;
    -- Ta sama kolejność blokad co academy_review_course: decyzja i wycofanie się wykluczają.
    SELECT * INTO c FROM public.courses WHERE id=p_course_id FOR UPDATE;
    SELECT * INTO v FROM public.course_versions WHERE id=c.draft_version_id FOR UPDATE;
    IF NOT FOUND OR v.status<>'pending_review' OR c.status='archived' THEN RAISE EXCEPTION 'pending_review_required'; END IF;
    IF p_submission_id IS NULL OR v.submission_id IS DISTINCT FROM p_submission_id THEN RAISE EXCEPTION 'review_submission_changed'; END IF;
    UPDATE public.course_versions SET status='draft',submitted_at=NULL WHERE id=v.id;
    UPDATE public.courses SET status=CASE WHEN published_version_id IS NULL THEN 'draft' ELSE status END,updated_at=now() WHERE id=c.id;
    INSERT INTO public.academy_audit_events(actor_id,action,course_id,details)
    VALUES(auth.uid(),'COURSE_REVIEW_WITHDRAWN',c.id,jsonb_build_object('version_id',v.id,'submission_id',p_submission_id));
    RETURN v.id;
END $$;
REVOKE ALL ON FUNCTION public.academy_withdraw_submission(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.academy_withdraw_submission(uuid,uuid) TO authenticated;

-- Historia decyzji pokazuje też wycofanie (lista akcji jak w 20260923093432, plus jedna pozycja).
DROP INDEX IF EXISTS public.academy_review_history_page;
CREATE INDEX academy_review_history_page ON public.academy_audit_events(course_id,created_at DESC,id DESC)
    WHERE action IN ('COURSE_REVIEW_SUBMITTED','COURSE_SUBMITTED','COURSE_PUBLISHED','COURSE_REJECTED','LEGACY_COURSE_REVIEWED','COURSE_ARCHIVED','COURSE_REVIEW_WITHDRAWN');

CREATE OR REPLACE FUNCTION public.academy_course_review_history(p_course_id uuid,p_before_created_at timestamptz DEFAULT NULL,p_before_id uuid DEFAULT NULL,p_limit integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
    IF NOT public.academy_can_access() OR NOT public.academy_can_manage_course(p_course_id) THEN
        RAISE EXCEPTION 'Brak uprawnień do historii decyzji tego szkolenia.' USING ERRCODE='42501';
    END IF;
    IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50
        OR (p_before_created_at IS NULL)<>(p_before_id IS NULL)
        OR (p_before_created_at IS NOT NULL AND NOT isfinite(p_before_created_at)) THEN
        RAISE EXCEPTION 'Nieprawidłowe parametry strony historii.';
    END IF;
    WITH page AS (
        SELECT a.id,a.action,a.created_at,a.actor_id,a.details
        FROM public.academy_audit_events a
        WHERE a.course_id=p_course_id
            AND a.action IN ('COURSE_REVIEW_SUBMITTED','COURSE_SUBMITTED','COURSE_PUBLISHED','COURSE_REJECTED','LEGACY_COURSE_REVIEWED','COURSE_ARCHIVED','COURSE_REVIEW_WITHDRAWN')
            AND (p_before_created_at IS NULL OR (a.created_at,a.id)<(p_before_created_at,p_before_id))
            AND (a.action<>'COURSE_SUBMITTED' OR NOT EXISTS(
                SELECT 1 FROM public.academy_audit_events newer WHERE newer.course_id=a.course_id
                    AND newer.action='COURSE_REVIEW_SUBMITTED' AND newer.created_at=a.created_at
                    AND newer.actor_id IS NOT DISTINCT FROM a.actor_id
                    AND newer.details->>'version_id'=a.details->>'version_id'))
        ORDER BY a.created_at DESC,a.id DESC LIMIT p_limit+1
    ), numbered AS (
        SELECT *,row_number() OVER(ORDER BY created_at DESC,id DESC) n FROM page
    ), projected AS (
        SELECT a.n,a.id,a.created_at,jsonb_build_object(
            'id',a.id,'action',a.action,'createdAt',a.created_at,
            'actorName',left(p.full_name,200),'versionNumber',v.version_number,
            'submissionId',CASE WHEN (a.details->>'submission_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN a.details->>'submission_id' END,
            'reason',CASE WHEN a.action IN ('COURSE_REJECTED','LEGACY_COURSE_REVIEWED') AND jsonb_typeof(a.details->'reason')='string' THEN left(a.details->>'reason',3000) END,
            'approved',CASE WHEN a.action='LEGACY_COURSE_REVIEWED' AND jsonb_typeof(a.details->'approved')='boolean' THEN (a.details->>'approved')::boolean END
        ) item
        FROM numbered a LEFT JOIN public.profiles p ON p.id=a.actor_id
        LEFT JOIN public.course_versions v ON v.id::text=a.details->>'version_id' AND v.course_id=p_course_id
        WHERE a.n<=p_limit
    ) SELECT jsonb_build_object(
        'items',COALESCE((SELECT jsonb_agg(item ORDER BY n) FROM projected),'[]'::jsonb),
        'nextCursor',CASE WHEN (SELECT count(*) FROM page)>p_limit THEN
            (SELECT jsonb_build_object('createdAt',created_at,'id',id) FROM projected WHERE n=p_limit) END
    ) INTO result;
    RETURN result;
END $$;

DO $$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='academy_review_signal' AND tgrelid='public.course_versions'::regclass AND NOT tgisinternal) THEN
        RAISE EXCEPTION 'B0.8: brak wyzwalacza academy_review_signal';
    END IF;
    IF NOT has_function_privilege('authenticated','public.academy_withdraw_submission(uuid,uuid)','EXECUTE')
        OR has_function_privilege('anon','public.academy_withdraw_submission(uuid,uuid)','EXECUTE') THEN
        RAISE EXCEPTION 'B0.8: złe uprawnienia academy_withdraw_submission';
    END IF;
    IF has_function_privilege('authenticated','academy_private.review_notify(text,uuid,text,text,text,text)','EXECUTE') THEN
        RAISE EXCEPTION 'B0.8: review_notify nie może być wołalna przez użytkownika';
    END IF;
    IF position('COURSE_REVIEW_WITHDRAWN' IN pg_get_functiondef('public.academy_course_review_history(uuid,timestamptz,uuid,integer)'::regprocedure))=0 THEN
        RAISE EXCEPTION 'B0.8: historia decyzji nie zna wycofania';
    END IF;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
