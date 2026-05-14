-- ============================================================
-- Phase A2.1 — Learning Paths (ścieżki kariery)
-- Date: 2026-05-08
--
-- Grupy kursów ułożone w sekwencję ("Cloud Fundamentals" = 3 kursy).
-- User zapisuje się na całą ścieżkę, system pokazuje progress.
--
-- Tabele:
--   - learning_paths (master) — published path z metadata
--   - learning_path_courses — pivot: path → course w kolejności
--   - learning_path_enrollments — user'owa subskrypcja
--
-- RLS: published widoczne wszystkim auth, własne enrollments tylko self+admin.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS learning_paths (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    cover_image_url TEXT,
    level TEXT NOT NULL DEFAULT 'beginner' CHECK (level IN ('beginner', 'intermediate', 'advanced')),
    estimated_hours INTEGER,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
    author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    enrollments_count INTEGER NOT NULL DEFAULT 0,
    completions_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_learning_paths_status ON learning_paths(status);
CREATE INDEX IF NOT EXISTS idx_learning_paths_slug ON learning_paths(slug);
CREATE INDEX IF NOT EXISTS idx_learning_paths_level ON learning_paths(level);

CREATE TABLE IF NOT EXISTS learning_path_courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    path_id UUID NOT NULL REFERENCES learning_paths(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    order_index INTEGER NOT NULL,
    is_required BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(path_id, course_id),
    UNIQUE(path_id, order_index)
);

CREATE INDEX IF NOT EXISTS idx_lp_courses_path ON learning_path_courses(path_id, order_index);
CREATE INDEX IF NOT EXISTS idx_lp_courses_course ON learning_path_courses(course_id);

CREATE TABLE IF NOT EXISTS learning_path_enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    path_id UUID NOT NULL REFERENCES learning_paths(id) ON DELETE CASCADE,
    enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    UNIQUE(user_id, path_id)
);

CREATE INDEX IF NOT EXISTS idx_lp_enrollments_user ON learning_path_enrollments(user_id);
CREATE INDEX IF NOT EXISTS idx_lp_enrollments_completed ON learning_path_enrollments(completed_at) WHERE completed_at IS NULL;

-- RLS
ALTER TABLE learning_paths ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_path_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_path_enrollments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "learning_paths_select" ON learning_paths;
CREATE POLICY "learning_paths_select" ON learning_paths
    FOR SELECT TO authenticated
    USING (
        status = 'published'
        OR author_id = auth.uid()
        OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

DROP POLICY IF EXISTS "learning_paths_insert_admin" ON learning_paths;
CREATE POLICY "learning_paths_insert_admin" ON learning_paths
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "learning_paths_update_admin" ON learning_paths;
CREATE POLICY "learning_paths_update_admin" ON learning_paths
    FOR UPDATE TO authenticated
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
    WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "lp_courses_select" ON learning_path_courses;
CREATE POLICY "lp_courses_select" ON learning_path_courses
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM learning_paths lp
            WHERE lp.id = path_id
            AND (lp.status = 'published' OR lp.author_id = auth.uid()
                 OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
        )
    );

DROP POLICY IF EXISTS "lp_courses_modify_admin" ON learning_path_courses;
CREATE POLICY "lp_courses_modify_admin" ON learning_path_courses
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
    WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "lp_enrollments_self_or_admin" ON learning_path_enrollments;
CREATE POLICY "lp_enrollments_self_or_admin" ON learning_path_enrollments
    FOR ALL TO authenticated
    USING (
        user_id = auth.uid()
        OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    )
    WITH CHECK (
        user_id = auth.uid()
        OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- Trigger: updated_at
CREATE OR REPLACE FUNCTION trg_learning_paths_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS learning_paths_updated_at ON learning_paths;
CREATE TRIGGER learning_paths_updated_at BEFORE UPDATE ON learning_paths
    FOR EACH ROW EXECUTE FUNCTION trg_learning_paths_updated_at();

-- Trigger: bump enrollments_count na insert/delete
CREATE OR REPLACE FUNCTION trg_lp_enrollment_stats()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE learning_paths SET enrollments_count = enrollments_count + 1 WHERE id = NEW.path_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE learning_paths SET enrollments_count = GREATEST(0, enrollments_count - 1) WHERE id = OLD.path_id;
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.completed_at IS NULL AND NEW.completed_at IS NOT NULL THEN
            UPDATE learning_paths SET completions_count = completions_count + 1 WHERE id = NEW.path_id;
        ELSIF OLD.completed_at IS NOT NULL AND NEW.completed_at IS NULL THEN
            UPDATE learning_paths SET completions_count = GREATEST(0, completions_count - 1) WHERE id = NEW.path_id;
        END IF;
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS lp_enrollment_stats ON learning_path_enrollments;
CREATE TRIGGER lp_enrollment_stats
    AFTER INSERT OR UPDATE OR DELETE ON learning_path_enrollments
    FOR EACH ROW EXECUTE FUNCTION trg_lp_enrollment_stats();

COMMIT;
