-- Smoke B0.6. Lokalnie: academy_drafts_stub.sql, migracja B0.6, potem ten plik (kończy się ROLLBACK).
BEGIN;
INSERT INTO public.profiles(id,role) VALUES
 ('00000000-0000-4000-8000-00000000000a','admin'),
 ('00000000-0000-4000-8000-00000000000b','talent_community'),
 ('00000000-0000-4000-8000-00000000000c','consultant');
INSERT INTO public.courses(id,author_id,title,status) VALUES
 ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-00000000000b','Pusty szkic','draft'),
 ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-00000000000b','Szkic z zapisem','draft'),
 ('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-00000000000b','Atrapa','draft'),
 ('00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-00000000000b','Archiwum','archived');
UPDATE public.courses SET is_rehearsal=true WHERE id='00000000-0000-4000-8000-000000000003';
INSERT INTO public.course_versions(id,course_id) VALUES
 ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000001'),
 ('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000002'),
 ('00000000-0000-4000-8000-000000000014','00000000-0000-4000-8000-000000000004');
UPDATE public.courses SET draft_version_id='00000000-0000-4000-8000-000000000011' WHERE id='00000000-0000-4000-8000-000000000001';
UPDATE public.courses SET draft_version_id='00000000-0000-4000-8000-000000000014' WHERE id='00000000-0000-4000-8000-000000000004';
INSERT INTO public.course_lessons(course_id,version_id) VALUES('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000011');
INSERT INTO public.course_enrollments(course_id) VALUES('00000000-0000-4000-8000-000000000002');
INSERT INTO public.academy_audit_events(action,course_id) VALUES('COURSE_CREATED','00000000-0000-4000-8000-000000000001');
INSERT INTO public.academy_rollout_settings(singleton) VALUES(true);
DO $$
DECLARE v_empty uuid:='00000000-0000-4000-8000-000000000001'; v_active uuid:='00000000-0000-4000-8000-000000000002'; v_atrapa uuid:='00000000-0000-4000-8000-000000000003';
 v_arch uuid:='00000000-0000-4000-8000-000000000004'; caught boolean; s text;
BEGIN
 PERFORM set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000000c',true);
 caught:=false; BEGIN PERFORM public.academy_delete_draft_course(v_empty); EXCEPTION WHEN insufficient_privilege THEN caught:=true; END;
 IF NOT caught THEN RAISE EXCEPTION 'obcy usunął szkic'; END IF;

 PERFORM set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000000b',true);
 caught:=false; BEGIN PERFORM public.academy_delete_draft_course(v_active); EXCEPTION WHEN raise_exception THEN caught:=SQLERRM='draft_has_activity'; END;
 IF NOT caught THEN RAISE EXCEPTION 'usunięto szkic z zapisem'; END IF;
 caught:=false; BEGIN PERFORM public.academy_delete_draft_course(v_atrapa); EXCEPTION WHEN raise_exception THEN caught:=SQLERRM='rehearsal_course_protected'; END;
 IF NOT caught THEN RAISE EXCEPTION 'usunięto kurs-atrapę'; END IF;
 caught:=false; BEGIN PERFORM public.academy_delete_draft_course(v_arch); EXCEPTION WHEN raise_exception THEN caught:=SQLERRM='unpublished_draft_required'; END;
 IF NOT caught THEN RAISE EXCEPTION 'usunięto archiwum'; END IF;

 caught:=false; BEGIN DELETE FROM public.course_versions WHERE course_id=v_empty; EXCEPTION WHEN raise_exception THEN caught:=SQLERRM='immutable_course_version'; END;
 IF NOT caught THEN RAISE EXCEPTION 'strażnik wpuścił DELETE bez RPC'; END IF;

 PERFORM public.academy_delete_draft_course(v_empty);
 IF EXISTS(SELECT 1 FROM public.courses WHERE id=v_empty) OR EXISTS(SELECT 1 FROM public.course_lessons WHERE course_id=v_empty) THEN RAISE EXCEPTION 'szkic nie zniknął'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.academy_audit_events WHERE action='COURSE_CREATED' AND course_id IS NULL AND details->>'deleted_course_id'=v_empty::text) THEN RAISE EXCEPTION 'audyt stracił historię'; END IF;
 IF COALESCE(current_setting('academy.deleting_draft_course',true),'')<>'' THEN RAISE EXCEPTION 'furtka została otwarta'; END IF;

 caught:=false; BEGIN PERFORM public.academy_restore_course(v_arch); EXCEPTION WHEN insufficient_privilege THEN caught:=true; END;
 IF NOT caught THEN RAISE EXCEPTION 'TCM przywrócił z archiwum'; END IF;
 PERFORM set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000000a',true);
 s:=public.academy_restore_course(v_arch);
 IF s<>'draft' OR (SELECT status FROM public.courses WHERE id=v_arch)<>'draft' THEN RAISE EXCEPTION 'przywrócenie: %',s; END IF;
 caught:=false; BEGIN PERFORM public.academy_restore_course(v_arch); EXCEPTION WHEN raise_exception THEN caught:=SQLERRM='course_not_archived'; END;
 IF NOT caught THEN RAISE EXCEPTION 'drugie przywrócenie przeszło'; END IF;
 IF public.academy_reports_start_at() IS NOT NULL THEN RAISE EXCEPTION 'data startu powinna być pusta'; END IF;
 RAISE NOTICE 'B0.6 smoke OK';
END $$;
ROLLBACK;
