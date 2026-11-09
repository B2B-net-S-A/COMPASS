-- B3.10: niezależną akceptację w Akademii prowadzi admin albo TCM (decyzja właściciela z planu budowy).
-- Dotyczy kursu, edycji, materiału edycji, pakietu i przeglądu kursów sprzed wersjonowania.
-- Zasada czterech oczu zostaje: autor i współtwórca wersji lub edycji nie zatwierdzają własnej
-- pracy także jako TCM, a token submission_id chroni decyzję jak dotąd.
-- Reszta uprawnień admina (archiwum, rollout, Teams, certyfikaty, trenerzy) się nie zmienia.
--
-- Funkcje łatamy w miejscu przez pg_get_functiondef, jak w B1.1: zmieniają się tylko warunki
-- wejścia, a ciało zostaje takie, jakie jest w bazie. Brak wzorca przerywa całą migrację.
-- Warunek kolejności: po B0.8 (20261109130000_academy_review_signal.sql), bo tu rozszerzamy
-- odbiorców sygnału w dzwonku; po tcm_full_editor, bo TCM musi mieć już dostęp do treści.
--
-- Cofnięcie: supabase/rollbacks/20261110150000_academy_b3_10_tcm_review.sql.
BEGIN;

DO $pre$
BEGIN
    IF to_regprocedure('academy_private.review_signal()') IS NULL THEN
        RAISE EXCEPTION 'b3_10_wymaga_B0_8: najpierw 20261109130000_academy_review_signal.sql';
    END IF;
    IF to_regprocedure('public.academy_is_global_editor(uuid)') IS NULL THEN
        RAISE EXCEPTION 'b3_10_wymaga_tcm_full_editor: najpierw 20261006080417_academy_tcm_full_editor.sql';
    END IF;
END $pre$;

-- Świadomie osobno od academy_is_global_editor: poszerzenie grona redaktorów nie może
-- po cichu poszerzyć grona osób zatwierdzających.
CREATE FUNCTION academy_private.reviewer_eligible(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT p_user_id IS NOT NULL AND EXISTS (
  SELECT 1 FROM public.profiles p JOIN auth.users u ON u.id=p.id
  WHERE p.id=p_user_id AND p.role::text IN ('admin','talent_community')
   AND NOT COALESCE(p.is_external,false)
   AND COALESCE(p.employment_status::text,'active')<>'exited'
 );
$$;
REVOKE ALL ON FUNCTION academy_private.reviewer_eligible(uuid) FROM PUBLIC,anon,authenticated;

-- Bez parametru: pyta tylko o własne konto. Aplikacja wykrywa nią, czy migracja już jest.
CREATE FUNCTION public.academy_is_reviewer()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT public.academy_can_access() AND academy_private.reviewer_eligible(auth.uid());
$$;
REVOKE ALL ON FUNCTION public.academy_is_reviewer() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.academy_is_reviewer() TO authenticated,service_role;

DO $migration$
DECLARE v_patch text[]; v_def text; v_new text;
BEGIN
    FOREACH v_patch SLICE 1 IN ARRAY ARRAY[
        ['public.academy_can_review_version(uuid)',
         $old$public.academy_can_access() AND public.is_admin() AND EXISTS$old$,
         $new$public.academy_can_access() AND public.academy_is_reviewer() AND EXISTS$new$],
        ['public.academy_can_review_run(uuid)',
         $old$public.academy_can_access() AND public.is_admin() AND EXISTS$old$,
         $new$public.academy_can_access() AND public.academy_is_reviewer() AND EXISTS$new$],
        ['public.academy_review_course(uuid,boolean,text)',
         $old$NOT public.is_admin() THEN RAISE EXCEPTION 'admin_required'$old$,
         $new$NOT public.academy_is_reviewer() THEN RAISE EXCEPTION 'reviewer_required'$new$],
        ['public.academy_review_course(uuid,boolean,text,uuid)',
         $old$NOT public.is_admin() THEN RAISE EXCEPTION 'admin_required'$old$,
         $new$NOT public.academy_is_reviewer() THEN RAISE EXCEPTION 'reviewer_required'$new$],
        ['public.academy_publish_run(uuid)',
         $old$NOT public.is_admin() THEN RAISE EXCEPTION 'Publikacja terminu wymaga administratora.'$old$,
         $new$NOT public.academy_is_reviewer() THEN RAISE EXCEPTION 'reviewer_required'$new$],
        ['public.academy_review_handover(uuid,boolean,text)',
         $old$not public.is_admin() then raise exception 'admin_required'$old$,
         $new$not public.academy_is_reviewer() then raise exception 'reviewer_required'$new$],
        ['public.academy_review_run_material(uuid,text,text)',
         $old$not public.is_admin() then raise exception 'admin_required'$old$,
         $new$not public.academy_is_reviewer() then raise exception 'reviewer_required'$new$],
        -- Admin zachowuje dotychczasową regułę (tylko osoba wgrywająca odpada). TCM ma pełną
        -- niezależność edycji, bo jako redaktor globalny może być autorem albo współtwórcą.
        ['public.academy_review_run_material(uuid,text,text)',
         $old$then raise exception 'Własny materiał musi zatwierdzić inny administrator.'; end if;$old$,
         $new$then raise exception 'Własny materiał musi zatwierdzić inna osoba.'; end if;
 if p_decision='approve' and not public.is_admin() and not public.academy_can_review_run(a.run_id) then raise exception 'independent_admin_review_required' using errcode='42501'; end if;$new$],
        ['academy_private.review_signal()',
         $old$WHERE p.role::text='admin' AND COALESCE(p.employment_status::text,'active')<>'exited'$old$,
         $new$WHERE academy_private.reviewer_eligible(p.id)$new$]
    ] LOOP
        v_def := pg_get_functiondef(v_patch[1]::regprocedure);
        v_new := replace(v_def, v_patch[2], v_patch[3]);
        IF v_new = v_def THEN RAISE EXCEPTION 'b3_10_wzorzec_nie_znaleziony: %', v_patch[1]; END IF;
        EXECUTE v_new;
    END LOOP;
END $migration$;

NOTIFY pgrst,'reload schema';

DO $check$
DECLARE v_fn text; v_def text;
BEGIN
    FOREACH v_fn IN ARRAY ARRAY[
        'public.academy_can_review_version(uuid)','public.academy_can_review_run(uuid)',
        'public.academy_review_course(uuid,boolean,text)','public.academy_review_course(uuid,boolean,text,uuid)',
        'public.academy_publish_run(uuid)','public.academy_review_handover(uuid,boolean,text)',
        'public.academy_review_run_material(uuid,text,text)'
    ] LOOP
        v_def := pg_get_functiondef(v_fn::regprocedure);
        IF v_def NOT LIKE '%public.academy_is_reviewer()%' THEN RAISE EXCEPTION 'b3_10_brak_recenzenta_w %', v_fn; END IF;
    END LOOP;
    -- Rozszerzenie nie może zgubić zasady czterech oczu ani tokenu zgłoszenia.
    v_def := pg_get_functiondef('public.academy_can_review_version(uuid)'::regprocedure);
    IF v_def NOT LIKE '%c.author_id<>auth.uid()%' OR v_def NOT LIKE '%academy_private.version_contributors%' THEN
        RAISE EXCEPTION 'b3_10_recenzja_wersji_bez_niezaleznosci';
    END IF;
    v_def := pg_get_functiondef('public.academy_can_review_run(uuid)'::regprocedure);
    IF v_def NOT LIKE '%c.author_id<>auth.uid()%' OR v_def NOT LIKE '%academy_private.run_contributors%' THEN
        RAISE EXCEPTION 'b3_10_recenzja_edycji_bez_niezaleznosci';
    END IF;
    v_def := pg_get_functiondef('public.academy_review_course(uuid,boolean,text,uuid)'::regprocedure);
    IF v_def NOT LIKE '%review_submission_changed%' THEN RAISE EXCEPTION 'b3_10_token_zgloszenia_zgubiony'; END IF;
    v_def := pg_get_functiondef('public.academy_review_legacy_course(uuid,boolean,text,uuid)'::regprocedure);
    IF v_def NOT LIKE '%public.academy_can_review_version(%' THEN RAISE EXCEPTION 'b3_10_przeglad_starych_kursow_bez_niezaleznosci'; END IF;
    v_def := pg_get_functiondef('public.academy_review_run_material(uuid,text,text)'::regprocedure);
    IF v_def NOT LIKE '%public.academy_can_review_run(a.run_id)%' THEN RAISE EXCEPTION 'b3_10_material_bez_niezaleznosci_tcm'; END IF;
    IF pg_get_functiondef('academy_private.review_signal()'::regprocedure) LIKE '%p.role::text=''admin''%' THEN
        RAISE EXCEPTION 'b3_10_dzwonek_tylko_dla_admina';
    END IF;
    IF has_function_privilege('anon','public.academy_is_reviewer()','EXECUTE')
        OR NOT has_function_privilege('authenticated','public.academy_is_reviewer()','EXECUTE') THEN
        RAISE EXCEPTION 'b3_10_zle_uprawnienia_academy_is_reviewer';
    END IF;
    IF has_function_privilege('authenticated','academy_private.reviewer_eligible(uuid)','EXECUTE') THEN
        RAISE EXCEPTION 'b3_10_reviewer_eligible_wolalna_z_przegladarki';
    END IF;
END $check$;

COMMIT;
