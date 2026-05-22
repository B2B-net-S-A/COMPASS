-- Fix: hard-deleting a user was impossible for essentially every account.
--
-- Two independent root causes (both masked in prod as a generic server error):
--
--   1) lifecycle_events.user_id → profiles ON DELETE CASCADE, and a second FK
--      lifecycle_events.created_by → profiles ON DELETE SET NULL. But
--      lifecycle_events also carries an append-only trigger
--      (trg_lifecycle_events_block_update → block_lifecycle_events_mutation)
--      that RAISEs on ANY DELETE or UPDATE. Deleting a user (auth.users →
--      profiles cascade → lifecycle_events cascade) therefore always aborts:
--      the CASCADE fires a DELETE (own events) and the SET NULL fires an
--      UPDATE (events the user authored for others) — both are blocked. Every
--      account has at least one lifecycle_event, so this blocked all deletes.
--
--   2) Many child tables reference profiles/auth.users with ON DELETE RESTRICT
--      or NO ACTION (user_rates, bonuses, placements, invoices, news_posts, …).
--      Those are business/financial/content records that must NOT be silently
--      destroyed when an account is removed. A plain auth.users delete would
--      either fail with an opaque FK violation or (worse) cascade-wipe them.
--
-- Fix:
--   * Keep lifecycle_events append-only for all normal operations, but let an
--     explicit admin hard-delete opt the cascade (DELETE + SET NULL→UPDATE)
--     through, scoped to a single transaction via a custom GUC.
--   * Provide a SECURITY DEFINER RPC that, BEFORE deleting, runs a pre-flight
--     check and refuses (with a clear, itemised message) when the account has
--     financial/business/content/admin-action data — the caller should archive
--     instead. Only "clean" accounts (test/erroneous/HR-lifecycle-only) delete.

-- ── 1) lifecycle_events trigger: allow DELETE *and* UPDATE under the bypass ──
CREATE OR REPLACE FUNCTION public.block_lifecycle_events_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  -- During an admin hard-delete the FK cascade must be allowed to remove
  -- (DELETE) and orphan (SET NULL → UPDATE) this user's lifecycle_events.
  -- The flag is set with is_local=true inside admin_hard_delete_user(), so it
  -- never leaks past that transaction. Append-only is otherwise enforced.
  IF current_setting('app.allow_lifecycle_cascade_delete', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW; -- UPDATE
  END IF;
  RAISE EXCEPTION 'lifecycle_events is append-only — % blocked', TG_OP
    USING ERRCODE = 'P0001';
END;
$fn$;

-- ── 2) Hard-delete RPC with pre-flight guard ────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_hard_delete_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_catalog
AS $fn$
DECLARE
  v_blockers text[] := '{}';
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
  IF v_n > 0 THEN v_blockers := v_blockers || format('%s stawek', v_n); END IF;

  SELECT count(*) INTO v_n FROM bonuses
    WHERE recipient_user_id = p_user_id OR proposed_by = p_user_id
       OR cancelled_by = p_user_id OR delivery_consultant_id = p_user_id;
  IF v_n > 0 THEN v_blockers := v_blockers || format('%s premii', v_n); END IF;

  SELECT count(*) INTO v_n FROM placements
    WHERE recruiter_id = p_user_id OR delivery_lead_id = p_user_id
       OR imported_by = p_user_id OR cancelled_by = p_user_id
       OR hours_confirmed_by = p_user_id;
  IF v_n > 0 THEN v_blockers := v_blockers || format('%s placementów', v_n); END IF;

  SELECT count(*) INTO v_n FROM invoices
    WHERE user_id = p_user_id OR reviewed_by = p_user_id
       OR manager_reviewed_by = p_user_id;
  IF v_n > 0 THEN v_blockers := v_blockers || format('%s faktur', v_n); END IF;

  SELECT count(*) INTO v_n FROM incubator_pitches
    WHERE submitter_id = p_user_id OR reviewer_id = p_user_id;
  IF v_n > 0 THEN v_blockers := v_blockers || format('%s zgłoszeń do inkubatora', v_n); END IF;

  SELECT count(*) INTO v_n FROM incubator_projects WHERE owner_id = p_user_id;
  IF v_n > 0 THEN v_blockers := v_blockers || format('%s projektów inkubatora', v_n); END IF;

  SELECT count(*) INTO v_n FROM learning_paths WHERE author_id = p_user_id;
  IF v_n > 0 THEN v_blockers := v_blockers || format('%s ścieżek nauki', v_n); END IF;

  SELECT (SELECT count(*) FROM support_article_attachments WHERE uploaded_by = p_user_id)
       + (SELECT count(*) FROM support_category_materials  WHERE uploaded_by = p_user_id)
    INTO v_n;
  IF v_n > 0 THEN v_blockers := v_blockers || format('%s materiałów wsparcia', v_n); END IF;

  -- Content / communication (ON DELETE NO ACTION — would hard-block the FK):
  SELECT count(*) INTO v_n FROM news_posts WHERE author_id = p_user_id;
  IF v_n > 0 THEN v_blockers := v_blockers || format('%s aktualności', v_n); END IF;

  SELECT count(*) INTO v_n FROM support_articles WHERE author_id = p_user_id;
  IF v_n > 0 THEN v_blockers := v_blockers || format('%s artykułów wsparcia', v_n); END IF;

  SELECT count(*) INTO v_n FROM courses WHERE reviewed_by = p_user_id;
  IF v_n > 0 THEN v_blockers := v_blockers || format('%s recenzji kursów', v_n); END IF;

  SELECT (SELECT count(*) FROM conversations WHERE owner_id = p_user_id)
       + (SELECT count(*) FROM messages       WHERE sender_id = p_user_id)
    INTO v_n;
  IF v_n > 0 THEN v_blockers := v_blockers || format('%s wiadomości/konwersacji', v_n); END IF;

  SELECT (SELECT count(*) FROM document_versions      WHERE uploaded_by = p_user_id)
       + (SELECT count(*) FROM user_contract_documents WHERE uploaded_by = p_user_id)
    INTO v_n;
  IF v_n > 0 THEN v_blockers := v_blockers || format('%s dokumentów', v_n); END IF;

  SELECT count(*) INTO v_n FROM tasks WHERE created_by = p_user_id;
  IF v_n > 0 THEN v_blockers := v_blockers || format('%s zadań', v_n); END IF;

  SELECT count(*) INTO v_n FROM system_settings WHERE updated_by = p_user_id;
  IF v_n > 0 THEN v_blockers := v_blockers || format('%s zmian ustawień', v_n); END IF;

  SELECT count(*) INTO v_n FROM contracts WHERE created_by = p_user_id;
  IF v_n > 0 THEN v_blockers := v_blockers || format('%s utworzonych kontraktów', v_n); END IF;

  SELECT count(*) INTO v_n FROM admin_access_list WHERE added_by = p_user_id;
  IF v_n > 0 THEN v_blockers := v_blockers || format('%s wpisów listy adminów', v_n); END IF;

  -- HR admin-actions (ON DELETE SET NULL on tables with append-only / stage
  -- triggers — the SET NULL → UPDATE would trip the trigger during cascade):
  SELECT count(*) INTO v_n FROM exit_interviews
    WHERE user_id = p_user_id OR reviewed_by = p_user_id
       OR invitation_sent_by = p_user_id OR manager_checklist_sent_by = p_user_id
       OR cancelled_by = p_user_id OR manager_snapshot = p_user_id;
  IF v_n > 0 THEN v_blockers := v_blockers || format('%s wywiadów exit', v_n); END IF;

  SELECT count(*) INTO v_n FROM timesheets WHERE approved_by = p_user_id;
  IF v_n > 0 THEN v_blockers := v_blockers || format('%s zaakceptowanych timesheetów', v_n); END IF;

  SELECT count(*) INTO v_n FROM timesheet_entries
    WHERE override_by = p_user_id OR correction_decided_by = p_user_id;
  IF v_n > 0 THEN v_blockers := v_blockers || format('%s nadpisań timesheetów', v_n); END IF;

  SELECT (SELECT count(*) FROM onboarding_tasks  WHERE completed_by = p_user_id)
       + (SELECT count(*) FROM offboarding_tasks WHERE completed_by = p_user_id)
    INTO v_n;
  IF v_n > 0 THEN v_blockers := v_blockers || format('%s ukończonych zadań HR (dla innych)', v_n); END IF;

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
$fn$;

-- ── 3) Lock down EXECUTE to service_role only (the server action calls it
--       behind requireSuperAdmin + ensureCanModify guards). ──
REVOKE ALL ON FUNCTION public.admin_hard_delete_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_hard_delete_user(uuid) TO service_role;

COMMENT ON FUNCTION public.admin_hard_delete_user(uuid) IS
  'Hard-deletes an auth user + cascade. Pre-flight refuses accounts with financial/business/content/admin-action data (archive those instead). Bypasses the lifecycle_events append-only trigger for this transaction only. service_role only; app gates with requireSuperAdmin + ensureCanModify.';
