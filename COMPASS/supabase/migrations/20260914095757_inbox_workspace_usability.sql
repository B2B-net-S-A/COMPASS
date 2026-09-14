-- Additive workspace fields. Existing inbox RLS remains authoritative.
ALTER TABLE public.support_inbox_meta
    ADD COLUMN work_area text NOT NULL DEFAULT 'administration' CHECK (work_area IN ('administration', 'marketing')),
    ADD COLUMN planned_due_date date,
    ADD COLUMN waiting_for text CHECK (length(waiting_for) <= 300),
    ADD COLUMN follow_up_date date,
    ADD COLUMN checklist jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(checklist) = 'array' AND jsonb_array_length(checklist) <= 50),
    ADD COLUMN materials jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(materials) = 'array' AND jsonb_array_length(materials) <= 30);

-- Preserve the Marketing classification introduced by the previous release.
UPDATE public.support_inbox_meta m SET work_area = 'marketing'
FROM public.support_tickets t JOIN public.support_categories c ON c.id = t.category_id
WHERE t.id = m.ticket_id AND c.slug = 'inbox_marketing';

INSERT INTO public.support_categories (slug, name_pl, name_en, icon, sort_order) VALUES
('inbox_grafika', 'Grafika', 'Design', 'Image', 108),
('inbox_publikacja', 'Publikacja', 'Publication', 'FileText', 109),
('inbox_wydarzenie', 'Wydarzenie', 'Event', 'Calendar', 110),
('inbox_kampania', 'Kampania', 'Campaign', 'Megaphone', 111)
ON CONFLICT (slug) DO NOTHING;

-- Edit ticket + metadata together. An outdated editor cannot overwrite newer work.
-- SECURITY INVOKER retains both table policies and the explicit handler guard.
CREATE FUNCTION public.update_inbox_workspace(
    p_ticket_id uuid, p_expected_updated_at timestamptz, p_changes jsonb
) RETURNS timestamptz
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
    v_ticket public.support_tickets%ROWTYPE;
    v_item jsonb;
    v_assignee uuid;
    v_category uuid;
    v_updated_at timestamptz;
BEGIN
    IF auth.uid() IS NULL OR NOT public.is_inbox_handler() THEN
        RAISE EXCEPTION 'Niewystarczające uprawnienia';
    END IF;
    SELECT * INTO v_ticket FROM public.support_tickets WHERE id = p_ticket_id FOR UPDATE;
    IF NOT FOUND OR NOT public.is_inbox_category(v_ticket.category_id)
       OR NOT EXISTS (SELECT 1 FROM public.support_inbox_meta WHERE ticket_id = p_ticket_id) THEN
        RAISE EXCEPTION 'Sprawa nie istnieje lub brak dostępu';
    END IF;
    IF p_expected_updated_at IS NULL OR v_ticket.updated_at IS DISTINCT FROM p_expected_updated_at THEN
        RAISE EXCEPTION 'Sprawa została zmieniona przez inną osobę. Odśwież szczegóły przed zapisem.';
    END IF;
    IF jsonb_typeof(p_changes) IS DISTINCT FROM 'object'
       OR NOT p_changes ?& ARRAY['subject','body_md','category_id','assignee_id','work_area','priority_level','planned_due_date','waiting_for','follow_up_date','checklist','materials']
       OR coalesce(p_changes->>'work_area','') NOT IN ('administration','marketing')
       OR coalesce(p_changes->>'priority_level','') NOT IN ('P1','P2','P3')
       OR length(btrim(coalesce(p_changes->>'subject',''))) NOT BETWEEN 3 AND 200
       OR length(btrim(coalesce(p_changes->>'body_md',''))) NOT BETWEEN 10 AND 20000
       OR length(coalesce(p_changes->>'waiting_for','')) > 300 THEN
        RAISE EXCEPTION 'Nieprawidłowe dane sprawy';
    END IF;
    v_category := (p_changes->>'category_id')::uuid;
    IF v_category IS NULL OR NOT public.is_inbox_category(v_category) THEN
        RAISE EXCEPTION 'Wybierz typ sprawy';
    END IF;
    v_assignee := (p_changes->>'assignee_id')::uuid;
    -- Preserve legacy owners, but newly assigned people must be eligible handlers.
    IF v_assignee IS NOT NULL AND v_assignee IS DISTINCT FROM v_ticket.assignee_id
       AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_assignee
                       AND (role::text = 'talent_community' OR is_inbox_handler = true)
                       AND employment_status::text IS DISTINCT FROM 'exited') THEN
        RAISE EXCEPTION 'Wybrana osoba nie obsługuje spraw lub zakończyła współpracę';
    END IF;
    IF jsonb_typeof(p_changes->'checklist') IS DISTINCT FROM 'array'
       OR jsonb_typeof(p_changes->'materials') IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'Nieprawidłowa checklista lub materiały';
    END IF;
    IF jsonb_array_length(p_changes->'checklist') > 50 OR jsonb_array_length(p_changes->'materials') > 30 THEN
        RAISE EXCEPTION 'Przekroczono limit pozycji';
    END IF;
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_changes->'checklist') LOOP
        IF (v_item->>'id')::uuid IS NULL OR length(btrim(coalesce(v_item->>'text',''))) NOT BETWEEN 1 AND 300
           OR jsonb_typeof(v_item->'done') IS DISTINCT FROM 'boolean' THEN
            RAISE EXCEPTION 'Nieprawidłowa pozycja checklisty';
        END IF;
    END LOOP;
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_changes->'materials') LOOP
        IF (v_item->>'id')::uuid IS NULL OR length(btrim(coalesce(v_item->>'label',''))) NOT BETWEEN 1 AND 150
           OR coalesce(v_item->>'url','') !~* '^https?://[^[:space:]]+$' OR length(v_item->>'url') > 2000 THEN
            RAISE EXCEPTION 'Nieprawidłowy link do materiału';
        END IF;
    END LOOP;
    IF (p_changes->>'planned_due_date')::date NOT BETWEEN date '2000-01-01' AND date '2100-12-31'
       OR (p_changes->>'follow_up_date')::date NOT BETWEEN date '2000-01-01' AND date '2100-12-31' THEN
        RAISE EXCEPTION 'Nieprawidłowa data';
    END IF;
    UPDATE public.support_tickets SET
        subject = btrim(p_changes->>'subject'), body_md = btrim(p_changes->>'body_md'),
        category_id = v_category, assignee_id = v_assignee, updated_at = clock_timestamp()
    WHERE id = p_ticket_id RETURNING updated_at INTO v_updated_at;
    UPDATE public.support_inbox_meta SET
        work_area = p_changes->>'work_area', priority_level = p_changes->>'priority_level',
        planned_due_date = (p_changes->>'planned_due_date')::date,
        waiting_for = nullif(btrim(p_changes->>'waiting_for'), ''), follow_up_date = (p_changes->>'follow_up_date')::date,
        checklist = p_changes->'checklist', materials = p_changes->'materials'
    WHERE ticket_id = p_ticket_id;
    IF NOT FOUND OR v_updated_at IS NULL THEN RAISE EXCEPTION 'Nie udało się zapisać całej sprawy'; END IF;
    RETURN v_updated_at;
END;
$$;
REVOKE ALL ON FUNCTION public.update_inbox_workspace(uuid, timestamptz, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_inbox_workspace(uuid, timestamptz, jsonb) TO authenticated;
