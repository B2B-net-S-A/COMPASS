-- Task Engine Schema
-- Sprint 6: Tables for task management system

-- Task boards (containers for columns and tasks)
CREATE TABLE IF NOT EXISTS task_boards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    visibility TEXT DEFAULT 'team' CHECK (visibility IN ('private', 'team', 'public')),
    archived BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Columns within a board
CREATE TABLE IF NOT EXISTS task_columns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    board_id UUID NOT NULL REFERENCES task_boards(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    color TEXT DEFAULT '#3B82F6',
    wip_limit INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tasks
CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    board_id UUID NOT NULL REFERENCES task_boards(id) ON DELETE CASCADE,
    column_id UUID NOT NULL REFERENCES task_columns(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    status TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'review', 'done', 'blocked')),
    position INTEGER NOT NULL DEFAULT 0,
    due_date DATE,
    labels TEXT[] DEFAULT '{}',
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Task assignments (many-to-many)
CREATE TABLE IF NOT EXISTS task_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(task_id, user_id)
);

-- Task comments
CREATE TABLE IF NOT EXISTS task_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    parent_id UUID REFERENCES task_comments(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Task activity log
CREATE TABLE IF NOT EXISTS task_activity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    details JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tasks_board_id ON tasks(board_id);
CREATE INDEX IF NOT EXISTS idx_tasks_column_id ON tasks(column_id);
CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON tasks(created_by);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
CREATE INDEX IF NOT EXISTS idx_task_columns_board_id ON task_columns(board_id);
CREATE INDEX IF NOT EXISTS idx_task_assignments_task_id ON task_assignments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_assignments_user_id ON task_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_task_id ON task_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_activity_task_id ON task_activity(task_id);

-- RLS Policies
ALTER TABLE task_boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_activity ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'task_boards' AND policyname = 'task_boards_select') THEN
    CREATE POLICY task_boards_select ON task_boards FOR SELECT USING (true);
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'task_boards' AND policyname = 'task_boards_insert') THEN
    CREATE POLICY task_boards_insert ON task_boards FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'task_boards' AND policyname = 'task_boards_update') THEN
    CREATE POLICY task_boards_update ON task_boards FOR UPDATE USING (auth.uid() IS NOT NULL);
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'task_boards' AND policyname = 'task_boards_delete') THEN
    CREATE POLICY task_boards_delete ON task_boards FOR DELETE USING (owner_id = auth.uid());
END IF;

IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'task_columns' AND policyname = 'task_columns_all') THEN
    CREATE POLICY task_columns_all ON task_columns USING (true) WITH CHECK (auth.uid() IS NOT NULL);
END IF;

IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tasks' AND policyname = 'tasks_all') THEN
    CREATE POLICY tasks_all ON tasks USING (true) WITH CHECK (auth.uid() IS NOT NULL);
END IF;

IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'task_assignments' AND policyname = 'task_assignments_all') THEN
    CREATE POLICY task_assignments_all ON task_assignments USING (true) WITH CHECK (auth.uid() IS NOT NULL);
END IF;

IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'task_comments' AND policyname = 'task_comments_all') THEN
    CREATE POLICY task_comments_all ON task_comments USING (true) WITH CHECK (auth.uid() IS NOT NULL);
END IF;

IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'task_activity' AND policyname = 'task_activity_all') THEN
    CREATE POLICY task_activity_all ON task_activity USING (true) WITH CHECK (auth.uid() IS NOT NULL);
END IF;
END $$;
