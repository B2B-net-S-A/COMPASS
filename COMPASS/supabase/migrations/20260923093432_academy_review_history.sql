BEGIN;

-- Only future decisions made by the current review transaction are enriched.
-- Never attach today's submission token to an older historical audit entry.
CREATE FUNCTION academy_private.review_decision_submission()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_submission uuid;
BEGIN
    IF NEW.action IN ('COURSE_PUBLISHED','COURSE_REJECTED') AND NOT (NEW.details ? 'submission_id')
        AND NEW.created_at=now() AND NEW.actor_id=auth.uid()
        AND (NEW.details->>'version_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        SELECT submission_id INTO v_submission FROM public.course_versions
        WHERE id=(NEW.details->>'version_id')::uuid AND course_id=NEW.course_id
            AND reviewed_by=NEW.actor_id AND reviewed_at=now()
            AND status=CASE NEW.action WHEN 'COURSE_PUBLISHED' THEN 'published' ELSE 'rejected' END;
        IF v_submission IS NOT NULL THEN NEW.details:=NEW.details||jsonb_build_object('submission_id',v_submission); END IF;
    END IF;
    RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION academy_private.review_decision_submission() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER academy_review_decision_submission BEFORE INSERT ON public.academy_audit_events
    FOR EACH ROW EXECUTE FUNCTION academy_private.review_decision_submission();

CREATE INDEX academy_review_history_page ON public.academy_audit_events(course_id,created_at DESC,id DESC)
    WHERE action IN ('COURSE_REVIEW_SUBMITTED','COURSE_SUBMITTED','COURSE_PUBLISHED','COURSE_REJECTED','LEGACY_COURSE_REVIEWED','COURSE_ARCHIVED');

CREATE FUNCTION public.academy_course_review_history(p_course_id uuid,p_before_created_at timestamptz DEFAULT NULL,p_before_id uuid DEFAULT NULL,p_limit integer DEFAULT 20)
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
            AND a.action IN ('COURSE_REVIEW_SUBMITTED','COURSE_SUBMITTED','COURSE_PUBLISHED','COURSE_REJECTED','LEGACY_COURSE_REVIEWED','COURSE_ARCHIVED')
            AND (p_before_created_at IS NULL OR (a.created_at,a.id)<(p_before_created_at,p_before_id))
            -- The submission trigger and old RPC emit two records in the same
            -- transaction. Prefer the one with its explicit submission token.
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
REVOKE ALL ON FUNCTION public.academy_course_review_history(uuid,timestamptz,uuid,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.academy_course_review_history(uuid,timestamptz,uuid,integer) TO authenticated;
-- Raw academy_audit_events grants and its administrator-only RLS stay unchanged.
NOTIFY pgrst,'reload schema';
COMMIT;
