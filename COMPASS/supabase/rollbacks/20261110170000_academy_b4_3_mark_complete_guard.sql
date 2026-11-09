-- Cofnięcie domknięcia B4.3. Stosuje wyłącznie właściciel. academy_mark_lesson_complete
-- znów zalicza lekcję z nagraniem na samo wywołanie; zaliczenia z okresu działania warunku zostają.
BEGIN;

DO $migration$
DECLARE v_def text; v_new text;
BEGIN
    v_def := pg_get_functiondef('public.academy_mark_lesson_complete(uuid,uuid)'::regprocedure);
    v_new := replace(v_def,
        $new$v_already:=p_lesson_id=ANY(e.completed_lessons);
    -- B4.3: lekcję z nagraniem zalicza obejrzenie (academy_save_video_progress), nie wywołanie wprost.
    IF NOT v_already AND NOT academy_private.lesson_video_requirement_met(e.user_id,e.version_id,p_lesson_id) THEN
        RAISE EXCEPTION 'video_watch_required' USING ERRCODE='42501';
    END IF;$new$,
        $old$v_already:=p_lesson_id=ANY(e.completed_lessons);$old$);
    IF v_new = v_def THEN RAISE EXCEPTION 'b4_3_guard_down_wzorzec_nie_znaleziony: public.academy_mark_lesson_complete(uuid,uuid)'; END IF;
    EXECUTE v_new;
END $migration$;

DROP FUNCTION academy_private.lesson_video_requirement_met(uuid,uuid,uuid);

NOTIFY pgrst,'reload schema';

DO $check$
BEGIN
    IF to_regprocedure('academy_private.lesson_video_requirement_met(uuid,uuid,uuid)') IS NOT NULL THEN
        RAISE EXCEPTION 'b4_3_guard_down_funkcja_zostala';
    END IF;
    IF pg_get_functiondef('public.academy_mark_lesson_complete(uuid,uuid)'::regprocedure) LIKE '%video_watch_required%' THEN
        RAISE EXCEPTION 'b4_3_guard_down_warunek_zostal';
    END IF;
END $check$;

COMMIT;
