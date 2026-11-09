-- B4.5: limit materiałów autora konfigurowany w bazie, bez limitu dla redakcji (admin, TCM).
-- Dotąd 10 GB było wpisane na sztywno w ciele funkcji rezerwujących materiał.
-- Zmiana limitu: UPDATE public.academy_storage_settings SET author_limit_bytes = <bajty>;
-- Cofnięcie: PITR albo ponowne zastosowanie definicji funkcji z migracji źródłowych.

CREATE TABLE public.academy_storage_settings (
    id boolean PRIMARY KEY DEFAULT true CHECK (id),
    author_limit_bytes bigint NOT NULL DEFAULT 10737418240 CHECK (author_limit_bytes > 0),
    updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.academy_storage_settings(id) VALUES (true);
ALTER TABLE public.academy_storage_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.academy_storage_settings FROM PUBLIC, anon, authenticated;

CREATE FUNCTION academy_private.assert_author_storage(p_size_bytes bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_limit bigint;
    v_used bigint;
BEGIN
    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'talent_community')) THEN RETURN; END IF;
    SELECT author_limit_bytes INTO v_limit FROM public.academy_storage_settings;
    SELECT COALESCE(sum(size_bytes), 0) INTO v_used FROM public.course_materials WHERE uploaded_by = auth.uid() AND purged_at IS NULL;
    IF v_used + p_size_bytes > v_limit THEN
        RAISE EXCEPTION 'Przekroczony limit materiałów autora: zajęte % z % GB, ten plik ma % GB. Usuń niepotrzebne materiały albo poproś administratora Akademii o podniesienie limitu.',
            round(v_used / 1073741824.0, 2), round(v_limit / 1073741824.0, 2), round(p_size_bytes / 1073741824.0, 2)
            USING ERRCODE = 'P0001';
    END IF;
END $$;
REVOKE ALL ON FUNCTION academy_private.assert_author_storage(bigint) FROM PUBLIC, anon, authenticated;

-- Definicje na produkcji mogły się różnić od plików w repo, więc podmieniamy fragment
-- w aktualnej treści funkcji. Brak dopasowania przerywa migrację zamiast zostawić stary limit.
DO $$
DECLARE
    target record;
    source text;
    patched text;
    v_count integer := 0;
BEGIN
    FOR target IN
        SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.prosrc LIKE '%10737418240%'
    LOOP
        source := pg_get_functiondef(target.oid);
        patched := regexp_replace(source,
            'if\s*\(select coalesce\(sum\(size_bytes\),0\) from public\.course_materials where uploaded_by=auth\.uid\(\) and purged_at is null\)\+p_size_bytes>10737418240 then raise exception ''[^'']*''[^;]*;\s*end if;',
            'perform academy_private.assert_author_storage(p_size_bytes);', 'gi');
        IF patched = source THEN RAISE EXCEPTION 'B4.5: nie rozpoznano limitu w %', target.oid::regprocedure; END IF;
        EXECUTE patched;
        v_count := v_count + 1;
    END LOOP;
    IF v_count = 0 THEN RAISE EXCEPTION 'B4.5: nie znaleziono funkcji z limitem autora'; END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.prosrc LIKE '%10737418240%'
    ) THEN RAISE EXCEPTION 'B4.5: limit nadal wpisany na sztywno'; END IF;
    IF (SELECT count(*) FROM public.academy_storage_settings) <> 1 THEN RAISE EXCEPTION 'B4.5: brak wiersza ustawień'; END IF;
    IF has_table_privilege('authenticated', 'public.academy_storage_settings', 'SELECT') THEN RAISE EXCEPTION 'B4.5: ustawienia widoczne dla authenticated'; END IF;
END $$;
