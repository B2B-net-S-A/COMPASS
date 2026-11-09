-- B4.3 (domknięcie): moduł z nagraniem zalicza się wyłącznie przez obejrzenie.
-- Przycisk ręczny zniknął tylko z interfejsu, a academy_mark_lesson_complete dało się nadal
-- wywołać wprost przez RPC i zaliczyć nagranie bez oglądania. Od tej migracji funkcja odmawia
-- (video_watch_required), gdy lekcja ma nagranie video/mp4, a postęp nie osiągnął progu.
--
-- Warunek jest tym samym, którym academy_save_video_progress (20261109213000) decyduje
-- o automatycznym zaliczeniu: wszystkie nagrania lekcji liczone razem, każde z zapisanym
-- postępem, procent zaokrąglony do 0,1 i porównany z completion_rules.video_watch_percent
-- (50–100, domyślnie 90). Zapis postępu woła academy_mark_lesson_complete w tej samej
-- transakcji po tym samym rachunku, więc automatyczne zaliczenie przechodzi bez zmian.
-- Lekcje bez nagrania i lekcje już zaliczone zachowują się jak dotąd.
--
-- Funkcję łatamy w miejscu przez pg_get_functiondef, jak w B1.1 i B3.10: ciało mogły zmienić
-- późniejsze migracje (completion_revocations, B0.10), więc wstawiamy tylko warunek po
-- wyliczeniu v_already. Brak wzorca przerywa całą transakcję.
-- Warunek kolejności: po 20261109213000_academy_video_progress.sql.
--
-- Cofnięcie: supabase/rollbacks/20261110170000_academy_b4_3_mark_complete_guard.sql.
BEGIN;

DO $pre$
BEGIN
    IF to_regclass('public.academy_video_progress') IS NULL
        OR to_regprocedure('academy_private.video_ranges_seconds(jsonb)') IS NULL THEN
        RAISE EXCEPTION 'b4_3_guard_wymaga_B4_3: najpierw 20261109213000_academy_video_progress.sql';
    END IF;
END $pre$;

-- Prawda, gdy lekcja nie ma nagrania albo jej nagrania są obejrzane do progu wersji.
-- Rachunek odpowiada academy_save_video_progress; zmieniając jeden, zmień drugi,
-- inaczej zapis postępu powyżej progu zacznie się przerywać na tej odmowie.
CREATE FUNCTION academy_private.lesson_video_requirement_met(p_user_id uuid, p_version_id uuid, p_lesson_id uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
    WITH videos AS (
        SELECT item->>'asset_id' AS asset_id
        FROM public.course_lessons l
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(l.attachments, '[]'::jsonb)) AS item
        WHERE l.id = p_lesson_id AND l.version_id = p_version_id
            AND item->>'mime_type' = 'video/mp4' AND item ? 'asset_id'
    ), totals AS (
        SELECT count(*) AS videos,
            count(*) FILTER (WHERE p.asset_id IS NULL) AS missing,
            COALESCE(sum(p.duration_seconds), 0) AS total,
            COALESCE(sum(LEAST(academy_private.video_ranges_seconds(p.watched_ranges), p.duration_seconds)), 0) AS watched
        FROM videos v
        LEFT JOIN public.academy_video_progress p ON p.user_id = p_user_id AND p.asset_id::text = v.asset_id
    ), threshold AS (
        SELECT CASE
            WHEN jsonb_typeof(cv.completion_rules->'video_watch_percent') = 'number'
                AND (cv.completion_rules->>'video_watch_percent')::numeric BETWEEN 50 AND 100
            THEN (cv.completion_rules->>'video_watch_percent')::numeric ELSE 90 END AS percent
        FROM (SELECT 1) AS one
        LEFT JOIN public.course_versions cv ON cv.id = p_version_id
    )
    SELECT t.videos = 0 OR (
        t.missing = 0
        AND CASE WHEN t.total > 0 THEN LEAST(100, round(t.watched / t.total * 100, 1)) ELSE 0 END >= h.percent
    )
    FROM totals t CROSS JOIN threshold h
$$;
REVOKE ALL ON FUNCTION academy_private.lesson_video_requirement_met(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;

DO $migration$
DECLARE v_def text; v_new text;
BEGIN
    v_def := pg_get_functiondef('public.academy_mark_lesson_complete(uuid,uuid)'::regprocedure);
    v_new := replace(v_def,
        $old$v_already:=p_lesson_id=ANY(e.completed_lessons);$old$,
        $new$v_already:=p_lesson_id=ANY(e.completed_lessons);
    -- B4.3: lekcję z nagraniem zalicza obejrzenie (academy_save_video_progress), nie wywołanie wprost.
    IF NOT v_already AND NOT academy_private.lesson_video_requirement_met(e.user_id,e.version_id,p_lesson_id) THEN
        RAISE EXCEPTION 'video_watch_required' USING ERRCODE='42501';
    END IF;$new$);
    IF v_new = v_def THEN RAISE EXCEPTION 'b4_3_guard_wzorzec_nie_znaleziony: public.academy_mark_lesson_complete(uuid,uuid)'; END IF;
    EXECUTE v_new;
END $migration$;

NOTIFY pgrst,'reload schema';

DO $check$
DECLARE v_def text;
BEGIN
    v_def := pg_get_functiondef('public.academy_mark_lesson_complete(uuid,uuid)'::regprocedure);
    IF v_def NOT LIKE '%academy_private.lesson_video_requirement_met(e.user_id,e.version_id,p_lesson_id)%'
        OR v_def NOT LIKE '%video_watch_required%' THEN
        RAISE EXCEPTION 'b4_3_guard_brak_warunku_w_academy_mark_lesson_complete';
    END IF;
    IF (length(v_def) - length(replace(v_def, 'video_watch_required', ''))) / length('video_watch_required') <> 1 THEN
        RAISE EXCEPTION 'b4_3_guard_warunek_wstawiony_wielokrotnie';
    END IF;
    -- Łatka nie może zgubić reszty ciała: zaliczenie kursu i blokady z późniejszych migracji.
    IF v_def NOT LIKE '%academy_private.finalize_enrollment(e.id)%' OR v_def NOT LIKE '%academy_private.require_lesson_access(p_enrollment_id,p_lesson_id)%' THEN
        RAISE EXCEPTION 'b4_3_guard_cialo_funkcji_niekompletne';
    END IF;
    IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.academy_mark_lesson_complete(uuid,uuid)'::regprocedure) THEN
        RAISE EXCEPTION 'b4_3_guard_funkcja_stracila_security_definer';
    END IF;
    IF has_function_privilege('authenticated', 'academy_private.lesson_video_requirement_met(uuid,uuid,uuid)', 'EXECUTE')
        OR has_function_privilege('anon', 'academy_private.lesson_video_requirement_met(uuid,uuid,uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'b4_3_guard_warunek_wolalny_z_przegladarki';
    END IF;
    -- Lekcja bez nagrania (tu: nieistniejąca) nie podlega warunkowi.
    IF NOT academy_private.lesson_video_requirement_met(gen_random_uuid(), gen_random_uuid(), gen_random_uuid()) THEN
        RAISE EXCEPTION 'b4_3_guard_blokuje_lekcje_bez_nagrania';
    END IF;
END $check$;

COMMIT;
