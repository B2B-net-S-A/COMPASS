-- Audited, terminal invalidation: history is retained and only exact reward links reverse.
BEGIN;
CREATE OR REPLACE FUNCTION update_loyalty_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path=public,pg_temp
AS $$
DECLARE
    new_total_points INTEGER;
    new_tier loyalty_tier_t;
    old_tier loyalty_tier_t;
BEGIN
    -- Lock before aggregation so concurrent awards/reversals cannot lose a balance update.
    SELECT loyalty_tier INTO old_tier FROM profiles WHERE id = NEW.user_id FOR UPDATE;
    SELECT COALESCE(SUM(points), 0)
    INTO new_total_points
    FROM loyalty_transactions
    WHERE user_id = NEW.user_id AND status = 'confirmed';

    new_tier := CASE
        WHEN new_total_points >= 25000 THEN 'legend'::loyalty_tier_t
        WHEN new_total_points >= 10000 THEN 'admiral'::loyalty_tier_t
        WHEN new_total_points >= 5000  THEN 'captain'::loyalty_tier_t
        WHEN new_total_points >= 2000  THEN 'navigator'::loyalty_tier_t
        WHEN new_total_points >= 750   THEN 'pathfinder'::loyalty_tier_t
        WHEN new_total_points >= 250   THEN 'explorer'::loyalty_tier_t
        ELSE 'scout'::loyalty_tier_t
    END;

    UPDATE profiles
    SET loyalty_points = new_total_points,
        loyalty_tier = new_tier
    WHERE id = NEW.user_id;

    IF new_tier > old_tier THEN
        INSERT INTO notifications (user_id, type, title_pl, title_en, body_pl, body_en, priority, created_at)
        VALUES (
            NEW.user_id,
            'loyalty_tier_up',
            'Awans w B2Bnetwork League!',
            'Promoted in B2Bnetwork League!',
            format('Osiągnąłeś poziom %s!', new_tier::TEXT),
            format('You reached the %s tier!', new_tier::TEXT),
            'normal',
            NOW()
        );
    END IF;

    RETURN NEW;
END;
$$;

-- Trigger needs to fire on INSERT and on UPDATE-of-status (pending→confirmed flips total)
DROP TRIGGER IF EXISTS on_loyalty_transaction_created ON loyalty_transactions;
DROP TRIGGER IF EXISTS on_loyalty_transaction_status_changed ON loyalty_transactions;

CREATE TRIGGER on_loyalty_transaction_created
    AFTER INSERT ON loyalty_transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_loyalty_status();

CREATE TRIGGER on_loyalty_transaction_status_changed
    AFTER UPDATE OF status ON loyalty_transactions
    FOR EACH ROW
    WHEN (NEW.status IS DISTINCT FROM OLD.status)
    EXECUTE FUNCTION update_loyalty_status();


ALTER TABLE public.course_completions
 ADD COLUMN revoked_at timestamptz,
 ADD COLUMN revoked_by uuid REFERENCES public.profiles(id),
 ADD COLUMN revoked_reason text,
 ADD COLUMN reward_tracking_complete boolean NOT NULL DEFAULT false,
 ADD CONSTRAINT academy_completion_revocation_complete CHECK (
  (revoked_at IS NULL AND revoked_by IS NULL AND revoked_reason IS NULL) OR
  (revoked_at IS NOT NULL AND revoked_by IS NOT NULL AND revoked_reason IS NOT NULL AND length(btrim(revoked_reason)) BETWEEN 10 AND 2000));
CREATE INDEX academy_valid_completions ON public.course_completions(user_id,course_id) WHERE revoked_at IS NULL;
CREATE TABLE public.academy_completion_rewards (
 completion_id uuid NOT NULL REFERENCES public.course_completions(id),
 transaction_id uuid PRIMARY KEY REFERENCES public.loyalty_transactions(id),
 recipient_kind text NOT NULL CHECK(recipient_kind IN ('student','author'))
);
CREATE TABLE public.academy_completion_revocations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),completion_id uuid NOT NULL UNIQUE REFERENCES public.course_completions(id),
 actor_id uuid NOT NULL REFERENCES public.profiles(id),reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 10 AND 2000),
 created_at timestamptz NOT NULL DEFAULT now(),
 rewards_state text NOT NULL CHECK(rewards_state IN ('reversed','retained_valid_completion','no_reward','manual_review')),
 reversed_transactions integer NOT NULL DEFAULT 0,
 manual_reward_review_required boolean NOT NULL DEFAULT false
);
ALTER TABLE public.academy_completion_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academy_completion_revocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.academy_completion_rewards,public.academy_completion_revocations FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.academy_completion_rewards,public.academy_completion_revocations TO authenticated;
GRANT ALL ON public.academy_completion_rewards,public.academy_completion_revocations TO service_role;
CREATE POLICY academy_completion_rewards_admin ON public.academy_completion_rewards FOR SELECT TO authenticated
 USING(public.academy_can_access() AND public.is_admin());
CREATE POLICY academy_revocation_read ON public.academy_completion_revocations FOR SELECT TO authenticated
 USING(public.academy_can_access() AND (public.is_admin() OR EXISTS(SELECT 1 FROM public.course_completions c WHERE c.id=completion_id AND c.user_id=auth.uid())));
CREATE FUNCTION academy_private.guard_completion_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP='DELETE' OR TG_TABLE_NAME='academy_completion_revocations' OR TG_TABLE_NAME='academy_completion_rewards' THEN
  RAISE EXCEPTION 'completion_history_is_immutable'; END IF;
 IF (to_jsonb(NEW)-ARRAY['revoked_at','revoked_by','revoked_reason']) IS DISTINCT FROM
    (to_jsonb(OLD)-ARRAY['revoked_at','revoked_by','revoked_reason']) OR OLD.revoked_at IS NOT NULL
    OR NEW.revoked_at IS NULL OR NEW.revoked_by IS DISTINCT FROM auth.uid()
    OR NOT public.academy_can_access() OR NOT public.is_admin() THEN
  RAISE EXCEPTION 'completion_history_is_immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER academy_completion_history BEFORE UPDATE OR DELETE ON public.course_completions FOR EACH ROW EXECUTE FUNCTION academy_private.guard_completion_history();
CREATE TRIGGER academy_revocation_history BEFORE UPDATE OR DELETE ON public.academy_completion_revocations FOR EACH ROW EXECUTE FUNCTION academy_private.guard_completion_history();
CREATE TRIGGER academy_reward_link_history BEFORE UPDATE OR DELETE ON public.academy_completion_rewards FOR EACH ROW EXECUTE FUNCTION academy_private.guard_completion_history();

CREATE FUNCTION public.academy_revoke_completion(p_completion_id uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c public.course_completions; e public.course_enrollments; decision public.academy_completion_revocations;
 v_run uuid; v_remaining boolean; v_manual boolean; v_count integer:=0; v_state text;
BEGIN
 IF NOT public.academy_can_access() OR NOT public.is_admin() THEN RAISE EXCEPTION 'admin_required' USING ERRCODE='42501'; END IF;
 IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 10 AND 2000 THEN RAISE EXCEPTION 'revocation_reason_required'; END IF;
 SELECT * INTO c FROM public.course_completions WHERE id=p_completion_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'completion_not_found'; END IF;
 IF c.user_id=auth.uid() THEN RAISE EXCEPTION 'independent_admin_required' USING ERRCODE='42501'; END IF;
 SELECT run_id INTO v_run FROM public.course_enrollments WHERE id=c.enrollment_id;
 IF v_run IS NOT NULL THEN PERFORM 1 FROM public.course_runs WHERE id=v_run FOR UPDATE; END IF;
 SELECT * INTO e FROM public.course_enrollments WHERE id=c.enrollment_id FOR UPDATE;
 PERFORM pg_advisory_xact_lock(hashtextextended('academy-eligibility:'||c.user_id::text,0));
 SELECT * INTO c FROM public.course_completions WHERE id=p_completion_id FOR UPDATE;
 SELECT * INTO decision FROM public.academy_completion_revocations WHERE completion_id=c.id;
 IF FOUND THEN RETURN to_jsonb(decision)||jsonb_build_object('already_revoked',true); END IF;
 UPDATE public.course_completions SET revoked_at=now(),revoked_by=auth.uid(),revoked_reason=btrim(p_reason) WHERE id=c.id;
 SELECT EXISTS(SELECT 1 FROM public.course_completions other WHERE other.user_id=c.user_id AND other.course_id=c.course_id AND other.revoked_at IS NULL) INTO v_remaining;
 v_manual:=false;
 IF v_remaining THEN v_state:='retained_valid_completion';
 ELSE
  -- Historical records have no provable enrollment-to-award attribution: never guess.
  SELECT EXISTS(SELECT 1 FROM public.course_completions old WHERE old.user_id=c.user_id AND old.course_id=c.course_id AND NOT old.reward_tracking_complete) INTO v_manual;
  PERFORM 1 FROM public.profiles p WHERE p.id IN (SELECT t.user_id FROM public.loyalty_transactions t
   JOIN public.academy_completion_rewards link ON link.transaction_id=t.id
   JOIN public.course_completions evidence ON evidence.id=link.completion_id
   WHERE evidence.user_id=c.user_id AND evidence.course_id=c.course_id) ORDER BY p.id FOR UPDATE;
  UPDATE public.loyalty_transactions t SET status='reversed'
   WHERE t.status IN ('confirmed','pending') AND EXISTS(SELECT 1 FROM public.academy_completion_rewards link
    JOIN public.course_completions evidence ON evidence.id=link.completion_id
    WHERE link.transaction_id=t.id AND evidence.user_id=c.user_id AND evidence.course_id=c.course_id);
  GET DIAGNOSTICS v_count=ROW_COUNT;
  v_state:=CASE WHEN v_manual THEN 'manual_review' WHEN v_count>0 THEN 'reversed' ELSE 'no_reward' END;
 END IF;
 INSERT INTO public.academy_completion_revocations(completion_id,actor_id,reason,rewards_state,reversed_transactions,manual_reward_review_required)
 VALUES(c.id,auth.uid(),btrim(p_reason),v_state,v_count,v_manual) RETURNING * INTO decision;
 INSERT INTO public.academy_audit_events(actor_id,action,course_id,details)
 VALUES(auth.uid(),'COURSE_COMPLETION_REVOKED',c.course_id,to_jsonb(decision)||jsonb_build_object('enrollment_id',e.id,'user_id',c.user_id,'version_id',c.version_id));
 INSERT INTO public.notifications(user_id,type,title_pl,title_en,body_pl,body_en,priority)
 SELECT c.user_id,'system_announcement','Unieważniono ukończenie szkolenia','Course completion revoked',
  'Administrator unieważnił ukończenie szkolenia „'||(c.certificate_snapshot->>'course_title')||'”. Powód: '||btrim(p_reason),
  'The course completion has been revoked. Reason: '||btrim(p_reason),'normal'
 WHERE EXISTS(SELECT 1 FROM auth.users WHERE id=c.user_id);
 RETURN to_jsonb(decision)||jsonb_build_object('already_revoked',false);
END $$;
REVOKE ALL ON FUNCTION public.academy_revoke_completion(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.academy_revoke_completion(uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION academy_private.guard_completion_history() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION academy_private.finalize_enrollment(p_enrollment_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e public.course_enrollments%ROWTYPE; v public.course_versions%ROWTYPE; c public.courses%ROWTYPE;
    v_existing public.course_completions; v_transaction uuid; v_run uuid; v_completion uuid; v_hash text; v_claim uuid; v_student integer; v_author integer; v_rule text;
    v_completed timestamptz:=now(); v_participant text; v_author_name text;
BEGIN
    SELECT run_id INTO v_run FROM public.course_enrollments WHERE id=p_enrollment_id;
    IF v_run IS NOT NULL THEN PERFORM 1 FROM public.course_runs WHERE id=v_run FOR UPDATE; END IF;
    SELECT * INTO e FROM public.course_enrollments WHERE id=p_enrollment_id FOR UPDATE;
    PERFORM pg_advisory_xact_lock(hashtextextended('academy-eligibility:'||e.user_id::text,0));
    IF NOT FOUND THEN RAISE EXCEPTION 'enrollment_not_found'; END IF;
    SELECT * INTO v_existing FROM public.course_completions WHERE enrollment_id=e.id;
    IF FOUND THEN RETURN jsonb_build_object('completed',v_existing.revoked_at IS NULL,'completion_id',v_existing.id,'already_completed',true,
        'reason',CASE WHEN v_existing.revoked_at IS NOT NULL THEN 'completion_revoked' END); END IF;
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
    INSERT INTO public.course_completions(enrollment_id,user_id,course_id,version_id,completed_at,certificate_snapshot,reward_tracking_complete)
    VALUES(e.id,e.user_id,e.course_id,e.version_id,v_completed,jsonb_build_object(
        'course_title',v.metadata->>'title','version_number',v.version_number,'participant_name',v_participant,
        'author_name',v_author_name,'completed_at',v_completed,'certificate_hash',v_hash),true) RETURNING id INTO v_completion;
    UPDATE public.course_enrollments SET completed_at=v_completed,certificate_hash=v_hash,certificate_issued_at=v_completed
        WHERE id=e.id;
    -- Claim is keyed by learner/course, including all versions and repeated live runs.
    INSERT INTO public.academy_reward_claims(user_id,course_id,reward_kind)
    VALUES(e.user_id,e.course_id,'completion') ON CONFLICT DO NOTHING RETURNING id INTO v_claim;
    IF v_claim IS NOT NULL AND e.user_id<>c.author_id THEN
        -- Both beneficiaries lock in a stable order, including reciprocal author/student roles.
        PERFORM 1 FROM public.profiles WHERE id IN (e.user_id,c.author_id) ORDER BY id FOR UPDATE;
        v_rule:=CASE WHEN v.metadata->>'course_type'='company' THEN 'course_completed_company_student' ELSE 'course_completed_student' END;
        SELECT points INTO v_student FROM public.loyalty_rules WHERE code=v_rule AND is_active;
        IF v_student IS NOT NULL THEN
            INSERT INTO public.loyalty_transactions(user_id,points,source_type,source_id,description)
            VALUES(e.user_id,v_student,v_rule,c.id,'Ukończenie szkolenia: '||(v.metadata->>'title')) RETURNING id INTO v_transaction;
            INSERT INTO public.academy_completion_rewards VALUES(v_completion,v_transaction,'student');
        END IF;
        IF v.metadata->>'course_type'='consultant' THEN
            SELECT points INTO v_author FROM public.loyalty_rules WHERE code='course_completed_author_reward' AND is_active;
            IF v_author IS NOT NULL THEN
                v_author:=round(v_author*(1.0+least(0.2,greatest(0,c.avg_rating)/5.0*0.2)));
                INSERT INTO public.loyalty_transactions(user_id,points,source_type,source_id,description)
                VALUES(c.author_id,v_author,'course_completed_author_reward',c.id,'Uczeń ukończył szkolenie: '||(v.metadata->>'title')) RETURNING id INTO v_transaction;
                INSERT INTO public.academy_completion_rewards VALUES(v_completion,v_transaction,'author');
            END IF;
        END IF;
    END IF;
    UPDATE public.course_enrollments SET points_awarded=true WHERE id=e.id;
    INSERT INTO public.academy_audit_events(actor_id,action,course_id,details)
    VALUES(auth.uid(),'COURSE_COMPLETED',c.id,jsonb_build_object('enrollment_id',e.id,'completion_id',v_completion,'version_id',v.id));
    RETURN jsonb_build_object('completed',true,'completion_id',v_completion,'already_completed',false);
END $$;

CREATE OR REPLACE FUNCTION public.academy_mark_lesson_complete(p_enrollment_id uuid,p_lesson_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e public.course_enrollments%ROWTYPE; v_already boolean; v_completion jsonb; v_streak jsonb;
BEGIN
    PERFORM 1 FROM public.course_runs WHERE id=(SELECT run_id FROM public.course_enrollments WHERE id=p_enrollment_id AND user_id=auth.uid()) FOR UPDATE;
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

CREATE OR REPLACE FUNCTION public.academy_submit_quiz(p_enrollment_id uuid,p_answers jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e public.course_enrollments%ROWTYPE; v public.course_versions%ROWTYPE;
    v_total integer; v_correct integer; v_score integer; v_passed boolean; v_attempt uuid; v_completion jsonb;
BEGIN
    PERFORM 1 FROM public.course_runs WHERE id=(SELECT run_id FROM public.course_enrollments WHERE id=p_enrollment_id AND user_id=auth.uid()) FOR UPDATE;
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

CREATE OR REPLACE FUNCTION academy_private.user_may_register(p_user_id uuid,p_version_id uuid)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended('academy-eligibility:'||p_user_id::text,0));
    RETURN EXISTS(SELECT 1 FROM public.profiles p JOIN auth.users u ON u.id=p.id WHERE p.id=p_user_id
        AND p.role::text IN ('consultant','admin') AND NOT COALESCE(p.is_external,false)
        AND COALESCE(p.employment_status::text,'active')<>'exited')
    AND EXISTS(SELECT 1 FROM public.course_versions v JOIN public.courses c ON c.id=v.course_id WHERE v.id=p_version_id AND NOT c.legacy_review_required)
    AND NOT EXISTS(SELECT 1 FROM public.course_versions v,
        jsonb_array_elements_text(COALESCE(v.metadata->'prerequisite_course_ids','[]')) prerequisite(value)
        WHERE v.id=p_version_id AND NOT EXISTS(SELECT 1 FROM public.course_completions c
            WHERE c.user_id=p_user_id AND c.course_id=prerequisite.value::uuid AND c.revoked_at IS NULL));
END $$;

CREATE OR REPLACE FUNCTION public.academy_enroll(p_course_id uuid,p_version_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c public.courses%ROWTYPE; v public.course_versions%ROWTYPE; v_id uuid;
BEGIN
    IF NOT public.academy_can_access() THEN RAISE EXCEPTION 'academy_access_required' USING ERRCODE='42501'; END IF;
    SELECT * INTO c FROM public.courses WHERE id=p_course_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'course_not_found'; END IF;
    SELECT id INTO v_id FROM public.course_enrollments WHERE user_id=auth.uid() AND course_id=c.id AND run_id IS NULL;
    IF FOUND THEN RETURN v_id; END IF;
    IF c.legacy_review_required THEN RAISE EXCEPTION 'legacy_admin_review_required'; END IF;
    IF c.status<>'published' OR c.published_version_id IS NULL
        OR (p_version_id IS NOT NULL AND p_version_id<>c.published_version_id) THEN RAISE EXCEPTION 'published_version_required'; END IF;
    SELECT * INTO v FROM public.course_versions WHERE id=c.published_version_id;
    IF v.status<>'published' THEN RAISE EXCEPTION 'published_version_required'; END IF;
    IF v.metadata->>'delivery_mode'<>'self_paced' THEN RAISE EXCEPTION 'select_course_run'; END IF;
    IF NOT academy_private.user_may_register(auth.uid(),v.id) THEN
        RAISE EXCEPTION 'prerequisites_not_completed';
    END IF;
    INSERT INTO public.course_enrollments(user_id,course_id,version_id) VALUES(auth.uid(),c.id,v.id) RETURNING id INTO v_id;
    INSERT INTO public.academy_audit_events(actor_id,action,course_id,details)
    VALUES(auth.uid(),'COURSE_ENROLLED',c.id,jsonb_build_object('version_id',v.id,'enrollment_id',v_id));
    RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.academy_complete_path(p_path_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e public.learning_path_enrollments%ROWTYPE;
BEGIN
    IF NOT public.academy_can_access() THEN RAISE EXCEPTION 'academy_access_required' USING ERRCODE='42501'; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('academy-eligibility:'||auth.uid()::text,0));
    SELECT * INTO e FROM public.learning_path_enrollments WHERE path_id=p_path_id AND user_id=auth.uid() FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'own_path_enrollment_required' USING ERRCODE='42501'; END IF;
    IF e.completed_at IS NOT NULL THEN RETURN jsonb_build_object('completed',true,'now_completed',false); END IF;
    IF cardinality(e.required_course_ids)=0 OR EXISTS(SELECT 1 FROM unnest(e.required_course_ids) cid WHERE NOT EXISTS(
        SELECT 1 FROM public.course_completions c WHERE c.course_id=cid AND c.user_id=e.user_id AND c.revoked_at IS NULL)) THEN
        RETURN jsonb_build_object('completed',false,'now_completed',false); END IF;
    UPDATE public.learning_path_enrollments SET completed_at=now() WHERE id=e.id;
    RETURN jsonb_build_object('completed',true,'now_completed',true);
END $$;

CREATE OR REPLACE FUNCTION public.academy_submit_survey(p_enrollment_id uuid,p_nps_score integer,p_best_part text DEFAULT NULL,p_improvement_suggestion text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e public.course_enrollments%ROWTYPE; v_id uuid;
BEGIN
    IF NOT public.academy_can_access() THEN RAISE EXCEPTION 'academy_access_required' USING ERRCODE='42501'; END IF;
    SELECT * INTO e FROM public.course_enrollments WHERE id=p_enrollment_id AND user_id=auth.uid() FOR UPDATE;
    IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.course_completions WHERE enrollment_id=e.id AND user_id=auth.uid() AND revoked_at IS NULL) THEN
        RAISE EXCEPTION 'own_trusted_completion_required' USING ERRCODE='42501'; END IF;
    IF p_nps_score IS NULL OR p_nps_score NOT BETWEEN 0 AND 10 OR length(p_best_part)>1000 OR length(p_improvement_suggestion)>1000 THEN RAISE EXCEPTION 'invalid_survey'; END IF;
    SELECT id INTO v_id FROM public.course_survey_responses WHERE user_id=e.user_id AND course_id=e.course_id;
    IF FOUND THEN RETURN v_id; END IF;
    INSERT INTO public.course_survey_responses(user_id,course_id,enrollment_id,nps_score,best_part,improvement_suggestion)
    VALUES(e.user_id,e.course_id,e.id,p_nps_score,p_best_part,p_improvement_suggestion) RETURNING id INTO v_id;
    RETURN v_id;
END $$;

DROP POLICY academy_ratings_insert ON public.course_ratings;
CREATE POLICY academy_ratings_insert ON public.course_ratings FOR INSERT TO authenticated WITH CHECK (
 public.academy_can_access() AND user_id=auth.uid() AND EXISTS(SELECT 1 FROM public.course_completions c
 WHERE c.user_id=auth.uid() AND c.course_id=course_ratings.course_id AND c.revoked_at IS NULL));
DROP POLICY academy_ratings_update ON public.course_ratings;
CREATE POLICY academy_ratings_update ON public.course_ratings FOR UPDATE TO authenticated USING(public.academy_can_access() AND user_id=auth.uid()) WITH CHECK (
 public.academy_can_access() AND user_id=auth.uid() AND EXISTS(SELECT 1 FROM public.course_completions c
 WHERE c.user_id=auth.uid() AND c.course_id=course_ratings.course_id AND c.revoked_at IS NULL));
COMMIT;
