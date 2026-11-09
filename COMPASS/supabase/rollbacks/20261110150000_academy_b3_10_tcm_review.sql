-- Cofnięcie B3.10. Stosuje wyłącznie właściciel. Akceptację znów prowadzi tylko admin;
-- decyzje podjęte w międzyczasie przez TCM zostają w historii i nie są cofane.
BEGIN;

DO $migration$
DECLARE v_patch text[]; v_def text; v_new text;
BEGIN
    FOREACH v_patch SLICE 1 IN ARRAY ARRAY[
        ['public.academy_can_review_version(uuid)',
         $new$public.academy_can_access() AND public.academy_is_reviewer() AND EXISTS$new$,
         $old$public.academy_can_access() AND public.is_admin() AND EXISTS$old$],
        ['public.academy_can_review_run(uuid)',
         $new$public.academy_can_access() AND public.academy_is_reviewer() AND EXISTS$new$,
         $old$public.academy_can_access() AND public.is_admin() AND EXISTS$old$],
        ['public.academy_review_course(uuid,boolean,text)',
         $new$NOT public.academy_is_reviewer() THEN RAISE EXCEPTION 'reviewer_required'$new$,
         $old$NOT public.is_admin() THEN RAISE EXCEPTION 'admin_required'$old$],
        ['public.academy_review_course(uuid,boolean,text,uuid)',
         $new$NOT public.academy_is_reviewer() THEN RAISE EXCEPTION 'reviewer_required'$new$,
         $old$NOT public.is_admin() THEN RAISE EXCEPTION 'admin_required'$old$],
        ['public.academy_publish_run(uuid)',
         $new$NOT public.academy_is_reviewer() THEN RAISE EXCEPTION 'reviewer_required'$new$,
         $old$NOT public.is_admin() THEN RAISE EXCEPTION 'Publikacja terminu wymaga administratora.'$old$],
        ['public.academy_review_handover(uuid,boolean,text)',
         $new$not public.academy_is_reviewer() then raise exception 'reviewer_required'$new$,
         $old$not public.is_admin() then raise exception 'admin_required'$old$],
        ['public.academy_review_run_material(uuid,text,text)',
         $new$not public.academy_is_reviewer() then raise exception 'reviewer_required'$new$,
         $old$not public.is_admin() then raise exception 'admin_required'$old$],
        ['public.academy_review_run_material(uuid,text,text)',
         $new$then raise exception 'Własny materiał musi zatwierdzić inna osoba.'; end if;
 if p_decision='approve' and not public.is_admin() and not public.academy_can_review_run(a.run_id) then raise exception 'independent_admin_review_required' using errcode='42501'; end if;$new$,
         $old$then raise exception 'Własny materiał musi zatwierdzić inny administrator.'; end if;$old$],
        ['academy_private.review_signal()',
         $new$WHERE academy_private.reviewer_eligible(p.id)$new$,
         $old$WHERE p.role::text='admin' AND COALESCE(p.employment_status::text,'active')<>'exited'$old$]
    ] LOOP
        v_def := pg_get_functiondef(v_patch[1]::regprocedure);
        v_new := replace(v_def, v_patch[2], v_patch[3]);
        IF v_new = v_def THEN RAISE EXCEPTION 'b3_10_down_wzorzec_nie_znaleziony: %', v_patch[1]; END IF;
        EXECUTE v_new;
    END LOOP;
END $migration$;

DROP FUNCTION public.academy_is_reviewer();
DROP FUNCTION academy_private.reviewer_eligible(uuid);

NOTIFY pgrst,'reload schema';

DO $check$
BEGIN
    IF to_regprocedure('public.academy_is_reviewer()') IS NOT NULL THEN RAISE EXCEPTION 'b3_10_down_funkcja_zostala'; END IF;
    IF pg_get_functiondef('public.academy_can_review_version(uuid)'::regprocedure) NOT LIKE '%public.is_admin()%' THEN
        RAISE EXCEPTION 'b3_10_down_recenzja_nie_wrocila';
    END IF;
END $check$;

COMMIT;
