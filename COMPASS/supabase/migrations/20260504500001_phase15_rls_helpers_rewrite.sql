-- ============================================================
-- Phase 1.5 — RLS rewrite to use is_admin() / is_trainer_or_admin() helpers
-- Date: 2026-05-04
--
-- Drops 60+ public + 4 storage policies that compared profiles.role TEXT directly
-- and recreates them using BOOLEAN-returning helpers (no enum dependency).
-- Also drops zombie policies on the locked compass_legacy schema.
-- Patches public.get_quiz_for_attempt to use is_admin() instead of inline IN-list.
--
-- After this migration, NO public RLS policy references profiles.role directly,
-- enabling the enum cast in 20260504500002.
-- ============================================================

BEGIN;

-- 1. Update is_admin / is_trainer_or_admin to use role::TEXT (works for both TEXT and enum column)
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
    SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role::TEXT = 'admin');
$$;

CREATE OR REPLACE FUNCTION is_trainer_or_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
    SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role::TEXT IN ('admin', 'trainer'));
$$;

-- 2. Patch get_quiz_for_attempt RPC (was: p.role IN ('admin', 'administrator', 'centrala'))
CREATE OR REPLACE FUNCTION public.get_quiz_for_attempt(p_course_id uuid)
RETURNS TABLE(question_id uuid, question_order integer, question_text text, options jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
END; $$;

-- 3. Drop zombie policies on compass_legacy (client grants revoked; RLS enabled)
DROP POLICY IF EXISTS "Admins can manage candidates" ON compass_legacy.candidates;
DROP POLICY IF EXISTS "Users can insert own candidate" ON compass_legacy.candidates;
DROP POLICY IF EXISTS "Users can update own candidate" ON compass_legacy.candidates;
DROP POLICY IF EXISTS "Users can view own candidate" ON compass_legacy.candidates;
DROP POLICY IF EXISTS "Users can insert own referrals" ON compass_legacy.centrala_referrals;
DROP POLICY IF EXISTS "Users can view own referrals" ON compass_legacy.centrala_referrals;
DROP POLICY IF EXISTS "Admins can update referral status" ON compass_legacy.centrala_referrals;
DROP POLICY IF EXISTS "Users can view their own referrals" ON compass_legacy.project_referrals;
DROP POLICY IF EXISTS "Admins can view all referrals" ON compass_legacy.project_referrals;
DROP POLICY IF EXISTS "Users can submit referrals" ON compass_legacy.project_referrals;
DROP POLICY IF EXISTS "Users can withdraw their own referrals" ON compass_legacy.project_referrals;
DROP POLICY IF EXISTS "Admins can update referrals" ON compass_legacy.project_referrals;
DROP POLICY IF EXISTS "Admins manage import_batches" ON compass_legacy.import_batches;
DROP POLICY IF EXISTS "Authenticated read market_rates" ON compass_legacy.market_rates;
DROP POLICY IF EXISTS "Admins manage market_rates" ON compass_legacy.market_rates;
DROP POLICY IF EXISTS "Users view own rate verifications" ON compass_legacy.rate_verifications;
DROP POLICY IF EXISTS "Users insert own rate verifications" ON compass_legacy.rate_verifications;
DROP POLICY IF EXISTS "Admins manage rate_verifications" ON compass_legacy.rate_verifications;

-- 4. Public schema admin checks → is_admin() helper
DROP POLICY IF EXISTS "Super admins can manage admin access list" ON admin_access_list;
DROP POLICY IF EXISTS "Authenticated users can read admin_access_list" ON admin_access_list;
DROP POLICY IF EXISTS "Users can read own admin access entry" ON admin_access_list;
CREATE POLICY "Super admins can manage admin access list" ON admin_access_list FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admins can view all ai logs" ON ai_assistant_logs;
CREATE POLICY "Admins can view all ai logs" ON ai_assistant_logs FOR SELECT TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "Owners or admins can delete documents" ON app_documents;
CREATE POLICY "Owners or admins can delete documents" ON app_documents FOR DELETE TO authenticated USING (auth.uid() = owner_id OR is_admin());
DROP POLICY IF EXISTS "Owners or admins can update documents" ON app_documents;
CREATE POLICY "Owners or admins can update documents" ON app_documents FOR UPDATE TO authenticated USING (auth.uid() = owner_id OR is_admin());
DROP POLICY IF EXISTS "Users and Admins can insert documents" ON app_documents;
CREATE POLICY "Users and Admins can insert documents" ON app_documents FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id OR is_admin());
DROP POLICY IF EXISTS "Users can view own or public documents" ON app_documents;
CREATE POLICY "Users can view own or public documents" ON app_documents FOR SELECT TO authenticated USING (auth.uid() = owner_id OR is_public = true OR is_admin());

DROP POLICY IF EXISTS "Centrala and Admins can view audit logs" ON audit_logs;
CREATE POLICY "Centrala and Admins can view audit logs" ON audit_logs FOR SELECT TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "admin_manage_benefit_declarations" ON benefit_declarations;
CREATE POLICY "admin_manage_benefit_declarations" ON benefit_declarations FOR ALL TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "Administrators can manage centrala access list" ON centrala_access_list;
CREATE POLICY "Administrators can manage centrala access list" ON centrala_access_list FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admins can update benefit status" ON centrala_benefit_declarations;
CREATE POLICY "Admins can update benefit status" ON centrala_benefit_declarations FOR UPDATE TO authenticated USING (is_admin());
DROP POLICY IF EXISTS "Users can view own benefit declarations" ON centrala_benefit_declarations;
CREATE POLICY "Users can view own benefit declarations" ON centrala_benefit_declarations FOR SELECT TO authenticated USING (auth.uid() = profile_id OR is_admin());

DROP POLICY IF EXISTS "Admins can update equipment status" ON centrala_equipment_requests;
CREATE POLICY "Admins can update equipment status" ON centrala_equipment_requests FOR UPDATE TO authenticated USING (is_admin());
DROP POLICY IF EXISTS "Users can view own equipment requests" ON centrala_equipment_requests;
CREATE POLICY "Users can view own equipment requests" ON centrala_equipment_requests FOR SELECT TO authenticated USING (auth.uid() = profile_id OR is_admin());

DROP POLICY IF EXISTS "Admins can update invoice status" ON centrala_invoices;
CREATE POLICY "Admins can update invoice status" ON centrala_invoices FOR UPDATE TO authenticated USING (is_admin());
DROP POLICY IF EXISTS "Users can view own invoices" ON centrala_invoices;
CREATE POLICY "Users can view own invoices" ON centrala_invoices FOR SELECT TO authenticated USING (auth.uid() = profile_id OR is_admin());

DROP POLICY IF EXISTS "Admins manage assist knowledge" ON compass_assist_knowledge;
CREATE POLICY "Admins manage assist knowledge" ON compass_assist_knowledge FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "Admins manage all tickets" ON compass_assist_tickets;
CREATE POLICY "Admins manage all tickets" ON compass_assist_tickets FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_manage_consultant_assignments" ON consultant_assignments;
CREATE POLICY "admin_manage_consultant_assignments" ON consultant_assignments FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admins can manage contracts" ON contracts;
CREATE POLICY "Admins can manage contracts" ON contracts FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "Admins can view all contracts" ON contracts;
CREATE POLICY "Admins can view all contracts" ON contracts FOR SELECT TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "course_enrollments_own_or_admin" ON course_enrollments;
CREATE POLICY "course_enrollments_own_or_admin" ON course_enrollments FOR ALL TO authenticated USING (user_id = auth.uid() OR is_admin()) WITH CHECK (user_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "course_lessons_select_visible_course" ON course_lessons;
CREATE POLICY "course_lessons_select_visible_course" ON course_lessons FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM courses c WHERE c.id = course_lessons.course_id AND (c.status = 'published' OR c.author_id = auth.uid() OR is_admin()))
);
DROP POLICY IF EXISTS "course_lessons_write_owner_or_admin" ON course_lessons;
CREATE POLICY "course_lessons_write_owner_or_admin" ON course_lessons FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM courses c WHERE c.id = course_lessons.course_id AND (c.author_id = auth.uid() OR is_admin()))
);

DROP POLICY IF EXISTS "course_quiz_attempts_own_or_admin" ON course_quiz_attempts;
CREATE POLICY "course_quiz_attempts_own_or_admin" ON course_quiz_attempts FOR ALL TO authenticated USING (user_id = auth.uid() OR is_admin()) WITH CHECK (user_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "course_quiz_options_select_owner_or_admin" ON course_quiz_options;
CREATE POLICY "course_quiz_options_select_owner_or_admin" ON course_quiz_options FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM course_quiz_questions q JOIN courses c ON c.id = q.course_id WHERE q.id = course_quiz_options.question_id AND (c.author_id = auth.uid() OR is_admin()))
);
DROP POLICY IF EXISTS "course_quiz_options_write_owner_or_admin" ON course_quiz_options;
CREATE POLICY "course_quiz_options_write_owner_or_admin" ON course_quiz_options FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM course_quiz_questions q JOIN courses c ON c.id = q.course_id WHERE q.id = course_quiz_options.question_id AND (c.author_id = auth.uid() OR is_admin()))
);

DROP POLICY IF EXISTS "course_quiz_questions_select_visible" ON course_quiz_questions;
CREATE POLICY "course_quiz_questions_select_visible" ON course_quiz_questions FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM courses c WHERE c.id = course_quiz_questions.course_id AND (c.status = 'published' OR c.author_id = auth.uid() OR is_admin()))
);
DROP POLICY IF EXISTS "course_quiz_questions_write_owner_or_admin" ON course_quiz_questions;
CREATE POLICY "course_quiz_questions_write_owner_or_admin" ON course_quiz_questions FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM courses c WHERE c.id = course_quiz_questions.course_id AND (c.author_id = auth.uid() OR is_admin()))
);

DROP POLICY IF EXISTS "course_ratings_delete_own_or_admin" ON course_ratings;
CREATE POLICY "course_ratings_delete_own_or_admin" ON course_ratings FOR DELETE TO authenticated USING (user_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "courses_delete_admin_only" ON courses;
CREATE POLICY "courses_delete_admin_only" ON courses FOR DELETE TO authenticated USING (is_admin());
DROP POLICY IF EXISTS "courses_insert_own_or_admin" ON courses;
CREATE POLICY "courses_insert_own_or_admin" ON courses FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid() OR is_admin());
DROP POLICY IF EXISTS "courses_select_published_or_own_or_admin" ON courses;
CREATE POLICY "courses_select_published_or_own_or_admin" ON courses FOR SELECT TO authenticated USING (status = 'published' OR author_id = auth.uid() OR is_admin());
DROP POLICY IF EXISTS "courses_update_own_or_admin" ON courses;
CREATE POLICY "courses_update_own_or_admin" ON courses FOR UPDATE TO authenticated USING (author_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "Owners or admins can delete versions" ON document_versions;
CREATE POLICY "Owners or admins can delete versions" ON document_versions FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM app_documents WHERE app_documents.id = document_versions.document_id AND (app_documents.owner_id = auth.uid() OR is_admin()))
);
DROP POLICY IF EXISTS "Users can view accessible document versions" ON document_versions;
CREATE POLICY "Users can view accessible document versions" ON document_versions FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM app_documents WHERE app_documents.id = document_versions.document_id AND (app_documents.owner_id = auth.uid() OR app_documents.is_public = true OR is_admin()))
);

DROP POLICY IF EXISTS "admin_manage_equipment_requests" ON equipment_requests;
CREATE POLICY "admin_manage_equipment_requests" ON equipment_requests FOR ALL TO authenticated USING (is_admin());
DROP POLICY IF EXISTS "view_equipment_requests" ON equipment_requests;
CREATE POLICY "view_equipment_requests" ON equipment_requests FOR SELECT TO authenticated USING (auth.uid() = profile_id OR is_admin());

DROP POLICY IF EXISTS "admin_update_all_invoices" ON invoices;
CREATE POLICY "admin_update_all_invoices" ON invoices FOR UPDATE TO authenticated USING (is_admin());
DROP POLICY IF EXISTS "admin_view_all_invoices" ON invoices;
CREATE POLICY "admin_view_all_invoices" ON invoices FOR SELECT TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "Admins write loyalty_rules" ON loyalty_rules;
DROP POLICY IF EXISTS "Enable write access for admins" ON loyalty_rules;
CREATE POLICY "Admins write loyalty_rules" ON loyalty_rules FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admins can manage all notifications" ON notifications;
CREATE POLICY "Admins can manage all notifications" ON notifications FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admins can manage projects" ON projects;
DROP POLICY IF EXISTS "Admins can insert projects" ON projects;
DROP POLICY IF EXISTS "Admins can update projects" ON projects;
DROP POLICY IF EXISTS "Admins can delete projects" ON projects;
CREATE POLICY "Admins can manage projects" ON projects FOR ALL TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "Admins manage role_permissions" ON role_permissions;
CREATE POLICY "Admins manage role_permissions" ON role_permissions FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_manage_system_settings" ON system_settings;
CREATE POLICY "admin_manage_system_settings" ON system_settings FOR ALL TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "Admins manage all boards" ON task_boards;
CREATE POLICY "Admins manage all boards" ON task_boards FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "Users view own or shared boards" ON task_boards;
CREATE POLICY "Users view own or shared boards" ON task_boards FOR SELECT TO authenticated USING (
  auth.uid() = owner_id OR visibility IN ('team', 'public') OR is_admin()
);

DROP POLICY IF EXISTS "Admins manage legal documents" ON um_legal_documents;
CREATE POLICY "Admins manage legal documents" ON um_legal_documents FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "user_consents_admin_read" ON um_user_consents;
CREATE POLICY "user_consents_admin_read" ON um_user_consents FOR SELECT TO authenticated USING (is_admin());

-- 5. Storage policies
DROP POLICY IF EXISTS "Admins can read all app-docs" ON storage.objects;
CREATE POLICY "Admins can read all app-docs" ON storage.objects FOR SELECT TO authenticated USING (
    bucket_id = 'documents' AND (storage.foldername(name))[1] = 'app-docs' AND is_admin()
);
DROP POLICY IF EXISTS "Admins can read all documents" ON storage.objects;
CREATE POLICY "Admins can read all documents" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'documents' AND is_admin());
DROP POLICY IF EXISTS "Admins can upload Candidates CVs" ON storage.objects;
CREATE POLICY "Admins can upload Candidates CVs" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'documents' AND (storage.foldername(name))[1] = 'candidates' AND is_admin()
);
DROP POLICY IF EXISTS "Admins can upload Project Specs" ON storage.objects;
CREATE POLICY "Admins can upload Project Specs" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'documents' AND (storage.foldername(name))[1] = 'specs' AND is_admin()
);

-- Remove every remaining legacy policy whose parsed expression still embeds
-- public.profiles.role. Earlier migrations used many inconsistent names, so a
-- static list silently left duplicates behind and blocked the enum cast.
DO $$
DECLARE
  policy_row RECORD;
BEGIN
  FOR policy_row IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE COALESCE(qual, '') LIKE '%profiles.role%'
       OR COALESCE(with_check, '') LIKE '%profiles.role%'
  LOOP
    EXECUTE format(
      'DROP POLICY %I ON %I.%I',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename
    );
  END LOOP;
END
$$;

-- Policies above are now expressed only through the stable helper. These four
-- capabilities had no equivalent helper-based replacement in the legacy set.
CREATE POLICY "Admins can insert audit logs v2" ON audit_logs
  FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "Admins can manage loyalty transactions v2" ON loyalty_transactions
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Admins can insert verification codes v2" ON verification_codes
  FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "Admins can upload public docs v2" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = 'public'
    AND is_admin()
  );

COMMIT;
