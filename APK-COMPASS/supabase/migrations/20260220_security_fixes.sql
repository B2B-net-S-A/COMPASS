-- ============================================================================
-- SECURITY FIXES — Supabase Database Linter Warnings
-- Date: 2026-02-20
-- Author: ComPass DevOps
--
-- Fixes:
--   1. RLS policies: admin_access_list, audit_logs, match_results, verification_codes
--   2. search_path for 14 functions
--   3. Extensions moved from public to extensions schema
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. FIX CRITICAL RLS POLICIES
-- ============================================================================

-- ─── 1a. admin_access_list — CRITICAL ────────────────────────────────────────
-- Problem: ANY authenticated user can read/modify admin list (privilege escalation)
-- Fix: Only administrators can manage this table

DROP POLICY IF EXISTS "Authenticated users can modify admin_access_list" ON public.admin_access_list;

-- Admins can read the list
CREATE POLICY "Admins can read admin_access_list"
  ON public.admin_access_list
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'administrator'
    )
  );

-- Admins can insert new entries
CREATE POLICY "Admins can insert admin_access_list"
  ON public.admin_access_list
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'administrator'
    )
  );

-- Admins can update entries
CREATE POLICY "Admins can update admin_access_list"
  ON public.admin_access_list
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'administrator'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'administrator'
    )
  );

-- Admins can delete entries
CREATE POLICY "Admins can delete admin_access_list"
  ON public.admin_access_list
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'administrator'
    )
  );

-- ─── 1b. audit_logs — restrict INSERT to service role + admins ───────────────
-- Problem: Any authenticated user can insert fake audit logs
-- Fix: Only admins and centrala can insert (server-side calls use service role anyway)

DROP POLICY IF EXISTS "Authenticated can insert audit logs" ON public.audit_logs;

CREATE POLICY "Admins and centrala can insert audit logs"
  ON public.audit_logs
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('administrator', 'centrala')
    )
  );

-- ─── 1c. match_results — restrict to admins + owner ─────────────────────────
-- Problem: Any authenticated user can read/modify ALL match results
-- Fix: Users see only their own matches; admins see all

DROP POLICY IF EXISTS "Allow authenticated users to insert/update matches" ON public.match_results;

-- Select: own matches or admin
CREATE POLICY "Users can read own match_results"
  ON public.match_results
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = candidate_id AND c.user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('administrator', 'centrala')
    )
  );

-- Insert: own matches or admin
CREATE POLICY "Users can insert own match_results"
  ON public.match_results
  FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = candidate_id AND c.user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('administrator', 'centrala')
    )
  );

-- Update: own matches or admin
CREATE POLICY "Users can update own match_results"
  ON public.match_results
  FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = candidate_id AND c.user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('administrator', 'centrala')
    )
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = candidate_id AND c.user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('administrator', 'centrala')
    )
  );

-- ─── 1d. verification_codes — restrict INSERT to own codes ──────────────────
-- Problem: Any authenticated user can insert verification codes for anyone
-- Fix: Only admins/centrala (MFA senders) or service role can insert

DROP POLICY IF EXISTS "Authenticated can insert verification codes" ON public.verification_codes;

CREATE POLICY "Admins can manage verification_codes"
  ON public.verification_codes
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('administrator', 'centrala')
    )
  );


-- ============================================================================
-- 2. FIX search_path FOR ALL FUNCTIONS
-- ============================================================================

-- ─── 2a. is_conversation_member ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_conversation_member(conv_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversation_participants
    WHERE conversation_id = conv_id
      AND user_id = auth.uid()
  );
$$;

-- ─── 2b. update_contracts_updated_at ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_contracts_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- ─── 2c. update_doc_timestamp ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_doc_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- ─── 2d. match_projects ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.match_projects(
    query_embedding vector(1536),
    match_threshold float,
    match_count int
)
RETURNS TABLE (
    id uuid,
    title text,
    description text,
    required_skills text[],
    similarity float
)
LANGUAGE plpgsql
SET search_path = 'public, extensions'
AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.id,
        p.title,
        p.description,
        p.required_skills,
        1 - (p.embedding <=> query_embedding) AS similarity
    FROM public.projects p
    WHERE 1 - (p.embedding <=> query_embedding) > match_threshold
    ORDER BY p.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- ─── 2e. match_assist_knowledge ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.match_assist_knowledge(
    query_embedding vector(1536),
    match_threshold float,
    match_count int,
    filter_category text DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    content text,
    category text,
    metadata jsonb,
    similarity float
)
LANGUAGE plpgsql
SET search_path = 'public, extensions'
AS $$
BEGIN
    RETURN QUERY
    SELECT
        k.id,
        k.content,
        k.category,
        k.metadata,
        1 - (k.embedding <=> query_embedding) AS similarity
    FROM public.compass_assist_knowledge k
    WHERE (1 - (k.embedding <=> query_embedding) > match_threshold)
      AND (filter_category IS NULL OR k.category = filter_category)
    ORDER BY k.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- ─── 2f. handle_new_user ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, avatar_url)
    VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url');
    RETURN new;
END;
$$;

-- ─── 2g. search_documents_for_ai ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.search_documents_for_ai(
    search_query TEXT,
    user_role TEXT DEFAULT 'consultant',
    max_results INT DEFAULT 5
)
RETURNS TABLE (
    id UUID,
    title TEXT,
    category TEXT,
    description TEXT,
    text_content TEXT,
    owner_id UUID,
    is_public BOOLEAN,
    relevance REAL
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public, extensions'
AS $$
BEGIN
    RETURN QUERY
    SELECT
        d.id,
        d.title,
        d.category,
        d.description,
        LEFT(d.text_content, 2000) AS text_content,
        d.owner_id,
        d.is_public,
        ts_rank(
            to_tsvector('polish', COALESCE(d.text_content, '') || ' ' || COALESCE(d.title, '') || ' ' || COALESCE(d.description, '')),
            plainto_tsquery('polish', search_query)
        ) AS relevance
    FROM public.app_documents d
    WHERE d.is_archived = false
      AND d.text_content IS NOT NULL
      AND (d.is_public = true OR user_role IN ('admin', 'administrator', 'centrala'))
      AND to_tsvector('polish', COALESCE(d.text_content, '') || ' ' || COALESCE(d.title, '') || ' ' || COALESCE(d.description, ''))
          @@ plainto_tsquery('polish', search_query)
    ORDER BY relevance DESC
    LIMIT max_results;
END;
$$;

-- ─── 2h. update_contract_status ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_contract_status()
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    UPDATE public.contracts
    SET status = 'ending_soon'
    WHERE status = 'active'
      AND end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days';

    UPDATE public.contracts
    SET status = 'completed'
    WHERE status IN ('active', 'ending_soon')
      AND end_date < CURRENT_DATE;
END;
$$;

-- ─── 2i. sync_profile_to_candidate ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_profile_to_candidate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public, extensions'
AS $$
BEGIN
    INSERT INTO public.candidates (
        user_id, email, full_name, bio, skills, experience_years,
        current_status, capacity_percentage, project_sentiment,
        verifier_status, ambassador_status, sales_support_status,
        previous_clients, avatar_url, cv_url, embedding,
        available_from, fte_status, max_monthly_hours, updated_at
    )
    VALUES (
        NEW.id, NEW.email, NEW.full_name, NEW.bio, NEW.skills, NEW.experience_years,
        NEW.current_status, NEW.capacity_percentage, NEW.project_sentiment,
        NEW.verifier_status, NEW.ambassador_status, NEW.sales_support_status,
        NEW.previous_clients, NEW.avatar_url, NEW.cv_url, NEW.embedding,
        NEW.available_from, NEW.fte_status, NEW.max_monthly_hours, NOW()
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
$$;

-- ─── 2j. update_loyalty_points ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_loyalty_points()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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
$$;

-- ─── 2k. get_projects_count ─────────────────────────────────────────────────
-- Note: Return type changed, must DROP first then recreate
DROP FUNCTION IF EXISTS public.get_projects_count();

CREATE OR REPLACE FUNCTION public.get_projects_count()
RETURNS bigint
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT count(*) FROM public.projects;
$$;

-- ─── 2l. create_notification ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_notification(
    p_user_id UUID,
    p_type TEXT,
    p_title_pl TEXT,
    p_title_en TEXT,
    p_body_pl TEXT DEFAULT NULL,
    p_body_en TEXT DEFAULT NULL,
    p_action_url TEXT DEFAULT NULL,
    p_priority TEXT DEFAULT 'normal'
)
RETURNS UUID
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE v_notification_id UUID;
BEGIN
    INSERT INTO public.notifications (
        user_id, type, title_pl, title_en, body_pl, body_en, action_url, priority
    )
    VALUES (
        p_user_id, p_type, p_title_pl, p_title_en, p_body_pl, p_body_en, p_action_url, p_priority
    )
    RETURNING id INTO v_notification_id;
    RETURN v_notification_id;
END;
$$;

-- ─── 2m. expire_old_notifications ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.expire_old_notifications()
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    DELETE FROM public.notifications
    WHERE expires_at < NOW()
      OR (created_at < NOW() - INTERVAL '90 days' AND is_read = TRUE);
END;
$$;

-- ─── 2n. match_candidates ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.match_candidates(
    query_embedding vector(1536),
    match_threshold float,
    match_count int
)
RETURNS TABLE (
    id uuid,
    full_name text,
    avatar_url text,
    job_title text,
    similarity float
)
LANGUAGE plpgsql
SET search_path = 'public, extensions'
AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id,
        c.full_name,
        c.avatar_url,
        c.current_status AS job_title,
        1 - (c.embedding <=> query_embedding) AS similarity
    FROM public.candidates c
    WHERE 1 - (c.embedding <=> query_embedding) > match_threshold
    ORDER BY c.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;


-- ============================================================================
-- 3. MOVE EXTENSIONS TO DEDICATED SCHEMA
-- ============================================================================

-- Create extensions schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS extensions;

-- Grant usage so functions still work
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;

-- Move extensions (these are idempotent — if already there, no error)
ALTER EXTENSION vector SET SCHEMA extensions;
ALTER EXTENSION unaccent SET SCHEMA extensions;


COMMIT;
