-- Existing external webinars retain their original registrations and communication.
-- CSV previews are private, session-bound and immutable; confirmation is one transaction.
BEGIN;
CREATE TABLE public.academy_webinar_roster (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), run_id uuid NOT NULL REFERENCES public.course_runs(id),
 email text NOT NULL CHECK(email=lower(btrim(email)) AND length(email)<=254 AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
 aliases text[] NOT NULL DEFAULT '{}', full_name text NOT NULL CHECK(length(full_name) BETWEEN 1 AND 200),
 user_id uuid REFERENCES public.profiles(id), contractor_id uuid REFERENCES public.contractors(id),
 contractual_email text CHECK(contractual_email IS NULL OR (contractual_email=lower(btrim(contractual_email)) AND contractual_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')),
 contractual_verified_by uuid REFERENCES public.profiles(id), contractual_verified_at timestamptz,
 status text NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed','cancelled')),
 created_by uuid NOT NULL REFERENCES public.profiles(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(run_id,email)
);
CREATE UNIQUE INDEX academy_webinar_roster_user ON public.academy_webinar_roster(run_id,user_id) WHERE user_id IS NOT NULL;
CREATE TABLE public.academy_webinar_import_batches (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), run_id uuid NOT NULL REFERENCES public.course_runs(id),
 session_id uuid REFERENCES public.course_sessions(id), kind text NOT NULL CHECK(kind IN ('registrations','attendance')),
 input_hash text NOT NULL, commit_hash text, source_hash text NOT NULL CHECK(source_hash ~ '^[a-f0-9]{64}$'),
 rows jsonb NOT NULL CHECK(jsonb_typeof(rows)='array' AND jsonb_array_length(rows) BETWEEN 1 AND 500),
 preview jsonb NOT NULL, context jsonb NOT NULL DEFAULT '{}', created_by uuid NOT NULL REFERENCES public.profiles(id), created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '30 minutes', committed_at timestamptz, result jsonb,
 CHECK((kind='attendance')=(session_id IS NOT NULL))
);
CREATE UNIQUE INDEX academy_webinar_committed_input ON public.academy_webinar_import_batches(run_id,kind,COALESCE(session_id,'00000000-0000-0000-0000-000000000000'::uuid),commit_hash) WHERE committed_at IS NOT NULL;
CREATE TABLE public.academy_webinar_attendance (
 roster_id uuid NOT NULL REFERENCES public.academy_webinar_roster(id), session_id uuid NOT NULL REFERENCES public.course_sessions(id),
 attended_seconds integer NOT NULL CHECK(attended_seconds BETWEEN 0 AND 86400), status text NOT NULL CHECK(status IN ('present','insufficient')),
 batch_id uuid NOT NULL REFERENCES public.academy_webinar_import_batches(id), imported_by uuid NOT NULL REFERENCES public.profiles(id), imported_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(roster_id,session_id)
);
ALTER TABLE public.academy_webinar_roster ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academy_webinar_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academy_webinar_attendance ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.academy_webinar_roster,public.academy_webinar_import_batches,public.academy_webinar_attendance FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.academy_webinar_roster,public.academy_webinar_import_batches,public.academy_webinar_attendance TO service_role;
GRANT SELECT ON public.academy_webinar_roster,public.academy_webinar_import_batches,public.academy_webinar_attendance TO authenticated;
CREATE POLICY academy_webinar_admin_roster ON public.academy_webinar_roster FOR SELECT TO authenticated USING(public.academy_can_access() AND public.is_admin());
CREATE POLICY academy_webinar_admin_batch ON public.academy_webinar_import_batches FOR SELECT TO authenticated USING(public.academy_can_access() AND public.is_admin());
CREATE POLICY academy_webinar_admin_attendance ON public.academy_webinar_attendance FOR SELECT TO authenticated USING(public.academy_can_access() AND public.is_admin());

CREATE FUNCTION academy_private.webinar_identity(p_email text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 WITH candidates AS (
  SELECT u.id FROM auth.users u WHERE u.email_confirmed_at IS NOT NULL AND lower(btrim(u.email))=p_email
  UNION SELECT x.user_id FROM public.academy_m365_identities x WHERE lower(btrim(x.verified_email))=p_email
  UNION SELECT c.profile_id FROM public.contractors c JOIN auth.users u ON u.id=c.profile_id
     WHERE lower(btrim(c.email))=p_email AND c.profile_id IS NOT NULL
 ), accounts AS (
 SELECT p.id,p.full_name,(SELECT CASE WHEN count(*)=1 THEN min(lower(btrim(c.email))) END FROM public.contractors c WHERE c.profile_id=p.id AND nullif(btrim(c.email),'') IS NOT NULL) contractual_email
 FROM candidates x JOIN public.profiles p ON p.id=x.id JOIN auth.users u ON u.id=p.id
 WHERE NOT COALESCE(p.is_external,false) AND COALESCE(p.employment_status::text,'active')<>'exited'
 ) SELECT jsonb_build_object('candidates',COALESCE((SELECT jsonb_agg(jsonb_build_object('userId',id,'fullName',full_name,'contractualEmail',contractual_email) ORDER BY id) FROM accounts),'[]'::jsonb),
 'contractAmbiguous',(SELECT count(*)>1 FROM public.contractors WHERE lower(btrim(email))=p_email),
 'contractorId',(SELECT CASE WHEN count(*)=1 THEN min(id::text) END FROM public.contractors WHERE lower(btrim(email))=p_email),
 'contractualEmail',(SELECT CASE WHEN count(*)=1 THEN p_email END FROM public.contractors WHERE lower(btrim(email))=p_email));
$$;

-- Count an account-backed place once even when it came from the webinar CSV.
CREATE FUNCTION academy_private.webinar_occupancy(p_run_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT (SELECT count(*) FROM public.course_run_registrations WHERE run_id=p_run_id AND status='confirmed')+
 (SELECT count(*) FROM public.academy_webinar_roster x WHERE x.run_id=p_run_id AND x.status='confirmed' AND NOT EXISTS(
 SELECT 1 FROM public.course_run_registrations reg WHERE reg.run_id=x.run_id AND reg.user_id=x.user_id AND reg.status='confirmed'));
$$;
CREATE FUNCTION academy_private.webinar_capacity_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_run uuid; v_capacity integer;
BEGIN
 v_run:=(to_jsonb(NEW)->>CASE WHEN TG_TABLE_NAME='course_runs' THEN 'id' ELSE 'run_id' END)::uuid;
 -- Follow the same parent -> run lock order as Academy enrollment/cancellation.
 PERFORM 1 FROM public.courses WHERE id=(SELECT course_id FROM public.course_runs WHERE id=v_run) FOR NO KEY UPDATE;
 SELECT capacity INTO v_capacity FROM public.course_runs WHERE id=v_run FOR UPDATE;
 IF academy_private.webinar_occupancy(v_run)>v_capacity THEN RAISE EXCEPTION 'Limit miejsc obejmuje zapisy Compass i listę webinaru. Zwiększ limit przed importem.'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER academy_webinar_roster_capacity AFTER INSERT OR UPDATE OF run_id,user_id,status ON public.academy_webinar_roster FOR EACH ROW EXECUTE FUNCTION academy_private.webinar_capacity_guard();
CREATE TRIGGER academy_webinar_registration_capacity AFTER INSERT OR UPDATE OF run_id,user_id,status ON public.course_run_registrations FOR EACH ROW EXECUTE FUNCTION academy_private.webinar_capacity_guard();
CREATE TRIGGER academy_webinar_run_capacity AFTER UPDATE OF capacity ON public.course_runs FOR EACH ROW EXECUTE FUNCTION academy_private.webinar_capacity_guard();
CREATE FUNCTION academy_private.webinar_external_only()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.meeting_mode='managed_teams' AND EXISTS(SELECT 1 FROM public.academy_webinar_roster WHERE run_id=NEW.run_id AND status='confirmed') THEN
 RAISE EXCEPTION 'Edycja z importowaną listą webinaru zachowuje istniejące Teams organizatora zewnętrznego.'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER academy_webinar_external_only BEFORE INSERT OR UPDATE OF meeting_mode ON public.course_sessions FOR EACH ROW EXECUTE FUNCTION academy_private.webinar_external_only();

CREATE OR REPLACE FUNCTION academy_private.promote_run_waitlist(p_run_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c public.courses; r public.course_runs; reg record; v_changed boolean:=false;
BEGIN
 SELECT * INTO c FROM public.courses WHERE id=(SELECT course_id FROM public.course_runs WHERE id=p_run_id) FOR NO KEY UPDATE;
 IF NOT FOUND OR c.status<>'published' OR c.legacy_review_required THEN RETURN; END IF;
 SELECT * INTO r FROM public.course_runs WHERE id=p_run_id FOR UPDATE;
 IF NOT FOUND OR r.status<>'published' OR EXISTS(SELECT 1 FROM public.course_sessions WHERE run_id=r.id AND status='scheduled' AND starts_at<=now()) THEN RETURN; END IF;
 FOR reg IN SELECT * FROM public.course_run_registrations WHERE run_id=r.id AND status='waitlisted' ORDER BY created_at,id FOR UPDATE LOOP
  -- A mapped external registrant already has a reserved place; other users remain FIFO.
  IF academy_private.webinar_occupancy(r.id)>=r.capacity AND NOT EXISTS(SELECT 1 FROM public.academy_webinar_roster WHERE run_id=r.id AND user_id=reg.user_id AND status='confirmed') THEN CONTINUE; END IF;
  IF NOT academy_private.user_may_register(reg.user_id,r.version_id) THEN
    UPDATE public.course_run_registrations SET status='cancelled',updated_at=now() WHERE id=reg.id; CONTINUE;
  END IF;
  PERFORM academy_private.confirm_registration(reg.id); v_changed:=true;
 END LOOP;
 IF v_changed THEN PERFORM academy_private.refresh_run_meetings(r.id); END IF;
END $$;


CREATE FUNCTION academy_private.webinar_registration_cancelled()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status='cancelled' THEN
  UPDATE public.academy_webinar_roster SET status='cancelled',updated_at=now() WHERE run_id=NEW.run_id AND user_id=NEW.user_id AND status='confirmed';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER academy_webinar_registration_cancelled AFTER UPDATE OF status ON public.course_run_registrations FOR EACH ROW EXECUTE FUNCTION academy_private.webinar_registration_cancelled();

CREATE FUNCTION academy_private.webinar_enroll_on_publish()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE x record; reg public.course_run_registrations;
BEGIN
 IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status='published' THEN
  FOR x IN SELECT * FROM public.academy_webinar_roster WHERE run_id=NEW.id AND status='confirmed' AND user_id IS NOT NULL ORDER BY created_at,id LOOP
   IF NOT academy_private.user_may_register(x.user_id,NEW.version_id) THEN CONTINUE; END IF;
   SELECT * INTO reg FROM public.course_run_registrations WHERE run_id=NEW.id AND user_id=x.user_id;
   IF NOT FOUND THEN
    INSERT INTO public.course_run_registrations(run_id,user_id,status) VALUES(NEW.id,x.user_id,'waitlisted') RETURNING * INTO reg;
    PERFORM academy_private.confirm_registration(reg.id);
   END IF;
  END LOOP;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER academy_webinar_enroll_on_publish AFTER UPDATE OF status ON public.course_runs FOR EACH ROW EXECUTE FUNCTION academy_private.webinar_enroll_on_publish();

CREATE FUNCTION academy_private.webinar_window_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF OLD.window_confirmed_at IS DISTINCT FROM NEW.window_confirmed_at OR OLD.actual_starts_at IS DISTINCT FROM NEW.actual_starts_at OR OLD.actual_ends_at IS DISTINCT FROM NEW.actual_ends_at THEN
  DELETE FROM public.academy_webinar_attendance WHERE session_id=NEW.id;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER academy_webinar_window_changed AFTER UPDATE OF actual_starts_at,actual_ends_at,window_confirmed_at ON public.course_sessions FOR EACH ROW EXECUTE FUNCTION academy_private.webinar_window_changed();

CREATE FUNCTION academy_private.webinar_seconds(p_intervals jsonb,p_start timestamptz,p_end timestamptz,p_reported_seconds integer DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql IMMUTABLE SET search_path=public,pg_temp AS $$
DECLARE item jsonb; a timestamptz; b timestamptz; ranges tstzmultirange; seconds integer;
BEGIN
 IF jsonb_typeof(p_intervals) IS DISTINCT FROM 'array' OR jsonb_array_length(p_intervals) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Brak poprawnych przedziałów obecności.'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_intervals) LOOP
  IF COALESCE(item->>'start','') !~ '^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:?\d{2})$' OR COALESCE(item->>'end','') !~ '^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:?\d{2})$' THEN RAISE EXCEPTION 'Data obecności wymaga jednoznacznej strefy czasowej.'; END IF;
  a:=(item->>'start')::timestamptz; b:=(item->>'end')::timestamptz;
  IF b<=a OR b>a+interval '24 hours' THEN RAISE EXCEPTION 'Nieprawidłowy przedział obecności.'; END IF;
 END LOOP;
 IF p_reported_seconds IS NOT NULL THEN
  IF jsonb_array_length(p_intervals)<>1 OR (p_intervals->0->>'start')::timestamptz<p_start OR (p_intervals->0->>'end')::timestamptz>p_end OR p_reported_seconds<0 OR p_reported_seconds>floor(extract(epoch FROM (p_intervals->0->>'end')::timestamptz-(p_intervals->0->>'start')::timestamptz)) THEN RAISE EXCEPTION 'Podsumowanie Teams wykracza poza okno zajęć lub ma nieprawidłowy czas. Użyj szczegółowych przedziałów.'; END IF;
  RETURN p_reported_seconds;
 END IF;
 SELECT range_agg(tstzrange(greatest((x->>'start')::timestamptz,p_start),least((x->>'end')::timestamptz,p_end),'[)')) INTO ranges FROM jsonb_array_elements(p_intervals) x WHERE (x->>'end')::timestamptz>p_start AND (x->>'start')::timestamptz<p_end;
 IF ranges IS NULL THEN RAISE EXCEPTION 'Raport nie pokrywa okna wybranego spotkania.'; END IF;
 SELECT floor(sum(extract(epoch FROM upper(x)-lower(x)))) INTO seconds FROM unnest(ranges) x;
 RETURN seconds;
END $$;

CREATE FUNCTION public.academy_preview_webinar_import(p_run_id uuid,p_kind text,p_rows jsonb,p_source_hash text,p_session_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.course_runs; s public.course_sessions; row jsonb; identity jsonb; item jsonb; preview jsonb:='[]'; v_email text; v_user uuid; v_id uuid; v_seconds integer;
BEGIN
 IF NOT public.academy_can_access() OR NOT public.is_admin() THEN RAISE EXCEPTION 'Wymagany administrator.' USING ERRCODE='42501'; END IF;
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
END $$;

CREATE FUNCTION public.academy_commit_webinar_import(p_batch_id uuid,p_resolutions jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE batch public.academy_webinar_import_batches; r public.course_runs; s public.course_sessions; row jsonb; original jsonb; identity jsonb; candidate jsonb; v_user uuid; x public.academy_webinar_roster; reg public.course_run_registrations; v_contract uuid; v_email text; v_contract_email text; v_seconds integer; v_status text; v_threshold integer; v_created integer:=0; v_linked integer:=0; v_attendance integer:=0; v_skipped integer:=0; v_note text; v_result jsonb; v_commit_hash text;
BEGIN
 IF NOT public.academy_can_access() OR NOT public.is_admin() THEN RAISE EXCEPTION 'Wymagany administrator.' USING ERRCODE='42501'; END IF;
 SELECT * INTO batch FROM public.academy_webinar_import_batches WHERE id=p_batch_id AND created_by=auth.uid();
 IF NOT FOUND THEN RAISE EXCEPTION 'Podgląd nie należy do tego administratora.' USING ERRCODE='42501'; END IF;
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
END $$;

CREATE FUNCTION public.academy_webinar_roster(p_run_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT public.academy_can_access() OR NOT public.is_admin() THEN RAISE EXCEPTION 'Wymagany administrator.' USING ERRCODE='42501'; END IF;
 RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('id',x.id,'email',x.email,'fullName',x.full_name,'userId',x.user_id,'contractualEmail',x.contractual_email,'status',x.status,
 'registrationStatus',(SELECT status FROM public.course_run_registrations WHERE run_id=x.run_id AND user_id=x.user_id),
 'match',CASE WHEN x.user_id IS NOT NULL THEN 'matched' ELSE 'unmatched' END,
 'attendance',COALESCE((SELECT jsonb_agg(jsonb_build_object('sessionId',a.session_id,'attendedSeconds',a.attended_seconds,'status',a.status)) FROM public.academy_webinar_attendance a WHERE roster_id=x.id),'[]')) ORDER BY x.full_name,x.id)
 FROM public.academy_webinar_roster x WHERE run_id=p_run_id),'[]');
END $$;

CREATE FUNCTION public.academy_verify_webinar_contractual_email(p_roster_id uuid,p_email text,p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE x public.academy_webinar_roster; v_email text:=lower(btrim(p_email));
BEGIN
 IF NOT public.academy_can_access() OR NOT public.is_admin() THEN RAISE EXCEPTION 'Wymagany administrator.' USING ERRCODE='42501'; END IF;
 IF COALESCE(length(btrim(p_note)),0) NOT BETWEEN 10 AND 2000 OR v_email IS NULL OR length(v_email)>254 OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'Podaj poprawny adres z umowy i uzasadnienie weryfikacji.'; END IF;
 SELECT * INTO x FROM public.academy_webinar_roster WHERE id=p_roster_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Nie znaleziono uczestnika.'; END IF;
 IF EXISTS(SELECT 1 FROM public.academy_webinar_roster WHERE run_id=x.run_id AND id<>x.id AND contractual_email=v_email AND status='confirmed') THEN RAISE EXCEPTION 'Adres z umowy jest współdzielony przez inne konto; wyjaśnij to przed eksportem.'; END IF;
 UPDATE public.academy_webinar_roster SET contractual_email=v_email,contractual_verified_by=auth.uid(),contractual_verified_at=now(),updated_at=now() WHERE id=x.id;
 INSERT INTO public.academy_audit_events(actor_id,action,course_id,details) VALUES(auth.uid(),'ACADEMY_WEBINAR_CONTRACT_EMAIL_VERIFIED',(SELECT course_id FROM public.course_runs WHERE id=x.run_id),jsonb_build_object('roster_id',x.id,'run_id',x.run_id,'note',p_note));
END $$;

CREATE FUNCTION public.academy_cancel_webinar_registration(p_roster_id uuid,p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE x public.academy_webinar_roster; r public.course_runs;
BEGIN
 IF NOT public.academy_can_access() OR NOT public.is_admin() THEN RAISE EXCEPTION 'Wymagany administrator.' USING ERRCODE='42501'; END IF;
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
END $$;

CREATE FUNCTION public.academy_export_webinar_mailing_list(p_run_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE rows jsonb; targets jsonb; missing integer; r public.course_runs;
BEGIN
 IF NOT public.academy_can_access() OR NOT public.is_admin() THEN RAISE EXCEPTION 'Wymagany administrator.' USING ERRCODE='42501'; END IF;
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
END $$;

-- Keep every catalog/detail projection consistent with the reserved external places.
ALTER FUNCTION public.academy_list_runs(uuid,uuid) SET SCHEMA academy_private;
ALTER FUNCTION public.academy_list_runs_page(uuid,integer,integer,text,timestamptz,timestamptz,uuid[]) SET SCHEMA academy_private;
REVOKE ALL ON FUNCTION academy_private.academy_list_runs(uuid,uuid),academy_private.academy_list_runs_page(uuid,integer,integer,text,timestamptz,timestamptz,uuid[]) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.academy_list_runs(p_course_id uuid DEFAULT NULL,p_run_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT COALESCE(jsonb_agg(jsonb_set(x,'{confirmedCount}',to_jsonb(academy_private.webinar_occupancy((x->>'id')::uuid))) ORDER BY ord),'[]')
 FROM jsonb_array_elements(academy_private.academy_list_runs(p_course_id,p_run_id)) WITH ORDINALITY t(x,ord);
$$;
CREATE FUNCTION public.academy_list_runs_page(p_course_id uuid,p_offset integer,p_limit integer,p_scope text,p_window_start timestamptz,p_window_end timestamptz,p_course_ids uuid[])
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT COALESCE(jsonb_agg(jsonb_set(x,'{confirmedCount}',to_jsonb(academy_private.webinar_occupancy((x->>'id')::uuid))) ORDER BY ord),'[]')
 FROM jsonb_array_elements(academy_private.academy_list_runs_page(p_course_id,p_offset,p_limit,p_scope,p_window_start,p_window_end,p_course_ids)) WITH ORDINALITY t(x,ord);
$$;
REVOKE ALL ON FUNCTION public.academy_list_runs(uuid,uuid),public.academy_list_runs_page(uuid,integer,integer,text,timestamptz,timestamptz,uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.academy_list_runs(uuid,uuid),public.academy_list_runs_page(uuid,integer,integer,text,timestamptz,timestamptz,uuid[]) TO authenticated;

DO $$ DECLARE fn regprocedure; BEGIN
 FOR fn IN SELECT oid::regprocedure FROM pg_proc WHERE pronamespace='academy_private'::regnamespace AND proname LIKE 'webinar_%' LOOP EXECUTE 'REVOKE ALL ON FUNCTION '||fn||' FROM PUBLIC,anon,authenticated'; END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.academy_preview_webinar_import(uuid,text,jsonb,text,uuid),public.academy_commit_webinar_import(uuid,jsonb),public.academy_webinar_roster(uuid),public.academy_verify_webinar_contractual_email(uuid,text,text),public.academy_export_webinar_mailing_list(uuid),public.academy_cancel_webinar_registration(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.academy_preview_webinar_import(uuid,text,jsonb,text,uuid),public.academy_commit_webinar_import(uuid,jsonb),public.academy_webinar_roster(uuid),public.academy_verify_webinar_contractual_email(uuid,text,text),public.academy_export_webinar_mailing_list(uuid),public.academy_cancel_webinar_registration(uuid,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
