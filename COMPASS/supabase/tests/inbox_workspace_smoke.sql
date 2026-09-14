BEGIN;
SELECT set_config('request.jwt.claim.sub', (SELECT id::text FROM public.profiles WHERE role='admin' LIMIT 1), true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
    v_id uuid := gen_random_uuid();
    v_category uuid;
    v_revision timestamptz := now() - interval '2 days';
    v_new_revision timestamptz;
    v_edit jsonb;
    v_rejected boolean;
    v_count integer;
BEGIN
    SELECT id INTO STRICT v_category FROM public.support_categories WHERE slug='inbox_grafika';
    INSERT INTO public.support_tickets (id,user_id,category_id,subject,body_md,updated_at)
    VALUES (v_id,auth.uid(),v_category,'KANBAN transaction smoke','Temporary record; transaction rolls back',v_revision);
    INSERT INTO public.support_inbox_meta (ticket_id,due_date) VALUES (v_id,now());
    v_edit := jsonb_build_object('subject','KANBAN smoke updated','body_md','Confirmed workspace metadata and ticket update','category_id',v_category,'assignee_id',NULL,'work_area','marketing','priority_level','P1','planned_due_date','2026-10-01','waiting_for','Akceptacja materiału','follow_up_date','2026-09-20','checklist',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'text','Publikacja','done',true)),'materials',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'label','Dokumentacja','url','https://example.com/material')));
    v_new_revision := public.update_inbox_workspace(v_id,v_revision,v_edit);
    SELECT count(*) INTO v_count FROM public.support_tickets t JOIN public.support_inbox_meta m ON m.ticket_id=t.id WHERE t.id=v_id AND t.subject='KANBAN smoke updated' AND m.work_area='marketing' AND m.planned_due_date='2026-10-01' AND m.follow_up_date='2026-09-20' AND m.checklist->0->>'done'='true' AND m.materials->0->>'url'='https://example.com/material';
    IF v_count <> 1 THEN RAISE EXCEPTION 'SMOKE: fields not saved'; END IF;
    v_rejected := false;
    BEGIN
        PERFORM public.update_inbox_workspace(v_id,v_revision,v_edit || '{"subject":"stale overwrite"}');
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM NOT LIKE '%zmieniona przez inną osobę%' THEN RAISE; END IF;
        v_rejected := true;
    END;
    IF NOT v_rejected THEN RAISE EXCEPTION 'SMOKE: stale editor accepted'; END IF;
    v_rejected := false;
    BEGIN
        PERFORM public.update_inbox_workspace(v_id,v_new_revision,v_edit || jsonb_build_object('materials',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'label','Unsafe','url','javascript:alert(1)'))));
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM NOT LIKE '%Nieprawidłowy link%' THEN RAISE; END IF;
        v_rejected := true;
    END;
    IF NOT v_rejected THEN RAISE EXCEPTION 'SMOKE: script link accepted'; END IF;
    PERFORM set_config('request.jwt.claim.sub','',true);
    v_rejected := false;
    BEGIN
        PERFORM public.update_inbox_workspace(v_id,v_new_revision,v_edit);
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM NOT LIKE '%uprawnienia%' THEN RAISE; END IF;
        v_rejected := true;
    END;
    IF NOT v_rejected THEN RAISE EXCEPTION 'SMOKE: unauthenticated edit accepted'; END IF;
END $$;
ROLLBACK;
SELECT 'PASS: atomic save, planned dates, checklist, links, stale revision, invalid URL and auth guard; all test data rolled back' AS result;
