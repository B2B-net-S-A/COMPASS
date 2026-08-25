-- Audit log for changes to market_rates (Stawki module).
-- Captures every INSERT/UPDATE/DELETE so admins can see "who changed what, when, from-to".
-- ROLLBACK: DROP TABLE IF EXISTS rate_change_log; DROP FUNCTION IF EXISTS log_rate_change CASCADE;

-- ─── Table ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rate_change_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rate_id UUID,                                     -- nullable for DELETE rows (rate is gone)
    action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
    changed_by UUID REFERENCES auth.users(id),        -- nullable for trigger-driven jobs
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Snapshot of the most-edited fields (full row in old_data/new_data for completeness)
    position_title TEXT,
    old_rate_min DECIMAL(10, 2),
    new_rate_min DECIMAL(10, 2),
    old_rate_median DECIMAL(10, 2),
    new_rate_median DECIMAL(10, 2),
    old_rate_max DECIMAL(10, 2),
    new_rate_max DECIMAL(10, 2),

    old_data JSONB,                                   -- full pre-image (NULL on INSERT)
    new_data JSONB,                                   -- full post-image (NULL on DELETE)

    CONSTRAINT rate_change_log_action_data CHECK (
        (action = 'INSERT' AND new_data IS NOT NULL AND old_data IS NULL) OR
        (action = 'UPDATE' AND new_data IS NOT NULL AND old_data IS NOT NULL) OR
        (action = 'DELETE' AND new_data IS NULL AND old_data IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_rate_change_log_rate_id ON rate_change_log(rate_id);
CREATE INDEX IF NOT EXISTS idx_rate_change_log_changed_at ON rate_change_log(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_rate_change_log_changed_by ON rate_change_log(changed_by);

-- ─── Trigger function ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION log_rate_change()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ─── Trigger on market_rates ───────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_rate_change_log ON market_rates;
CREATE TRIGGER trg_rate_change_log
AFTER INSERT OR UPDATE OR DELETE ON market_rates
FOR EACH ROW EXECUTE FUNCTION log_rate_change();

-- ─── RLS: admin/centrala can read; nobody writes directly (only the trigger) ──
ALTER TABLE rate_change_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rate_change_log_select_admin" ON rate_change_log;
CREATE POLICY "rate_change_log_select_admin" ON rate_change_log FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('administrator', 'admin', 'centrala')
    )
);

-- No INSERT/UPDATE/DELETE policy — the table is append-only via trigger.
-- service_role bypasses RLS for back-fills.

COMMENT ON TABLE rate_change_log IS 'Append-only audit log of every change to market_rates. Populated by trigger trg_rate_change_log. Read-only for admin/centrala.';
