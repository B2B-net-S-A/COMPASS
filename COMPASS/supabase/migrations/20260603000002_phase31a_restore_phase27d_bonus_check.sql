-- Phase 31a — restore Phase 27d field requirements that Phase 31 regressed.
--
-- Phase 31 (2026-06-02) added the 5th category (champions_league) by rewriting the
-- whole bonuses_category_fields_required CHECK. That rewrite accidentally went BACK
-- to the pre-Phase-27d shape for sales/delivery_lead/recruiter:
--   • sales: required sales_client_name (old) instead of generic client_name (Phase 27d)
--   • delivery_lead: required delivery_consultant_id UUID (old) instead of
--     delivery_candidate_name text + client_name (Phase 27d)
--   • recruiter: dropped the client_name requirement (Phase 27d had it)
--
-- This broke Phase 28 placement bonus generation. Placement consultants are EXTERNAL
-- free-text names (not internal profiles), so `delivery_consultant_id` is always NULL —
-- the regressed constraint blocks every confirmPlacementHours INSERT.
--
-- This migration restores Phase 27d field requirements for sales/delivery_lead/recruiter
-- and preserves Phase 31's champions_league + custom branches.

ALTER TABLE bonuses DROP CONSTRAINT IF EXISTS bonuses_category_fields_required;

ALTER TABLE bonuses ADD CONSTRAINT bonuses_category_fields_required CHECK (
    (category = 'sales'
        AND client_name IS NOT NULL
        AND length(client_name) >= 2
        AND sales_service_description IS NOT NULL
        AND length(sales_service_description) >= 3)
    OR (category = 'delivery_lead'
        AND client_name IS NOT NULL
        AND length(client_name) >= 2
        AND delivery_candidate_name IS NOT NULL
        AND length(delivery_candidate_name) >= 3
        AND delivery_margin_amount IS NOT NULL
        AND delivery_margin_amount > 0)
    OR (category = 'recruiter'
        AND client_name IS NOT NULL
        AND length(client_name) >= 2
        AND recruiter_margin_per_hour IS NOT NULL
        AND recruiter_margin_per_hour >= 0
        AND recruiter_candidate_name IS NOT NULL
        AND length(recruiter_candidate_name) >= 3
        AND recruiter_calculated_tier IS NOT NULL)
    OR (category = 'custom'
        AND (custom_email_memo IS NOT NULL OR attachment_path IS NOT NULL))
    OR (category = 'champions_league'
        AND place_rank IS NOT NULL
        AND period_quarter IS NOT NULL
        AND period_month IS NULL)
) NOT VALID;

COMMENT ON CONSTRAINT bonuses_category_fields_required ON bonuses IS
    'Phase 31a — restored Phase 27d shape (client_name + delivery_candidate_name for placements as external free-text consultants) after Phase 31 inadvertently reverted to pre-27d delivery_consultant_id requirement.';
