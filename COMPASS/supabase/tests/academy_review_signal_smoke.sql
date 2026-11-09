-- Smoke B0.8. Lokalnie: academy_local_stub.sql, migracja, potem ten plik (kończy się ROLLBACK).
BEGIN;
INSERT INTO public.profiles(id,role) VALUES
 ('00000000-0000-4000-8000-00000000000a','admin'),                 -- recenzent
 ('00000000-0000-4000-8000-00000000000b','talent_community'),      -- autor
 ('00000000-0000-4000-8000-00000000000c','consultant');            -- obcy
INSERT INTO public.profiles(id,role,employment_status) VALUES('00000000-0000-4000-8000-00000000000d','admin','exited');
INSERT INTO public.courses(id,author_id,title,status) VALUES('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-00000000000b','Kurs','pending_review');
INSERT INTO public.course_versions(id,course_id,status,metadata) VALUES('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','draft','{"title":"Kurs próbny"}');
UPDATE public.courses SET draft_version_id='00000000-0000-4000-8000-000000000002';
DO $$
DECLARE v_c uuid:='00000000-0000-4000-8000-000000000001'; v_v uuid:='00000000-0000-4000-8000-000000000002';
 v_admin uuid:='00000000-0000-4000-8000-00000000000a'; v_author uuid:='00000000-0000-4000-8000-00000000000b'; v_token uuid; v_token2 uuid; n int; caught boolean;
BEGIN
 UPDATE public.course_versions SET status='pending_review' WHERE id=v_v;
 SELECT submission_id INTO v_token FROM public.course_versions WHERE id=v_v;
 SELECT count(*) INTO n FROM public.notifications WHERE user_id=v_admin AND action_url='/admin/learning';
 IF n<>1 THEN RAISE EXCEPTION 'zgłoszenie: recenzent dostał % powiadomień',n; END IF;
 SELECT count(*) INTO n FROM public.notifications WHERE user_id<>v_admin;
 IF n<>0 THEN RAISE EXCEPTION 'zgłoszenie: autor albo były pracownik dostał sygnał (%)',n; END IF;

 PERFORM set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000000c',true);
 caught:=false; BEGIN PERFORM public.academy_withdraw_submission(v_c,v_token); EXCEPTION WHEN insufficient_privilege THEN caught:=true; END;
 IF NOT caught THEN RAISE EXCEPTION 'obcy wycofał zgłoszenie'; END IF;

 PERFORM set_config('request.jwt.claim.sub',v_author::text,true);
 caught:=false; BEGIN PERFORM public.academy_withdraw_submission(v_c,gen_random_uuid()); EXCEPTION WHEN raise_exception THEN caught:=SQLERRM='review_submission_changed'; END;
 IF NOT caught THEN RAISE EXCEPTION 'wycofanie bez aktualnego tokenu przeszło'; END IF;

 PERFORM public.academy_withdraw_submission(v_c,v_token);
 IF (SELECT status FROM public.course_versions WHERE id=v_v)<>'draft' OR (SELECT status FROM public.courses WHERE id=v_c)<>'draft' THEN RAISE EXCEPTION 'wycofanie nie wróciło do szkicu'; END IF;
 SELECT count(*) INTO n FROM public.notifications WHERE user_id=v_admin AND title_pl LIKE 'Wycofano%';
 IF n<>1 THEN RAISE EXCEPTION 'wycofanie: recenzent dostał % sygnałów',n; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.academy_audit_events WHERE action='COURSE_REVIEW_WITHDRAWN') THEN RAISE EXCEPTION 'brak wpisu audytu'; END IF;
 caught:=false; BEGIN PERFORM public.academy_withdraw_submission(v_c,v_token); EXCEPTION WHEN raise_exception THEN caught:=SQLERRM='pending_review_required'; END;
 IF NOT caught THEN RAISE EXCEPTION 'drugie wycofanie przeszło'; END IF;

 UPDATE public.course_versions SET status='pending_review' WHERE id=v_v;
 SELECT submission_id INTO v_token2 FROM public.course_versions WHERE id=v_v;
 IF v_token2=v_token THEN RAISE EXCEPTION 'ponowne zgłoszenie bez nowego tokenu'; END IF;
 SELECT count(*) INTO n FROM public.notifications WHERE user_id=v_admin AND title_pl LIKE 'Szkolenie czeka%';
 IF n<>2 THEN RAISE EXCEPTION 'ponowne zgłoszenie: % sygnałów zamiast 2',n; END IF;

 PERFORM set_config('request.jwt.claim.sub',v_admin::text,true);
 UPDATE public.course_versions SET status='published',reviewed_by=v_admin WHERE id=v_v;
 SELECT count(*) INTO n FROM public.notifications WHERE user_id=v_author AND type='course_approved' AND action_url='/learning/tworze/'||v_c||'/edit';
 IF n<>1 THEN RAISE EXCEPTION 'decyzja: autor dostał % sygnałów',n; END IF;
 IF EXISTS(SELECT 1 FROM public.notifications WHERE user_id=v_admin AND type='course_approved') THEN RAISE EXCEPTION 'recenzent dostał sygnał o własnej decyzji'; END IF;
 RAISE NOTICE 'B0.8 smoke OK';
END $$;
ROLLBACK;
