-- Wersja prosta, krok 4 (decyzja właściciela z 2026-11-10): zapowiedź szkolenia na żywo
-- publikuje organizator sam. Jedyna akceptacja drugiej osoby zostaje przy nagraniu
-- (academy_review_run_material, zasada czterech oczu bez zmian).
--
-- academy_publish_announcement publikuje PIERWSZĄ wersję szkolenia na żywo (`live`) bez recenzji,
-- gdy woła ją redaktor globalny (admin albo TCM). Kursy mieszane i we własnym tempie (niosą lekcje
-- i test) oraz poprawki już opublikowanego kursu nadal przechodzą zwykłą recenzję.
-- Dalej edycję i termin zakłada się jak dotąd (academy_create_run wymaga opublikowanej wersji),
-- a edycję publikuje academy_publish_run. Jej wyzwalacz niezależności (guard_run_review) przepuszcza
-- teraz redaktora globalnego dla edycji szkolenia na żywo, bo organizator jest jej twórcą.
-- Nie nalicza punktów za pierwszą publikację (to nagroda autora za recenzowaną treść).
--
-- Kolejność: po 20261006080417_academy_tcm_full_editor.sql (academy_is_global_editor).
-- Cofnięcie: supabase/rollbacks/20261110210000_academy_prosta_zapowiedz_bez_drugiej_osoby.sql.
BEGIN;

DO $pre$
BEGIN
    IF to_regprocedure('public.academy_is_global_editor(uuid)') IS NULL THEN
        RAISE EXCEPTION 'prosta_4_wymaga_tcm_full_editor: najpierw 20261006080417_academy_tcm_full_editor.sql';
    END IF;
END $pre$;

CREATE FUNCTION public.academy_publish_announcement(p_course_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    c public.courses;
    v public.course_versions;
BEGIN
    IF NOT public.academy_can_access() OR NOT public.academy_is_global_editor() THEN
        RAISE EXCEPTION 'organizer_required' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO c FROM public.courses WHERE id = p_course_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'course_not_found'; END IF;
    IF c.status = 'archived' OR c.legacy_review_required THEN RAISE EXCEPTION 'course_archived'; END IF;
    IF c.draft_version_id IS NULL AND c.published_version_id IS NOT NULL THEN RETURN c.published_version_id; END IF;
    -- Poprawka opublikowanego kursu to zmiana treści, nie zapowiedź: idzie do recenzji.
    IF c.published_version_id IS NOT NULL THEN RAISE EXCEPTION 'announcement_draft_required'; END IF;

    SELECT * INTO v FROM public.course_versions WHERE id = c.draft_version_id FOR UPDATE;
    IF NOT FOUND OR v.status NOT IN ('draft', 'pending_review') THEN RAISE EXCEPTION 'announcement_draft_required'; END IF;
    IF COALESCE(v.metadata->>'delivery_mode', 'self_paced') <> 'live' THEN
        RAISE EXCEPTION 'live_course_required';
    END IF;

    UPDATE public.course_versions SET status = 'published', reviewed_by = auth.uid(), reviewed_at = now(), published_at = now(), rejection_reason = NULL
    WHERE id = v.id;
    PERFORM academy_private.mirror_metadata(c.id, v.metadata);
    UPDATE public.courses SET published_version_id = v.id, draft_version_id = NULL, status = 'published',
        reviewed_by = auth.uid(), reviewed_at = now(), published_at = COALESCE(published_at, now()), rejection_reason = NULL
    WHERE id = c.id;
    INSERT INTO public.academy_audit_events(actor_id, action, course_id, details)
    VALUES (auth.uid(), 'ACADEMY_ANNOUNCEMENT_PUBLISHED', c.id, jsonb_build_object('version_id', v.id, 'second_person', false));
    RETURN v.id;
END $$;
REVOKE ALL ON FUNCTION public.academy_publish_announcement(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academy_publish_announcement(uuid) TO authenticated;

-- Edycja szkolenia na żywo: organizator (redaktor globalny) publikuje termin, który sam założył.
-- Pozostałe edycje (kursy mieszane) nadal wymagają osoby spoza autorów i współtwórców.
CREATE OR REPLACE FUNCTION academy_private.guard_run_review()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.status='published' AND OLD.status IS DISTINCT FROM NEW.status AND NOT public.academy_can_review_run(NEW.id)
    AND NOT (public.academy_can_access() AND public.academy_is_global_editor() AND EXISTS(
        SELECT 1 FROM public.course_versions v WHERE v.id=NEW.version_id AND v.metadata->>'delivery_mode'='live')) THEN
    RAISE EXCEPTION 'independent_admin_review_required';
 END IF;
 RETURN NEW;
END $$;

NOTIFY pgrst, 'reload schema';

DO $check$
DECLARE v_def text;
BEGIN
    IF has_function_privilege('anon', 'public.academy_publish_announcement(uuid)', 'EXECUTE')
        OR NOT has_function_privilege('authenticated', 'public.academy_publish_announcement(uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'prosta_4: złe uprawnienia publikacji zapowiedzi';
    END IF;
    v_def := pg_get_functiondef('public.academy_publish_announcement(uuid)'::regprocedure);
    IF v_def NOT LIKE '%academy_is_global_editor()%' OR v_def NOT LIKE '%live_course_required%' OR v_def LIKE '%blended%' THEN
        RAISE EXCEPTION 'prosta_4: publikacja bez warunku organizatora albo szkolenia na żywo';
    END IF;
    v_def := pg_get_functiondef('academy_private.guard_run_review()'::regprocedure);
    IF v_def NOT LIKE '%academy_can_review_run(NEW.id)%' OR v_def NOT LIKE '%''live''%' THEN
        RAISE EXCEPTION 'prosta_4: wyzwalacz niezależności edycji bez warunku szkolenia na żywo';
    END IF;
    -- Akceptacja nagrania nadal wymaga drugiej osoby.
    IF pg_get_functiondef('public.academy_review_run_material(uuid,text,text)'::regprocedure) NOT LIKE '%uploaded_by=auth.uid()%' THEN
        RAISE EXCEPTION 'prosta_4: akceptacja nagrania bez zasady czterech oczu';
    END IF;
END $check$;

COMMIT;
