-- Phase 28c — placement natural-key uniqueness should not block re-imports after
-- a placement was cancelled (consultant left, deal fell through, etc.). Cancelled
-- rows are historical; their natural key (consultant+client+start) should be
-- reusable by a fresh import of the same person/client.
--
-- Old: UNIQUE (lower(consultant), lower(client), start_date) over ALL rows.
-- New: same UNIQUE, partial WHERE status <> 'cancelled'.
--
-- Active duplicates (two non-cancelled rows with same key) remain blocked.
-- Coexistence of one cancelled + one active row with the same key becomes allowed.

DROP INDEX IF EXISTS idx_placements_natural_key;

CREATE UNIQUE INDEX idx_placements_natural_key
    ON public.placements (lower(consultant_name), lower(client_name), start_date)
    WHERE status <> 'cancelled';

COMMENT ON INDEX idx_placements_natural_key IS
    'Partial unique on natural key over non-cancelled rows only — lets re-imports reuse keys of historical cancelled placements (Phase 28c).';
