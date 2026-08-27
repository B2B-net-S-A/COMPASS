-- Production verification companion for placement_additional_dl_bonus.
-- The original DDL was applied before the review-required self-check was added
-- to its repository file, so record the same semantic check as its own migration.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'placements'
          AND column_name = 'additional_dl_bonus_id'
          AND data_type = 'uuid'
          AND is_nullable = 'YES'
    ) THEN
        RAISE EXCEPTION 'placements.additional_dl_bonus_id is missing or has an unexpected definition';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint constraint_row
        JOIN pg_attribute source_column
          ON source_column.attrelid = constraint_row.conrelid
         AND source_column.attnum = ANY (constraint_row.conkey)
        JOIN pg_attribute target_column
          ON target_column.attrelid = constraint_row.confrelid
         AND target_column.attnum = ANY (constraint_row.confkey)
        WHERE constraint_row.contype = 'f'
          AND constraint_row.conrelid = 'public.placements'::regclass
          AND constraint_row.confrelid = 'public.bonuses'::regclass
          AND constraint_row.confdeltype = 'n'
          AND source_column.attname = 'additional_dl_bonus_id'
          AND target_column.attname = 'id'
    ) THEN
        RAISE EXCEPTION 'placements.additional_dl_bonus_id has no bonuses(id) FK with ON DELETE SET NULL';
    END IF;

    IF to_regclass('public.idx_placements_additional_dl_bonus_id') IS NULL THEN
        RAISE EXCEPTION 'idx_placements_additional_dl_bonus_id is missing';
    END IF;
END $$;
