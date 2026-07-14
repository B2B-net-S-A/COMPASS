-- Complete SECURITY DEFINER hardening for COMPASS.
-- Recreates the audited 42-function inventory with explicit execution mode,
-- pinned search_path, internal authorization guards, and least-privilege ACLs.

CREATE OR REPLACE FUNCTION private.admin_hard_delete_user_impl(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_blockers text[] := ARRAY[]::text[];
  v_n        integer;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required' USING ERRCODE = 'P0001';
  END IF;

  -- ── Pre-flight: refuse if the account owns business/financial/content data,
  --    or rows that would trip a business-rule trigger during the cascade.
  --    These are exactly the cases that should be ARCHIVED, not hard-deleted.

  -- Financial / business (ON DELETE RESTRICT — would hard-block the FK):
  SELECT count(*) INTO v_n FROM user_rates
    WHERE user_id = p_user_id OR set_by = p_user_id;
  IF v_n > 0 THEN v_blockers := array_append(v_blockers, format('%s stawek', v_n)); END IF;

  SELECT count(*) INTO v_n FROM bonuses
    WHERE recipient_user_id = p_user_id OR proposed_by = p_user_id
       OR cancelled_by = p_user_id OR delivery_consultant_id = p_user_id;
  IF v_n > 0 THEN v_blockers := array_append(v_blockers, format('%s premii', v_n)); END IF;

  SELECT count(*) INTO v_n FROM placements
    WHERE recruiter_id = p_user_id OR delivery_lead_id = p_user_id
       OR imported_by = p_user_id OR cancelled_by = p_user_id
       OR hours_confirmed_by = p_user_id;
  IF v_n > 0 THEN v_blockers := array_append(v_blockers, format('%s placementów', v_n)); END IF;

  SELECT count(*) INTO v_n FROM invoices
    WHERE user_id = p_user_id OR reviewed_by = p_user_id
       OR manager_reviewed_by = p_user_id;
  IF v_n > 0 THEN v_blockers := array_append(v_blockers, format('%s faktur', v_n)); END IF;

  SELECT count(*) INTO v_n FROM incubator_pitches
    WHERE submitter_id = p_user_id OR reviewer_id = p_user_id;
  IF v_n > 0 THEN v_blockers := array_append(v_blockers, format('%s zgłoszeń do inkubatora', v_n)); END IF;

  SELECT count(*) INTO v_n FROM incubator_projects WHERE owner_id = p_user_id;
  IF v_n > 0 THEN v_blockers := array_append(v_blockers, format('%s projektów inkubatora', v_n)); END IF;

  SELECT count(*) INTO v_n FROM learning_paths WHERE author_id = p_user_id;
  IF v_n > 0 THEN v_blockers := array_append(v_blockers, format('%s ścieżek nauki', v_n)); END IF;

  SELECT (SELECT count(*) FROM support_article_attachments WHERE uploaded_by = p_user_id)
       + (SELECT count(*) FROM support_category_materials  WHERE uploaded_by = p_user_id)
    INTO v_n;
  IF v_n > 0 THEN v_blockers := array_append(v_blockers, format('%s materiałów wsparcia', v_n)); END IF;

  -- Content / communication (ON DELETE NO ACTION — would hard-block the FK):
  SELECT count(*) INTO v_n FROM news_posts WHERE author_id = p_user_id;
  IF v_n > 0 THEN v_blockers := array_append(v_blockers, format('%s aktualności', v_n)); END IF;

  SELECT count(*) INTO v_n FROM support_articles WHERE author_id = p_user_id;
  IF v_n > 0 THEN v_blockers := array_append(v_blockers, format('%s artykułów wsparcia', v_n)); END IF;

  SELECT count(*) INTO v_n FROM courses WHERE reviewed_by = p_user_id;
  IF v_n > 0 THEN v_blockers := array_append(v_blockers, format('%s recenzji kursów', v_n)); END IF;

  SELECT (SELECT count(*) FROM conversations WHERE owner_id = p_user_id)
       + (SELECT count(*) FROM messages       WHERE sender_id = p_user_id)
    INTO v_n;
  IF v_n > 0 THEN v_blockers := array_append(v_blockers, format('%s wiadomości/konwersacji', v_n)); END IF;

  SELECT (SELECT count(*) FROM document_versions      WHERE uploaded_by = p_user_id)
       + (SELECT count(*) FROM user_contract_documents WHERE uploaded_by = p_user_id)
    INTO v_n;
  IF v_n > 0 THEN v_blockers := array_append(v_blockers, format('%s dokumentów', v_n)); END IF;

  SELECT count(*) INTO v_n FROM tasks WHERE created_by = p_user_id;
  IF v_n > 0 THEN v_blockers := array_append(v_blockers, format('%s zadań', v_n)); END IF;

  SELECT count(*) INTO v_n FROM system_settings WHERE updated_by = p_user_id;
  IF v_n > 0 THEN v_blockers := array_append(v_blockers, format('%s zmian ustawień', v_n)); END IF;

  SELECT count(*) INTO v_n FROM contracts WHERE created_by = p_user_id;
  IF v_n > 0 THEN v_blockers := array_append(v_blockers, format('%s utworzonych kontraktów', v_n)); END IF;

  SELECT count(*) INTO v_n FROM admin_access_list WHERE added_by = p_user_id;
  IF v_n > 0 THEN v_blockers := array_append(v_blockers, format('%s wpisów listy adminów', v_n)); END IF;

  -- HR admin-actions (ON DELETE SET NULL on tables with append-only / stage
  -- triggers — the SET NULL → UPDATE would trip the trigger during cascade):
  SELECT count(*) INTO v_n FROM exit_interviews
    WHERE user_id = p_user_id OR reviewed_by = p_user_id
       OR invitation_sent_by = p_user_id OR manager_checklist_sent_by = p_user_id
       OR cancelled_by = p_user_id OR manager_snapshot = p_user_id;
  IF v_n > 0 THEN v_blockers := array_append(v_blockers, format('%s wywiadów exit', v_n)); END IF;

  SELECT count(*) INTO v_n FROM timesheets WHERE approved_by = p_user_id;
  IF v_n > 0 THEN v_blockers := array_append(v_blockers, format('%s zaakceptowanych timesheetów', v_n)); END IF;

  SELECT count(*) INTO v_n FROM timesheet_entries
    WHERE override_by = p_user_id OR correction_decided_by = p_user_id;
  IF v_n > 0 THEN v_blockers := array_append(v_blockers, format('%s nadpisań timesheetów', v_n)); END IF;

  SELECT (SELECT count(*) FROM onboarding_tasks  WHERE completed_by = p_user_id)
       + (SELECT count(*) FROM offboarding_tasks WHERE completed_by = p_user_id)
    INTO v_n;
  IF v_n > 0 THEN v_blockers := array_append(v_blockers, format('%s ukończonych zadań HR (dla innych)', v_n)); END IF;

  IF array_length(v_blockers, 1) > 0 THEN
    RAISE EXCEPTION
      'Nie można trwale usunąć konta — ma powiązane dane: %. Użyj „Archiwizuj" zamiast usuwania (dane finansowe/biznesowe muszą zostać zachowane).',
      array_to_string(v_blockers, ', ')
      USING ERRCODE = 'P0001';
  END IF;

  -- ── Clean account: perform the hard delete. The bypass lets the FK cascade
  --    remove this user's lifecycle_events; everything else is CASCADE / safe
  --    SET NULL. Transaction-scoped, so append-only resumes immediately after.
  PERFORM set_config('app.allow_lifecycle_cascade_delete', 'on', true);
  DELETE FROM auth.users WHERE id = p_user_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION private.record_lifecycle_event_impl(p_user_id uuid, p_event_type text, p_actor_id uuid, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor_role text;
  v_event_id uuid;
begin
  if p_user_id is null or p_actor_id is null then
    raise exception 'target and actor are required'
      using errcode = '22023';
  end if;

  if jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object' then
    raise exception 'lifecycle event metadata must be a JSON object'
      using errcode = '22023';
  end if;

  select p.role::text
    into v_actor_role
    from public.profiles as p
   where p.id = p_actor_id;

  if v_actor_role is null
     or v_actor_role not in ('admin', 'talent_community')
  then
    raise exception 'lifecycle manager actor required'
      using errcode = '42501';
  end if;

  insert into public.lifecycle_events (
    user_id,
    event_type,
    metadata,
    created_by
  )
  values (
    p_user_id,
    p_event_type,
    coalesce(p_metadata, '{}'::jsonb),
    p_actor_id
  )
  returning id into v_event_id;

  return v_event_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.start_offboarding_for_user_impl(p_user_id uuid, p_termination_date date, p_scheduled_for date DEFAULT NULL::date, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
    v_role           TEXT;
    v_manager_id     UUID;
    v_hired_at       DATE;
    v_tenure_months  INTEGER;
    v_interview_id   UUID;
    v_scheduled_for  DATE;
BEGIN
    SELECT role::text, manager_id, hired_at
      INTO v_role, v_manager_id, v_hired_at
      FROM profiles
     WHERE id = p_user_id;

    IF v_role IS NULL THEN
        RAISE EXCEPTION 'User % not found in profiles', p_user_id
            USING ERRCODE = 'P0001';
    END IF;

    -- Block double-start
    IF EXISTS (
        SELECT 1 FROM exit_interviews
         WHERE user_id = p_user_id
           AND status <> 'archived'
    ) THEN
        RAISE EXCEPTION 'Active exit interview already exists for user %', p_user_id
            USING ERRCODE = 'P0001';
    END IF;

    -- Compute tenure (rough months)
    v_tenure_months := CASE
        WHEN v_hired_at IS NOT NULL THEN
            (EXTRACT(YEAR FROM AGE(p_termination_date, v_hired_at)) * 12
             + EXTRACT(MONTH FROM AGE(p_termination_date, v_hired_at)))::INTEGER
        ELSE NULL
    END;

    v_scheduled_for := COALESCE(p_scheduled_for, p_termination_date - INTERVAL '3 days');

    -- Update profile lifecycle
    UPDATE profiles
       SET employment_status = 'offboarding',
           termination_date  = p_termination_date
     WHERE id = p_user_id;

    -- Create exit interview (scheduled)
    INSERT INTO exit_interviews (
        user_id, role_snapshot, manager_snapshot, tenure_months,
        scheduled_for, status
    ) VALUES (
        p_user_id, v_role, v_manager_id, v_tenure_months,
        v_scheduled_for, 'scheduled'
    ) RETURNING id INTO v_interview_id;

    -- Seed default offboarding tasks
    INSERT INTO offboarding_tasks (user_id, category, title, description, responsible_role, due_date, position)
    VALUES
        (p_user_id, 'access_revoke', 'Cofnij dostępy systemowe',
         'Azure SSO + Microsoft 365 + Compass + GitHub deploy keys + Supabase service accounts.',
         'admin', p_termination_date, 0),
        (p_user_id, 'equipment_return', 'Zwrot sprzętu firmowego',
         'Laptop, monitor, telefon, akcesoria — checklist u managera.',
         'manager', p_termination_date, 1),
        (p_user_id, 'knowledge_transfer', 'Knowledge transfer do zespołu',
         'Notatki, dokumentacja projektów, handoff spotkania.',
         'employee', p_termination_date - INTERVAL '7 days', 2),
        (p_user_id, 'final_settlement', 'Finalne rozliczenie faktur',
         'Sprawdź czy wszystkie faktury zaakceptowane, ostatni timesheet zamknięty.',
         'finanse', p_termination_date + INTERVAL '14 days', 3),
        (p_user_id, 'docs_archive', 'Archiwizacja dokumentów + zamknięcie exit interview',
         'Po wypełnieniu ankiety przez pracownika TCM oznacza jako reviewed + archiwizuje folder.',
         'tcm', p_termination_date + INTERVAL '7 days', 4);

    -- Audit timeline
    INSERT INTO lifecycle_events (user_id, event_type, metadata, created_by)
    VALUES (
        p_user_id,
        'offboarding_started',
        jsonb_build_object(
            'interview_id', v_interview_id,
            'termination_date', p_termination_date,
            'scheduled_for', v_scheduled_for,
            'tenure_months', v_tenure_months
        ),
        p_actor_id
    );

    RETURN v_interview_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION private.start_onboarding_for_user_impl(p_user_id uuid, p_template_id uuid DEFAULT NULL::uuid, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
    v_template_id   UUID;
    v_role          TEXT;
    v_hired_at      DATE;
    v_progress_id   UUID;
BEGIN
    SELECT role::text, COALESCE(hired_at, CURRENT_DATE)
      INTO v_role, v_hired_at
      FROM profiles
     WHERE id = p_user_id;

    IF v_role IS NULL THEN
        RAISE EXCEPTION 'User % not found in profiles', p_user_id
            USING ERRCODE = 'P0001';
    END IF;

    -- Block double-start
    IF EXISTS (SELECT 1 FROM onboarding_progress WHERE user_id = p_user_id) THEN
        RAISE EXCEPTION 'Onboarding already exists for user %', p_user_id
            USING ERRCODE = 'P0001';
    END IF;

    -- Resolve template
    IF p_template_id IS NOT NULL THEN
        SELECT id INTO v_template_id
          FROM onboarding_templates
         WHERE id = p_template_id AND is_archived = FALSE;
    ELSE
        SELECT id INTO v_template_id
          FROM onboarding_templates
         WHERE target_role = v_role
           AND is_default = TRUE
           AND is_archived = FALSE
         LIMIT 1;
    END IF;

    IF v_template_id IS NULL THEN
        RAISE EXCEPTION 'No active onboarding template found for role % (id param: %)', v_role, p_template_id
            USING ERRCODE = 'P0001';
    END IF;

    -- Create progress row
    INSERT INTO onboarding_progress (user_id, template_id)
    VALUES (p_user_id, v_template_id)
    RETURNING id INTO v_progress_id;

    -- Copy template items → tasks (with computed due_date)
    INSERT INTO onboarding_tasks (
        progress_id, template_item_id, title, description, category, course_slug,
        responsible_role, is_required, requires_file, due_date, position
    )
    SELECT
        v_progress_id,
        ti.id,
        ti.title,
        ti.description,
        ti.category,
        ti.course_slug,
        ti.responsible_role,
        ti.is_required,
        ti.requires_file,
        v_hired_at + (ti.due_offset_days || ' days')::interval,
        ti.position
    FROM onboarding_template_items ti
    WHERE ti.template_id = v_template_id
    ORDER BY ti.position;

    -- Update profile status
    UPDATE profiles
       SET employment_status = 'onboarding'
     WHERE id = p_user_id
       AND employment_status IN ('pending', 'active');

    -- Audit timeline
    INSERT INTO lifecycle_events (user_id, event_type, metadata, created_by)
    VALUES (
        p_user_id,
        'onboarding_started',
        jsonb_build_object(
            'template_id', v_template_id,
            'progress_id', v_progress_id,
            'role', v_role,
            'hired_at', v_hired_at
        ),
        p_actor_id
    );

    RETURN v_progress_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION private.sync_profile_directory()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public.profile_directory (
    id,
    full_name,
    avatar_url,
    job_title,
    department
  )
  values (
    new.id,
    new.full_name,
    new.avatar_url,
    new.job_title,
    new.department
  )
  on conflict (id) do update
  set full_name = excluded.full_name,
      avatar_url = excluded.avatar_url,
      job_title = excluded.job_title,
      department = excluded.department;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_hard_delete_user(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  perform private.admin_hard_delete_user_impl(p_user_id);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_revoke_user_sessions(target_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  if target_user_id is null then
    raise exception 'target_user_id is required' using errcode = '22023';
  end if;

  delete from auth.refresh_tokens where user_id = target_user_id::text;
  delete from auth.sessions where user_id = target_user_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.award_course_points(p_enrollment_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  v_enrollment record;
  v_course record;
  v_student_pts integer;
  v_author_base_pts integer;
  v_multiplier numeric(4, 2);
  v_author_pts integer;
  v_rows_updated integer;
  v_has_passed boolean;
  v_student_rule_code text;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select id, user_id, course_id, points_awarded
    into v_enrollment
    from public.course_enrollments
   where id = p_enrollment_id;

  if not found then return 'enrollment_not_found'; end if;

  if v_enrollment.user_id <> auth.uid() and not public.is_admin() then
    raise exception 'enrollment owner or administrator required'
      using errcode = '42501';
  end if;

  if v_enrollment.points_awarded then return 'already_awarded'; end if;

  select exists (
    select 1
      from public.course_quiz_attempts
     where enrollment_id = p_enrollment_id
       and passed = true
  ) into v_has_passed;
  if not v_has_passed then return 'not_passed'; end if;

  select id, author_id, title, slug, course_type,
         coalesce(avg_rating, 0) as avg_rating
    into v_course
    from public.courses
   where id = v_enrollment.course_id;

  update public.course_enrollments
     set points_awarded = true,
         completed_at = coalesce(completed_at, now())
   where id = p_enrollment_id
     and points_awarded = false;
  get diagnostics v_rows_updated = row_count;
  if v_rows_updated = 0 then return 'race'; end if;

  if v_course.course_type = 'consultant'
     and v_course.author_id = v_enrollment.user_id
  then
    return 'self_study_no_points';
  end if;

  v_student_rule_code := case
    when v_course.course_type = 'company'
      then 'course_completed_company_student'
    else 'course_completed_student'
  end;

  select points
    into v_student_pts
    from public.loyalty_rules
   where code = v_student_rule_code
     and is_active = true;

  if v_student_pts is not null then
    insert into public.loyalty_transactions (
      user_id, points, source_type, source_id, description
    ) values (
      v_enrollment.user_id,
      v_student_pts,
      v_student_rule_code,
      v_course.id,
      'Ukończenie szkolenia: ' || v_course.title
    );
  end if;

  if v_course.course_type = 'consultant'
     and v_course.author_id is not null
  then
    select points
      into v_author_base_pts
      from public.loyalty_rules
     where code = 'course_completed_author_reward'
       and is_active = true;

    v_multiplier := 1.0
      + least(0.2, greatest(0, v_course.avg_rating) / 5.0 * 0.2);
    v_author_pts := round(coalesce(v_author_base_pts, 50) * v_multiplier);

    insert into public.loyalty_transactions (
      user_id, points, source_type, source_id, description
    ) values (
      v_course.author_id,
      v_author_pts,
      'course_completed_author_reward',
      v_course.id,
      'Uczeń ukończył Twoje szkolenie: ' || v_course.title
        || ' (×' || to_char(v_multiplier, 'FM9.00') || ')'
    );

    perform public.create_notification(
      v_course.author_id,
      'course_completed',
      'Ktoś ukończył Twoje szkolenie!',
      'Someone completed your course!',
      '+' || v_author_pts || ' pkt — ' || v_course.title,
      '+' || v_author_pts || ' pts — ' || v_course.title,
      '/akademia/' || v_course.slug,
      'normal'
    );
  end if;

  return 'awarded';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.award_first_publish_bonus(p_course_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  v_author_id uuid;
  v_title text;
  v_slug text;
  v_status text;
  v_count integer;
  v_bonus_pts integer;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'administrator role required' using errcode = '42501';
  end if;

  select author_id, title, slug, status
    into v_author_id, v_title, v_slug, v_status
    from public.courses
   where id = p_course_id;

  if not found then return 'course_not_found'; end if;
  if v_status <> 'published' then return 'course_not_published'; end if;

  select count(*)
    into v_count
    from public.courses
   where author_id = v_author_id
     and status = 'published'
     and id <> p_course_id;

  if v_count > 0 then return 'not_first'; end if;

  select points
    into v_bonus_pts
    from public.loyalty_rules
   where code = 'course_first_publish_bonus'
     and is_active = true;

  if v_bonus_pts is null then return 'rule_inactive'; end if;

  insert into public.loyalty_transactions (
    user_id, points, source_type, source_id, description
  ) values (
    v_author_id,
    v_bonus_pts,
    'course_first_publish_bonus',
    p_course_id,
    'Bonus za pierwsze opublikowane szkolenie: ' || v_title
  );

  perform public.create_notification(
    v_author_id,
    'course_approved',
    'Bonus za pierwsze szkolenie!',
    'First-course publication bonus!',
    '+' || v_bonus_pts || ' pkt — ' || v_title,
    '+' || v_bonus_pts || ' pts — ' || v_title,
    '/akademia/' || v_slug,
    'normal'
  );

  return 'awarded';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.can_propose_bonus_for(target_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
    SELECT public.is_admin() OR public.is_manager_of(target_user_id);
$function$
;

CREATE OR REPLACE FUNCTION public.create_broadcast_conversation(p_owner_id uuid, p_name text, p_participant_ids uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_conv_id uuid;
begin
  if (select auth.uid()) is null or (select auth.uid()) <> p_owner_id then
    raise exception 'caller identity mismatch' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.profiles
    where id = p_owner_id
      and role::text = 'admin'
  ) then
    raise exception 'administrator role required' using errcode = '42501';
  end if;
  if nullif(btrim(p_name), '') is null or length(p_name) > 200 then
    raise exception 'invalid broadcast name' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_participant_ids), 0) > 5000 then
    raise exception 'too many broadcast participants' using errcode = '22023';
  end if;

  insert into public.conversations (type, name, owner_id, last_message_at)
  values ('broadcast', btrim(p_name), p_owner_id, now())
  returning id into v_conv_id;

  insert into public.conversation_participants (
    conversation_id,
    user_id,
    role
  ) values (v_conv_id, p_owner_id, 'owner');

  insert into public.conversation_participants (
    conversation_id,
    user_id,
    role
  )
  select v_conv_id, participant_id, 'member'
  from (
    select distinct unnest(coalesce(p_participant_ids, '{}'::uuid[])) as participant_id
  ) participants
  where participant_id <> p_owner_id;

  return v_conv_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_direct_conversation(p_user_id uuid, p_target_user_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_conv_id uuid;
  v_caller_role text;
  v_target_role text;
begin
  if (select auth.uid()) is null or (select auth.uid()) <> p_user_id then
    raise exception 'caller identity mismatch' using errcode = '42501';
  end if;
  if p_target_user_id is null or p_target_user_id = p_user_id then
    raise exception 'invalid conversation target' using errcode = '22023';
  end if;

  select role::text into v_caller_role
  from public.profiles
  where id = p_user_id;
  select role::text into v_target_role
  from public.profiles
  where id = p_target_user_id;

  if v_caller_role is null or v_target_role is null then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;
  if v_caller_role = 'consultant' and v_target_role = 'consultant' then
    raise exception 'direct consultant messaging is not allowed'
      using errcode = '42501';
  end if;

  insert into public.conversations (type)
  values ('direct')
  returning id into v_conv_id;

  insert into public.conversation_participants (
    conversation_id,
    user_id,
    role
  ) values
    (v_conv_id, p_user_id, 'member'),
    (v_conv_id, p_target_user_id, 'member');

  return v_conv_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_quiz_for_attempt(p_course_id uuid)
 RETURNS TABLE(question_id uuid, question_order integer, question_text text, options jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE v_authorized BOOLEAN;
BEGIN
    SELECT (
        EXISTS (SELECT 1 FROM course_enrollments e WHERE e.course_id = p_course_id AND e.user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM courses c WHERE c.id = p_course_id AND c.author_id = auth.uid())
        OR is_admin()
    ) INTO v_authorized;
    IF NOT v_authorized THEN RAISE EXCEPTION 'not_authorized'; END IF;
    RETURN QUERY
    SELECT q.id AS question_id, q.order_index AS question_order, q.question_text,
        COALESCE(
            (SELECT jsonb_agg(jsonb_build_object('id', o.id, 'order_index', o.order_index, 'option_text', o.option_text) ORDER BY o.order_index)
             FROM course_quiz_options o WHERE o.question_id = q.id),
            '[]'::jsonb
        ) AS options
    FROM course_quiz_questions q WHERE q.course_id = p_course_id ORDER BY q.order_index;
END; $function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    left(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), 200)
  );
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.has_hr_zone_access()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
    SELECT public.is_internal_or_admin();
$function$
;

CREATE OR REPLACE FUNCTION public.has_lifecycle_access()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
    SELECT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
          AND role::TEXT IN ('admin', 'talent_community')
    );
$function$
;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
    SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role::TEXT = 'admin');
$function$
;

CREATE OR REPLACE FUNCTION public.is_buddy_of(target_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
    SELECT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = target_user_id
          AND buddy_id = auth.uid()
    );
$function$
;

CREATE OR REPLACE FUNCTION public.is_conversation_member(conv_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversation_participants
    WHERE conversation_id = conv_id
      AND user_id = auth.uid()
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_finanse_or_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
    SELECT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
          AND role::TEXT IN ('admin', 'finanse')
    );
$function$
;

CREATE OR REPLACE FUNCTION public.is_inbox_handler()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
        SELECT EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
              AND (role::TEXT = 'admin' OR is_inbox_handler = true)
        );
    $function$
;

CREATE OR REPLACE FUNCTION public.is_internal_or_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
    SELECT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
          AND role::TEXT IN ('admin', 'internal', 'finanse', 'manager', 'talent_community')
    );
$function$
;

CREATE OR REPLACE FUNCTION public.is_manager()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
    SELECT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
          AND role::TEXT = 'manager'
    );
$function$
;

CREATE OR REPLACE FUNCTION public.is_manager_of(target_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
    SELECT EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = target_user_id
          AND p.manager_id = auth.uid()
    );
$function$
;

CREATE OR REPLACE FUNCTION public.is_talent_community()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
    SELECT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
          AND role::TEXT = 'talent_community'
    );
$function$
;

CREATE OR REPLACE FUNCTION public.is_trainer_or_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$ SELECT public.is_admin() $function$
;

CREATE OR REPLACE FUNCTION public.log_rate_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'compass_legacy', 'pg_temp'
AS $function$
DECLARE
    actor_id UUID;
BEGIN
    -- auth.uid() returns the JWT subject when called via Supabase REST,
    -- NULL for service_role / direct SQL.
    actor_id := auth.uid();

    IF (TG_OP = 'INSERT') THEN
        INSERT INTO rate_change_log (
            rate_id, action, changed_by,
            position_title,
            new_rate_min, new_rate_median, new_rate_max,
            new_data
        ) VALUES (
            NEW.id, 'INSERT', actor_id,
            NEW.position_title,
            NEW.rate_min, NEW.rate_median, NEW.rate_max,
            to_jsonb(NEW)
        );
        RETURN NEW;
    ELSIF (TG_OP = 'UPDATE') THEN
        -- Only log when something actually changed
        IF NEW IS DISTINCT FROM OLD THEN
            INSERT INTO rate_change_log (
                rate_id, action, changed_by,
                position_title,
                old_rate_min, new_rate_min,
                old_rate_median, new_rate_median,
                old_rate_max, new_rate_max,
                old_data, new_data
            ) VALUES (
                NEW.id, 'UPDATE', actor_id,
                NEW.position_title,
                OLD.rate_min, NEW.rate_min,
                OLD.rate_median, NEW.rate_median,
                OLD.rate_max, NEW.rate_max,
                to_jsonb(OLD), to_jsonb(NEW)
            );
        END IF;
        RETURN NEW;
    ELSIF (TG_OP = 'DELETE') THEN
        INSERT INTO rate_change_log (
            rate_id, action, changed_by,
            position_title,
            old_rate_min, old_rate_median, old_rate_max,
            old_data
        ) VALUES (
            OLD.id, 'DELETE', actor_id,
            OLD.position_title,
            OLD.rate_min, OLD.rate_median, OLD.rate_max,
            to_jsonb(OLD)
        );
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.match_courses(query_embedding vector, match_threshold double precision DEFAULT 0.3, match_count integer DEFAULT 12)
 RETURNS TABLE(course_id uuid, similarity double precision)
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        c.id AS course_id,
        1 - (c.embedding <=> query_embedding) AS similarity
    FROM courses c
    WHERE c.status = 'published'
      AND c.embedding IS NOT NULL
      AND (1 - (c.embedding <=> query_embedding)) > match_threshold
    ORDER BY c.embedding <=> query_embedding ASC
    LIMIT match_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.record_lifecycle_event(p_user_id uuid, p_event_type text, p_actor_id uuid, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'service role required'
      using errcode = '42501';
  end if;

  return private.record_lifecycle_event_impl(
    p_user_id,
    p_event_type,
    p_actor_id,
    p_metadata
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.resolve_role_default(target_role user_role, target_project text)
 RETURNS TABLE(id uuid, label text, default_description text, project text, applies_to_role user_role)
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
    SELECT id, label, default_description, project, applies_to_role
    FROM timesheet_role_defaults
    WHERE is_active = TRUE
      AND (applies_to_role IS NULL OR applies_to_role = target_role)
      AND (project IS NULL OR project = target_project)
    ORDER BY
        (applies_to_role IS NOT NULL)::int DESC,
        (project IS NOT NULL)::int DESC,
        sort_order ASC,
        created_at ASC
    LIMIT 1;
$function$
;

CREATE OR REPLACE FUNCTION public.start_offboarding_for_user(p_user_id uuid, p_termination_date date, p_scheduled_for date DEFAULT NULL::date, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  if p_actor_id is null or not exists (
    select 1
      from public.profiles
     where id = p_actor_id
       and role::text in ('admin', 'talent_community')
  ) then
    raise exception 'lifecycle manager actor required' using errcode = '42501';
  end if;

  return private.start_offboarding_for_user_impl(
    p_user_id,
    p_termination_date,
    p_scheduled_for,
    p_actor_id
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.start_onboarding_for_user(p_user_id uuid, p_template_id uuid DEFAULT NULL::uuid, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  if p_actor_id is null or not exists (
    select 1
      from public.profiles
     where id = p_actor_id
       and role::text in ('admin', 'talent_community')
  ) then
    raise exception 'lifecycle manager actor required' using errcode = '42501';
  end if;

  return private.start_onboarding_for_user_impl(
    p_user_id,
    p_template_id,
    p_actor_id
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.submit_quiz_attempt(p_course_id uuid, p_answers jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
    v_user_id UUID := auth.uid();
    v_enrollment RECORD;
    v_total_questions INTEGER;
    v_correct_count INTEGER := 0;
    v_score_percent INTEGER;
    v_passed BOOLEAN;
    v_attempt_id UUID;
    v_award_status TEXT := NULL;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;

    -- 1. Validate enrollment
    SELECT id, points_awarded INTO v_enrollment
    FROM course_enrollments
    WHERE course_id = p_course_id AND user_id = v_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'not_enrolled';
    END IF;

    -- 2. Total questions in this course
    SELECT COUNT(*) INTO v_total_questions
    FROM course_quiz_questions
    WHERE course_id = p_course_id;

    IF v_total_questions = 0 THEN
        RAISE EXCEPTION 'no_quiz_questions';
    END IF;

    -- 3. Score: count correctly-answered questions
    SELECT COUNT(*) INTO v_correct_count
    FROM jsonb_array_elements(p_answers) AS a
    JOIN course_quiz_options o
      ON o.id = (a->>'selected_option_id')::UUID
    JOIN course_quiz_questions q
      ON q.id = o.question_id
     AND q.id = (a->>'question_id')::UUID
    WHERE q.course_id = p_course_id
      AND o.is_correct = TRUE;

    v_score_percent := ROUND((v_correct_count::NUMERIC / v_total_questions) * 100);
    v_passed := v_score_percent >= 70;

    -- 4. Record the attempt
    INSERT INTO course_quiz_attempts (
        enrollment_id, user_id, course_id, answers, score_percent, passed
    ) VALUES (
        v_enrollment.id, v_user_id, p_course_id, p_answers, v_score_percent, v_passed
    ) RETURNING id INTO v_attempt_id;

    -- 5. If passed and not yet awarded, trigger points
    IF v_passed AND NOT v_enrollment.points_awarded THEN
        v_award_status := award_course_points(v_enrollment.id);
    END IF;

    RETURN jsonb_build_object(
        'score_percent', v_score_percent,
        'passed', v_passed,
        'attempt_id', v_attempt_id,
        'already_awarded', v_enrollment.points_awarded,
        'award_status', v_award_status
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_conversation_ticket()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE v_cat UUID; v_admin UUID;
BEGIN
    IF TG_OP = 'DELETE' THEN
        DELETE FROM support_tickets WHERE id = OLD.id;  -- cascades support_contractor_meta
        RETURN OLD;
    END IF;
    SELECT id INTO v_cat FROM support_categories WHERE slug = 'contractor_conversation';
    SELECT id INTO v_admin FROM profiles WHERE role::text = 'admin' ORDER BY created_at LIMIT 1;
    INSERT INTO support_tickets (id, user_id, assignee_id, category_id, subject, body_md, status, priority, resolved_at, created_at, updated_at)
    VALUES (
        NEW.id, COALESCE(NEW.created_by, NEW.tcm_id, v_admin), NEW.tcm_id, v_cat,
        left('Rozmowa (' || NEW.category || ') ' || COALESCE(NEW.client_snapshot, '') || ' · ' || NEW.conversation_date::text, 200),
        COALESCE(NEW.note, ''),
        CASE NEW.status WHEN 'rozwiazane' THEN 'resolved' WHEN 'w_toku' THEN 'in_progress' ELSE 'open' END,
        CASE NEW.status WHEN 'pilne' THEN 'urgent' WHEN 'potrzebny_kontakt' THEN 'high' ELSE 'normal' END,
        NEW.resolved_at, NEW.created_at, NEW.updated_at
    )
    ON CONFLICT (id) DO UPDATE SET
        assignee_id = EXCLUDED.assignee_id, subject = EXCLUDED.subject, body_md = EXCLUDED.body_md,
        status = EXCLUDED.status, priority = EXCLUDED.priority, resolved_at = EXCLUDED.resolved_at;
    INSERT INTO support_contractor_meta (ticket_id, kind, contractor_id, conversation_category, follow_up_date, client_snapshot, tcm_id, placement_id, source_conversation_id)
    VALUES (NEW.id, 'conversation', NEW.contractor_id, NEW.category, NEW.follow_up_date, NEW.client_snapshot, NEW.tcm_id, NEW.placement_id, NEW.id)
    ON CONFLICT (ticket_id) DO UPDATE SET
        conversation_category = EXCLUDED.conversation_category, follow_up_date = EXCLUDED.follow_up_date,
        client_snapshot = EXCLUDED.client_snapshot, tcm_id = EXCLUDED.tcm_id, placement_id = EXCLUDED.placement_id;
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'sync_conversation_ticket failed for %: %', COALESCE(NEW.id, OLD.id), SQLERRM;
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_exit_case_contractor()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
    IF TG_OP = 'DELETE' THEN
        DELETE FROM exit_cases WHERE id = OLD.id AND person_type = 'contractor';
        RETURN OLD;
    END IF;
    INSERT INTO exit_cases (
        id, person_type, person_id, placement_id, position_snapshot, client_snapshot, start_date, end_date,
        contractor_form, attachments, status, scheduled_for, submitted_at, reviewed_by, reviewed_at, reviewer_note,
        created_by, created_at, updated_at
    ) VALUES (
        NEW.id, 'contractor', NEW.contractor_id, NEW.placement_id, NEW.position_snapshot, NEW.client_snapshot, NEW.start_date, NEW.end_date,
        jsonb_strip_nulls(jsonb_build_object(
            'formal_reason', NEW.formal_reason, 'causes', NEW.causes, 'repair_potential', NEW.repair_potential,
            'is_final', NEW.is_final, 'can_retain_transfer', NEW.can_retain_transfer, 'retain_transfer_note', NEW.retain_transfer_note,
            'can_extend_departure', NEW.can_extend_departure, 'extend_departure_note', NEW.extend_departure_note, 'feedback_lessons', NEW.feedback_lessons
        )),
        COALESCE(NEW.attachments, '[]'::jsonb),
        CASE WHEN NEW.status IN ('scheduled','submitted','reviewed','archived','cancelled') THEN NEW.status ELSE 'scheduled' END,
        NEW.scheduled_for, NEW.submitted_at, NEW.reviewed_by, NEW.reviewed_at, NEW.reviewer_note,
        NEW.created_by, NEW.created_at, NEW.updated_at
    )
    ON CONFLICT (id) DO UPDATE SET
        placement_id = EXCLUDED.placement_id, position_snapshot = EXCLUDED.position_snapshot,
        client_snapshot = EXCLUDED.client_snapshot, start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date,
        contractor_form = EXCLUDED.contractor_form, attachments = EXCLUDED.attachments, status = EXCLUDED.status,
        scheduled_for = EXCLUDED.scheduled_for, submitted_at = EXCLUDED.submitted_at,
        reviewed_by = EXCLUDED.reviewed_by, reviewed_at = EXCLUDED.reviewed_at, reviewer_note = EXCLUDED.reviewer_note, updated_at = EXCLUDED.updated_at;
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'sync_exit_case_contractor failed for %: %', COALESCE(NEW.id, OLD.id), SQLERRM;
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_exit_case_employee()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
    IF TG_OP = 'DELETE' THEN
        DELETE FROM exit_cases WHERE id = OLD.id AND person_type = 'employee';
        RETURN OLD;
    END IF;
    INSERT INTO exit_cases (
        id, person_type, person_id, is_anonymous, role_snapshot, manager_snapshot, department_snapshot, tenure_months,
        exit_reason, exit_reason_detail, nps_score, satisfaction_team, satisfaction_manager, satisfaction_projects,
        would_recommend, what_worked, what_to_improve, knowledge_transfer_notes,
        status, scheduled_for, submitted_at, reviewed_by, reviewed_at, reviewer_note, created_at, updated_at
    ) VALUES (
        NEW.id, 'employee', NEW.user_id, NEW.is_anonymous, NEW.role_snapshot, NEW.manager_snapshot, NEW.department_snapshot, NEW.tenure_months,
        NEW.exit_reason, NEW.exit_reason_detail, NEW.nps_score, NEW.satisfaction_team, NEW.satisfaction_manager, NEW.satisfaction_projects,
        NEW.would_recommend, NEW.what_worked, NEW.what_to_improve, NEW.knowledge_transfer_notes,
        NEW.status, NEW.scheduled_for, NEW.submitted_at, NEW.reviewed_by, NEW.reviewed_at, NEW.reviewer_note, NEW.created_at, NEW.updated_at
    )
    ON CONFLICT (id) DO UPDATE SET
        person_id = EXCLUDED.person_id, is_anonymous = EXCLUDED.is_anonymous,
        role_snapshot = EXCLUDED.role_snapshot, manager_snapshot = EXCLUDED.manager_snapshot,
        department_snapshot = EXCLUDED.department_snapshot, tenure_months = EXCLUDED.tenure_months,
        exit_reason = EXCLUDED.exit_reason, exit_reason_detail = EXCLUDED.exit_reason_detail, nps_score = EXCLUDED.nps_score,
        satisfaction_team = EXCLUDED.satisfaction_team, satisfaction_manager = EXCLUDED.satisfaction_manager, satisfaction_projects = EXCLUDED.satisfaction_projects,
        would_recommend = EXCLUDED.would_recommend, what_worked = EXCLUDED.what_worked, what_to_improve = EXCLUDED.what_to_improve,
        knowledge_transfer_notes = EXCLUDED.knowledge_transfer_notes, status = EXCLUDED.status,
        scheduled_for = EXCLUDED.scheduled_for, submitted_at = EXCLUDED.submitted_at,
        reviewed_by = EXCLUDED.reviewed_by, reviewed_at = EXCLUDED.reviewed_at, reviewer_note = EXCLUDED.reviewer_note, updated_at = EXCLUDED.updated_at;
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'sync_exit_case_employee failed for %: %', COALESCE(NEW.id, OLD.id), SQLERRM;
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_onboarding_case_contractor()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
    IF TG_OP = 'DELETE' THEN
        DELETE FROM onboarding_cases WHERE id = OLD.id AND person_type = 'contractor';
        RETURN OLD;
    END IF;
    INSERT INTO onboarding_cases (
        id, person_type, person_id, status, placement_id, position_snapshot, client_snapshot, start_date,
        scheduled_for, submitted_at, reviewed_by, reviewed_at, reviewer_note, interview, attachments,
        created_by, created_at, updated_at
    ) VALUES (
        NEW.id, 'contractor', NEW.contractor_id,
        CASE WHEN NEW.status IN ('scheduled','submitted','reviewed','archived','cancelled') THEN NEW.status ELSE 'scheduled' END,
        NEW.placement_id, NEW.position_snapshot, NEW.client_snapshot, NEW.start_date,
        NEW.scheduled_for, NEW.submitted_at, NEW.reviewed_by, NEW.reviewed_at, NEW.reviewer_note,
        jsonb_strip_nulls(jsonb_build_object(
            'tcm_role_note', NEW.tcm_role_note, 'first_day_note', NEW.first_day_note,
            'client_manager_name', NEW.client_manager_name, 'equipment_note', NEW.equipment_note,
            'system_access_note', NEW.system_access_note, 'duties_note', NEW.duties_note,
            'work_note', NEW.work_note, 'manager_relation_note', NEW.manager_relation_note,
            'missing_resolved_note', NEW.missing_resolved_note, 'positive_surprise', NEW.positive_surprise,
            'negative_surprise', NEW.negative_surprise, 'doubts_note', NEW.doubts_note,
            'side_projects_interest', NEW.side_projects_interest,
            'cs_challenge', NEW.cs_challenge, 'cs_solution', NEW.cs_solution,
            'cs_technologies', NEW.cs_technologies, 'cs_client', NEW.cs_client, 'cs_sector', NEW.cs_sector
        )),
        COALESCE(NEW.attachments, '[]'::jsonb), NEW.created_by, NEW.created_at, NEW.updated_at
    )
    ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status, placement_id = EXCLUDED.placement_id,
        position_snapshot = EXCLUDED.position_snapshot, client_snapshot = EXCLUDED.client_snapshot, start_date = EXCLUDED.start_date,
        scheduled_for = EXCLUDED.scheduled_for, submitted_at = EXCLUDED.submitted_at,
        reviewed_by = EXCLUDED.reviewed_by, reviewed_at = EXCLUDED.reviewed_at, reviewer_note = EXCLUDED.reviewer_note,
        interview = EXCLUDED.interview, attachments = EXCLUDED.attachments, updated_at = EXCLUDED.updated_at;
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'sync_onboarding_case_contractor failed for %: %', COALESCE(NEW.id, OLD.id), SQLERRM;
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_onboarding_case_employee()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
    IF TG_OP = 'DELETE' THEN
        DELETE FROM onboarding_cases WHERE id = OLD.id AND person_type = 'employee';
        RETURN OLD;
    END IF;
    INSERT INTO onboarding_cases (
        id, person_type, person_id, status, template_id,
        checkin_day1_at, checkin_day1_score, checkin_day1_note,
        checkin_day7_at, checkin_day7_score, checkin_day7_note,
        checkin_day30_at, checkin_day30_score, checkin_day30_note,
        started_at, completed_at, cancelled_at, cancelled_by, cancelled_reason,
        created_at, updated_at
    ) VALUES (
        NEW.id, 'employee', NEW.user_id,
        CASE WHEN NEW.cancelled_at IS NOT NULL THEN 'cancelled'
             WHEN NEW.completed_at IS NOT NULL THEN 'completed' ELSE 'active' END,
        NEW.template_id,
        NEW.checkin_day1_at, NEW.checkin_day1_score, NEW.checkin_day1_note,
        NEW.checkin_day7_at, NEW.checkin_day7_score, NEW.checkin_day7_note,
        NEW.checkin_day30_at, NEW.checkin_day30_score, NEW.checkin_day30_note,
        NEW.started_at, NEW.completed_at, NEW.cancelled_at, NEW.cancelled_by, NEW.cancellation_reason,
        NEW.created_at, NEW.updated_at
    )
    ON CONFLICT (id) DO UPDATE SET
        person_id = EXCLUDED.person_id, status = EXCLUDED.status, template_id = EXCLUDED.template_id,
        checkin_day1_at = EXCLUDED.checkin_day1_at, checkin_day1_score = EXCLUDED.checkin_day1_score, checkin_day1_note = EXCLUDED.checkin_day1_note,
        checkin_day7_at = EXCLUDED.checkin_day7_at, checkin_day7_score = EXCLUDED.checkin_day7_score, checkin_day7_note = EXCLUDED.checkin_day7_note,
        checkin_day30_at = EXCLUDED.checkin_day30_at, checkin_day30_score = EXCLUDED.checkin_day30_score, checkin_day30_note = EXCLUDED.checkin_day30_note,
        started_at = EXCLUDED.started_at, completed_at = EXCLUDED.completed_at,
        cancelled_at = EXCLUDED.cancelled_at, cancelled_by = EXCLUDED.cancelled_by, cancelled_reason = EXCLUDED.cancelled_reason,
        updated_at = EXCLUDED.updated_at;
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'sync_onboarding_case_employee failed for %: %', COALESCE(NEW.id, OLD.id), SQLERRM;
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_profile_to_candidate()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
    INSERT INTO public.candidates (
        user_id, email, full_name, bio, skills, experience_years,
        current_status, capacity_percentage, project_sentiment,
        verifier_status, ambassador_status, sales_support_status,
        previous_clients, avatar_url, cv_url, embedding,
        available_from, fte_status, max_monthly_hours,
        candidate_status, source, updated_at
    ) VALUES (
        NEW.id, NEW.email, NEW.full_name, NEW.bio, NEW.skills,
        NEW.experience_years, NEW.current_status, NEW.capacity_percentage,
        NEW.project_sentiment, NEW.verifier_status, NEW.ambassador_status,
        NEW.sales_support_status, NEW.previous_clients, NEW.avatar_url,
        NEW.cv_url, NEW.embedding, NEW.available_from, NEW.fte_status,
        NEW.max_monthly_hours, 'konsultant', 'self_registration', NOW()
    )
    ON CONFLICT (user_id) DO UPDATE SET
        email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        bio = EXCLUDED.bio,
        skills = EXCLUDED.skills,
        experience_years = EXCLUDED.experience_years,
        current_status = EXCLUDED.current_status,
        capacity_percentage = EXCLUDED.capacity_percentage,
        project_sentiment = EXCLUDED.project_sentiment,
        verifier_status = EXCLUDED.verifier_status,
        ambassador_status = EXCLUDED.ambassador_status,
        sales_support_status = EXCLUDED.sales_support_status,
        previous_clients = EXCLUDED.previous_clients,
        avatar_url = EXCLUDED.avatar_url,
        cv_url = EXCLUDED.cv_url,
        embedding = EXCLUDED.embedding,
        available_from = EXCLUDED.available_from,
        fte_status = EXCLUDED.fte_status,
        max_monthly_hours = EXCLUDED.max_monthly_hours,
        updated_at = NOW();
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_task_ticket()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE v_cat UUID; v_admin UUID;
BEGIN
    IF TG_OP = 'DELETE' THEN
        DELETE FROM support_tickets WHERE id = OLD.id;
        RETURN OLD;
    END IF;
    SELECT id INTO v_cat FROM support_categories WHERE slug = 'contractor_task';
    SELECT id INTO v_admin FROM profiles WHERE role::text = 'admin' ORDER BY created_at LIMIT 1;
    INSERT INTO support_tickets (id, user_id, assignee_id, category_id, subject, body_md, status, priority, resolved_at, created_at, updated_at)
    VALUES (
        NEW.id, COALESCE(NEW.created_by, NEW.assigned_tcm_id, v_admin), NEW.assigned_tcm_id, v_cat,
        left(NEW.title, 200), COALESCE(NEW.description, ''),
        CASE NEW.status WHEN 'done' THEN 'resolved' WHEN 'in_progress' THEN 'in_progress' ELSE 'open' END,
        'normal',
        CASE WHEN NEW.status = 'done' THEN NEW.updated_at ELSE NULL END,
        NEW.created_at, NEW.updated_at
    )
    ON CONFLICT (id) DO UPDATE SET
        assignee_id = EXCLUDED.assignee_id, subject = EXCLUDED.subject, body_md = EXCLUDED.body_md,
        status = EXCLUDED.status, resolved_at = EXCLUDED.resolved_at;
    INSERT INTO support_contractor_meta (ticket_id, kind, contractor_id, due_date, tcm_id, linked_ticket_id, source_task_id)
    VALUES (NEW.id, 'task', NEW.contractor_id, NEW.due_date, NEW.assigned_tcm_id, NEW.source_ticket_id, NEW.id)
    ON CONFLICT (ticket_id) DO UPDATE SET
        contractor_id = EXCLUDED.contractor_id, due_date = EXCLUDED.due_date,
        tcm_id = EXCLUDED.tcm_id, linked_ticket_id = EXCLUDED.linked_ticket_id;
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'sync_task_ticket failed for %: %', COALESCE(NEW.id, OLD.id), SQLERRM;
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_user_role(p_user_id uuid, p_email text, p_is_super_admin boolean DEFAULT false)
 RETURNS user_role
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_current_role public.user_role;
  v_profile_email text;
  v_is_admin boolean;
  v_target public.user_role;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  if p_user_id is null or nullif(btrim(p_email), '') is null then
    raise exception 'user id and email are required' using errcode = '22023';
  end if;

  select role, email
    into v_current_role, v_profile_email
    from public.profiles
   where id = p_user_id;

  if not found then
    raise exception 'sync_user_role: profile not found for user_id=%', p_user_id
      using errcode = 'P0002';
  end if;

  if v_profile_email is null
     or lower(v_profile_email) <> lower(btrim(p_email))
  then
    raise exception 'sync_user_role: verified email mismatch'
      using errcode = '42501';
  end if;

  select exists (
    select 1
      from public.admin_access_list
     where lower(email) = lower(v_profile_email)
  ) into v_is_admin;

  if p_is_super_admin or v_is_admin then
    v_target := 'admin'::public.user_role;
  elsif v_current_role::text = 'internal' then
    v_target := 'internal'::public.user_role;
  elsif v_current_role::text = 'finanse' then
    v_target := 'finanse'::public.user_role;
  elsif v_current_role::text = 'manager' then
    v_target := 'manager'::public.user_role;
  elsif v_current_role::text = 'talent_community' then
    v_target := 'talent_community'::public.user_role;
  else
    v_target := 'consultant'::public.user_role;
  end if;

  if v_current_role is distinct from v_target then
    update public.profiles
       set role = v_target
     where id = p_user_id;
  end if;

  return v_target;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.update_loyalty_points()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
    UPDATE public.profiles
    SET loyalty_points = COALESCE(loyalty_points, 0) + NEW.points
    WHERE id = NEW.user_id;

    UPDATE public.profiles
    SET loyalty_tier = CASE
        WHEN COALESCE(loyalty_points, 0) + NEW.points >= 6000 THEN 'platinum'
        WHEN COALESCE(loyalty_points, 0) + NEW.points >= 2000 THEN 'gold'
        WHEN COALESCE(loyalty_points, 0) + NEW.points >= 500 THEN 'silver'
        ELSE 'bronze'
    END
    WHERE id = NEW.user_id;

    RETURN NEW;
END;
$function$
;

REVOKE ALL ON FUNCTION private.admin_hard_delete_user_impl(p_user_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.record_lifecycle_event_impl(p_user_id uuid, p_event_type text, p_actor_id uuid, p_metadata jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.start_offboarding_for_user_impl(p_user_id uuid, p_termination_date date, p_scheduled_for date, p_actor_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.start_onboarding_for_user_impl(p_user_id uuid, p_template_id uuid, p_actor_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.sync_profile_directory() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_hard_delete_user(p_user_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_revoke_user_sessions(target_user_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.award_course_points(p_enrollment_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.award_first_publish_bonus(p_course_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.can_propose_bonus_for(target_user_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_broadcast_conversation(p_owner_id uuid, p_name text, p_participant_ids uuid[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_direct_conversation(p_user_id uuid, p_target_user_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_quiz_for_attempt(p_course_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.has_hr_zone_access() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.has_lifecycle_access() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_buddy_of(target_user_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_conversation_member(conv_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_finanse_or_admin() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_inbox_handler() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_internal_or_admin() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_manager() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_manager_of(target_user_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_talent_community() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_trainer_or_admin() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.log_rate_change() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.match_courses(query_embedding vector, match_threshold double precision, match_count integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_lifecycle_event(p_user_id uuid, p_event_type text, p_actor_id uuid, p_metadata jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.resolve_role_default(target_role user_role, target_project text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.start_offboarding_for_user(p_user_id uuid, p_termination_date date, p_scheduled_for date, p_actor_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.start_onboarding_for_user(p_user_id uuid, p_template_id uuid, p_actor_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.submit_quiz_attempt(p_course_id uuid, p_answers jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.sync_conversation_ticket() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.sync_exit_case_contractor() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.sync_exit_case_employee() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.sync_onboarding_case_contractor() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.sync_onboarding_case_employee() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.sync_profile_to_candidate() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.sync_task_ticket() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.sync_user_role(p_user_id uuid, p_email text, p_is_super_admin boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.update_loyalty_points() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.award_course_points(p_enrollment_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.award_first_publish_bonus(p_course_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_propose_bonus_for(target_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_broadcast_conversation(p_owner_id uuid, p_name text, p_participant_ids uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_direct_conversation(p_user_id uuid, p_target_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_quiz_for_attempt(p_course_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_hr_zone_access() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_lifecycle_access() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_buddy_of(target_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_conversation_member(conv_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_finanse_or_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_inbox_handler() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_internal_or_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_manager() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_manager_of(target_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_talent_community() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_trainer_or_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_courses(query_embedding vector, match_threshold double precision, match_count integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_role_default(target_role user_role, target_project text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_quiz_attempt(p_course_id uuid, p_answers jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_hard_delete_user(p_user_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_revoke_user_sessions(target_user_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_propose_bonus_for(target_user_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_hr_zone_access() TO service_role;
GRANT EXECUTE ON FUNCTION public.has_lifecycle_access() TO service_role;
GRANT EXECUTE ON FUNCTION public.is_admin() TO service_role;
GRANT EXECUTE ON FUNCTION public.is_buddy_of(target_user_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_conversation_member(conv_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_finanse_or_admin() TO service_role;
GRANT EXECUTE ON FUNCTION public.is_inbox_handler() TO service_role;
GRANT EXECUTE ON FUNCTION public.is_internal_or_admin() TO service_role;
GRANT EXECUTE ON FUNCTION public.is_manager() TO service_role;
GRANT EXECUTE ON FUNCTION public.is_manager_of(target_user_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_talent_community() TO service_role;
GRANT EXECUTE ON FUNCTION public.is_trainer_or_admin() TO service_role;
GRANT EXECUTE ON FUNCTION public.match_courses(query_embedding vector, match_threshold double precision, match_count integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_lifecycle_event(p_user_id uuid, p_event_type text, p_actor_id uuid, p_metadata jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_role_default(target_role user_role, target_project text) TO service_role;
GRANT EXECUTE ON FUNCTION public.start_offboarding_for_user(p_user_id uuid, p_termination_date date, p_scheduled_for date, p_actor_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.start_onboarding_for_user(p_user_id uuid, p_template_id uuid, p_actor_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_user_role(p_user_id uuid, p_email text, p_is_super_admin boolean) TO service_role;
COMMENT ON FUNCTION private.admin_hard_delete_user_impl(p_user_id uuid) IS 'Hard-deletes an auth user + cascade. Pre-flight refuses accounts with financial/business/content/admin-action data (archive those instead). Bypasses the lifecycle_events append-only trigger for this transaction only. service_role only; app gates with requireSuperAdmin + ensureCanModify.';
COMMENT ON FUNCTION private.record_lifecycle_event_impl(p_user_id uuid, p_event_type text, p_actor_id uuid, p_metadata jsonb) IS 'Unexposed lifecycle event writer. Requires an admin or talent_community actor and is callable only by its guarded owner wrapper.';
COMMENT ON FUNCTION private.start_offboarding_for_user_impl(p_user_id uuid, p_termination_date date, p_scheduled_for date, p_actor_id uuid) IS 'Phase 22. Bootstraps offboarding: sets employment_status=offboarding + termination_date, creates exit_interview(scheduled), seeds default offboarding tasks, logs event. Returns interview_id.';
COMMENT ON FUNCTION private.start_onboarding_for_user_impl(p_user_id uuid, p_template_id uuid, p_actor_id uuid) IS 'Phase 22. Bootstraps an onboarding run: picks default template per role, copies items → tasks, sets employment_status=onboarding, logs event. Returns progress_id.';
COMMENT ON FUNCTION public.admin_hard_delete_user(p_user_id uuid) IS 'C0 service-role-only wrapper. The implementation is in the unexposed private schema.';
COMMENT ON FUNCTION public.admin_revoke_user_sessions(target_user_id uuid) IS 'Service-role-only session revocation. Defense in depth: validates service_role JWT inside the function.';
COMMENT ON FUNCTION public.award_course_points(p_enrollment_id uuid) IS 'Authenticated enrollment-owner/admin RPC. SECURITY DEFINER is required for atomic loyalty writes.';
COMMENT ON FUNCTION public.award_first_publish_bonus(p_course_id uuid) IS 'Authenticated admin-only publication RPC. SECURITY DEFINER is required for atomic loyalty writes.';
COMMENT ON FUNCTION public.can_propose_bonus_for(target_user_id uuid) IS 'Phase 23. True iff current user can propose a bonus for target_user_id. Admin can propose for anyone; manager only for direct reports.';
COMMENT ON FUNCTION public.get_quiz_for_attempt(p_course_id uuid) IS 'SECURITY DEFINER: zwraca quiz dla studenta BEZ pola is_correct';
COMMENT ON FUNCTION public.has_hr_zone_access() IS 'Phase 20. Alias for is_internal_or_admin(). Returns true for everyone except consultant IT.';
COMMENT ON FUNCTION public.has_lifecycle_access() IS 'Phase 22. RLS gate for lifecycle module — admin OR talent_community. Used by onboarding_*, exit_interviews, offboarding_tasks, lifecycle_events.';
COMMENT ON FUNCTION public.is_admin() IS 'Phase 1.1 (2026-05-04). RLS migration to use this helper deferred to Phase 1.5.';
COMMENT ON FUNCTION public.is_buddy_of(target_user_id uuid) IS 'Phase 22. True iff current user is assigned as buddy for target_user_id. Used by onboarding RLS.';
COMMENT ON FUNCTION public.is_finanse_or_admin() IS 'Phase 19. Used by invoices RLS — gate for invoice review (admin OR finanse).';
COMMENT ON FUNCTION public.is_internal_or_admin() IS 'Phase 11 + 19d + 20b. HR-zone gate: admin/internal/finanse/manager/talent_community. Consultant IT excluded.';
COMMENT ON FUNCTION public.is_manager() IS 'Phase 20. True iff current user has role=manager.';
COMMENT ON FUNCTION public.is_manager_of(target_user_id uuid) IS 'Phase 20 + 20e. True iff current user is the manager (via profiles.manager_id link) of target_user_id. Role-agnostic — any HR-zone user with direct reports is a team manager.';
COMMENT ON FUNCTION public.is_talent_community() IS 'Phase 20. True iff current user has role=talent_community. Used by /admin/inbox + /admin/compliance + news composer gates.';
COMMENT ON FUNCTION public.is_trainer_or_admin() IS 'Deprecated: kept as alias for is_admin() after trainer role was removed in phase 16. Do not use in new policies.';
COMMENT ON FUNCTION public.record_lifecycle_event(p_user_id uuid, p_event_type text, p_actor_id uuid, p_metadata jsonb) IS 'Service-role-only lifecycle event writer used by guarded server actions. Rejects client JWTs and validates the actor in the private implementation.';
COMMENT ON FUNCTION public.resolve_role_default(target_role user_role, target_project text) IS 'Phase 24a. Zwraca najbardziej specyficzny aktywny default dla pary (role, project). NULL→NULL = fallback global.';
COMMENT ON FUNCTION public.start_offboarding_for_user(p_user_id uuid, p_termination_date date, p_scheduled_for date, p_actor_id uuid) IS 'C0 service-role-only wrapper. The implementation is in the unexposed private schema.';
COMMENT ON FUNCTION public.start_onboarding_for_user(p_user_id uuid, p_template_id uuid, p_actor_id uuid) IS 'C0 service-role-only wrapper. The implementation is in the unexposed private schema.';
COMMENT ON FUNCTION public.submit_quiz_attempt(p_course_id uuid, p_answers jsonb) IS 'SECURITY DEFINER: atomic scoring + INSERT attempt + (jeśli passed) award_course_points';
COMMENT ON FUNCTION public.sync_user_role(p_user_id uuid, p_email text, p_is_super_admin boolean) IS 'Service-role-only atomic role sync. Email must match the target profile; super-admin input is accepted only from the guarded server layer.';
