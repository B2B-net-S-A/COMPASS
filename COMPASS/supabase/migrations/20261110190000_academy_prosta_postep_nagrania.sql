-- Wersja prosta, krok 2: nagranie edycji w bibliotece pamięta pozycję i pokazuje czas trwania.
-- Nagranie edycji nie jest załącznikiem lekcji, więc academy_save_video_progress go odrzuca
-- (`video_not_in_lesson`). Ta funkcja zapisuje do tej samej tabeli academy_video_progress
-- (klucz user_id + asset_id) z tą samą walidacją zakresów i limitem tempa, bez zaliczania lekcji.
-- academy_recording_durations zwraca czas trwania, jaki zgłosiła przeglądarka któregokolwiek
-- oglądającego: sam agregat (najdłuższy), bez osób, tylko dla nagrań, które wywołujący może czytać.
--
-- Kolejność: po 20261109213000_academy_video_progress.sql (tabela i scalanie zakresów).
-- Cofnięcie: supabase/rollbacks/20261110190000_academy_prosta_postep_nagrania.sql.
BEGIN;

DO $pre$
BEGIN
    IF to_regclass('public.academy_video_progress') IS NULL
        OR to_regprocedure('academy_private.merge_video_ranges(jsonb,jsonb)') IS NULL THEN
        RAISE EXCEPTION 'prosta_2_wymaga_B4_3: najpierw 20261109213000_academy_video_progress.sql';
    END IF;
END $pre$;

CREATE FUNCTION public.academy_save_recording_progress(
    p_asset_id uuid, p_position numeric, p_duration numeric, p_ranges jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_existing public.academy_video_progress%ROWTYPE;
    v_found boolean;
    v_duration numeric;
    v_position numeric;
    v_merged jsonb;
    v_added numeric;
    v_allowed numeric;
    v_accepted boolean := true;
BEGIN
    IF auth.uid() IS NULL OR NOT public.academy_can_access() THEN
        RAISE EXCEPTION 'academy_access_required' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.course_materials a WHERE a.id = p_asset_id AND a.run_id IS NOT NULL
        AND a.mime_type = 'video/mp4' AND a.status = 'ready') OR NOT public.academy_can_read_asset(p_asset_id) THEN
        RAISE EXCEPTION 'recording_not_available' USING ERRCODE = '42501';
    END IF;
    IF p_position IS NULL OR p_position < 0 OR p_duration IS NULL OR p_duration <= 0 OR p_duration > 86400
        OR jsonb_typeof(p_ranges) IS DISTINCT FROM 'array' OR jsonb_array_length(p_ranges) > 200 THEN
        RAISE EXCEPTION 'invalid_video_progress';
    END IF;
    IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_ranges) AS item
        WHERE jsonb_typeof(item) <> 'array' OR jsonb_array_length(item) <> 2
            OR jsonb_typeof(item->0) <> 'number' OR jsonb_typeof(item->1) <> 'number'
            OR (item->>0)::numeric < 0 OR (item->>1)::numeric <= (item->>0)::numeric
            OR (item->>1)::numeric > p_duration + 1
    ) THEN RAISE EXCEPTION 'invalid_video_progress'; END IF;

    SELECT * INTO v_existing FROM public.academy_video_progress
    WHERE user_id = auth.uid() AND asset_id = p_asset_id FOR UPDATE;
    v_found := FOUND;

    v_duration := GREATEST(COALESCE(v_existing.duration_seconds, 0), p_duration);
    v_position := LEAST(p_position, v_duration);
    v_merged := academy_private.merge_video_ranges(v_existing.watched_ranges, p_ranges);
    v_added := academy_private.video_ranges_seconds(v_merged) - academy_private.video_ranges_seconds(v_existing.watched_ranges);
    v_allowed := CASE WHEN v_found THEN GREATEST(EXTRACT(EPOCH FROM now() - v_existing.updated_at), 0) * 2 + 30 ELSE 30 END;
    IF v_added > v_allowed THEN
        v_merged := COALESCE(v_existing.watched_ranges, '[]'::jsonb);
        v_accepted := false;
    END IF;

    INSERT INTO public.academy_video_progress(user_id, asset_id, position_seconds, duration_seconds, watched_ranges, updated_at)
    VALUES (auth.uid(), p_asset_id, v_position, v_duration, v_merged, now())
    ON CONFLICT (user_id, asset_id) DO UPDATE SET
        position_seconds = EXCLUDED.position_seconds,
        duration_seconds = EXCLUDED.duration_seconds,
        watched_ranges = EXCLUDED.watched_ranges,
        updated_at = CASE WHEN v_accepted THEN now() ELSE public.academy_video_progress.updated_at END;

    RETURN jsonb_build_object(
        'accepted', v_accepted,
        'watched_percent', LEAST(100, round(LEAST(academy_private.video_ranges_seconds(v_merged), v_duration) / v_duration * 100, 1))
    );
END $$;
REVOKE ALL ON FUNCTION public.academy_save_recording_progress(uuid,numeric,numeric,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academy_save_recording_progress(uuid,numeric,numeric,jsonb) TO authenticated;

CREATE FUNCTION public.academy_recording_durations(p_asset_ids uuid[])
RETURNS TABLE(asset_id uuid, duration_seconds numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT p.asset_id, max(p.duration_seconds)
    FROM public.academy_video_progress p
    WHERE public.academy_can_access() AND cardinality(p_asset_ids) <= 200
        AND p.asset_id = ANY(p_asset_ids) AND public.academy_can_read_asset(p.asset_id)
    GROUP BY p.asset_id;
$$;
REVOKE ALL ON FUNCTION public.academy_recording_durations(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academy_recording_durations(uuid[]) TO authenticated;

NOTIFY pgrst, 'reload schema';

DO $check$
BEGIN
    IF NOT has_function_privilege('authenticated', 'public.academy_save_recording_progress(uuid,numeric,numeric,jsonb)', 'EXECUTE')
        OR has_function_privilege('anon', 'public.academy_save_recording_progress(uuid,numeric,numeric,jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'prosta_2: złe uprawnienia zapisu postępu nagrania';
    END IF;
    IF NOT has_function_privilege('authenticated', 'public.academy_recording_durations(uuid[])', 'EXECUTE')
        OR has_function_privilege('anon', 'public.academy_recording_durations(uuid[])', 'EXECUTE') THEN
        RAISE EXCEPTION 'prosta_2: złe uprawnienia czasu trwania';
    END IF;
    IF pg_get_functiondef('public.academy_save_recording_progress(uuid,numeric,numeric,jsonb)'::regprocedure) NOT LIKE '%public.academy_can_read_asset(p_asset_id)%' THEN
        RAISE EXCEPTION 'prosta_2: zapis postępu bez sprawdzenia dostępu do nagrania';
    END IF;
    IF has_table_privilege('authenticated', 'public.academy_video_progress', 'INSERT,UPDATE,DELETE') THEN
        RAISE EXCEPTION 'prosta_2: authenticated ma zapis bezpośredni do postępu';
    END IF;
END $check$;

COMMIT;
