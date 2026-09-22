-- Academy: capability grants, immutable publications and trusted completions.
-- Additive backfill preserves IDs, existing enrollments, ledger and certificate hashes.
BEGIN;

CREATE SCHEMA IF NOT EXISTS academy_private;
REVOKE ALL ON SCHEMA academy_private FROM PUBLIC, anon, authenticated;

CREATE TABLE public.academy_user_capabilities (
    user_id uuid PRIMARY KEY REFERENCES public.profiles(id),
    can_train boolean NOT NULL DEFAULT false,
    granted_by uuid REFERENCES public.profiles(id),
    granted_at timestamptz NOT NULL DEFAULT now(),
    revoked_by uuid REFERENCES public.profiles(id),
    revoked_at timestamptz,
    CHECK ((can_train AND revoked_at IS NULL) OR NOT can_train)
);

ALTER TABLE public.courses
    ADD COLUMN delivery_mode text NOT NULL DEFAULT 'self_paced'
        CHECK (delivery_mode IN ('self_paced', 'live', 'blended')),
    ADD COLUMN published_version_id uuid,
    ADD COLUMN draft_version_id uuid;

CREATE TABLE public.course_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id uuid NOT NULL REFERENCES public.courses(id),
    version_number integer NOT NULL CHECK (version_number > 0),
    status text NOT NULL CHECK (status IN ('draft', 'pending_review', 'published', 'rejected')),
    metadata jsonb NOT NULL CHECK (jsonb_typeof(metadata) = 'object'),
    completion_rules jsonb NOT NULL CHECK (jsonb_typeof(completion_rules) = 'object'),
    created_by uuid REFERENCES public.profiles(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    submitted_at timestamptz,
    reviewed_by uuid REFERENCES public.profiles(id),
    reviewed_at timestamptz,
    published_at timestamptz,
    rejection_reason text,
    legacy boolean NOT NULL DEFAULT false,
    UNIQUE (course_id, version_number),
    UNIQUE (id, course_id)
);
CREATE INDEX academy_versions_review ON public.course_versions(status, submitted_at);
ALTER TABLE public.courses
    ADD CONSTRAINT academy_published_version_course_fk FOREIGN KEY (published_version_id, id)
        REFERENCES public.course_versions(id, course_id),
    ADD CONSTRAINT academy_draft_version_course_fk FOREIGN KEY (draft_version_id, id)
        REFERENCES public.course_versions(id, course_id);

ALTER TABLE public.course_lessons ADD COLUMN version_id uuid;
ALTER TABLE public.course_quiz_questions ADD COLUMN version_id uuid;
ALTER TABLE public.course_enrollments ADD COLUMN version_id uuid, ADD COLUMN run_id uuid;

INSERT INTO public.course_versions (
    course_id, version_number, status, metadata, completion_rules, created_by,
    created_at, reviewed_by, reviewed_at, published_at, rejection_reason, legacy
)
SELECT c.id, 1, CASE WHEN c.status = 'archived' THEN 'published' ELSE c.status END,
    jsonb_build_object(
        'title', c.title, 'description', c.description, 'category', c.category,
        'tags', c.tags, 'level', c.level, 'duration_minutes', c.duration_minutes,
        'cover_image_url', c.cover_image_url, 'delivery_mode', c.delivery_mode,
        'course_type', c.course_type, 'is_official', c.is_official,
        'prerequisite_course_ids', c.prerequisite_course_ids
    ),
    -- Legacy LMS required the quiz, but did not require every lesson to be marked.
    jsonb_build_object('quiz_required', true, 'quiz_pass_percent', 70,
        'require_all_lessons', false, 'attendance_percent', 80),
    c.author_id, c.created_at, c.reviewed_by, c.reviewed_at, c.published_at,
    c.rejection_reason, true
FROM public.courses c;

UPDATE public.courses c SET
    published_version_id = CASE WHEN c.status IN ('published', 'archived') THEN v.id END,
    draft_version_id = CASE WHEN c.status IN ('draft', 'pending_review', 'rejected') THEN v.id END
FROM public.course_versions v WHERE v.course_id = c.id;
UPDATE public.course_lessons l SET version_id = v.id FROM public.course_versions v WHERE v.course_id = l.course_id;
UPDATE public.course_quiz_questions q SET version_id = v.id FROM public.course_versions v WHERE v.course_id = q.course_id;
UPDATE public.course_enrollments e SET version_id = v.id FROM public.course_versions v WHERE v.course_id = e.course_id;

ALTER TABLE public.course_lessons ALTER COLUMN version_id SET NOT NULL;
ALTER TABLE public.course_quiz_questions ALTER COLUMN version_id SET NOT NULL;
ALTER TABLE public.course_enrollments ALTER COLUMN version_id SET NOT NULL;
ALTER TABLE public.course_lessons ADD CONSTRAINT academy_lesson_version_course_fk
    FOREIGN KEY (version_id, course_id) REFERENCES public.course_versions(id, course_id);
ALTER TABLE public.course_quiz_questions ADD CONSTRAINT academy_question_version_course_fk
    FOREIGN KEY (version_id, course_id) REFERENCES public.course_versions(id, course_id);
ALTER TABLE public.course_enrollments ADD CONSTRAINT academy_enrollment_version_course_fk
    FOREIGN KEY (version_id, course_id) REFERENCES public.course_versions(id, course_id);
ALTER TABLE public.course_lessons DROP CONSTRAINT course_lessons_course_id_order_index_key;
ALTER TABLE public.course_quiz_questions DROP CONSTRAINT course_quiz_questions_course_id_order_index_key;
ALTER TABLE public.course_lessons ADD CONSTRAINT academy_lessons_version_order
    UNIQUE (version_id, order_index) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE public.course_quiz_questions ADD CONSTRAINT academy_questions_version_order
    UNIQUE (version_id, order_index) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE public.course_enrollments DROP CONSTRAINT course_enrollments_user_id_course_id_key;
CREATE UNIQUE INDEX academy_enrollment_self_paced ON public.course_enrollments(user_id, course_id) WHERE run_id IS NULL;
CREATE UNIQUE INDEX academy_enrollment_run ON public.course_enrollments(user_id, run_id) WHERE run_id IS NOT NULL;
CREATE INDEX academy_enrollments_version ON public.course_enrollments(version_id, user_id);

CREATE TABLE public.course_completions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    enrollment_id uuid NOT NULL UNIQUE REFERENCES public.course_enrollments(id),
    user_id uuid NOT NULL REFERENCES public.profiles(id),
    course_id uuid NOT NULL REFERENCES public.courses(id),
    version_id uuid NOT NULL REFERENCES public.course_versions(id),
    completed_at timestamptz NOT NULL,
    certificate_snapshot jsonb NOT NULL,
    legacy boolean NOT NULL DEFAULT false
);
CREATE INDEX academy_completions_user ON public.course_completions(user_id, completed_at DESC);

CREATE TABLE public.academy_reward_claims (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.profiles(id),
    course_id uuid NOT NULL REFERENCES public.courses(id),
    reward_kind text NOT NULL CHECK (reward_kind IN ('completion', 'first_publication')),
    claimed_at timestamptz NOT NULL DEFAULT now(),
    legacy boolean NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX academy_reward_completion ON public.academy_reward_claims(user_id, course_id) WHERE reward_kind = 'completion';
CREATE UNIQUE INDEX academy_reward_first_publication ON public.academy_reward_claims(user_id) WHERE reward_kind = 'first_publication';

CREATE TABLE public.academy_audit_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id uuid REFERENCES public.profiles(id),
    action text NOT NULL,
    course_id uuid REFERENCES public.courses(id),
    details jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX academy_audit_course ON public.academy_audit_events(course_id, created_at DESC);

INSERT INTO public.course_completions(enrollment_id,user_id,course_id,version_id,completed_at,certificate_snapshot,legacy)
SELECT e.id,e.user_id,e.course_id,e.version_id,e.completed_at,
    jsonb_build_object('course_title',v.metadata->>'title','version_number',v.version_number,
        'participant_name',COALESCE(p.full_name,p.email,'Uczestnik'),
        'author_name',a.full_name,'completed_at',e.completed_at,
        'certificate_hash',COALESCE(e.certificate_hash,
            encode(sha256(convert_to(e.user_id::text || ':' || e.course_id::text || ':' || e.completed_at::text,'UTF8')),'hex'))),true
FROM public.course_enrollments e
JOIN public.course_versions v ON v.id=e.version_id
JOIN public.courses c ON c.id=e.course_id
JOIN public.profiles p ON p.id=e.user_id
LEFT JOIN public.profiles a ON a.id=c.author_id
WHERE e.completed_at IS NOT NULL;
INSERT INTO public.academy_reward_claims(user_id,course_id,reward_kind,legacy)
SELECT DISTINCT e.user_id,e.course_id,'completion',true FROM public.course_enrollments e
WHERE e.points_awarded OR e.completed_at IS NOT NULL ON CONFLICT DO NOTHING;
INSERT INTO public.academy_reward_claims(user_id,course_id,reward_kind,legacy)
SELECT DISTINCT t.user_id,t.source_id,'completion',true FROM public.loyalty_transactions t
JOIN public.courses c ON c.id=t.source_id
WHERE t.source_type IN ('course_completed_student','course_completed_company_student') ON CONFLICT DO NOTHING;
INSERT INTO public.academy_reward_claims(user_id,course_id,reward_kind,legacy)
SELECT DISTINCT ON (t.user_id) t.user_id,t.source_id,'first_publication',true FROM public.loyalty_transactions t
JOIN public.courses c ON c.id=t.source_id WHERE t.source_type='course_first_publish_bonus'
ORDER BY t.user_id,t.created_at ON CONFLICT DO NOTHING;
-- A legacy publication without a ledger entry must not become a new "first"
-- publication after editing. No historical bonus is retroactively paid.
INSERT INTO public.academy_reward_claims(user_id,course_id,reward_kind,legacy)
SELECT DISTINCT ON (c.author_id) c.author_id,c.id,'first_publication',true
FROM public.courses c WHERE c.published_version_id IS NOT NULL
ORDER BY c.author_id,c.created_at ON CONFLICT DO NOTHING;

CREATE TABLE public.academy_learning_streaks (
    user_id uuid PRIMARY KEY REFERENCES public.profiles(id),
    current_streak integer NOT NULL DEFAULT 0 CHECK(current_streak>=0),
    longest_streak integer NOT NULL DEFAULT 0 CHECK(longest_streak>=current_streak),
    last_activity_date date
);
INSERT INTO public.academy_learning_streaks(user_id,current_streak,longest_streak,last_activity_date)
SELECT id,greatest(0,learning_streak_current),greatest(0,learning_streak_current,learning_streak_longest),learning_streak_last_date FROM public.profiles;
ALTER TABLE public.academy_learning_streaks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.academy_learning_streaks FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.academy_learning_streaks TO authenticated;
GRANT ALL ON public.academy_learning_streaks TO service_role;

CREATE OR REPLACE FUNCTION public.academy_can_access()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
    SELECT auth.uid() IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.profiles p WHERE p.id=auth.uid()
        AND p.role::text IN ('consultant','admin') AND NOT COALESCE(p.is_external,false)
        AND COALESCE(p.employment_status::text,'active') <> 'exited'
    );
$$;
CREATE OR REPLACE FUNCTION public.academy_is_trainer()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
    SELECT public.academy_can_access() AND (public.is_admin() OR EXISTS (
        SELECT 1 FROM public.academy_user_capabilities g WHERE g.user_id=auth.uid()
        AND g.can_train AND g.revoked_at IS NULL
    ));
$$;
CREATE OR REPLACE FUNCTION public.academy_can_manage_course(p_course_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
    SELECT public.academy_is_trainer() AND EXISTS (
        SELECT 1 FROM public.courses c WHERE c.id=p_course_id AND (public.is_admin() OR c.author_id=auth.uid())
    );
$$;
-- The live migration adds the confirmed-registration branch. A bare run_id can
-- never grant access before that domain has installed its authorization check.
CREATE OR REPLACE FUNCTION public.academy_enrollment_has_access(p_enrollment_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
    SELECT public.academy_can_access() AND EXISTS(SELECT 1 FROM public.course_enrollments e
        WHERE e.id=p_enrollment_id AND (e.user_id=auth.uid() OR public.academy_can_manage_course(e.course_id))
        AND (e.run_id IS NULL OR e.completed_at IS NOT NULL));
$$;
CREATE OR REPLACE FUNCTION public.academy_can_read_version(p_version_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
    SELECT public.academy_can_access() AND EXISTS (
        SELECT 1 FROM public.course_versions v JOIN public.courses c ON c.id=v.course_id
        WHERE v.id=p_version_id AND (public.is_admin() OR c.author_id=auth.uid()
            OR (c.status='published' AND c.published_version_id=v.id AND v.status='published')
            OR EXISTS (SELECT 1 FROM public.course_enrollments e WHERE e.version_id=v.id AND e.user_id=auth.uid() AND public.academy_enrollment_has_access(e.id)))
    );
$$;
CREATE OR REPLACE FUNCTION public.academy_can_read_material(p_version_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
    SELECT public.academy_can_access() AND EXISTS (
        SELECT 1 FROM public.course_versions v JOIN public.courses c ON c.id=v.course_id
        WHERE v.id=p_version_id AND (public.is_admin() OR c.author_id=auth.uid()
            OR EXISTS (SELECT 1 FROM public.course_enrollments e WHERE e.version_id=v.id AND e.user_id=auth.uid() AND public.academy_enrollment_has_access(e.id)))
    );
$$;
CREATE OR REPLACE FUNCTION public.academy_can_edit_version(p_version_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
    SELECT EXISTS (SELECT 1 FROM public.course_versions v JOIN public.courses c ON c.id=v.course_id
        WHERE v.id=p_version_id AND c.draft_version_id=v.id AND c.status<>'archived' AND v.status IN ('draft','rejected')
        AND public.academy_can_manage_course(c.id));
$$;
CREATE POLICY academy_streak_read ON public.academy_learning_streaks FOR SELECT TO authenticated
    USING(public.academy_can_access() AND (user_id=auth.uid() OR public.is_admin()));

CREATE OR REPLACE FUNCTION academy_private.try_timestamp(p_value text)
RETURNS timestamptz LANGUAGE plpgsql STABLE SET search_path=public,pg_temp AS $$
BEGIN
    RETURN p_value::timestamptz;
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.academy_can_read_lesson(p_lesson_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
    SELECT public.academy_can_access() AND EXISTS (
        SELECT 1 FROM public.course_lessons l JOIN public.courses c ON c.id=l.course_id
        WHERE l.id=p_lesson_id AND (public.is_admin() OR c.author_id=auth.uid() OR EXISTS (
            SELECT 1 FROM public.course_enrollments e WHERE e.user_id=auth.uid() AND e.version_id=l.version_id AND public.academy_enrollment_has_access(e.id)
                AND (e.completed_at IS NOT NULL OR l.unlock_after_days=0 OR NOT EXISTS (
                    SELECT 1 FROM public.course_lessons previous WHERE previous.version_id=l.version_id AND previous.order_index<l.order_index)
                OR now() >= academy_private.try_timestamp(e.lesson_completion_dates->>(
                    SELECT previous.id::text FROM public.course_lessons previous WHERE previous.version_id=l.version_id
                        AND previous.order_index<l.order_index ORDER BY previous.order_index DESC LIMIT 1)) + make_interval(days=>l.unlock_after_days))
        ))
    );
$$;

-- All old permissive policies are replaced, including unknown historical aliases.
DO $$ DECLARE t text; p record; BEGIN
    FOREACH t IN ARRAY ARRAY['courses','course_versions','course_lessons','course_quiz_questions','course_quiz_options',
        'course_enrollments','course_quiz_attempts','course_completions','academy_user_capabilities','academy_reward_claims','academy_audit_events'] LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
        FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
            EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,t);
        END LOOP;
        EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated',t);
        EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
        EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
    END LOOP;
END $$;
CREATE POLICY academy_capabilities_read ON public.academy_user_capabilities FOR SELECT TO authenticated
    USING (public.academy_can_access() AND (user_id=auth.uid() OR public.is_admin()));
CREATE POLICY academy_courses_read ON public.courses FOR SELECT TO authenticated USING (
    public.academy_can_access() AND (public.is_admin() OR author_id=auth.uid()
        OR (status='published' AND published_version_id IS NOT NULL)
        OR EXISTS (SELECT 1 FROM public.course_enrollments e WHERE e.course_id=courses.id AND e.user_id=auth.uid() AND public.academy_enrollment_has_access(e.id))));
CREATE POLICY academy_versions_read ON public.course_versions FOR SELECT TO authenticated USING(public.academy_can_read_version(id));
CREATE POLICY academy_lessons_read ON public.course_lessons FOR SELECT TO authenticated USING(public.academy_can_read_lesson(id));
CREATE POLICY academy_lessons_write ON public.course_lessons FOR ALL TO authenticated
    USING(public.academy_can_edit_version(version_id)) WITH CHECK(public.academy_can_edit_version(version_id));
CREATE POLICY academy_questions_read ON public.course_quiz_questions FOR SELECT TO authenticated
    USING(public.academy_can_manage_course(course_id));
CREATE POLICY academy_questions_write ON public.course_quiz_questions FOR ALL TO authenticated
    USING(public.academy_can_edit_version(version_id)) WITH CHECK(public.academy_can_edit_version(version_id));
CREATE POLICY academy_options_read ON public.course_quiz_options FOR SELECT TO authenticated USING (
    EXISTS(SELECT 1 FROM public.course_quiz_questions q WHERE q.id=question_id AND public.academy_can_manage_course(q.course_id)));
CREATE POLICY academy_options_write ON public.course_quiz_options FOR ALL TO authenticated USING (
    EXISTS(SELECT 1 FROM public.course_quiz_questions q WHERE q.id=question_id AND public.academy_can_edit_version(q.version_id))) WITH CHECK (
    EXISTS(SELECT 1 FROM public.course_quiz_questions q WHERE q.id=question_id AND public.academy_can_edit_version(q.version_id)));
CREATE POLICY academy_enrollments_read ON public.course_enrollments FOR SELECT TO authenticated USING (
    public.academy_can_access() AND (user_id=auth.uid() OR public.academy_can_manage_course(course_id)));
CREATE POLICY academy_attempts_read ON public.course_quiz_attempts FOR SELECT TO authenticated USING (
    public.academy_can_access() AND (user_id=auth.uid() OR public.academy_can_manage_course(course_id)));
CREATE POLICY academy_completions_read ON public.course_completions FOR SELECT TO authenticated USING (
    public.academy_can_access() AND (user_id=auth.uid() OR public.academy_can_manage_course(course_id)));
CREATE POLICY academy_rewards_read ON public.academy_reward_claims FOR SELECT TO authenticated
    USING(public.academy_can_access() AND (user_id=auth.uid() OR public.is_admin()));
CREATE POLICY academy_audit_read ON public.academy_audit_events FOR SELECT TO authenticated
    USING(public.academy_can_access() AND public.is_admin());
GRANT INSERT,UPDATE,DELETE ON public.course_lessons,public.course_quiz_questions,public.course_quiz_options TO authenticated;

-- Lock the version before every child edit, so a racing approval cannot publish a
-- version and then have a previously-authorized content update commit afterward.
CREATE OR REPLACE FUNCTION academy_private.guard_content_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_id uuid; v_status text; v_course uuid; v_question uuid;
BEGIN
    IF TG_TABLE_NAME='course_quiz_options' THEN
        v_question := CASE WHEN TG_OP='DELETE' THEN OLD.question_id ELSE NEW.question_id END;
        IF TG_OP='UPDATE' AND NEW.question_id<>OLD.question_id THEN RAISE EXCEPTION 'immutable_question_identity'; END IF;
        SELECT version_id,course_id INTO v_id,v_course FROM public.course_quiz_questions WHERE id=v_question;
        -- Parent DELETE has already passed its version guard before the FK cascade.
        IF TG_OP='DELETE' AND v_id IS NULL AND pg_trigger_depth()>1 THEN RETURN OLD; END IF;
    ELSE
        v_id := CASE WHEN TG_OP='DELETE' THEN OLD.version_id ELSE NEW.version_id END;
        v_course := CASE WHEN TG_OP='DELETE' THEN OLD.course_id ELSE NEW.course_id END;
        IF TG_OP='UPDATE' AND (NEW.version_id<>OLD.version_id OR NEW.course_id<>OLD.course_id) THEN
            RAISE EXCEPTION 'immutable_content_identity';
        END IF;
    END IF;
    SELECT status INTO v_status FROM public.course_versions WHERE id=v_id AND course_id=v_course FOR UPDATE;
    -- A scanner has no user session. Its sole exception is attaching scanned
    -- assets to the current editable draft; a separate asset trigger validates
    -- every reference. It cannot create/delete lessons or change other content.
    IF TG_TABLE_NAME='course_lessons' AND TG_OP='UPDATE' AND auth.role()='service_role'
        AND v_status IN ('draft','rejected')
        AND EXISTS(SELECT 1 FROM public.courses c WHERE c.id=v_course AND c.draft_version_id=v_id AND c.status<>'archived')
        AND (to_jsonb(NEW)-ARRAY['attachments','updated_at'])=(to_jsonb(OLD)-ARRAY['attachments','updated_at']) THEN
        RETURN NEW;
    END IF;
    IF NOT FOUND OR v_status NOT IN ('draft','rejected') OR NOT public.academy_can_edit_version(v_id) THEN
        RAISE EXCEPTION 'version_not_editable' USING ERRCODE='42501';
    END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER academy_lesson_immutable BEFORE INSERT OR UPDATE OR DELETE ON public.course_lessons
    FOR EACH ROW EXECUTE FUNCTION academy_private.guard_content_write();
CREATE TRIGGER academy_question_immutable BEFORE INSERT OR UPDATE OR DELETE ON public.course_quiz_questions
    FOR EACH ROW EXECUTE FUNCTION academy_private.guard_content_write();
CREATE TRIGGER academy_option_immutable BEFORE INSERT OR UPDATE OR DELETE ON public.course_quiz_options
    FOR EACH ROW EXECUTE FUNCTION academy_private.guard_content_write();

CREATE OR REPLACE FUNCTION academy_private.validate_metadata(p_metadata jsonb,p_rules jsonb)
RETURNS void LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
    IF jsonb_typeof(p_metadata)<>'object' OR length(trim(COALESCE(p_metadata->>'title',''))) NOT BETWEEN 3 AND 200
        OR length(trim(COALESCE(p_metadata->>'category',''))) NOT BETWEEN 1 AND 100
        OR COALESCE(p_metadata->>'level','') NOT IN ('beginner','intermediate','advanced')
        OR COALESCE(p_metadata->>'delivery_mode','') NOT IN ('self_paced','live','blended')
        OR COALESCE(p_metadata->>'course_type','') NOT IN ('consultant','company')
        OR jsonb_typeof(p_metadata->'tags') IS DISTINCT FROM 'array'
        OR jsonb_typeof(p_metadata->'prerequisite_course_ids') IS DISTINCT FROM 'array'
        OR jsonb_typeof(p_metadata->'is_official') IS DISTINCT FROM 'boolean'
        OR length(COALESCE(p_metadata->>'description',''))>20000 THEN
        RAISE EXCEPTION 'invalid_course_metadata';
    END IF;
    IF (p_metadata->>'duration_minutes') IS NOT NULL AND (p_metadata->>'duration_minutes')::integer<1 THEN
        RAISE EXCEPTION 'invalid_course_duration';
    END IF;
    IF jsonb_array_length(p_metadata->'tags')>30 OR jsonb_array_length(p_metadata->'prerequisite_course_ids')>50
        OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_metadata->'tags') t
            WHERE jsonb_typeof(t)<>'string' OR length(t#>>'{}') NOT BETWEEN 1 AND 100)
        OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_metadata->'prerequisite_course_ids') p(id)
            WHERE NOT EXISTS(SELECT 1 FROM public.courses c WHERE c.id=p.id::uuid)) THEN
        RAISE EXCEPTION 'invalid_course_tags_or_prerequisites';
    END IF;
    IF (p_metadata->>'is_official')::boolean AND p_metadata->>'course_type'<>'company' THEN
        RAISE EXCEPTION 'official_course_must_be_company';
    END IF;
    IF jsonb_typeof(p_rules) IS DISTINCT FROM 'object'
        OR jsonb_typeof(p_rules->'quiz_required') IS DISTINCT FROM 'boolean'
        OR jsonb_typeof(p_rules->'require_all_lessons') IS DISTINCT FROM 'boolean'
        OR jsonb_typeof(p_rules->'quiz_pass_percent') IS DISTINCT FROM 'number'
        OR jsonb_typeof(p_rules->'attendance_percent') IS DISTINCT FROM 'number'
        OR (p_rules->>'quiz_pass_percent')::integer NOT BETWEEN 1 AND 100
        OR (p_rules->>'attendance_percent')::integer NOT BETWEEN 1 AND 100 THEN
        RAISE EXCEPTION 'invalid_completion_rules';
    END IF;
    IF p_metadata->>'delivery_mode'='self_paced'
        AND NOT (p_rules->>'quiz_required')::boolean AND NOT (p_rules->>'require_all_lessons')::boolean THEN
        RAISE EXCEPTION 'self_paced_requires_completion_evidence';
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.academy_set_trainer(p_user_id uuid,p_enabled boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
    IF NOT public.academy_can_access() OR NOT public.is_admin() THEN RAISE EXCEPTION 'admin_required' USING ERRCODE='42501'; END IF;
    IF p_enabled IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=p_user_id
        AND (NOT p_enabled OR (p.role::text='consultant' AND NOT COALESCE(p.is_external,false)
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

CREATE OR REPLACE FUNCTION academy_private.mirror_metadata(p_course_id uuid,p_metadata jsonb)
RETURNS void LANGUAGE sql SET search_path=public,pg_temp AS $$
    UPDATE public.courses SET title=p_metadata->>'title',description=p_metadata->>'description',
        category=p_metadata->>'category',tags=ARRAY(SELECT jsonb_array_elements_text(p_metadata->'tags')),
        level=p_metadata->>'level',duration_minutes=(p_metadata->>'duration_minutes')::integer,
        cover_image_url=p_metadata->>'cover_image_url',delivery_mode=p_metadata->>'delivery_mode',
        course_type=(p_metadata->>'course_type')::public.course_type_t,
        is_official=(p_metadata->>'is_official')::boolean,
        prerequisite_course_ids=ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(p_metadata->'prerequisite_course_ids')),
        updated_at=now() WHERE id=p_course_id;
$$;

CREATE OR REPLACE FUNCTION public.academy_create_course(p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_metadata jsonb; v_rules jsonb; v_course uuid; v_version uuid; v_slug text; v_mode text;
BEGIN
    IF NOT public.academy_is_trainer() THEN RAISE EXCEPTION 'trainer_required' USING ERRCODE='42501'; END IF;
    v_mode:=COALESCE(p_input->>'delivery_mode','self_paced');
    v_metadata:=jsonb_build_object(
        'title',trim(p_input->>'title'),'description',p_input->>'description','category',trim(p_input->>'category'),
        'tags',COALESCE(p_input->'tags','[]'),'level',COALESCE(p_input->>'level','beginner'),
        'duration_minutes',(p_input->>'duration_minutes')::integer,'cover_image_url',p_input->>'cover_image_url',
        'delivery_mode',v_mode,'course_type',CASE WHEN public.is_admin() THEN COALESCE(p_input->>'course_type','consultant') ELSE 'consultant' END,
        'is_official',public.is_admin() AND COALESCE((p_input->>'is_official')::boolean,false),
        'prerequisite_course_ids',COALESCE(p_input->'prerequisite_course_ids','[]'));
    v_rules:=jsonb_build_object('quiz_required',v_mode<>'live','quiz_pass_percent',80,
        'require_all_lessons',v_mode<>'live','attendance_percent',80) || COALESCE(p_input->'completion_rules','{}');
    PERFORM academy_private.validate_metadata(v_metadata,v_rules);
    v_slug:=trim(both '-' FROM regexp_replace(lower(translate(v_metadata->>'title','ąćęłńóśźżĄĆĘŁŃÓŚŹŻ','acelnoszzACELNOSZZ')),'[^a-z0-9]+','-','g'));
    v_slug:=COALESCE(NULLIF(left(v_slug,80),''),'kurs')||'-'||left(gen_random_uuid()::text,8);
    INSERT INTO public.courses(author_id,title,slug,category,status,delivery_mode)
    VALUES(auth.uid(),v_metadata->>'title',v_slug,v_metadata->>'category','draft',v_mode) RETURNING id INTO v_course;
    INSERT INTO public.course_versions(course_id,version_number,status,metadata,completion_rules,created_by)
    VALUES(v_course,1,'draft',v_metadata,v_rules,auth.uid()) RETURNING id INTO v_version;
    UPDATE public.courses SET draft_version_id=v_version WHERE id=v_course;
    PERFORM academy_private.mirror_metadata(v_course,v_metadata);
    INSERT INTO public.academy_audit_events(actor_id,action,course_id,details)
    VALUES(auth.uid(),'COURSE_CREATED',v_course,jsonb_build_object('version_id',v_version));
    RETURN jsonb_build_object('course_id',v_course,'version_id',v_version,'slug',v_slug);
END $$;

CREATE OR REPLACE FUNCTION public.academy_begin_draft(p_course_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c public.courses%ROWTYPE; v public.course_versions%ROWTYPE; v_id uuid; q record; v_question uuid;
BEGIN
    IF NOT public.academy_can_manage_course(p_course_id) THEN RAISE EXCEPTION 'trainer_course_required' USING ERRCODE='42501'; END IF;
    SELECT * INTO c FROM public.courses WHERE id=p_course_id FOR UPDATE;
    IF c.status='archived' THEN RAISE EXCEPTION 'course_archived'; END IF;
    IF c.draft_version_id IS NOT NULL THEN
        SELECT * INTO v FROM public.course_versions WHERE id=c.draft_version_id FOR UPDATE;
        IF v.status='pending_review' THEN RAISE EXCEPTION 'version_in_review'; END IF;
        RETURN v.id;
    END IF;
    SELECT * INTO v FROM public.course_versions WHERE id=c.published_version_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'published_version_missing'; END IF;
    INSERT INTO public.course_versions(course_id,version_number,status,metadata,completion_rules,created_by)
    VALUES(c.id,(SELECT COALESCE(max(version_number),0)+1 FROM public.course_versions WHERE course_id=c.id),
        'draft',v.metadata,v.completion_rules,auth.uid()) RETURNING id INTO v_id;
    UPDATE public.courses SET draft_version_id=v_id,updated_at=now() WHERE id=c.id;
    INSERT INTO public.course_lessons(course_id,version_id,order_index,title,content_md,video_url,attachments,
        estimated_minutes,unlock_after_days,ai_summary,ai_summary_generated_at)
    SELECT course_id,v_id,order_index,title,content_md,video_url,attachments,estimated_minutes,
        unlock_after_days,ai_summary,ai_summary_generated_at FROM public.course_lessons WHERE version_id=v.id;
    FOR q IN SELECT * FROM public.course_quiz_questions WHERE version_id=v.id ORDER BY order_index LOOP
        INSERT INTO public.course_quiz_questions(course_id,version_id,order_index,question_text)
        VALUES(c.id,v_id,q.order_index,q.question_text) RETURNING id INTO v_question;
        INSERT INTO public.course_quiz_options(question_id,order_index,option_text,is_correct)
        SELECT v_question,order_index,option_text,is_correct FROM public.course_quiz_options WHERE question_id=q.id;
    END LOOP;
    INSERT INTO public.academy_audit_events(actor_id,action,course_id,details)
    VALUES(auth.uid(),'COURSE_DRAFT_CREATED',c.id,jsonb_build_object('version_id',v_id,'source_version_id',v.id));
    RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.academy_update_course(p_course_id uuid,p_patch jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_id uuid; v public.course_versions%ROWTYPE; v_metadata jsonb; v_rules jsonb;
BEGIN
    IF jsonb_typeof(p_patch) IS DISTINCT FROM 'object' OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_patch) k WHERE k NOT IN (
        'title','description','category','tags','level','duration_minutes','cover_image_url','delivery_mode',
        'course_type','is_official','prerequisite_course_ids','completion_rules')) THEN RAISE EXCEPTION 'invalid_course_patch'; END IF;
    IF NOT public.is_admin() AND (p_patch ? 'course_type' OR p_patch ? 'is_official') THEN
        RAISE EXCEPTION 'official_metadata_admin_only' USING ERRCODE='42501';
    END IF;
    v_id:=public.academy_begin_draft(p_course_id);
    SELECT * INTO v FROM public.course_versions WHERE id=v_id FOR UPDATE;
    v_metadata:=v.metadata || (p_patch-'completion_rules');
    v_rules:=v.completion_rules || COALESCE(p_patch->'completion_rules','{}');
    PERFORM academy_private.validate_metadata(v_metadata,v_rules);
    IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(v_metadata->'prerequisite_course_ids') a(value)
        WHERE value::uuid=p_course_id OR NOT EXISTS(SELECT 1 FROM public.courses c WHERE c.id=value::uuid)) THEN
        RAISE EXCEPTION 'invalid_prerequisite';
    END IF;
    UPDATE public.course_versions SET metadata=v_metadata,completion_rules=v_rules,status='draft',
        submitted_at=NULL,reviewed_by=NULL,reviewed_at=NULL,rejection_reason=NULL WHERE id=v_id;
    UPDATE public.courses SET updated_at=now(),status=CASE WHEN published_version_id IS NULL THEN 'draft' ELSE status END
        WHERE id=p_course_id;
    IF NOT EXISTS(SELECT 1 FROM public.courses WHERE id=p_course_id AND published_version_id IS NOT NULL) THEN
        PERFORM academy_private.mirror_metadata(p_course_id,v_metadata);
    END IF;
    RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.academy_replace_quiz(p_course_id uuid,p_questions jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_id uuid; q record; o record; v_question uuid;
BEGIN
    v_id:=public.academy_begin_draft(p_course_id);
    PERFORM 1 FROM public.course_versions WHERE id=v_id FOR UPDATE;
    IF jsonb_typeof(p_questions) IS DISTINCT FROM 'array' OR jsonb_array_length(p_questions)>10 THEN
        RAISE EXCEPTION 'invalid_quiz_questions';
    END IF;
    FOR q IN SELECT value,ordinality FROM jsonb_array_elements(p_questions) WITH ORDINALITY LOOP
        IF length(trim(COALESCE(q.value->>'question_text',''))) NOT BETWEEN 1 AND 2000
            OR jsonb_typeof(q.value->'options') IS DISTINCT FROM 'array'
            OR jsonb_array_length(q.value->'options')<>4
            OR (SELECT count(*) FROM jsonb_array_elements(q.value->'options') x
                WHERE x->'is_correct'='true'::jsonb)<>1 THEN RAISE EXCEPTION 'invalid_quiz_question'; END IF;
        IF EXISTS(SELECT 1 FROM jsonb_array_elements(q.value->'options') x
            WHERE length(trim(COALESCE(x->>'option_text',''))) NOT BETWEEN 1 AND 2000
                OR jsonb_typeof(x->'is_correct') IS DISTINCT FROM 'boolean') THEN RAISE EXCEPTION 'invalid_quiz_option'; END IF;
    END LOOP;
    DELETE FROM public.course_quiz_questions WHERE version_id=v_id;
    FOR q IN SELECT value,ordinality FROM jsonb_array_elements(p_questions) WITH ORDINALITY LOOP
        INSERT INTO public.course_quiz_questions(course_id,version_id,order_index,question_text)
        VALUES(p_course_id,v_id,q.ordinality-1,trim(q.value->>'question_text')) RETURNING id INTO v_question;
        FOR o IN SELECT value,ordinality FROM jsonb_array_elements(q.value->'options') WITH ORDINALITY LOOP
            INSERT INTO public.course_quiz_options(question_id,order_index,option_text,is_correct)
            VALUES(v_question,o.ordinality-1,trim(o.value->>'option_text'),(o.value->>'is_correct')::boolean);
        END LOOP;
    END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.academy_reorder_lessons(p_course_id uuid,p_lesson_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_id uuid; v_count integer;
BEGIN
    v_id:=public.academy_begin_draft(p_course_id);
    PERFORM 1 FROM public.course_versions WHERE id=v_id FOR UPDATE;
    SELECT count(*) INTO v_count FROM public.course_lessons WHERE version_id=v_id;
    IF p_lesson_ids IS NULL OR cardinality(p_lesson_ids)<>v_count
        OR (SELECT count(DISTINCT x) FROM unnest(p_lesson_ids) x)<>v_count
        OR EXISTS(SELECT 1 FROM unnest(p_lesson_ids) x WHERE NOT EXISTS (
            SELECT 1 FROM public.course_lessons l WHERE l.id=x AND l.version_id=v_id)) THEN
        RAISE EXCEPTION 'invalid_lesson_order';
    END IF;
    SET CONSTRAINTS academy_lessons_version_order DEFERRED;
    UPDATE public.course_lessons l SET order_index=o.ordinality-1,updated_at=now()
        FROM unnest(p_lesson_ids) WITH ORDINALITY o(id,ordinality) WHERE l.id=o.id AND l.version_id=v_id;
    SET CONSTRAINTS academy_lessons_version_order IMMEDIATE;
END $$;

CREATE OR REPLACE FUNCTION public.academy_submit_for_review(p_course_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c public.courses%ROWTYPE; v public.course_versions%ROWTYPE; v_count integer;
BEGIN
    IF NOT public.academy_can_manage_course(p_course_id) THEN RAISE EXCEPTION 'trainer_course_required' USING ERRCODE='42501'; END IF;
    SELECT * INTO c FROM public.courses WHERE id=p_course_id FOR UPDATE;
    SELECT * INTO v FROM public.course_versions WHERE id=c.draft_version_id FOR UPDATE;
    IF NOT FOUND OR v.status NOT IN ('draft','rejected') OR c.status='archived' THEN RAISE EXCEPTION 'editable_draft_required'; END IF;
    PERFORM academy_private.validate_metadata(v.metadata,v.completion_rules);
    IF v.metadata->>'delivery_mode'<>'live' AND NOT EXISTS (SELECT 1 FROM public.course_lessons WHERE version_id=v.id) THEN
        RAISE EXCEPTION 'at_least_one_lesson_required';
    END IF;
    IF EXISTS(SELECT 1 FROM public.course_lessons l WHERE l.version_id=v.id AND (
        length(trim(l.title)) NOT BETWEEN 1 AND 200 OR (length(trim(COALESCE(l.content_md,'')))=0
            AND length(trim(COALESCE(l.video_url,'')))=0 AND jsonb_array_length(l.attachments)=0))) THEN
        RAISE EXCEPTION 'lesson_content_required';
    END IF;
    SELECT count(*) INTO v_count FROM public.course_quiz_questions WHERE version_id=v.id;
    IF (v.completion_rules->>'quiz_required')::boolean AND v_count NOT BETWEEN 4 AND 10 THEN RAISE EXCEPTION 'quiz_requires_four_to_ten_questions'; END IF;
    IF EXISTS(SELECT 1 FROM public.course_quiz_questions q WHERE q.version_id=v.id AND (
        length(trim(q.question_text)) NOT BETWEEN 1 AND 2000 OR
        (SELECT count(*) FROM public.course_quiz_options o WHERE o.question_id=q.id)<>4 OR
        (SELECT count(*) FROM public.course_quiz_options o WHERE o.question_id=q.id AND o.is_correct)<>1 OR
        EXISTS(SELECT 1 FROM public.course_quiz_options o WHERE o.question_id=q.id AND length(trim(o.option_text)) NOT BETWEEN 1 AND 2000))) THEN
        RAISE EXCEPTION 'invalid_quiz_options';
    END IF;
    UPDATE public.course_versions SET status='pending_review',submitted_at=now(),reviewed_by=NULL,
        reviewed_at=NULL,rejection_reason=NULL WHERE id=v.id;
    UPDATE public.courses SET status=CASE WHEN published_version_id IS NULL THEN 'pending_review' ELSE status END,
        updated_at=now() WHERE id=c.id;
    INSERT INTO public.academy_audit_events(actor_id,action,course_id,details)
    VALUES(auth.uid(),'COURSE_SUBMITTED',c.id,jsonb_build_object('version_id',v.id));
    RETURN v.id;
END $$;

CREATE OR REPLACE FUNCTION public.academy_review_course(p_version_id uuid,p_approve boolean,p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v public.course_versions%ROWTYPE; c public.courses%ROWTYPE; v_bonus integer; v_claim uuid; v_awarded boolean:=false;
BEGIN
    IF NOT public.academy_can_access() OR NOT public.is_admin() THEN RAISE EXCEPTION 'admin_required' USING ERRCODE='42501'; END IF;
    SELECT course_id INTO v.course_id FROM public.course_versions WHERE id=p_version_id;
    SELECT * INTO c FROM public.courses WHERE id=v.course_id FOR UPDATE;
    SELECT * INTO v FROM public.course_versions WHERE id=p_version_id FOR UPDATE;
    IF FOUND AND p_approve AND v.status='published' AND c.published_version_id=v.id AND c.status='published' THEN
        RETURN jsonb_build_object('course_id',c.id,'version_id',v.id,'published',true,'first_publish_bonus',false);
    END IF;
    IF NOT FOUND OR v.status<>'pending_review' OR c.draft_version_id IS DISTINCT FROM v.id OR c.status='archived' THEN
        RAISE EXCEPTION 'pending_review_required';
    END IF;
    IF p_approve IS NULL THEN RAISE EXCEPTION 'review_decision_required'; END IF;
    IF NOT p_approve AND length(trim(COALESCE(p_reason,''))) NOT BETWEEN 3 AND 2000 THEN RAISE EXCEPTION 'rejection_reason_required'; END IF;
    UPDATE public.course_versions SET status=CASE WHEN p_approve THEN 'published' ELSE 'rejected' END,
        reviewed_by=auth.uid(),reviewed_at=now(),published_at=CASE WHEN p_approve THEN now() END,
        rejection_reason=CASE WHEN NOT p_approve THEN trim(p_reason) END WHERE id=v.id;
    IF p_approve THEN
        PERFORM academy_private.mirror_metadata(c.id,v.metadata);
        UPDATE public.courses SET published_version_id=v.id,draft_version_id=NULL,status='published',
            reviewed_by=auth.uid(),reviewed_at=now(),published_at=COALESCE(published_at,now()),rejection_reason=NULL WHERE id=c.id;
        -- One claim per author, regardless of re-publication, version, or parallel reviews.
        IF v.metadata->>'course_type'='consultant' THEN
            INSERT INTO public.academy_reward_claims(user_id,course_id,reward_kind)
            VALUES(c.author_id,c.id,'first_publication') ON CONFLICT DO NOTHING RETURNING id INTO v_claim;
            IF v_claim IS NOT NULL THEN
                SELECT points INTO v_bonus FROM public.loyalty_rules WHERE code='course_first_publish_bonus' AND is_active;
                IF v_bonus IS NOT NULL THEN
                    INSERT INTO public.loyalty_transactions(user_id,points,source_type,source_id,description)
                    VALUES(c.author_id,v_bonus,'course_first_publish_bonus',c.id,'Bonus za pierwsze opublikowane szkolenie: '||(v.metadata->>'title'));
                    v_awarded:=true;
                END IF;
            END IF;
        END IF;
    ELSE
        UPDATE public.courses SET status=CASE WHEN published_version_id IS NULL THEN 'rejected' ELSE status END,
            rejection_reason=CASE WHEN published_version_id IS NULL THEN trim(p_reason) ELSE rejection_reason END,updated_at=now() WHERE id=c.id;
    END IF;
    INSERT INTO public.academy_audit_events(actor_id,action,course_id,details) VALUES(auth.uid(),
        CASE WHEN p_approve THEN 'COURSE_PUBLISHED' ELSE 'COURSE_REJECTED' END,c.id,
        jsonb_build_object('version_id',v.id,'reason',CASE WHEN NOT p_approve THEN trim(p_reason) END));
    RETURN jsonb_build_object('course_id',c.id,'version_id',v.id,'published',p_approve,'first_publish_bonus',v_awarded);
END $$;

CREATE OR REPLACE FUNCTION public.academy_archive_course(p_course_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
    IF NOT public.academy_can_access() OR NOT public.is_admin() THEN RAISE EXCEPTION 'admin_required' USING ERRCODE='42501'; END IF;
    UPDATE public.courses SET status='archived',updated_at=now() WHERE id=p_course_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'course_not_found'; END IF;
    INSERT INTO public.academy_audit_events(actor_id,action,course_id) VALUES(auth.uid(),'COURSE_ARCHIVED',p_course_id);
END $$;

CREATE OR REPLACE FUNCTION academy_private.guard_version_snapshot()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
    IF OLD.status='published' OR TG_OP='DELETE' THEN RAISE EXCEPTION 'immutable_course_version'; END IF;
    IF NEW.id<>OLD.id OR NEW.course_id<>OLD.course_id OR NEW.version_number<>OLD.version_number THEN
        RAISE EXCEPTION 'immutable_version_identity';
    END IF;
    IF OLD.status='pending_review' AND (NEW.metadata IS DISTINCT FROM OLD.metadata
        OR NEW.completion_rules IS DISTINCT FROM OLD.completion_rules) THEN RAISE EXCEPTION 'review_snapshot_immutable'; END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER academy_version_immutable BEFORE UPDATE OR DELETE ON public.course_versions
    FOR EACH ROW EXECUTE FUNCTION academy_private.guard_version_snapshot();

CREATE OR REPLACE FUNCTION public.academy_enroll(p_course_id uuid,p_version_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c public.courses%ROWTYPE; v public.course_versions%ROWTYPE; v_id uuid;
BEGIN
    IF NOT public.academy_can_access() THEN RAISE EXCEPTION 'academy_access_required' USING ERRCODE='42501'; END IF;
    SELECT * INTO c FROM public.courses WHERE id=p_course_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'course_not_found'; END IF;
    SELECT id INTO v_id FROM public.course_enrollments WHERE user_id=auth.uid() AND course_id=c.id AND run_id IS NULL;
    IF FOUND THEN RETURN v_id; END IF;
    IF c.status<>'published' OR c.published_version_id IS NULL
        OR (p_version_id IS NOT NULL AND p_version_id<>c.published_version_id) THEN RAISE EXCEPTION 'published_version_required'; END IF;
    SELECT * INTO v FROM public.course_versions WHERE id=c.published_version_id;
    IF v.status<>'published' THEN RAISE EXCEPTION 'published_version_required'; END IF;
    IF v.metadata->>'delivery_mode'<>'self_paced' THEN RAISE EXCEPTION 'select_course_run'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(v.metadata->'prerequisite_course_ids') p(id)
        WHERE NOT EXISTS(SELECT 1 FROM public.course_completions cc WHERE cc.user_id=auth.uid() AND cc.course_id=p.id::uuid)) THEN
        RAISE EXCEPTION 'prerequisites_not_completed';
    END IF;
    INSERT INTO public.course_enrollments(user_id,course_id,version_id) VALUES(auth.uid(),c.id,v.id) RETURNING id INTO v_id;
    INSERT INTO public.academy_audit_events(actor_id,action,course_id,details)
    VALUES(auth.uid(),'COURSE_ENROLLED',c.id,jsonb_build_object('version_id',v.id,'enrollment_id',v_id));
    RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.academy_get_syllabus(p_version_id uuid)
RETURNS TABLE(id uuid,course_id uuid,version_id uuid,order_index integer,title text,estimated_minutes integer,unlock_after_days integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
    IF NOT public.academy_can_read_version(p_version_id) THEN RAISE EXCEPTION 'version_access_denied' USING ERRCODE='42501'; END IF;
    RETURN QUERY SELECT l.id,l.course_id,l.version_id,l.order_index,l.title,l.estimated_minutes,l.unlock_after_days
        FROM public.course_lessons l WHERE l.version_id=p_version_id ORDER BY l.order_index;
END $$;
CREATE OR REPLACE FUNCTION public.academy_quiz_question_count(p_version_id uuid)
RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_count integer;
BEGIN
    IF NOT public.academy_can_read_version(p_version_id) THEN RAISE EXCEPTION 'version_access_denied' USING ERRCODE='42501'; END IF;
    SELECT count(*) INTO v_count FROM public.course_quiz_questions WHERE version_id=p_version_id;
    RETURN v_count;
END $$;

-- Replaced by the live-session migration. Always fail closed until real evidence exists.
CREATE OR REPLACE FUNCTION public.academy_attendance_satisfied(p_enrollment_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT false; $$;

CREATE OR REPLACE FUNCTION academy_private.finalize_enrollment(p_enrollment_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e public.course_enrollments%ROWTYPE; v public.course_versions%ROWTYPE; c public.courses%ROWTYPE;
    v_completion uuid; v_hash text; v_claim uuid; v_student integer; v_author integer; v_rule text;
    v_completed timestamptz:=now(); v_participant text; v_author_name text;
BEGIN
    SELECT * INTO e FROM public.course_enrollments WHERE id=p_enrollment_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'enrollment_not_found'; END IF;
    SELECT id INTO v_completion FROM public.course_completions WHERE enrollment_id=e.id;
    IF FOUND THEN RETURN jsonb_build_object('completed',true,'completion_id',v_completion,'already_completed',true); END IF;
    SELECT * INTO v FROM public.course_versions WHERE id=e.version_id;
    SELECT * INTO c FROM public.courses WHERE id=e.course_id;
    IF v.status<>'published' THEN RAISE EXCEPTION 'published_enrollment_version_required'; END IF;
    IF (v.completion_rules->>'require_all_lessons')::boolean AND EXISTS(
        SELECT 1 FROM public.course_lessons l WHERE l.version_id=v.id AND NOT (l.id=ANY(e.completed_lessons))) THEN
        RETURN jsonb_build_object('completed',false,'reason','required_lessons');
    END IF;
    IF (v.completion_rules->>'quiz_required')::boolean AND NOT EXISTS(
        SELECT 1 FROM public.course_quiz_attempts a WHERE a.enrollment_id=e.id AND a.user_id=e.user_id
            AND a.course_id=e.course_id AND a.passed) THEN
        RETURN jsonb_build_object('completed',false,'reason','quiz_not_passed');
    END IF;
    IF v.metadata->>'delivery_mode' IN ('live','blended') AND NOT public.academy_attendance_satisfied(e.id) THEN
        RETURN jsonb_build_object('completed',false,'reason','attendance_missing');
    END IF;
    v_hash:=COALESCE(e.certificate_hash,
        encode(sha256(convert_to(e.id::text||':'||v.id::text||':'||v_completed::text,'UTF8')),'hex'));
    SELECT COALESCE(full_name,email,'Uczestnik') INTO v_participant FROM public.profiles WHERE id=e.user_id;
    SELECT full_name INTO v_author_name FROM public.profiles WHERE id=c.author_id;
    INSERT INTO public.course_completions(enrollment_id,user_id,course_id,version_id,completed_at,certificate_snapshot)
    VALUES(e.id,e.user_id,e.course_id,e.version_id,v_completed,jsonb_build_object(
        'course_title',v.metadata->>'title','version_number',v.version_number,'participant_name',v_participant,
        'author_name',v_author_name,'completed_at',v_completed,'certificate_hash',v_hash)) RETURNING id INTO v_completion;
    UPDATE public.course_enrollments SET completed_at=v_completed,certificate_hash=v_hash,certificate_issued_at=v_completed
        WHERE id=e.id;
    -- Claim is keyed by learner/course, including all versions and repeated live runs.
    INSERT INTO public.academy_reward_claims(user_id,course_id,reward_kind)
    VALUES(e.user_id,e.course_id,'completion') ON CONFLICT DO NOTHING RETURNING id INTO v_claim;
    IF v_claim IS NOT NULL AND e.user_id<>c.author_id THEN
        v_rule:=CASE WHEN v.metadata->>'course_type'='company' THEN 'course_completed_company_student' ELSE 'course_completed_student' END;
        SELECT points INTO v_student FROM public.loyalty_rules WHERE code=v_rule AND is_active;
        IF v_student IS NOT NULL THEN
            INSERT INTO public.loyalty_transactions(user_id,points,source_type,source_id,description)
            VALUES(e.user_id,v_student,v_rule,c.id,'Ukończenie szkolenia: '||(v.metadata->>'title'));
        END IF;
        IF v.metadata->>'course_type'='consultant' THEN
            SELECT points INTO v_author FROM public.loyalty_rules WHERE code='course_completed_author_reward' AND is_active;
            IF v_author IS NOT NULL THEN
                v_author:=round(v_author*(1.0+least(0.2,greatest(0,c.avg_rating)/5.0*0.2)));
                INSERT INTO public.loyalty_transactions(user_id,points,source_type,source_id,description)
                VALUES(c.author_id,v_author,'course_completed_author_reward',c.id,'Uczeń ukończył szkolenie: '||(v.metadata->>'title'));
            END IF;
        END IF;
    END IF;
    UPDATE public.course_enrollments SET points_awarded=true WHERE id=e.id;
    INSERT INTO public.academy_audit_events(actor_id,action,course_id,details)
    VALUES(auth.uid(),'COURSE_COMPLETED',c.id,jsonb_build_object('enrollment_id',e.id,'completion_id',v_completion,'version_id',v.id));
    RETURN jsonb_build_object('completed',true,'completion_id',v_completion,'already_completed',false);
END $$;

CREATE OR REPLACE FUNCTION public.academy_complete_course(p_enrollment_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
    IF NOT public.academy_can_access() OR NOT EXISTS(
        SELECT 1 FROM public.course_enrollments WHERE id=p_enrollment_id AND user_id=auth.uid() AND public.academy_enrollment_has_access(id)) THEN
        RAISE EXCEPTION 'own_enrollment_required' USING ERRCODE='42501';
    END IF;
    RETURN academy_private.finalize_enrollment(p_enrollment_id);
END $$;

CREATE OR REPLACE FUNCTION academy_private.require_lesson_access(p_enrollment_id uuid,p_lesson_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e public.course_enrollments%ROWTYPE; l public.course_lessons%ROWTYPE; v_previous uuid; v_completed timestamptz;
BEGIN
    IF NOT public.academy_can_access() THEN RAISE EXCEPTION 'academy_access_required' USING ERRCODE='42501'; END IF;
    SELECT * INTO e FROM public.course_enrollments WHERE id=p_enrollment_id AND user_id=auth.uid() AND public.academy_enrollment_has_access(id);
    IF NOT FOUND THEN RAISE EXCEPTION 'own_enrollment_required' USING ERRCODE='42501'; END IF;
    SELECT * INTO l FROM public.course_lessons WHERE id=p_lesson_id AND version_id=e.version_id AND course_id=e.course_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'lesson_not_in_enrollment'; END IF;
    IF l.unlock_after_days>0 THEN
        SELECT id INTO v_previous FROM public.course_lessons WHERE version_id=e.version_id AND order_index<l.order_index ORDER BY order_index DESC LIMIT 1;
        IF v_previous IS NOT NULL THEN
            v_completed:=academy_private.try_timestamp(e.lesson_completion_dates->>v_previous::text);
            IF v_completed IS NULL OR now()<v_completed+make_interval(days=>l.unlock_after_days) THEN
                RAISE EXCEPTION 'lesson_not_unlocked';
            END IF;
        END IF;
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.academy_record_lesson_access(p_enrollment_id uuid,p_lesson_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
    PERFORM academy_private.require_lesson_access(p_enrollment_id,p_lesson_id);
    UPDATE public.course_enrollments SET last_accessed_lesson_id=p_lesson_id,last_accessed_at=now()
        WHERE id=p_enrollment_id AND user_id=auth.uid();
END $$;

CREATE OR REPLACE FUNCTION public.academy_mark_lesson_complete(p_enrollment_id uuid,p_lesson_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e public.course_enrollments%ROWTYPE; v_already boolean; v_completion jsonb; v_streak jsonb;
BEGIN
    PERFORM academy_private.require_lesson_access(p_enrollment_id,p_lesson_id);
    SELECT * INTO e FROM public.course_enrollments WHERE id=p_enrollment_id AND user_id=auth.uid() FOR UPDATE;
    v_already:=p_lesson_id=ANY(e.completed_lessons);
    IF NOT v_already THEN
        UPDATE public.course_enrollments SET completed_lessons=array_append(completed_lessons,p_lesson_id),
            lesson_completion_dates=lesson_completion_dates || jsonb_build_object(p_lesson_id::text,now()),
            last_accessed_lesson_id=p_lesson_id,last_accessed_at=now() WHERE id=e.id;
        IF NOT EXISTS(SELECT 1 FROM public.courses c WHERE c.id=e.course_id AND c.author_id=e.user_id) THEN
            v_streak:=academy_private.bump_learning_streak(e.user_id);
        END IF;
    END IF;
    v_completion:=academy_private.finalize_enrollment(e.id);
    RETURN jsonb_build_object('completed',true,'already_completed',v_already,'completion',v_completion,'streak',v_streak);
END $$;

CREATE OR REPLACE FUNCTION public.academy_get_quiz(p_enrollment_id uuid)
RETURNS TABLE(question_id uuid,question_order integer,question_text text,options jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_version uuid;
BEGIN
    IF NOT public.academy_can_access() THEN RAISE EXCEPTION 'academy_access_required' USING ERRCODE='42501'; END IF;
    SELECT version_id INTO v_version FROM public.course_enrollments WHERE id=p_enrollment_id AND user_id=auth.uid() AND public.academy_enrollment_has_access(id);
    IF NOT FOUND THEN RAISE EXCEPTION 'own_enrollment_required' USING ERRCODE='42501'; END IF;
    RETURN QUERY SELECT q.id,q.order_index,q.question_text,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('id',o.id,'order_index',o.order_index,'option_text',o.option_text) ORDER BY o.order_index)
            FROM public.course_quiz_options o WHERE o.question_id=q.id),'[]'::jsonb)
        FROM public.course_quiz_questions q WHERE q.version_id=v_version ORDER BY q.order_index;
END $$;

CREATE OR REPLACE FUNCTION public.academy_submit_quiz(p_enrollment_id uuid,p_answers jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e public.course_enrollments%ROWTYPE; v public.course_versions%ROWTYPE;
    v_total integer; v_correct integer; v_score integer; v_passed boolean; v_attempt uuid; v_completion jsonb;
BEGIN
    IF NOT public.academy_can_access() THEN RAISE EXCEPTION 'academy_access_required' USING ERRCODE='42501'; END IF;
    SELECT * INTO e FROM public.course_enrollments WHERE id=p_enrollment_id AND user_id=auth.uid() AND public.academy_enrollment_has_access(id) FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'own_enrollment_required' USING ERRCODE='42501'; END IF;
    SELECT * INTO v FROM public.course_versions WHERE id=e.version_id;
    IF v.status<>'published' THEN RAISE EXCEPTION 'published_enrollment_version_required'; END IF;
    SELECT count(*) INTO v_total FROM public.course_quiz_questions WHERE version_id=e.version_id;
    IF v_total=0 OR jsonb_typeof(p_answers) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'invalid_quiz_answers'; END IF;
    IF jsonb_array_length(p_answers)<>v_total OR
        (SELECT count(DISTINCT a->>'question_id') FROM jsonb_array_elements(p_answers) a)<>v_total THEN
        RAISE EXCEPTION 'one_answer_per_question_required';
    END IF;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_answers) a WHERE NOT EXISTS(
        SELECT 1 FROM public.course_quiz_questions q JOIN public.course_quiz_options o ON o.question_id=q.id
        WHERE q.id=(a->>'question_id')::uuid AND o.id=(a->>'selected_option_id')::uuid AND q.version_id=e.version_id)) THEN
        RAISE EXCEPTION 'answer_not_in_enrollment_version';
    END IF;
    SELECT count(*) INTO v_correct FROM jsonb_array_elements(p_answers) a
        JOIN public.course_quiz_options o ON o.id=(a->>'selected_option_id')::uuid WHERE o.is_correct;
    v_score:=round(v_correct::numeric/v_total*100);
    v_passed:=v_score>=(v.completion_rules->>'quiz_pass_percent')::integer;
    INSERT INTO public.course_quiz_attempts(enrollment_id,user_id,course_id,answers,score_percent,passed)
    VALUES(e.id,e.user_id,e.course_id,p_answers,v_score,v_passed) RETURNING id INTO v_attempt;
    IF v_passed THEN v_completion:=academy_private.finalize_enrollment(e.id); END IF;
    RETURN jsonb_build_object('score_percent',v_score,'passed',v_passed,'attempt_id',v_attempt,
        'already_awarded',e.points_awarded,'award_status',CASE WHEN NOT v_passed THEN 'not_passed'
            WHEN (v_completion->>'completed')::boolean THEN 'completed' ELSE 'requirements_pending' END,
        'completion',v_completion);
END $$;

-- Legacy course-ID entry points retain self-paced compatibility without ambiguity
-- when the same learner has enrollments in multiple live runs.
CREATE OR REPLACE FUNCTION public.get_quiz_for_attempt(p_course_id uuid)
RETURNS TABLE(question_id uuid,question_order integer,question_text text,options jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_enrollment uuid;
BEGIN
    SELECT id INTO v_enrollment FROM public.course_enrollments WHERE course_id=p_course_id AND user_id=auth.uid() AND run_id IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'not_enrolled'; END IF;
    RETURN QUERY SELECT * FROM public.academy_get_quiz(v_enrollment);
END $$;
CREATE OR REPLACE FUNCTION public.submit_quiz_attempt(p_course_id uuid,p_answers jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_enrollment uuid;
BEGIN
    SELECT id INTO v_enrollment FROM public.course_enrollments WHERE course_id=p_course_id AND user_id=auth.uid() AND run_id IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'not_enrolled'; END IF;
    RETURN public.academy_submit_quiz(v_enrollment,p_answers);
END $$;

-- A streak advances only inside a verified new lesson-completion transaction.
CREATE OR REPLACE FUNCTION academy_private.bump_learning_streak(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s public.academy_learning_streaks%ROWTYPE; v_today date:=(now() AT TIME ZONE 'UTC')::date;
    v_current integer; v_milestone boolean:=false; v_points integer;
BEGIN
    INSERT INTO public.academy_learning_streaks(user_id) VALUES(p_user_id) ON CONFLICT DO NOTHING;
    SELECT * INTO s FROM public.academy_learning_streaks WHERE user_id=p_user_id FOR UPDATE;
    IF s.last_activity_date>=v_today THEN
        RETURN jsonb_build_object('current',s.current_streak,'milestone_reached',false);
    END IF;
    v_current:=CASE WHEN s.last_activity_date=v_today-1 THEN s.current_streak+1 ELSE 1 END;
    v_milestone:=v_current%7=0;
    UPDATE public.academy_learning_streaks SET current_streak=v_current,longest_streak=greatest(longest_streak,v_current),last_activity_date=v_today WHERE user_id=p_user_id;
    UPDATE public.profiles SET learning_streak_current=v_current,learning_streak_longest=greatest(s.longest_streak,v_current),learning_streak_last_date=v_today WHERE id=p_user_id;
    IF v_milestone THEN
        SELECT points INTO v_points FROM public.loyalty_rules WHERE code='learning_streak_milestone' AND is_active;
        IF COALESCE(v_points,0)>0 THEN
            INSERT INTO public.loyalty_transactions(user_id,points,source_type,source_id,description)
            VALUES(p_user_id,v_points,'learning_streak_milestone',NULL,'Seria nauki: '||v_current||' dni');
        END IF;
    END IF;
    RETURN jsonb_build_object('current',v_current,'milestone_reached',v_milestone);
END $$;

-- Discussions are pinned to the material version, never the moving catalogue.
ALTER TABLE public.course_questions ADD COLUMN version_id uuid,ADD COLUMN enrollment_id uuid REFERENCES public.course_enrollments(id);
UPDATE public.course_questions q SET
    version_id=COALESCE((SELECT l.version_id FROM public.course_lessons l WHERE l.id=q.lesson_id),
        (SELECT e.version_id FROM public.course_enrollments e WHERE e.user_id=q.user_id AND e.course_id=q.course_id ORDER BY e.enrolled_at LIMIT 1),
        c.published_version_id,c.draft_version_id),
    enrollment_id=(SELECT e.id FROM public.course_enrollments e WHERE e.user_id=q.user_id AND e.course_id=q.course_id
        AND (q.lesson_id IS NULL OR e.version_id=(SELECT l.version_id FROM public.course_lessons l WHERE l.id=q.lesson_id)) ORDER BY e.enrolled_at LIMIT 1)
FROM public.courses c WHERE c.id=q.course_id;
ALTER TABLE public.course_questions ALTER COLUMN version_id SET NOT NULL,
    ADD CONSTRAINT academy_question_version_course_fk FOREIGN KEY(version_id,course_id) REFERENCES public.course_versions(id,course_id);
CREATE INDEX academy_questions_version_idx ON public.course_questions(version_id,created_at);
CREATE INDEX academy_questions_enrollment_idx ON public.course_questions(enrollment_id) WHERE enrollment_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.academy_can_read_discussion(p_question_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
    SELECT public.academy_can_access() AND EXISTS(SELECT 1 FROM public.course_questions q WHERE q.id=p_question_id
        AND (public.academy_can_manage_course(q.course_id) OR (public.academy_can_read_material(q.version_id)
            AND (q.lesson_id IS NULL OR public.academy_can_read_lesson(q.lesson_id)))))
$$;
DO $$ DECLARE p record; BEGIN
    FOR p IN SELECT tablename,policyname FROM pg_policies WHERE schemaname='public' AND tablename IN ('course_questions','course_answers','course_survey_responses','learning_path_enrollments') LOOP
        EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,p.tablename);
    END LOOP;
END $$;
REVOKE ALL ON public.course_questions,public.course_answers,public.course_survey_responses,public.learning_path_enrollments FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.course_questions,public.course_answers,public.course_survey_responses,public.learning_path_enrollments TO authenticated;
GRANT ALL ON public.course_questions,public.course_answers,public.course_survey_responses,public.learning_path_enrollments TO service_role;
CREATE POLICY academy_questions_read ON public.course_questions FOR SELECT TO authenticated USING(public.academy_can_read_discussion(id));
CREATE POLICY academy_answers_read ON public.course_answers FOR SELECT TO authenticated USING(public.academy_can_read_discussion(question_id));
CREATE POLICY academy_surveys_read ON public.course_survey_responses FOR SELECT TO authenticated
    USING(public.academy_can_access() AND (user_id=auth.uid() OR public.academy_can_manage_course(course_id)));
CREATE POLICY academy_path_enrollments_read ON public.learning_path_enrollments FOR SELECT TO authenticated
    USING(public.academy_can_access() AND (user_id=auth.uid() OR public.is_admin()));

CREATE OR REPLACE FUNCTION public.academy_ask_question(p_enrollment_id uuid,p_question_text text,p_lesson_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e public.course_enrollments%ROWTYPE; v_id uuid; v_points integer;
BEGIN
    IF NOT public.academy_can_access() THEN RAISE EXCEPTION 'academy_access_required' USING ERRCODE='42501'; END IF;
    SELECT * INTO e FROM public.course_enrollments WHERE id=p_enrollment_id AND user_id=auth.uid() AND public.academy_enrollment_has_access(id) FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'own_enrollment_required' USING ERRCODE='42501'; END IF;
    IF p_lesson_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.course_lessons WHERE id=p_lesson_id AND version_id=e.version_id AND public.academy_can_read_lesson(id)) THEN
        RAISE EXCEPTION 'lesson_not_accessible' USING ERRCODE='42501'; END IF;
    p_question_text:=btrim(p_question_text);
    IF p_question_text IS NULL OR length(p_question_text) NOT BETWEEN 10 AND 2000 THEN RAISE EXCEPTION 'invalid_question'; END IF;
    SELECT id INTO v_id FROM public.course_questions WHERE enrollment_id=e.id AND lesson_id IS NOT DISTINCT FROM p_lesson_id AND question_text=p_question_text LIMIT 1;
    IF FOUND THEN RETURN v_id; END IF;
    INSERT INTO public.course_questions(course_id,version_id,enrollment_id,lesson_id,user_id,question_text)
    VALUES(e.course_id,e.version_id,e.id,p_lesson_id,e.user_id,p_question_text) RETURNING id INTO v_id;
    SELECT points INTO v_points FROM public.loyalty_rules WHERE code='course_question_asked' AND is_active;
    IF COALESCE(v_points,0)>0 AND NOT EXISTS(SELECT 1 FROM public.courses WHERE id=e.course_id AND author_id=e.user_id) THEN
        INSERT INTO public.loyalty_transactions(user_id,points,source_type,source_id,description)
        VALUES(e.user_id,v_points,'course_question_asked',v_id,'Pytanie w Akademii');
    END IF;
    RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.academy_answer_question(p_question_id uuid,p_answer_text text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE q public.course_questions%ROWTYPE; v_id uuid; v_author boolean; v_points integer;
BEGIN
    IF NOT public.academy_can_read_discussion(p_question_id) THEN RAISE EXCEPTION 'discussion_not_accessible' USING ERRCODE='42501'; END IF;
    SELECT * INTO q FROM public.course_questions WHERE id=p_question_id FOR UPDATE;
    p_answer_text:=btrim(p_answer_text);
    IF p_answer_text IS NULL OR length(p_answer_text) NOT BETWEEN 5 AND 5000 THEN RAISE EXCEPTION 'invalid_answer'; END IF;
    SELECT id INTO v_id FROM public.course_answers WHERE question_id=q.id AND user_id=auth.uid() AND answer_text=p_answer_text LIMIT 1;
    IF FOUND THEN RETURN v_id; END IF;
    v_author:=public.academy_can_manage_course(q.course_id) AND EXISTS(SELECT 1 FROM public.courses WHERE id=q.course_id AND author_id=auth.uid());
    INSERT INTO public.course_answers(question_id,user_id,answer_text,is_author_answer)
    VALUES(q.id,auth.uid(),p_answer_text,v_author) RETURNING id INTO v_id;
    SELECT points INTO v_points FROM public.loyalty_rules WHERE code='course_answer_given' AND is_active;
    IF v_author AND q.user_id<>auth.uid() AND COALESCE(v_points,0)>0 THEN
        INSERT INTO public.loyalty_transactions(user_id,points,source_type,source_id,description)
        VALUES(auth.uid(),v_points,'course_answer_given',v_id,'Odpowiedź autora w Akademii');
    END IF;
    RETURN v_id;
END $$;
CREATE OR REPLACE FUNCTION public.academy_resolve_question(p_question_id uuid,p_resolved boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
    IF p_resolved IS NULL OR NOT public.academy_can_read_discussion(p_question_id) OR NOT EXISTS(
        SELECT 1 FROM public.course_questions WHERE id=p_question_id AND (user_id=auth.uid() OR public.academy_can_manage_course(course_id))) THEN
        RAISE EXCEPTION 'question_owner_or_trainer_required' USING ERRCODE='42501'; END IF;
    UPDATE public.course_questions SET is_resolved=p_resolved WHERE id=p_question_id;
END $$;

ALTER TABLE public.course_survey_responses DROP CONSTRAINT IF EXISTS course_survey_responses_nps_score_check;
ALTER TABLE public.course_survey_responses ADD CONSTRAINT course_survey_responses_nps_score_check CHECK(nps_score BETWEEN 0 AND 10);
CREATE OR REPLACE FUNCTION public.academy_submit_survey(p_enrollment_id uuid,p_nps_score integer,p_best_part text DEFAULT NULL,p_improvement_suggestion text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e public.course_enrollments%ROWTYPE; v_id uuid;
BEGIN
    IF NOT public.academy_can_access() THEN RAISE EXCEPTION 'academy_access_required' USING ERRCODE='42501'; END IF;
    SELECT * INTO e FROM public.course_enrollments WHERE id=p_enrollment_id AND user_id=auth.uid() FOR UPDATE;
    IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.course_completions WHERE enrollment_id=e.id AND user_id=auth.uid()) THEN
        RAISE EXCEPTION 'own_trusted_completion_required' USING ERRCODE='42501'; END IF;
    IF p_nps_score IS NULL OR p_nps_score NOT BETWEEN 0 AND 10 OR length(p_best_part)>1000 OR length(p_improvement_suggestion)>1000 THEN RAISE EXCEPTION 'invalid_survey'; END IF;
    SELECT id INTO v_id FROM public.course_survey_responses WHERE user_id=e.user_id AND course_id=e.course_id;
    IF FOUND THEN RETURN v_id; END IF;
    INSERT INTO public.course_survey_responses(user_id,course_id,enrollment_id,nps_score,best_part,improvement_suggestion)
    VALUES(e.user_id,e.course_id,e.id,p_nps_score,p_best_part,p_improvement_suggestion) RETURNING id INTO v_id;
    RETURN v_id;
END $$;

-- Path completion has its own pinned requirements and never trusts client dates.
ALTER TABLE public.learning_path_enrollments ADD COLUMN required_course_ids uuid[] NOT NULL DEFAULT '{}';
UPDATE public.learning_path_enrollments e SET required_course_ids=COALESCE((
    SELECT array_agg(c.course_id ORDER BY c.order_index) FROM public.learning_path_courses c WHERE c.path_id=e.path_id AND c.is_required),'{}');
CREATE OR REPLACE FUNCTION public.academy_enroll_path(p_path_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_id uuid; v_courses uuid[];
BEGIN
    IF NOT public.academy_can_access() THEN RAISE EXCEPTION 'academy_access_required' USING ERRCODE='42501'; END IF;
    PERFORM 1 FROM public.learning_paths WHERE id=p_path_id AND status='published' FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'published_path_required'; END IF;
    SELECT id INTO v_id FROM public.learning_path_enrollments WHERE path_id=p_path_id AND user_id=auth.uid();
    IF FOUND THEN RETURN v_id; END IF;
    SELECT COALESCE(array_agg(course_id ORDER BY order_index),'{}') INTO v_courses FROM public.learning_path_courses WHERE path_id=p_path_id AND is_required;
    IF cardinality(v_courses)=0 THEN RAISE EXCEPTION 'path_requires_courses'; END IF;
    INSERT INTO public.learning_path_enrollments(user_id,path_id,required_course_ids) VALUES(auth.uid(),p_path_id,v_courses)
    ON CONFLICT(user_id,path_id) DO NOTHING RETURNING id INTO v_id;
    IF v_id IS NULL THEN SELECT id INTO v_id FROM public.learning_path_enrollments WHERE user_id=auth.uid() AND path_id=p_path_id; END IF;
    RETURN v_id;
END $$;
CREATE OR REPLACE FUNCTION public.academy_complete_path(p_path_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e public.learning_path_enrollments%ROWTYPE;
BEGIN
    IF NOT public.academy_can_access() THEN RAISE EXCEPTION 'academy_access_required' USING ERRCODE='42501'; END IF;
    SELECT * INTO e FROM public.learning_path_enrollments WHERE path_id=p_path_id AND user_id=auth.uid() FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'own_path_enrollment_required' USING ERRCODE='42501'; END IF;
    IF e.completed_at IS NOT NULL THEN RETURN jsonb_build_object('completed',true,'now_completed',false); END IF;
    IF cardinality(e.required_course_ids)=0 OR EXISTS(SELECT 1 FROM unnest(e.required_course_ids) cid WHERE NOT EXISTS(
        SELECT 1 FROM public.course_completions c WHERE c.course_id=cid AND c.user_id=e.user_id)) THEN
        RETURN jsonb_build_object('completed',false,'now_completed',false); END IF;
    UPDATE public.learning_path_enrollments SET completed_at=now() WHERE id=e.id;
    RETURN jsonb_build_object('completed',true,'now_completed',true);
END $$;

-- Retire bypassable award endpoints, including default PUBLIC function grants.
REVOKE ALL ON FUNCTION public.award_course_points(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.award_first_publish_bonus(uuid) FROM PUBLIC,anon,authenticated;

DO $$ DECLARE f record; BEGIN
    FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND (p.proname LIKE 'academy\_%' ESCAPE '\' OR p.proname IN ('get_quiz_for_attempt','submit_quiz_attempt')) LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated,service_role',f.signature);
    END LOOP;
END $$;
-- This helper reads attendance evidence and must only be called by trusted SQL.
REVOKE ALL ON FUNCTION public.academy_attendance_satisfied(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA academy_private FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA academy_private TO service_role;
GRANT EXECUTE ON FUNCTION academy_private.finalize_enrollment(uuid) TO service_role;

COMMENT ON TABLE public.course_versions IS 'Immutable published/review snapshots; drafts are edited through authenticated Academy RPCs.';
COMMENT ON TABLE public.course_completions IS 'Trusted completion evidence and immutable certificate snapshot; never client-written.';
COMMENT ON TABLE public.academy_reward_claims IS 'Idempotency across course versions and live runs; historical claims do not re-award points.';

-- Rating rollups must remain functional after direct courses UPDATE is revoked.
-- Only completed learners may create/change a rating; the trigger has no public API.
DO $$ DECLARE p record; BEGIN
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='course_ratings' LOOP
        EXECUTE format('DROP POLICY %I ON public.course_ratings',p.policyname);
    END LOOP;
END $$;
CREATE POLICY academy_ratings_read ON public.course_ratings FOR SELECT TO authenticated
    USING(public.academy_can_access());
CREATE POLICY academy_ratings_insert ON public.course_ratings FOR INSERT TO authenticated WITH CHECK (
    public.academy_can_access() AND user_id=auth.uid() AND EXISTS(
        SELECT 1 FROM public.course_completions c WHERE c.user_id=auth.uid() AND c.course_id=course_ratings.course_id));
CREATE POLICY academy_ratings_update ON public.course_ratings FOR UPDATE TO authenticated
    USING(public.academy_can_access() AND user_id=auth.uid()) WITH CHECK (
        public.academy_can_access() AND user_id=auth.uid() AND EXISTS(
            SELECT 1 FROM public.course_completions c WHERE c.user_id=auth.uid() AND c.course_id=course_ratings.course_id));
CREATE POLICY academy_ratings_delete ON public.course_ratings FOR DELETE TO authenticated
    USING(public.academy_can_access() AND (user_id=auth.uid() OR public.is_admin()));
CREATE OR REPLACE FUNCTION public.update_course_ratings_stats()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_course_id uuid:=COALESCE(NEW.course_id,OLD.course_id);
BEGIN
    UPDATE public.courses SET
        avg_rating=(SELECT COALESCE(avg(rating)::numeric(3,2),0) FROM public.course_ratings WHERE course_id=v_course_id),
        ratings_count=(SELECT count(*) FROM public.course_ratings WHERE course_id=v_course_id),updated_at=now()
        WHERE id=v_course_id;
    RETURN COALESCE(NEW,OLD);
END $$;
REVOKE ALL ON FUNCTION public.update_course_ratings_stats() FROM PUBLIC,anon,authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
