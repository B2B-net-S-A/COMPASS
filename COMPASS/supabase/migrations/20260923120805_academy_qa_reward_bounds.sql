-- Bound discussion rewards across every version and run of a course. Existing
-- transactions remain untouched; their corresponding claims prevent re-awards.
BEGIN;

-- Deploy only while the Academy rollout is closed and no old Q&A RPC is in
-- flight. The lock waits for committed ledger writers and prevents a new
-- payout from slipping between the historical snapshot and function cutover.
LOCK TABLE public.loyalty_transactions IN SHARE ROW EXCLUSIVE MODE;
DO $$ BEGIN
    IF EXISTS(SELECT 1 FROM public.academy_rollout_settings WHERE mode <> 'closed') THEN
        RAISE EXCEPTION 'academy_qa_cutover_requires_closed_rollout';
    END IF;
    -- A deleted source has no trustworthy course ID for a per-course claim.
    -- Stop instead of silently allowing another payout for that history.
    IF EXISTS(SELECT 1 FROM public.loyalty_transactions tx
        WHERE tx.source_type='course_question_asked' AND tx.points>0
          AND NOT EXISTS(SELECT 1 FROM public.course_questions q WHERE q.id=tx.source_id AND q.user_id=tx.user_id))
       OR EXISTS(SELECT 1 FROM public.loyalty_transactions tx
        WHERE tx.source_type='course_answer_given' AND tx.points>0
          AND NOT EXISTS(SELECT 1 FROM public.course_answers a JOIN public.course_questions q ON q.id=a.question_id
            WHERE a.id=tx.source_id AND a.user_id=tx.user_id)) THEN
        RAISE EXCEPTION 'academy_qa_orphan_reward_requires_manual_review';
    END IF;
END $$;

ALTER TABLE public.academy_reward_claims
    DROP CONSTRAINT academy_reward_claims_reward_kind_check;
ALTER TABLE public.academy_reward_claims
    ADD CONSTRAINT academy_reward_claims_reward_kind_check
    CHECK (reward_kind IN ('completion', 'first_publication', 'question_engagement', 'author_answer'));

CREATE UNIQUE INDEX academy_reward_discussion_once_per_course
    ON public.academy_reward_claims(user_id, course_id, reward_kind)
    WHERE reward_kind IN ('question_engagement', 'author_answer');

INSERT INTO public.academy_reward_claims(user_id, course_id, reward_kind, legacy)
SELECT DISTINCT tx.user_id, q.course_id, 'question_engagement', true
FROM public.loyalty_transactions tx
JOIN public.course_questions q ON q.id = tx.source_id AND q.user_id = tx.user_id
WHERE tx.source_type = 'course_question_asked' AND tx.points > 0
ON CONFLICT DO NOTHING;

INSERT INTO public.academy_reward_claims(user_id, course_id, reward_kind, legacy)
SELECT DISTINCT tx.user_id, q.course_id, 'author_answer', true
FROM public.loyalty_transactions tx
JOIN public.course_answers a ON a.id = tx.source_id AND a.user_id = tx.user_id
JOIN public.course_questions q ON q.id = a.question_id
WHERE tx.source_type = 'course_answer_given' AND tx.points > 0
ON CONFLICT DO NOTHING;

-- The ledger is the shared payout boundary for both the old and current Q&A
-- function bodies. A request already executing the old body after this commit
-- still passes through this trigger before any points can be recorded.
CREATE FUNCTION academy_private.claim_qa_reward()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_course uuid; v_kind text; v_claim uuid;
BEGIN
    IF NEW.points <= 0 THEN RETURN NEW; END IF;
    IF NEW.source_type='course_question_asked' THEN
        SELECT q.course_id INTO v_course FROM public.course_questions q
        JOIN public.courses c ON c.id=q.course_id
        WHERE q.id=NEW.source_id AND q.user_id=NEW.user_id AND c.author_id<>q.user_id;
        v_kind:='question_engagement';
    ELSE
        SELECT q.course_id INTO v_course FROM public.course_answers a
        JOIN public.course_questions q ON q.id=a.question_id
        JOIN public.courses c ON c.id=q.course_id
        WHERE a.id=NEW.source_id AND a.user_id=NEW.user_id AND a.is_author_answer
          AND c.author_id=a.user_id AND q.user_id<>a.user_id;
        v_kind:='author_answer';
    END IF;
    IF v_course IS NULL THEN RAISE EXCEPTION 'academy_qa_reward_source_required'; END IF;
    INSERT INTO public.academy_reward_claims(user_id,course_id,reward_kind)
    VALUES(NEW.user_id,v_course,v_kind) ON CONFLICT DO NOTHING RETURNING id INTO v_claim;
    IF v_claim IS NULL THEN RETURN NULL; END IF;
    RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION academy_private.claim_qa_reward() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER academy_claim_qa_reward BEFORE INSERT ON public.loyalty_transactions
    FOR EACH ROW WHEN (NEW.source_type IN ('course_question_asked','course_answer_given'))
    EXECUTE FUNCTION academy_private.claim_qa_reward();

COMMENT ON INDEX public.academy_reward_discussion_once_per_course IS
    'One question reward per learner/course and one author-answer reward per author/course across versions and runs.';
COMMIT;
