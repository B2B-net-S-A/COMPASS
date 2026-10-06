-- Academy-only global authoring for real TCM accounts. HR/admin identity,
-- rollout administration, Microsoft configuration and independent review stay
-- unchanged. Published program versions, certificates and storage are immutable.
BEGIN;

CREATE FUNCTION public.academy_is_global_editor(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT p_user_id IS NOT NULL AND EXISTS (
  SELECT 1 FROM public.profiles p JOIN auth.users u ON u.id=p.id
  WHERE p.id=p_user_id AND p.role::text IN ('admin','talent_community')
   AND NOT COALESCE(p.is_external,false)
   AND COALESCE(p.employment_status::text,'active')<>'exited'
 );
$$;
REVOKE ALL ON FUNCTION public.academy_is_global_editor(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.academy_is_global_editor(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION academy_private.rollout_allows_user(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT public.academy_is_global_editor(p_user_id) OR EXISTS (
  SELECT 1 FROM public.profiles p JOIN auth.users u ON u.id=p.id
  CROSS JOIN public.academy_rollout_settings s WHERE p.id=p_user_id
   AND p.role::text='consultant' AND NOT COALESCE(p.is_external,false)
   AND COALESCE(p.employment_status::text,'active')<>'exited'
   AND (s.mode='open' OR (s.mode='pilot' AND p.id=ANY(s.pilot_user_ids)))
 );
$$;

CREATE OR REPLACE FUNCTION academy_private.trainer_eligible(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT academy_private.rollout_allows_user(p_user_id) AND (
  public.academy_is_global_editor(p_user_id) OR EXISTS (
   SELECT 1 FROM public.profiles p JOIN public.academy_user_capabilities g ON g.user_id=p.id
   WHERE p.id=p_user_id AND p.role::text='consultant' AND g.can_train AND g.revoked_at IS NULL
  )
 );
$$;

CREATE OR REPLACE FUNCTION public.academy_is_trainer()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT auth.uid() IS NOT NULL AND academy_private.trainer_eligible(auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.academy_can_edit_course_as(p_course_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
 SELECT academy_private.trainer_eligible(p_user_id) AND EXISTS(SELECT 1 FROM public.courses c JOIN public.profiles p ON p.id=p_user_id
 WHERE c.id=p_course_id AND (public.academy_is_global_editor(p_user_id) OR c.author_id=p_user_id OR EXISTS(SELECT 1 FROM public.course_staff s
 WHERE s.course_id=c.id AND s.user_id=p_user_id AND s.role='editor' AND s.revoked_at IS NULL)));
$function$;

CREATE OR REPLACE FUNCTION public.academy_can_lead_course_as(p_course_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
 SELECT academy_private.trainer_eligible(p_user_id) AND EXISTS(SELECT 1 FROM public.courses c JOIN public.profiles p ON p.id=p_user_id
 WHERE c.id=p_course_id AND (public.academy_is_global_editor(p_user_id) OR c.author_id=p_user_id OR EXISTS(SELECT 1 FROM public.course_staff s
 WHERE s.course_id=c.id AND s.user_id=p_user_id AND s.role='facilitator' AND s.revoked_at IS NULL)));
$function$;

CREATE OR REPLACE FUNCTION public.academy_can_assign_staff(p_course_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
 SELECT public.academy_is_trainer() AND EXISTS(SELECT 1 FROM public.courses WHERE id=p_course_id AND (author_id=auth.uid() OR public.academy_is_global_editor()));
$function$;

CREATE OR REPLACE FUNCTION public.academy_rollout_access()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
 SELECT jsonb_build_object('mode',s.mode,'allowed',public.academy_can_access(),
  'isPilot',s.mode='pilot' AND public.academy_can_access() AND NOT public.academy_is_global_editor())
 FROM public.academy_rollout_settings s;
$function$;

CREATE OR REPLACE FUNCTION public.academy_teaching_courses()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
 SELECT COALESCE(jsonb_agg(to_jsonb(c)||jsonb_build_object('can_edit',public.academy_can_manage_course(c.id),'can_lead',public.academy_can_lead_course(c.id),
 'can_manage_assigned_runs',EXISTS(SELECT 1 FROM public.course_runs r WHERE r.course_id=c.id AND public.academy_can_manage_run(r.id))) ORDER BY c.updated_at DESC),'[]')
 FROM public.courses c WHERE public.academy_is_trainer() AND (public.academy_is_global_editor() OR c.author_id=auth.uid()
 OR EXISTS(SELECT 1 FROM public.course_staff s WHERE s.course_id=c.id AND s.user_id=auth.uid() AND s.revoked_at IS NULL)
 OR EXISTS(SELECT 1 FROM public.course_runs r JOIN public.course_run_staff s ON s.run_id=r.id WHERE r.course_id=c.id AND s.user_id=auth.uid() AND s.revoked_at IS NULL));
$function$;

CREATE OR REPLACE FUNCTION public.academy_create_course(p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_metadata jsonb; v_rules jsonb; v_course uuid; v_version uuid; v_slug text; v_mode text;
BEGIN
    IF NOT public.academy_is_trainer() THEN RAISE EXCEPTION 'trainer_required' USING ERRCODE='42501'; END IF;
    v_mode:=COALESCE(p_input->>'delivery_mode','self_paced');
    v_metadata:=jsonb_build_object(
        'title',trim(p_input->>'title'),'description',p_input->>'description','category',trim(p_input->>'category'),
        'tags',COALESCE(p_input->'tags','[]'),'level',COALESCE(p_input->>'level','beginner'),
        'duration_minutes',(p_input->>'duration_minutes')::integer,'cover_image_url',p_input->>'cover_image_url',
        'delivery_mode',v_mode,'course_type',CASE WHEN public.academy_is_global_editor() THEN COALESCE(p_input->>'course_type','consultant') ELSE 'consultant' END,
        'is_official',public.academy_is_global_editor() AND COALESCE((p_input->>'is_official')::boolean,false),
        'prerequisite_course_ids',COALESCE(p_input->'prerequisite_course_ids','[]'));
    v_rules:=jsonb_build_object('quiz_required',v_mode<>'live','quiz_pass_percent',80,
        'require_all_lessons',v_mode<>'live','attendance_percent',80) || COALESCE(p_input->'completion_rules','{}');
    PERFORM academy_private.validate_metadata(v_metadata,v_rules);
    v_slug:=trim(both '-' FROM regexp_replace(lower(translate(v_metadata->>'title','ąćęłńóśźżĄĆĘŁŃÓŚŹŻ','acelnoszzACELNOSZZ')),'[^a-z0-9]+','-','g'));
    v_slug:=COALESCE(NULLIF(left(v_slug,80),''),'kurs')||'-'||left(gen_random_uuid()::text,8);
    INSERT INTO public.courses(author_id,title,slug,category,status,delivery_mode)
    VALUES(auth.uid(),v_metadata->>'title',v_slug,v_metadata->>'category','draft',v_mode) RETURNING id INTO v_course;
    INSERT INTO public.course_versions(course_id,version_number,status,metadata,completion_rules,created_by)
    VALUES(v_course,1,'draft',v_metadata,v_rules,auth.uid()) RETURNING id INTO v_version;
    UPDATE public.courses SET draft_version_id=v_version WHERE id=v_course;
    PERFORM academy_private.mirror_metadata(v_course,v_metadata);
    INSERT INTO public.academy_audit_events(actor_id,action,course_id,details)
    VALUES(auth.uid(),'COURSE_CREATED',v_course,jsonb_build_object('version_id',v_version));
    RETURN jsonb_build_object('course_id',v_course,'version_id',v_version,'slug',v_slug);
END $function$;

CREATE OR REPLACE FUNCTION public.academy_update_course(p_course_id uuid, p_patch jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_id uuid; v public.course_versions%ROWTYPE; v_metadata jsonb; v_rules jsonb;
BEGIN
    IF jsonb_typeof(p_patch) IS DISTINCT FROM 'object' OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_patch) k WHERE k NOT IN (
        'title','description','category','tags','level','duration_minutes','cover_image_url','delivery_mode',
        'course_type','is_official','prerequisite_course_ids','completion_rules')) THEN RAISE EXCEPTION 'invalid_course_patch'; END IF;
    IF NOT public.academy_is_global_editor() AND (p_patch ? 'course_type' OR p_patch ? 'is_official') THEN
        RAISE EXCEPTION 'official_metadata_admin_only' USING ERRCODE='42501';
    END IF;
    v_id:=public.academy_begin_draft(p_course_id);
    SELECT * INTO v FROM public.course_versions WHERE id=v_id FOR UPDATE;
    v_metadata:=v.metadata || (p_patch-'completion_rules');
    v_rules:=v.completion_rules || COALESCE(p_patch->'completion_rules','{}');
    PERFORM academy_private.validate_metadata(v_metadata,v_rules);
    IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(v_metadata->'prerequisite_course_ids') a(value)
        WHERE value::uuid=p_course_id OR NOT EXISTS(SELECT 1 FROM public.courses c WHERE c.id=value::uuid)) THEN
        RAISE EXCEPTION 'invalid_prerequisite';
    END IF;
    UPDATE public.course_versions SET metadata=v_metadata,completion_rules=v_rules,status='draft',
        submitted_at=NULL,reviewed_by=NULL,reviewed_at=NULL,rejection_reason=NULL WHERE id=v_id;
    UPDATE public.courses SET updated_at=now(),status=CASE WHEN published_version_id IS NULL THEN 'draft' ELSE status END
        WHERE id=p_course_id;
    IF NOT EXISTS(SELECT 1 FROM public.courses WHERE id=p_course_id AND published_version_id IS NOT NULL) THEN
        PERFORM academy_private.mirror_metadata(p_course_id,v_metadata);
    END IF;
    RETURN v_id;
END $function$;

CREATE OR REPLACE FUNCTION public.academy_finish_material_upload(p_asset_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare a public.course_materials; stored_size bigint; v_course uuid; v_run uuid;
begin
 select course_id,run_id into v_course,v_run from public.course_materials where id=p_asset_id;
 perform 1 from public.courses where id=v_course for update;
 if v_run is not null then perform 1 from public.course_runs where id=v_run for update; end if;
 select * into a from public.course_materials where id=p_asset_id for update;
 if not found or (a.uploaded_by<>auth.uid() and not public.academy_is_global_editor())
   or not (case when a.run_id is null then public.academy_can_edit_version(a.version_id)
     else public.academy_can_manage_run(a.run_id) and exists(select 1 from public.course_runs r where r.id=a.run_id and r.status<>'cancelled') end)
 then raise exception 'Brak uprawnień'; end if;
 if a.status in ('quarantined','scanning','ready') then return; end if;
 if a.status<>'uploading' then raise exception 'Plik został odrzucony'; end if;
 select (metadata->>'size')::bigint into stored_size from storage.objects where bucket_id='academy-materials' and name=a.storage_path;
 if stored_size is null or stored_size<>a.size_bytes then raise exception 'Plik nie został w całości przesłany'; end if;
 update public.course_materials set status='quarantined' where id=a.id;
end;$function$;

CREATE OR REPLACE FUNCTION public.academy_set_run_caption(p_caption_id uuid, p_video_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  caption public.course_materials;
  video public.course_materials;
  v_course_id uuid;
  v_run_id uuid;
begin
  if auth.uid() is null or not public.academy_can_access() or not public.academy_is_global_editor() then
    raise exception 'admin_required' using errcode='42501';
  end if;
  select course_id,run_id into v_course_id,v_run_id from public.course_materials where id=p_caption_id;
  if v_run_id is null then raise exception 'caption_run_required'; end if;
  perform 1 from public.courses where id=v_course_id for update;
  perform 1 from public.course_runs where id=v_run_id for update;
  select * into caption from public.course_materials where id=p_caption_id for update;
  if not found or caption.run_id is distinct from v_run_id or caption.mime_type<>'text/vtt' then
    raise exception 'caption_run_required';
  end if;
  if p_video_id is not null then
    if caption.status<>'ready' or caption.review_status<>'published' then
      raise exception 'caption_not_published';
    end if;
    select * into video from public.course_materials where id=p_video_id for update;
    if not found or video.run_id is distinct from caption.run_id or video.mime_type<>'video/mp4'
      or video.status<>'ready' or video.review_status<>'published' then
      raise exception 'video_not_published_in_run';
    end if;
  end if;
  if caption.caption_for_asset_id is not distinct from p_video_id then return; end if;
  update public.course_materials set caption_for_asset_id=p_video_id where id=caption.id;
  insert into public.academy_audit_events(actor_id,action,course_id,details)
  values(auth.uid(),'RUN_CAPTION_ASSIGNED',caption.course_id,
    jsonb_build_object('run_id',caption.run_id,'caption_id',caption.id,
      'previous_video_id',caption.caption_for_asset_id,'video_id',p_video_id));
end;$function$;

CREATE OR REPLACE FUNCTION public.academy_reconcile_attendance(p_session_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE s public.course_sessions; r public.course_runs; j public.academy_integration_jobs;
BEGIN
    IF NOT public.academy_can_access() OR NOT public.academy_is_global_editor() THEN
        RAISE EXCEPTION 'Ta operacja wymaga uprawnień administratora.' USING ERRCODE='42501';
    END IF;
    SELECT * INTO s FROM public.course_sessions WHERE id=p_session_id;
    IF NOT FOUND OR NOT public.academy_can_manage_run(s.run_id) THEN
        RAISE EXCEPTION 'Brak uprawnień do obecności.' USING ERRCODE='42501';
    END IF;
    -- Keep the same lock order as the worker ACK and attendance decisions.
    SELECT * INTO r FROM public.course_runs WHERE id=s.run_id FOR UPDATE;
    SELECT * INTO s FROM public.course_sessions WHERE id=p_session_id FOR UPDATE;
    IF r.status<>'published' OR s.status<>'scheduled' OR s.meeting_mode<>'managed_teams'
        OR s.window_confirmed_at IS NULL OR s.actual_ends_at IS NULL OR s.actual_ends_at>now() THEN
        RAISE EXCEPTION 'Ponowienie wymaga zakończonego spotkania firmowego z potwierdzonym czasem zajęć.';
    END IF;
    IF NOT EXISTS(SELECT 1 FROM public.academy_session_integrations i
        WHERE i.session_id=s.id AND i.cancelled_at IS NULL) THEN
        RAISE EXCEPTION 'Najpierw zakończ synchronizację spotkania Teams.';
    END IF;
    SELECT * INTO j FROM public.academy_integration_jobs
        WHERE session_id=s.id AND kind='sync_attendance' AND revision=s.revision FOR UPDATE;
    IF j.status='processing' AND j.lease_expires_at>now() THEN
        RAISE EXCEPTION 'Import obecności jest w trakcie. Poczekaj na wynik i ponów po jego zakończeniu.';
    END IF;
    -- Repeated requests against already queued work are harmless. Expired leases
    -- are cleared; a late ACK cannot commit against the replacement lease.
    IF j.status='pending' THEN RETURN; END IF;
    PERFORM academy_private.enqueue_session(s.id,'sync_attendance');
    UPDATE public.academy_integration_jobs SET status='pending',attempts=0,available_at=now(),
        claimed_by=NULL,lease_token=NULL,lease_expires_at=NULL,last_error=NULL,updated_at=now()
        WHERE session_id=s.id AND kind='sync_attendance' AND revision=s.revision;
    -- academy_complete_job preserves manual decisions and skips completed
    -- enrollments. Reconciliation grants no authority to change certificates.
    INSERT INTO public.academy_audit_events(actor_id,action,course_id,details)
        VALUES(auth.uid(),'ACADEMY_ATTENDANCE_RECONCILIATION_REQUESTED',r.course_id,
            jsonb_build_object('session_id',s.id,'revision',s.revision,'previous_status',j.status));
END $function$;


-- Import preview/commit keeps author ownership, identity snapshots,
-- atomic capacity checks, manual attendance preservation and audit unchanged.

CREATE OR REPLACE FUNCTION public.academy_preview_webinar_import(p_run_id uuid, p_kind text, p_rows jsonb, p_source_hash text, p_session_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE r public.course_runs; s public.course_sessions; row jsonb; identity jsonb; item jsonb; preview jsonb:='[]'; v_email text; v_user uuid; v_id uuid; v_seconds integer;
BEGIN
 IF NOT public.academy_can_access() OR NOT public.academy_is_global_editor() THEN RAISE EXCEPTION 'Wymagany administrator lub TCM.' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM public.course_runs WHERE id=p_run_id;
 IF NOT FOUND OR r.status='cancelled' OR EXISTS(SELECT 1 FROM public.course_sessions WHERE run_id=r.id AND meeting_mode='managed_teams' AND status='scheduled') THEN RAISE EXCEPTION 'Import dotyczy aktywnej edycji z istniejącym zewnętrznym Teams.'; END IF;
 IF p_kind IS NULL OR p_kind NOT IN ('registrations','attendance') OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 500 OR length(p_rows::text)>2000000 OR p_source_hash IS NULL OR p_source_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Nieprawidłowy import.'; END IF;
 IF (p_kind='attendance') IS DISTINCT FROM (p_session_id IS NOT NULL) THEN RAISE EXCEPTION 'Wybierz spotkanie dla obecności.'; END IF;
 IF p_kind='attendance' THEN
  SELECT * INTO s FROM public.course_sessions WHERE id=p_session_id AND run_id=r.id;
  IF NOT FOUND OR r.status<>'published' OR s.status<>'scheduled' OR s.meeting_mode<>'external_link' OR s.window_confirmed_at IS NULL OR s.actual_ends_at>now() THEN RAISE EXCEPTION 'Najpierw potwierdź rzeczywisty czas zakończonego spotkania.'; END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_rows) x GROUP BY lower(btrim(x->>'email')) HAVING count(*)>1) THEN RAISE EXCEPTION 'Powtórzony email w imporcie.'; END IF;
 FOR row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
  v_email:=lower(btrim(row->>'email'));
  IF v_email IS NULL OR length(v_email)>254 OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' OR COALESCE(length(btrim(row->>'fullName')),0) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Nieprawidłowy email lub nazwa uczestnika.'; END IF;
  identity:=academy_private.webinar_identity(v_email);
  v_user:=CASE WHEN jsonb_array_length(identity->'candidates')=1 THEN (identity->'candidates'->0->>'userId')::uuid END;
  item:=jsonb_build_object('email',v_email,'fullName',btrim(row->>'fullName'),'identity',identity,'candidates',identity->'candidates','userId',v_user,
   'match',CASE WHEN (identity->>'contractAmbiguous')::boolean THEN 'ambiguous' WHEN jsonb_array_length(identity->'candidates')=0 THEN 'unmatched' WHEN jsonb_array_length(identity->'candidates')=1 THEN 'matched' ELSE 'ambiguous' END,
   'existing',EXISTS(SELECT 1 FROM public.academy_webinar_roster WHERE run_id=r.id AND (email=v_email OR v_email=ANY(aliases) OR user_id=v_user)));
  IF p_kind='attendance' THEN
   v_seconds:=academy_private.webinar_seconds(row->'intervals',s.actual_starts_at,s.actual_ends_at,(row->>'reportedSeconds')::integer);
   item:=item||jsonb_build_object('attendedSeconds',v_seconds,'intervals',row->'intervals','evidence',COALESCE(row->>'evidence','intervals'),'reportedSeconds',row->'reportedSeconds');
  END IF;
  preview:=preview||jsonb_build_array(item);
 END LOOP;
 INSERT INTO public.academy_webinar_import_batches(run_id,session_id,kind,input_hash,source_hash,rows,preview,context,created_by)
 VALUES(r.id,p_session_id,p_kind,md5(p_rows::text),p_source_hash,p_rows,preview,jsonb_build_object('versionId',r.version_id,'status',r.status,'start',s.actual_starts_at,'end',s.actual_ends_at,'windowConfirmedAt',s.window_confirmed_at,'sessionRevision',s.revision),auth.uid()) RETURNING id INTO v_id;
 RETURN jsonb_build_object('id',v_id,'kind',p_kind,'rows',preview,'expiresAt',now()+interval '30 minutes');
END $function$;

CREATE OR REPLACE FUNCTION public.academy_commit_webinar_import(p_batch_id uuid, p_resolutions jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE batch public.academy_webinar_import_batches; r public.course_runs; s public.course_sessions; row jsonb; original jsonb; identity jsonb; candidate jsonb; v_user uuid; x public.academy_webinar_roster; reg public.course_run_registrations; v_contract uuid; v_email text; v_contract_email text; v_seconds integer; v_status text; v_threshold integer; v_created integer:=0; v_linked integer:=0; v_attendance integer:=0; v_skipped integer:=0; v_note text; v_result jsonb; v_commit_hash text;
BEGIN
 IF NOT public.academy_can_access() OR NOT public.academy_is_global_editor() THEN RAISE EXCEPTION 'Wymagany administrator lub TCM.' USING ERRCODE='42501'; END IF;
 SELECT * INTO batch FROM public.academy_webinar_import_batches WHERE id=p_batch_id AND created_by=auth.uid();
 IF NOT FOUND THEN RAISE EXCEPTION 'Podgląd nie należy do tego operatora.' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.courses WHERE id=(SELECT course_id FROM public.course_runs WHERE id=batch.run_id) FOR NO KEY UPDATE;
 SELECT * INTO r FROM public.course_runs WHERE id=batch.run_id FOR UPDATE;
 SELECT * INTO batch FROM public.academy_webinar_import_batches WHERE id=batch.id FOR UPDATE;
 IF batch.committed_at IS NOT NULL THEN RETURN batch.result||jsonb_build_object('alreadyCommitted',true); END IF;
 v_commit_hash:=md5(batch.rows::text||(SELECT jsonb_agg(value-'existing')::text FROM jsonb_array_elements(batch.preview))||batch.context::text||p_resolutions::text);
 SELECT result INTO v_result FROM public.academy_webinar_import_batches WHERE run_id=batch.run_id AND kind=batch.kind AND session_id IS NOT DISTINCT FROM batch.session_id AND commit_hash=v_commit_hash AND committed_at IS NOT NULL;
 IF FOUND THEN RETURN v_result||jsonb_build_object('alreadyCommitted',true); END IF;
 IF batch.context->>'versionId' IS DISTINCT FROM r.version_id::text THEN RAISE EXCEPTION 'Program edycji zmienił się od podglądu.'; END IF;
 IF batch.expires_at<now() OR r.status='cancelled' OR jsonb_typeof(p_resolutions) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM public.course_sessions WHERE run_id=r.id AND status='scheduled' AND meeting_mode='managed_teams') THEN RAISE EXCEPTION 'Podgląd wygasł lub edycja uległa zmianie. Wczytaj plik ponownie.'; END IF;
 IF batch.kind='attendance' THEN
  SELECT * INTO s FROM public.course_sessions WHERE id=batch.session_id AND run_id=r.id FOR UPDATE;
  IF NOT FOUND OR r.status<>'published' OR s.status<>'scheduled' OR s.meeting_mode<>'external_link' OR s.window_confirmed_at IS NULL OR s.actual_ends_at>now() THEN RAISE EXCEPTION 'Wymagane zakończone spotkanie z potwierdzonym czasem.'; END IF;
  IF (batch.context->>'start')::timestamptz IS DISTINCT FROM s.actual_starts_at OR (batch.context->>'end')::timestamptz IS DISTINCT FROM s.actual_ends_at OR (batch.context->>'windowConfirmedAt')::timestamptz IS DISTINCT FROM s.window_confirmed_at OR (batch.context->>'sessionRevision')::integer IS DISTINCT FROM s.revision THEN RAISE EXCEPTION 'Czas spotkania zmienił się od podglądu. Wczytaj raport ponownie.'; END IF;
  SELECT (completion_rules->>'attendance_percent')::integer INTO v_threshold FROM public.course_versions WHERE id=r.version_id;
 END IF;
 -- Preserve the existing Compass FIFO before new external reservations.
 IF batch.kind='registrations' THEN PERFORM academy_private.promote_run_waitlist(r.id); END IF;
 FOR row IN SELECT value FROM jsonb_array_elements(batch.preview) LOOP
  v_email:=row->>'email'; identity:=academy_private.webinar_identity(v_email);
  IF identity IS DISTINCT FROM row->'identity' THEN RAISE EXCEPTION 'Mapowanie kont uległo zmianie. Przygotuj nowy podgląd.'; END IF;
  v_user:=NULL;
  IF p_resolutions ? v_email THEN
    IF jsonb_typeof(p_resolutions->v_email)='string' THEN
     v_user:=(p_resolutions->>v_email)::uuid;
     IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(identity->'candidates') c WHERE (c->>'userId')::uuid=v_user) THEN RAISE EXCEPTION 'Wybrane konto nie ma zweryfikowanego dopasowania emaila.'; END IF;
    ELSIF jsonb_typeof(p_resolutions->v_email)<>'null' THEN RAISE EXCEPTION 'Nieprawidłowa decyzja mapowania.'; END IF;
  ELSE
    IF jsonb_array_length(identity->'candidates')>1 OR (identity->>'contractAmbiguous')::boolean THEN RAISE EXCEPTION 'Wybierz konto lub zachowanie osobnego uczestnika dla niejednoznacznego emaila.'; END IF;
    v_user:=(row->>'userId')::uuid;
  END IF;
  SELECT * INTO x FROM public.academy_webinar_roster WHERE run_id=r.id AND (email=v_email OR v_email=ANY(aliases) OR (v_user IS NOT NULL AND user_id=v_user)) ORDER BY CASE WHEN email=v_email THEN 0 ELSE 1 END LIMIT 1 FOR UPDATE;
  IF FOUND AND x.user_id IS NOT NULL AND x.user_id IS DISTINCT FROM v_user THEN RAISE EXCEPTION 'Email jest już powiązany z innym kontem. Zweryfikuj tożsamość przed importem.'; END IF;
  v_contract:=(identity->>'contractorId')::uuid; v_contract_email:=identity->>'contractualEmail';
  IF v_user IS NOT NULL THEN
   SELECT c INTO candidate FROM jsonb_array_elements(identity->'candidates') c WHERE (c->>'userId')::uuid=v_user;
   v_contract_email:=candidate->>'contractualEmail';
   SELECT CASE WHEN count(*)=1 THEN min(id::text)::uuid END INTO v_contract FROM public.contractors WHERE profile_id=v_user;
  END IF;
  IF batch.kind='registrations' THEN
   IF x.id IS NULL THEN
    INSERT INTO public.academy_webinar_roster(run_id,email,aliases,full_name,user_id,contractor_id,contractual_email,created_by)
      VALUES(r.id,v_email,ARRAY[v_email],row->>'fullName',v_user,v_contract,v_contract_email,auth.uid()) RETURNING * INTO x;
    v_created:=v_created+1;
   ELSE
    IF x.status='cancelled' THEN RAISE EXCEPTION 'Uczestnik został anulowany w Compass. Przywrócenie wymaga osobnej decyzji administratora.'; END IF;
    UPDATE public.academy_webinar_roster SET aliases=CASE WHEN v_email=ANY(aliases) THEN aliases ELSE array_append(aliases,v_email) END,
      user_id=COALESCE(user_id,v_user),contractor_id=COALESCE(contractor_id,v_contract),contractual_email=COALESCE(contractual_email,v_contract_email),updated_at=now() WHERE id=x.id RETURNING * INTO x;
   END IF;
   IF v_user IS NOT NULL AND r.status='published' AND academy_private.user_may_register(v_user,r.version_id) THEN
    SELECT * INTO reg FROM public.course_run_registrations WHERE run_id=r.id AND user_id=v_user FOR UPDATE;
    IF NOT FOUND THEN
     INSERT INTO public.course_run_registrations(run_id,user_id,status) VALUES(r.id,v_user,'waitlisted') RETURNING * INTO reg;
     -- This person already holds an external reservation, so promotion consumes no extra place.
     PERFORM academy_private.confirm_registration(reg.id); v_linked:=v_linked+1;
    ELSIF reg.status='cancelled' THEN RAISE EXCEPTION 'Konto zrezygnowało z edycji. Nie można przywrócić zapisu przez ponowny import.';
    ELSIF reg.status='waitlisted' THEN RAISE EXCEPTION 'Osoba jest na liście rezerwowej Compass. Zwiększ limit i rozwiąż rezerwę przed importem.';
    END IF;
   END IF;
  ELSE
   SELECT value INTO original FROM jsonb_array_elements(batch.rows) WHERE lower(btrim(value->>'email'))=v_email;
   v_seconds:=academy_private.webinar_seconds(original->'intervals',s.actual_starts_at,s.actual_ends_at,(original->>'reportedSeconds')::integer);
   v_status:=CASE WHEN v_seconds>=ceil(extract(epoch FROM s.actual_ends_at-s.actual_starts_at)*v_threshold/100.0) THEN 'present' ELSE 'insufficient' END;
   SELECT * INTO reg FROM public.course_run_registrations WHERE run_id=r.id AND user_id=v_user AND status='confirmed' FOR UPDATE;
   IF reg.id IS NOT NULL AND (v_user=auth.uid() OR EXISTS(SELECT 1 FROM public.course_enrollments WHERE id=reg.enrollment_id AND completed_at IS NOT NULL)
       OR EXISTS(SELECT 1 FROM public.course_completions WHERE enrollment_id=reg.enrollment_id)
       OR EXISTS(SELECT 1 FROM public.session_attendance WHERE session_id=s.id AND enrollment_id=reg.enrollment_id AND source='manual')) THEN
    v_skipped:=v_skipped+1; CONTINUE;
   END IF;
   IF x.id IS NOT NULL AND x.status='confirmed' THEN
    INSERT INTO public.academy_webinar_attendance(roster_id,session_id,attended_seconds,status,batch_id,imported_by) VALUES(x.id,s.id,v_seconds,v_status,batch.id,auth.uid())
     ON CONFLICT(roster_id,session_id) DO UPDATE SET attended_seconds=EXCLUDED.attended_seconds,status=EXCLUDED.status,batch_id=EXCLUDED.batch_id,imported_by=EXCLUDED.imported_by,imported_at=now();
   END IF;
   IF reg.id IS NULL THEN
    IF x.id IS NULL OR x.status<>'confirmed' THEN RAISE EXCEPTION 'Osoba z raportu nie ma zapisu na tę edycję. Najpierw zaimportuj rejestracje.'; END IF;
    v_attendance:=v_attendance+1;
   ELSE
    v_note:='Zatwierdzony import raportu zewnętrznego Teams ('||batch.source_hash||').';
    INSERT INTO public.session_attendance(session_id,enrollment_id,status,attended_seconds,source,reviewed_by,note,report_ids)
    VALUES(s.id,reg.enrollment_id,v_status,v_seconds,'teams',auth.uid(),v_note,jsonb_build_array('csv:'||batch.source_hash))
    ON CONFLICT(session_id,enrollment_id) DO UPDATE SET status=EXCLUDED.status,attended_seconds=EXCLUDED.attended_seconds,source=EXCLUDED.source,reviewed_by=EXCLUDED.reviewed_by,note=EXCLUDED.note,report_ids=EXCLUDED.report_ids,updated_at=now();
    PERFORM academy_private.finalize_enrollment(reg.enrollment_id); v_attendance:=v_attendance+1;
   END IF;
  END IF;
 END LOOP;
 IF batch.kind='registrations' AND EXISTS(SELECT 1 FROM public.course_run_registrations WHERE run_id=r.id AND status='waitlisted') THEN RAISE EXCEPTION 'Import nie może ominąć istniejącej listy rezerwowej. Zwiększ limit i rozwiąż rezerwę.'; END IF;
 v_result:=jsonb_build_object('created',v_created,'linked',v_linked,'attendance',v_attendance,'preserved',v_skipped,'alreadyCommitted',false);
 UPDATE public.academy_webinar_import_batches SET committed_at=now(),commit_hash=v_commit_hash,result=v_result WHERE id=batch.id;
 INSERT INTO public.academy_audit_events(actor_id,action,course_id,details) VALUES(auth.uid(),'ACADEMY_WEBINAR_IMPORT_APPROVED',r.course_id,jsonb_build_object('run_id',r.id,'session_id',batch.session_id,'batch_id',batch.id,'kind',batch.kind,'source_hash',batch.source_hash,'counts',v_result));
 RETURN v_result;
END $function$;

CREATE OR REPLACE FUNCTION public.academy_webinar_roster(p_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
 IF NOT public.academy_can_access() OR NOT public.academy_is_global_editor() THEN RAISE EXCEPTION 'Wymagany administrator lub TCM.' USING ERRCODE='42501'; END IF;
 RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('id',x.id,'email',x.email,'fullName',x.full_name,'userId',x.user_id,'contractualEmail',x.contractual_email,'status',x.status,
 'registrationStatus',(SELECT status FROM public.course_run_registrations WHERE run_id=x.run_id AND user_id=x.user_id),
 'match',CASE WHEN x.user_id IS NOT NULL THEN 'matched' ELSE 'unmatched' END,
 'attendance',COALESCE((SELECT jsonb_agg(jsonb_build_object('sessionId',a.session_id,'attendedSeconds',a.attended_seconds,'status',a.status)) FROM public.academy_webinar_attendance a WHERE roster_id=x.id),'[]')) ORDER BY x.full_name,x.id)
 FROM public.academy_webinar_roster x WHERE run_id=p_run_id),'[]');
END $function$;

CREATE OR REPLACE FUNCTION public.academy_verify_webinar_contractual_email(p_roster_id uuid, p_email text, p_note text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE x public.academy_webinar_roster; v_email text:=lower(btrim(p_email));
BEGIN
 IF NOT public.academy_can_access() OR NOT public.academy_is_global_editor() THEN RAISE EXCEPTION 'Wymagany administrator lub TCM.' USING ERRCODE='42501'; END IF;
 IF COALESCE(length(btrim(p_note)),0) NOT BETWEEN 10 AND 2000 OR v_email IS NULL OR length(v_email)>254 OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'Podaj poprawny adres z umowy i uzasadnienie weryfikacji.'; END IF;
 SELECT * INTO x FROM public.academy_webinar_roster WHERE id=p_roster_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Nie znaleziono uczestnika.'; END IF;
 IF EXISTS(SELECT 1 FROM public.academy_webinar_roster WHERE run_id=x.run_id AND id<>x.id AND contractual_email=v_email AND status='confirmed') THEN RAISE EXCEPTION 'Adres z umowy jest współdzielony przez inne konto; wyjaśnij to przed eksportem.'; END IF;
 UPDATE public.academy_webinar_roster SET contractual_email=v_email,contractual_verified_by=auth.uid(),contractual_verified_at=now(),updated_at=now() WHERE id=x.id;
 INSERT INTO public.academy_audit_events(actor_id,action,course_id,details) VALUES(auth.uid(),'ACADEMY_WEBINAR_CONTRACT_EMAIL_VERIFIED',(SELECT course_id FROM public.course_runs WHERE id=x.run_id),jsonb_build_object('roster_id',x.id,'run_id',x.run_id,'note',p_note));
END $function$;

CREATE OR REPLACE FUNCTION public.academy_cancel_webinar_registration(p_roster_id uuid, p_note text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE x public.academy_webinar_roster; r public.course_runs;
BEGIN
 IF NOT public.academy_can_access() OR NOT public.academy_is_global_editor() THEN RAISE EXCEPTION 'Wymagany administrator lub TCM.' USING ERRCODE='42501'; END IF;
 IF COALESCE(length(btrim(p_note)),0) NOT BETWEEN 10 AND 2000 THEN RAISE EXCEPTION 'Podaj uzasadnienie anulowania zapisu.'; END IF;
 SELECT * INTO x FROM public.academy_webinar_roster WHERE id=p_roster_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Nie znaleziono uczestnika.'; END IF;
 PERFORM 1 FROM public.courses WHERE id=(SELECT course_id FROM public.course_runs WHERE id=x.run_id) FOR NO KEY UPDATE;
 SELECT * INTO r FROM public.course_runs WHERE id=x.run_id FOR UPDATE;
 SELECT * INTO x FROM public.academy_webinar_roster WHERE id=x.id FOR UPDATE;
 IF r.status='cancelled' OR x.status='cancelled' THEN RETURN; END IF;
 IF EXISTS(SELECT 1 FROM public.course_run_registrations reg JOIN public.course_completions c ON c.enrollment_id=reg.enrollment_id WHERE reg.run_id=r.id AND reg.user_id=x.user_id) THEN RAISE EXCEPTION 'Osoba ma certyfikat; użyj osobnej procedury unieważnienia administratora.'; END IF;
 UPDATE public.academy_webinar_roster SET status='cancelled',updated_at=now() WHERE id=x.id;
 UPDATE public.course_run_registrations SET status='cancelled',calendar_revision=calendar_revision+1,updated_at=now() WHERE run_id=r.id AND user_id=x.user_id AND status<>'cancelled';
 PERFORM academy_private.promote_run_waitlist(r.id);
 INSERT INTO public.academy_audit_events(actor_id,action,course_id,details) VALUES(auth.uid(),'ACADEMY_WEBINAR_REGISTRATION_CANCELLED',r.course_id,jsonb_build_object('run_id',r.id,'roster_id',x.id,'note',p_note));
END $function$;

CREATE OR REPLACE FUNCTION public.academy_export_webinar_mailing_list(p_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE rows jsonb; targets jsonb; missing integer; r public.course_runs;
BEGIN
 IF NOT public.academy_can_access() OR NOT public.academy_is_global_editor() THEN RAISE EXCEPTION 'Wymagany administrator lub TCM.' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM public.course_runs WHERE id=p_run_id;
 IF NOT FOUND OR r.status='cancelled' THEN RAISE EXCEPTION 'Nieaktywna edycja.'; END IF;
 WITH recipients AS (
  SELECT x.id::text AS key,x.full_name,
   CASE WHEN x.contractual_verified_at IS NOT NULL THEN x.contractual_email
    WHEN c.id IS NOT NULL AND lower(btrim(c.email))=x.contractual_email AND (x.user_id IS NULL OR c.profile_id=x.user_id) THEN lower(btrim(c.email)) END AS email
   FROM public.academy_webinar_roster x LEFT JOIN public.contractors c ON c.id=x.contractor_id
   WHERE x.run_id=r.id AND x.status='confirmed'
  UNION ALL
  SELECT reg.id::text,p.full_name,(SELECT CASE WHEN count(*)=1 THEN min(lower(btrim(email))) END FROM public.contractors WHERE profile_id=p.id AND NULLIF(btrim(email),'') IS NOT NULL)
   FROM public.course_run_registrations reg JOIN public.profiles p ON p.id=reg.user_id
   WHERE reg.run_id=r.id AND reg.status='confirmed' AND NOT EXISTS(SELECT 1 FROM public.academy_webinar_roster x WHERE x.run_id=r.id AND x.user_id=reg.user_id AND x.status='confirmed')
 ) SELECT COALESCE(jsonb_agg(jsonb_build_object('email',email,'fullName',full_name,'courseTitle',c.title,'runTitle',r.title) ORDER BY full_name,key),'[]') INTO targets FROM recipients CROSS JOIN public.courses c WHERE c.id=r.course_id;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(targets) x WHERE x->>'email' IS NOT NULL GROUP BY x->>'email' HAVING count(*)>1) THEN RAISE EXCEPTION 'Współdzielony email z umowy. Wyjaśnij adresy przed eksportem.'; END IF;
 SELECT COALESCE(jsonb_agg(x),'[]') INTO rows FROM jsonb_array_elements(targets) x WHERE x->>'email' IS NOT NULL;
 missing:=jsonb_array_length(targets)-jsonb_array_length(rows);
 INSERT INTO public.academy_audit_events(actor_id,action,course_id,details) VALUES(auth.uid(),'ACADEMY_WEBINAR_MAILING_LIST_EXPORTED',r.course_id,jsonb_build_object('run_id',r.id,'count',jsonb_array_length(rows),'excluded_missing_contract_email',missing));
 RETURN jsonb_build_object('rows',rows,'excludedMissingEmail',missing);
END $function$;

-- Privileged reads only; direct writes and deletes remain revoked.
ALTER POLICY academy_webinar_admin_roster ON public.academy_webinar_roster
 USING(public.academy_can_access() AND public.academy_is_global_editor());
ALTER POLICY academy_webinar_admin_batch ON public.academy_webinar_import_batches
 USING(public.academy_can_access() AND public.academy_is_global_editor());
ALTER POLICY academy_webinar_admin_attendance ON public.academy_webinar_attendance
 USING(public.academy_can_access() AND public.academy_is_global_editor());
ALTER POLICY academy_audit_read ON public.academy_audit_events
 USING(public.academy_can_access() AND public.academy_is_global_editor());
ALTER POLICY academy_path_enrollments_read ON public.learning_path_enrollments
 USING(public.academy_can_access() AND (user_id=auth.uid() OR public.academy_is_global_editor()));

-- Paths have no immutable-version/review workflow. A TCM can prepare every
-- draft, but cannot publish a path or mutate a published path's live structure.
-- Original admin policies and permissions are intentionally left intact.
CREATE POLICY academy_tcm_paths_read ON public.learning_paths FOR SELECT TO authenticated
 USING(public.academy_is_global_editor());
CREATE POLICY academy_tcm_paths_insert ON public.learning_paths FOR INSERT TO authenticated
 WITH CHECK(public.academy_is_global_editor() AND status='draft' AND author_id=auth.uid());
CREATE POLICY academy_tcm_paths_update ON public.learning_paths FOR UPDATE TO authenticated
 USING(public.academy_is_global_editor() AND status='draft')
 WITH CHECK(public.academy_is_global_editor() AND status='draft');
CREATE POLICY academy_tcm_path_courses_read ON public.learning_path_courses FOR SELECT TO authenticated
 USING(public.academy_is_global_editor());
CREATE POLICY academy_tcm_path_courses_insert ON public.learning_path_courses FOR INSERT TO authenticated
 WITH CHECK(public.academy_is_global_editor() AND EXISTS(SELECT 1 FROM public.learning_paths p WHERE p.id=path_id AND p.status='draft'));
CREATE POLICY academy_tcm_path_courses_update ON public.learning_path_courses FOR UPDATE TO authenticated
 USING(public.academy_is_global_editor() AND EXISTS(SELECT 1 FROM public.learning_paths p WHERE p.id=path_id AND p.status='draft'))
 WITH CHECK(public.academy_is_global_editor() AND EXISTS(SELECT 1 FROM public.learning_paths p WHERE p.id=path_id AND p.status='draft'));
CREATE POLICY academy_tcm_path_courses_delete ON public.learning_path_courses FOR DELETE TO authenticated
 USING(public.academy_is_global_editor() AND EXISTS(SELECT 1 FROM public.learning_paths p WHERE p.id=path_id AND p.status='draft'));

-- Recheck path status under the same parent lock on every structural write;
-- RLS snapshots alone cannot serialize an administrator publishing a draft.
CREATE FUNCTION academy_private.guard_tcm_path_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_status text; v_path uuid; v_other uuid;
BEGIN
 IF auth.uid() IS NULL OR public.is_admin() THEN RETURN COALESCE(NEW,OLD); END IF;
 IF NOT public.academy_is_global_editor() THEN RETURN COALESCE(NEW,OLD); END IF;
 IF TG_TABLE_NAME='learning_paths' THEN
  IF TG_OP='DELETE' OR NEW.status<>'draft' OR (TG_OP='UPDATE' AND (OLD.status<>'draft' OR NEW.author_id IS DISTINCT FROM OLD.author_id)) THEN
   RAISE EXCEPTION 'path_publication_requires_admin' USING ERRCODE='42501';
  END IF;
 ELSE
  v_path:=CASE WHEN TG_OP='DELETE' THEN OLD.path_id ELSE NEW.path_id END;
  v_other:=CASE WHEN TG_OP='UPDATE' THEN OLD.path_id ELSE v_path END;
  PERFORM 1 FROM public.learning_paths WHERE id IN (v_path,v_other) ORDER BY id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.learning_paths WHERE id IN (v_path,v_other) AND status<>'draft') THEN
   RAISE EXCEPTION 'published_path_is_not_editable_by_tcm' USING ERRCODE='42501';
  END IF;
 END IF;
 RETURN COALESCE(NEW,OLD);
END $$;
REVOKE ALL ON FUNCTION academy_private.guard_tcm_path_write() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER academy_tcm_path_guard BEFORE INSERT OR UPDATE OR DELETE ON public.learning_paths
 FOR EACH ROW EXECUTE FUNCTION academy_private.guard_tcm_path_write();
CREATE TRIGGER academy_tcm_path_courses_guard BEFORE INSERT OR UPDATE OR DELETE ON public.learning_path_courses
 FOR EACH ROW EXECUTE FUNCTION academy_private.guard_tcm_path_write();

-- Scan retries do not bypass quarantine or change scanner permissions.
CREATE OR REPLACE FUNCTION public.academy_admin_retry_material(p_asset_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 if not public.academy_can_access() or not public.academy_is_global_editor() then raise exception 'admin_required'; end if;
 update public.course_materials set status='quarantined',scan_attempts=0,scan_next_attempt_at=now(),scan_started_at=null,scan_error=null
 where id=p_asset_id and scan_attempts>=5 and (status='quarantined' or (status='scanning' and scan_started_at<now()-interval '15 minutes'));
 if not found then raise exception 'material_not_waiting_for_retry'; end if;
 insert into public.academy_audit_events(actor_id,action,details) values(auth.uid(),'MATERIAL_SCAN_RETRIED',jsonb_build_object('asset_id',p_asset_id));
end;$function$;

create or replace function academy_material_policy.staff_metadata(p_asset_id uuid)
returns table (
  uploaded_by uuid,
  review_note text,
  scan_error text,
  scan_attempts integer,
  scan_started_at timestamptz,
  scan_next_attempt_at timestamptz,
  cleanup_token uuid,
  cleanup_attempts integer,
  cleanup_claimed_at timestamptz,
  cleanup_error text
)
language sql stable security definer set search_path = '' as $$
  select a.uploaded_by, a.review_note, a.scan_error,
    case when public.academy_is_global_editor() then a.scan_attempts end,
    case when public.academy_is_global_editor() then a.scan_started_at end,
    case when public.academy_is_global_editor() then a.scan_next_attempt_at end,
    case when public.is_admin() then a.cleanup_token end,
    case when public.is_admin() then a.cleanup_attempts end,
    case when public.is_admin() then a.cleanup_claimed_at end,
    case when public.is_admin() then a.cleanup_error end
  from public.course_materials a
  where a.id = p_asset_id
    and auth.uid() is not null
    and public.academy_can_access()
    and public.academy_can_read_asset(a.id)
    and (public.is_admin() or public.academy_can_manage_course(a.course_id)
      or (a.run_id is not null and public.academy_can_manage_run(a.run_id)));
$$;

-- Queue membership must not depend on the privileged cleanup token, which
-- stays masked for TCM. This non-exposed helper returns only a guarded boolean.
CREATE FUNCTION academy_material_policy.cleanup_pending(p_asset_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT a.cleanup_token IS NOT NULL FROM public.course_materials a
 WHERE a.id=p_asset_id AND auth.uid() IS NOT NULL
  AND public.academy_can_access() AND public.academy_is_global_editor()
  AND public.academy_can_read_asset(a.id);
$$;
REVOKE ALL ON FUNCTION academy_material_policy.cleanup_pending(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION academy_material_policy.cleanup_pending(uuid) TO authenticated;

-- Appended projection; existing column names/order/grants remain unchanged.
CREATE OR REPLACE VIEW public.academy_material_catalog
WITH (security_barrier=true,security_invoker=true) AS
SELECT a.id,a.course_id,a.version_id,a.lesson_id,a.run_id,
 a.filename,a.storage_path,a.mime_type,a.size_bytes,a.status,
 a.review_status,a.created_at,a.purged_at,
 staff.uploaded_by,staff.review_note,staff.scan_error,
 staff.scan_attempts,staff.scan_started_at,staff.scan_next_attempt_at,
 staff.cleanup_token,staff.cleanup_attempts,staff.cleanup_claimed_at,staff.cleanup_error,
 a.caption_for_asset_id,
 academy_material_policy.cleanup_pending(a.id) AS cleanup_pending
FROM public.course_materials a
LEFT JOIN LATERAL academy_material_policy.staff_metadata(a.id) staff ON true;
ALTER VIEW public.academy_material_catalog SET (security_invoker=true);

COMMIT;
