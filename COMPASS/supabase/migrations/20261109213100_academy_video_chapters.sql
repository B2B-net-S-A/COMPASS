-- B4.4: rozdziały nagrania. Odczyt ma ten sam zakres co sam materiał.
-- Cofnięcie: DROP FUNCTION public.academy_replace_video_chapters(uuid,jsonb); DROP TABLE public.academy_video_chapters.

CREATE TABLE public.academy_video_chapters (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id uuid NOT NULL REFERENCES public.course_materials(id) ON DELETE CASCADE,
    position_seconds integer NOT NULL CHECK (position_seconds >= 0),
    title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 120),
    created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (asset_id, position_seconds)
);
ALTER TABLE public.academy_video_chapters ENABLE ROW LEVEL SECURITY;
CREATE POLICY academy_video_chapters_read ON public.academy_video_chapters
    FOR SELECT TO authenticated USING (public.academy_can_read_asset(asset_id));
REVOKE ALL ON public.academy_video_chapters FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.academy_video_chapters TO authenticated;

CREATE FUNCTION public.academy_replace_video_chapters(p_asset_id uuid, p_chapters jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_course uuid;
    v_mime text;
    v_count integer;
BEGIN
    SELECT course_id, mime_type INTO v_course, v_mime FROM public.course_materials WHERE id = p_asset_id;
    IF NOT FOUND OR NOT public.academy_can_manage_course(v_course) THEN RAISE EXCEPTION 'trainer_course_required' USING ERRCODE = '42501'; END IF;
    IF v_mime <> 'video/mp4' THEN RAISE EXCEPTION 'chapters_require_video'; END IF;
    IF jsonb_typeof(p_chapters) IS DISTINCT FROM 'array' OR jsonb_array_length(p_chapters) > 100 THEN RAISE EXCEPTION 'invalid_video_chapters'; END IF;
    IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_chapters) AS item
        WHERE jsonb_typeof(item) <> 'object'
            OR jsonb_typeof(item->'position_seconds') <> 'number'
            OR (item->>'position_seconds')::numeric < 0
            OR (item->>'position_seconds')::numeric <> trunc((item->>'position_seconds')::numeric)
            OR jsonb_typeof(item->'title') <> 'string'
            OR length(btrim(item->>'title')) NOT BETWEEN 1 AND 120
    ) THEN RAISE EXCEPTION 'invalid_video_chapters'; END IF;
    IF (SELECT count(*) <> count(DISTINCT item->>'position_seconds') FROM jsonb_array_elements(p_chapters) AS item) THEN
        RAISE EXCEPTION 'duplicate_video_chapter';
    END IF;

    DELETE FROM public.academy_video_chapters WHERE asset_id = p_asset_id;
    INSERT INTO public.academy_video_chapters(asset_id, position_seconds, title, created_by)
    SELECT p_asset_id, (item->>'position_seconds')::integer, btrim(item->>'title'), auth.uid()
    FROM jsonb_array_elements(p_chapters) AS item;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END $$;
REVOKE ALL ON FUNCTION public.academy_replace_video_chapters(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academy_replace_video_chapters(uuid,jsonb) TO authenticated;

DO $$
BEGIN
    IF to_regclass('public.academy_video_chapters') IS NULL THEN RAISE EXCEPTION 'B4.4: brak tabeli academy_video_chapters'; END IF;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.academy_video_chapters'::regclass) THEN RAISE EXCEPTION 'B4.4: RLS wyłączone'; END IF;
    IF has_table_privilege('authenticated', 'public.academy_video_chapters', 'INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'B4.4: authenticated ma zapis bezpośredni'; END IF;
    IF NOT has_function_privilege('authenticated', 'public.academy_replace_video_chapters(uuid,jsonb)', 'EXECUTE') THEN RAISE EXCEPTION 'B4.4: brak EXECUTE dla authenticated'; END IF;
END $$;
