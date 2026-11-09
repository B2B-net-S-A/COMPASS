-- B4.3: postęp oglądania co do sekundy, wznawianie na innym urządzeniu i automatyczne
-- zaliczenie modułu po obejrzeniu ustawionej części nagrania (domyślnie 90%).
-- Cofnięcie: DROP FUNCTION public.academy_save_video_progress(uuid,uuid,uuid,numeric,numeric,jsonb),
-- academy_private.merge_video_ranges(jsonb,jsonb), academy_private.video_ranges_seconds(jsonb);
-- DROP TABLE public.academy_video_progress. Dane postępu można odtworzyć tylko z PITR.

CREATE TABLE public.academy_video_progress (
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    asset_id uuid NOT NULL REFERENCES public.course_materials(id) ON DELETE CASCADE,
    position_seconds numeric(10,3) NOT NULL DEFAULT 0 CHECK (position_seconds >= 0),
    duration_seconds numeric(10,3) NOT NULL CHECK (duration_seconds > 0),
    watched_ranges jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(watched_ranges) = 'array'),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, asset_id)
);
ALTER TABLE public.academy_video_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY academy_video_progress_own_read ON public.academy_video_progress
    FOR SELECT TO authenticated USING (user_id = auth.uid());
REVOKE ALL ON public.academy_video_progress FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.academy_video_progress TO authenticated;

CREATE FUNCTION academy_private.merge_video_ranges(p_left jsonb, p_right jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
    WITH points AS (
        SELECT (item->>0)::numeric AS range_start, (item->>1)::numeric AS range_end
        FROM jsonb_array_elements(COALESCE(p_left, '[]'::jsonb) || COALESCE(p_right, '[]'::jsonb)) AS item
    ), ordered AS (
        SELECT range_start, range_end,
            max(range_end) OVER (ORDER BY range_start, range_end ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS previous_end
        FROM points
    ), grouped AS (
        SELECT range_start, range_end,
            count(*) FILTER (WHERE previous_end IS NULL OR range_start > previous_end) OVER (ORDER BY range_start, range_end) AS grp
        FROM ordered
    ), merged AS (
        SELECT min(range_start) AS range_start, max(range_end) AS range_end FROM grouped GROUP BY grp
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_array(range_start, range_end) ORDER BY range_start), '[]'::jsonb) FROM merged
$$;

CREATE FUNCTION academy_private.video_ranges_seconds(p_ranges jsonb)
RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
    SELECT COALESCE(sum((item->>1)::numeric - (item->>0)::numeric), 0)
    FROM jsonb_array_elements(COALESCE(p_ranges, '[]'::jsonb)) AS item
$$;

CREATE FUNCTION public.academy_save_video_progress(
    p_enrollment_id uuid, p_lesson_id uuid, p_asset_id uuid,
    p_position numeric, p_duration numeric, p_ranges jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_version uuid;
    v_rules jsonb;
    v_attachments jsonb;
    v_existing public.academy_video_progress%ROWTYPE;
    v_found boolean;
    v_duration numeric;
    v_position numeric;
    v_merged jsonb;
    v_added numeric;
    v_allowed numeric;
    v_accepted boolean := true;
    v_threshold integer;
    v_total numeric;
    v_watched numeric;
    v_missing integer;
    v_percent numeric := 0;
    v_completion jsonb;
BEGIN
    PERFORM academy_private.require_lesson_access(p_enrollment_id, p_lesson_id);
    SELECT e.version_id, v.completion_rules, l.attachments INTO v_version, v_rules, v_attachments
    FROM public.course_enrollments e
    JOIN public.course_versions v ON v.id = e.version_id
    JOIN public.course_lessons l ON l.id = p_lesson_id AND l.version_id = e.version_id
    WHERE e.id = p_enrollment_id AND e.user_id = auth.uid();
    IF NOT FOUND THEN RAISE EXCEPTION 'lesson_not_in_enrollment'; END IF;
    IF NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_attachments) AS item
        WHERE item->>'asset_id' = p_asset_id::text AND item->>'mime_type' = 'video/mp4'
    ) THEN RAISE EXCEPTION 'video_not_in_lesson'; END IF;

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

    -- Czas trwania raportuje przeglądarka, więc nie wolno go potem skrócić.
    v_duration := GREATEST(COALESCE(v_existing.duration_seconds, 0), p_duration);
    v_position := LEAST(p_position, v_duration);
    v_merged := academy_private.merge_video_ranges(v_existing.watched_ranges, p_ranges);
    v_added := academy_private.video_ranges_seconds(v_merged) - academy_private.video_ranges_seconds(v_existing.watched_ranges);

    -- Nowo obejrzane sekundy nie mogą przekraczać czasu od ostatniego zapisu przy prędkości 2×.
    -- Odrzucone zakresy klient wysyła ponownie, a wtedy limit jest już większy o upływ czasu.
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

    v_threshold := CASE
        WHEN jsonb_typeof(v_rules->'video_watch_percent') = 'number'
            AND (v_rules->>'video_watch_percent')::numeric BETWEEN 50 AND 100
        THEN (v_rules->>'video_watch_percent')::integer ELSE 90 END;

    -- Wszystkie nagrania modułu liczą się razem, bo część plików to kolejne fragmenty jednej sesji.
    SELECT count(*) FILTER (WHERE p.asset_id IS NULL),
        COALESCE(sum(p.duration_seconds), 0),
        COALESCE(sum(LEAST(academy_private.video_ranges_seconds(p.watched_ranges), p.duration_seconds)), 0)
    INTO v_missing, v_total, v_watched
    FROM jsonb_array_elements(v_attachments) AS item
    LEFT JOIN public.academy_video_progress p ON p.user_id = auth.uid() AND p.asset_id::text = item->>'asset_id'
    WHERE item->>'mime_type' = 'video/mp4' AND item ? 'asset_id';

    IF v_total > 0 THEN v_percent := LEAST(100, round(v_watched / v_total * 100, 1)); END IF;
    IF v_missing = 0 AND v_percent >= v_threshold THEN
        v_completion := public.academy_mark_lesson_complete(p_enrollment_id, p_lesson_id);
    END IF;

    RETURN jsonb_build_object(
        'accepted', v_accepted,
        'watched_percent', v_percent,
        'threshold_percent', v_threshold,
        'completed', v_completion IS NOT NULL,
        'already_completed', COALESCE((v_completion->>'already_completed')::boolean, false),
        'streak', v_completion->'streak'
    );
END $$;
REVOKE ALL ON FUNCTION public.academy_save_video_progress(uuid,uuid,uuid,numeric,numeric,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academy_save_video_progress(uuid,uuid,uuid,numeric,numeric,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION academy_private.merge_video_ranges(jsonb,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION academy_private.video_ranges_seconds(jsonb) FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
    IF to_regclass('public.academy_video_progress') IS NULL THEN RAISE EXCEPTION 'B4.3: brak tabeli academy_video_progress'; END IF;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.academy_video_progress'::regclass) THEN RAISE EXCEPTION 'B4.3: RLS wyłączone'; END IF;
    IF has_table_privilege('authenticated', 'public.academy_video_progress', 'INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'B4.3: authenticated ma zapis bezpośredni'; END IF;
    IF has_table_privilege('anon', 'public.academy_video_progress', 'SELECT') THEN RAISE EXCEPTION 'B4.3: anon czyta postęp'; END IF;
    IF NOT has_function_privilege('authenticated', 'public.academy_save_video_progress(uuid,uuid,uuid,numeric,numeric,jsonb)', 'EXECUTE') THEN RAISE EXCEPTION 'B4.3: brak EXECUTE dla authenticated'; END IF;
    IF academy_private.merge_video_ranges('[[0,10],[20,30]]', '[[5,25]]') <> '[[0,30]]'::jsonb THEN RAISE EXCEPTION 'B4.3: scalanie zakresów niepoprawne'; END IF;
    IF academy_private.video_ranges_seconds('[[0,10],[20,30]]') <> 20 THEN RAISE EXCEPTION 'B4.3: suma zakresów niepoprawna'; END IF;
END $$;
