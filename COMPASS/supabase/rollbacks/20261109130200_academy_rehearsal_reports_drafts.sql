-- Cofnięcie B0.6. Usuniętych szkiców nie przywraca (do tego służy PITR); kolumny kasuje razem z oznaczeniami atrapy i datą startu.
BEGIN;
DROP FUNCTION IF EXISTS public.academy_delete_draft_course(uuid);
DROP FUNCTION IF EXISTS public.academy_restore_course(uuid);
DROP FUNCTION IF EXISTS public.academy_reports_start_at();
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
ALTER TABLE public.courses DROP COLUMN IF EXISTS is_rehearsal;
ALTER TABLE public.academy_rollout_settings DROP COLUMN IF EXISTS reports_start_at;
NOTIFY pgrst,'reload schema';
DO $$
BEGIN
    IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='courses' AND column_name='is_rehearsal') THEN
        RAISE EXCEPTION 'cofnięcie B0.6: kolumna nadal istnieje';
    END IF;
END $$;
COMMIT;
