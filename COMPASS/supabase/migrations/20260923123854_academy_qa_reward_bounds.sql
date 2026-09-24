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

-- Loyalty balance serialization must coexist with Q&A foreign-key checks
-- that take KEY SHARE on the same profile. NO KEY UPDATE still serializes
-- balance updates without deadlocking concurrent author answers.
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
    SELECT loyalty_tier INTO old_tier FROM profiles WHERE id = NEW.user_id FOR NO KEY UPDATE;
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
    -- Order same-user/course payouts before touching the unique claim index.
    -- Concurrent author answers otherwise can deadlock after locking their
    -- separate question rows and attempting the same claim simultaneously.
    PERFORM pg_advisory_xact_lock(hashtextextended(
        NEW.user_id::text || ':' || v_course::text || ':' || v_kind, 0));
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
