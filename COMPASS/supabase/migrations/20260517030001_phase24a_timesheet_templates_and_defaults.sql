-- ============================================================
-- Phase 24a — Timesheet UX: per-user templates + global role defaults
-- Date: 2026-05-17
--
-- Depends on:
--   - 20260212_project_referrals.sql (update_updated_at_column)
--   - 20260504000002_phase1_role_enum.sql (user_role enum, is_admin)
--   - 20260516000002_phase20b_manager_id_and_helpers.sql (manager_id)
--
-- Creates:
--   table:     timesheet_user_templates (snippets per-user dla opisu usług)
--   table:     timesheet_role_defaults  (admin-defined globalne prefill per rola/projekt)
--   helpers:   resolve_role_default(target_role, target_project) — pierwszeństwo:
--                role+project > role > project > global
--
-- Workflow:
--   * Pracownik: tworzy własne snippety (np. "Code review", "Standup", "Konsultacje SAP")
--     → wstawia jednym klikiem do entry dialogu (override description / project).
--   * Admin: definiuje globalne defaults per rola (np. konsultant SAP) lub per projekt
--     (np. "Audyt B2B Network") → auto-prefill pustych entries gdy user zaczyna miesiąc.
-- ============================================================

BEGIN;

-- ─── 1. timesheet_user_templates (per-user snippets) ──────────────────────
CREATE TABLE IF NOT EXISTS timesheet_user_templates (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    name        TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
    description TEXT NOT NULL CHECK (length(trim(description)) BETWEEN 1 AND 2000),
    project     TEXT,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT timesheet_user_templates_name_unique UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_timesheet_user_templates_user
    ON timesheet_user_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_timesheet_user_templates_user_sort
    ON timesheet_user_templates(user_id, sort_order);

DROP TRIGGER IF EXISTS timesheet_user_templates_updated_at ON timesheet_user_templates;
CREATE TRIGGER timesheet_user_templates_updated_at BEFORE UPDATE ON timesheet_user_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE timesheet_user_templates IS
    'Phase 24a. Per-user snippets — szybkie wstawianie opisów usług do timesheet entries. Edytowane wyłącznie przez właściciela.';
COMMENT ON COLUMN timesheet_user_templates.project IS
    'Phase 24a. Opcjonalny projekt domyślny dla snippetu. NULL = bez sugestii projektu.';

-- ─── 2. timesheet_role_defaults (admin-defined globalne prefill) ──────────
CREATE TABLE IF NOT EXISTS timesheet_role_defaults (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    label               TEXT NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 120),
    applies_to_role     user_role,
    project             TEXT,
    default_description TEXT NOT NULL CHECK (length(trim(default_description)) BETWEEN 1 AND 2000),
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order          INTEGER NOT NULL DEFAULT 0,
    created_by          UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_timesheet_role_defaults_active
    ON timesheet_role_defaults(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_timesheet_role_defaults_role
    ON timesheet_role_defaults(applies_to_role) WHERE applies_to_role IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_timesheet_role_defaults_project
    ON timesheet_role_defaults(project) WHERE project IS NOT NULL;

DROP TRIGGER IF EXISTS timesheet_role_defaults_updated_at ON timesheet_role_defaults;
CREATE TRIGGER timesheet_role_defaults_updated_at BEFORE UPDATE ON timesheet_role_defaults
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE timesheet_role_defaults IS
    'Phase 24a. Globalne prefill opisu usług — admin definiuje per rola lub per projekt. Priority: role+project > role > project > global.';
COMMENT ON COLUMN timesheet_role_defaults.applies_to_role IS
    'Phase 24a. Rola, dla której obowiązuje default. NULL = każda rola.';
COMMENT ON COLUMN timesheet_role_defaults.project IS
    'Phase 24a. Konkretny projekt, do którego pasuje default. NULL = każdy projekt.';

-- ─── 3. Helper: resolve_role_default(target_role, target_project) ────────
-- Zwraca najbardziej specyficzny aktywny default dla pary (role, project).
-- Priority (lower number = higher priority):
--   1) applies_to_role = X AND project = Y
--   2) applies_to_role = X AND project IS NULL
--   3) applies_to_role IS NULL AND project = Y
--   4) applies_to_role IS NULL AND project IS NULL
CREATE OR REPLACE FUNCTION public.resolve_role_default(
    target_role    user_role,
    target_project TEXT
)
RETURNS TABLE (
    id                  UUID,
    label               TEXT,
    default_description TEXT,
    project             TEXT,
    applies_to_role     user_role
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
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
$$;

COMMENT ON FUNCTION public.resolve_role_default IS
    'Phase 24a. Zwraca najbardziej specyficzny aktywny default dla pary (role, project). NULL→NULL = fallback global.';

REVOKE EXECUTE ON FUNCTION public.resolve_role_default(user_role, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_role_default(user_role, TEXT) TO authenticated, service_role;

-- ─── 4. RLS: timesheet_user_templates (owner-only CRUD) ───────────────────
ALTER TABLE timesheet_user_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tut_select_own" ON timesheet_user_templates;
CREATE POLICY "tut_select_own" ON timesheet_user_templates
    FOR SELECT TO authenticated
    USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "tut_insert_own" ON timesheet_user_templates;
CREATE POLICY "tut_insert_own" ON timesheet_user_templates
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "tut_update_own" ON timesheet_user_templates;
CREATE POLICY "tut_update_own" ON timesheet_user_templates
    FOR UPDATE TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "tut_delete_own" ON timesheet_user_templates;
CREATE POLICY "tut_delete_own" ON timesheet_user_templates
    FOR DELETE TO authenticated
    USING (auth.uid() = user_id);

-- ─── 5. RLS: timesheet_role_defaults (read for HR-zone, write for admin) ──
ALTER TABLE timesheet_role_defaults ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trd_select_authenticated" ON timesheet_role_defaults;
CREATE POLICY "trd_select_authenticated" ON timesheet_role_defaults
    FOR SELECT TO authenticated
    USING (TRUE);

DROP POLICY IF EXISTS "trd_insert_admin" ON timesheet_role_defaults;
CREATE POLICY "trd_insert_admin" ON timesheet_role_defaults
    FOR INSERT TO authenticated
    WITH CHECK (is_admin());

DROP POLICY IF EXISTS "trd_update_admin" ON timesheet_role_defaults;
CREATE POLICY "trd_update_admin" ON timesheet_role_defaults
    FOR UPDATE TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());

DROP POLICY IF EXISTS "trd_delete_admin" ON timesheet_role_defaults;
CREATE POLICY "trd_delete_admin" ON timesheet_role_defaults
    FOR DELETE TO authenticated
    USING (is_admin());

-- ─── 6. Audit log action types (comment only) ─────────────────────────────
-- Server actions emit (audit_logs.action is TEXT, no schema change required):
--   'TIMESHEET_COPIED_FROM_PREVIOUS', 'TIMESHEET_TEMPLATE_CREATED',
--   'TIMESHEET_TEMPLATE_UPDATED', 'TIMESHEET_TEMPLATE_DELETED',
--   'TIMESHEET_TEMPLATE_APPLIED', 'TIMESHEET_EXPORTED_CSV',
--   'ROLE_DEFAULT_CREATED', 'ROLE_DEFAULT_UPDATED', 'ROLE_DEFAULT_DELETED'.

COMMIT;
