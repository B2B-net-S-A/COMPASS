-- B4.7: biblioteka IT. Program łączy szkolenie na żywo z jego kursem z modułów, a raport liczy go raz.
-- Podsumowanie zwraca wyłącznie liczby i flagi kursów opublikowanych, nigdy treść lekcji.
-- Cofnięcie: nieodwracalne dla danych tematów i programów, cofamy PITR.

CREATE TABLE public.academy_programmes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 200),
    created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.academy_programmes ENABLE ROW LEVEL SECURITY;
CREATE POLICY academy_programmes_read ON public.academy_programmes FOR SELECT TO authenticated USING (public.academy_can_access());
REVOKE ALL ON public.academy_programmes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.academy_programmes TO authenticated;

ALTER TABLE public.courses ADD COLUMN programme_id uuid REFERENCES public.academy_programmes(id) ON DELETE SET NULL;
ALTER TABLE public.courses ADD COLUMN topic text CHECK (topic IS NULL OR length(btrim(topic)) BETWEEN 1 AND 100);
CREATE INDEX academy_courses_programme_idx ON public.courses(programme_id) WHERE programme_id IS NOT NULL;
CREATE INDEX academy_courses_topic_idx ON public.courses(topic) WHERE topic IS NOT NULL;

CREATE FUNCTION public.academy_set_course_library_fields(p_course_id uuid, p_topic text, p_programme_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    IF NOT public.academy_can_manage_course(p_course_id) THEN RAISE EXCEPTION 'trainer_course_required' USING ERRCODE = '42501'; END IF;
    IF p_topic IS NOT NULL AND length(btrim(p_topic)) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'invalid_course_topic'; END IF;
    IF p_programme_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.academy_programmes WHERE id = p_programme_id) THEN RAISE EXCEPTION 'programme_not_found'; END IF;
    UPDATE public.courses SET topic = NULLIF(btrim(p_topic), ''), programme_id = p_programme_id WHERE id = p_course_id;
END $$;
REVOKE ALL ON FUNCTION public.academy_set_course_library_fields(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academy_set_course_library_fields(uuid, text, uuid) TO authenticated;

CREATE FUNCTION public.academy_library_summary(p_course_ids uuid[])
RETURNS TABLE (course_id uuid, modules integer, minutes integer, videos integer, materials integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT c.id,
        count(l.id)::integer,
        COALESCE(sum(l.estimated_minutes), 0)::integer,
        COALESCE(sum((SELECT count(*) FROM jsonb_array_elements(l.attachments) a WHERE a->>'mime_type' = 'video/mp4')), 0)::integer,
        COALESCE(sum((SELECT count(*) FROM jsonb_array_elements(l.attachments) a WHERE COALESCE(a->>'mime_type', '') NOT IN ('video/mp4', 'text/vtt'))), 0)::integer
    FROM public.courses c
    LEFT JOIN public.course_lessons l ON l.course_id = c.id AND l.version_id = c.published_version_id
    WHERE public.academy_can_access() AND c.id = ANY(p_course_ids) AND c.status = 'published' AND c.published_version_id IS NOT NULL
    GROUP BY c.id
$$;
REVOKE ALL ON FUNCTION public.academy_library_summary(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academy_library_summary(uuid[]) TO authenticated;

DO $$
BEGIN
    IF to_regclass('public.academy_programmes') IS NULL THEN RAISE EXCEPTION 'B4.7: brak tabeli academy_programmes'; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'courses' AND column_name = 'programme_id') THEN RAISE EXCEPTION 'B4.7: brak courses.programme_id'; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'courses' AND column_name = 'topic') THEN RAISE EXCEPTION 'B4.7: brak courses.topic'; END IF;
    IF has_table_privilege('authenticated', 'public.academy_programmes', 'INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'B4.7: authenticated ma zapis programów'; END IF;
    IF NOT has_function_privilege('authenticated', 'public.academy_library_summary(uuid[])', 'EXECUTE') THEN RAISE EXCEPTION 'B4.7: brak EXECUTE podsumowania'; END IF;
END $$;
