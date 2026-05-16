-- ============================================================
-- Phase 22e — start_onboarding/offboarding helpers + 3 default seeds
-- Date: 2026-05-17
--
-- Depends on:
--   - 20260517000001 → 20260517000004 (full schema + RLS)
--
-- Provides:
--   start_onboarding_for_user(user_id, template_id?, actor_id?)
--     → creates progress + copies template_items → tasks
--     → sets profiles.employment_status='onboarding'
--     → INSERTs lifecycle_events(onboarding_started)
--     → returns progress_id
--
--   start_offboarding_for_user(user_id, termination_date, scheduled_for?, actor_id?)
--     → sets profiles.employment_status='offboarding', termination_date
--     → creates exit_interviews row (scheduled status, snapshot fields)
--     → creates default offboarding_tasks
--     → INSERTs lifecycle_events(offboarding_started)
--     → returns interview_id
--
-- Seeds 3 default templates (consultant, internal, manager).
-- ============================================================

BEGIN;

-- ─── 1. start_onboarding_for_user ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION start_onboarding_for_user(
    p_user_id UUID,
    p_template_id UUID DEFAULT NULL,
    p_actor_id UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
    v_template_id   UUID;
    v_role          TEXT;
    v_hired_at      DATE;
    v_progress_id   UUID;
BEGIN
    SELECT role::text, COALESCE(hired_at, CURRENT_DATE)
      INTO v_role, v_hired_at
      FROM profiles
     WHERE id = p_user_id;

    IF v_role IS NULL THEN
        RAISE EXCEPTION 'User % not found in profiles', p_user_id
            USING ERRCODE = 'P0001';
    END IF;

    -- Block double-start
    IF EXISTS (SELECT 1 FROM onboarding_progress WHERE user_id = p_user_id) THEN
        RAISE EXCEPTION 'Onboarding already exists for user %', p_user_id
            USING ERRCODE = 'P0001';
    END IF;

    -- Resolve template
    IF p_template_id IS NOT NULL THEN
        SELECT id INTO v_template_id
          FROM onboarding_templates
         WHERE id = p_template_id AND is_archived = FALSE;
    ELSE
        SELECT id INTO v_template_id
          FROM onboarding_templates
         WHERE target_role = v_role
           AND is_default = TRUE
           AND is_archived = FALSE
         LIMIT 1;
    END IF;

    IF v_template_id IS NULL THEN
        RAISE EXCEPTION 'No active onboarding template found for role % (id param: %)', v_role, p_template_id
            USING ERRCODE = 'P0001';
    END IF;

    -- Create progress row
    INSERT INTO onboarding_progress (user_id, template_id)
    VALUES (p_user_id, v_template_id)
    RETURNING id INTO v_progress_id;

    -- Copy template items → tasks (with computed due_date)
    INSERT INTO onboarding_tasks (
        progress_id, template_item_id, title, description, category, course_slug,
        responsible_role, is_required, requires_file, due_date, position
    )
    SELECT
        v_progress_id,
        ti.id,
        ti.title,
        ti.description,
        ti.category,
        ti.course_slug,
        ti.responsible_role,
        ti.is_required,
        ti.requires_file,
        v_hired_at + (ti.due_offset_days || ' days')::interval,
        ti.position
    FROM onboarding_template_items ti
    WHERE ti.template_id = v_template_id
    ORDER BY ti.position;

    -- Update profile status
    UPDATE profiles
       SET employment_status = 'onboarding'
     WHERE id = p_user_id
       AND employment_status IN ('pending', 'active');

    -- Audit timeline
    INSERT INTO lifecycle_events (user_id, event_type, metadata, created_by)
    VALUES (
        p_user_id,
        'onboarding_started',
        jsonb_build_object(
            'template_id', v_template_id,
            'progress_id', v_progress_id,
            'role', v_role,
            'hired_at', v_hired_at
        ),
        p_actor_id
    );

    RETURN v_progress_id;
END;
$$;

COMMENT ON FUNCTION start_onboarding_for_user IS
    'Phase 22. Bootstraps an onboarding run: picks default template per role, copies items → tasks, sets employment_status=onboarding, logs event. Returns progress_id.';

REVOKE EXECUTE ON FUNCTION start_onboarding_for_user(UUID, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION start_onboarding_for_user(UUID, UUID, UUID) TO authenticated, service_role;

-- ─── 2. start_offboarding_for_user ────────────────────────────────────────
CREATE OR REPLACE FUNCTION start_offboarding_for_user(
    p_user_id UUID,
    p_termination_date DATE,
    p_scheduled_for DATE DEFAULT NULL,
    p_actor_id UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
    v_role           TEXT;
    v_manager_id     UUID;
    v_hired_at       DATE;
    v_tenure_months  INTEGER;
    v_interview_id   UUID;
    v_scheduled_for  DATE;
BEGIN
    SELECT role::text, manager_id, hired_at
      INTO v_role, v_manager_id, v_hired_at
      FROM profiles
     WHERE id = p_user_id;

    IF v_role IS NULL THEN
        RAISE EXCEPTION 'User % not found in profiles', p_user_id
            USING ERRCODE = 'P0001';
    END IF;

    -- Block double-start
    IF EXISTS (
        SELECT 1 FROM exit_interviews
         WHERE user_id = p_user_id
           AND status <> 'archived'
    ) THEN
        RAISE EXCEPTION 'Active exit interview already exists for user %', p_user_id
            USING ERRCODE = 'P0001';
    END IF;

    -- Compute tenure (rough months)
    v_tenure_months := CASE
        WHEN v_hired_at IS NOT NULL THEN
            (EXTRACT(YEAR FROM AGE(p_termination_date, v_hired_at)) * 12
             + EXTRACT(MONTH FROM AGE(p_termination_date, v_hired_at)))::INTEGER
        ELSE NULL
    END;

    v_scheduled_for := COALESCE(p_scheduled_for, p_termination_date - INTERVAL '3 days');

    -- Update profile lifecycle
    UPDATE profiles
       SET employment_status = 'offboarding',
           termination_date  = p_termination_date
     WHERE id = p_user_id;

    -- Create exit interview (scheduled)
    INSERT INTO exit_interviews (
        user_id, role_snapshot, manager_snapshot, tenure_months,
        scheduled_for, status
    ) VALUES (
        p_user_id, v_role, v_manager_id, v_tenure_months,
        v_scheduled_for, 'scheduled'
    ) RETURNING id INTO v_interview_id;

    -- Seed default offboarding tasks
    INSERT INTO offboarding_tasks (user_id, category, title, description, responsible_role, due_date, position)
    VALUES
        (p_user_id, 'access_revoke', 'Cofnij dostępy systemowe',
         'Azure SSO + Microsoft 365 + Compass + GitHub deploy keys + Supabase service accounts.',
         'admin', p_termination_date, 0),
        (p_user_id, 'equipment_return', 'Zwrot sprzętu firmowego',
         'Laptop, monitor, telefon, akcesoria — checklist u managera.',
         'manager', p_termination_date, 1),
        (p_user_id, 'knowledge_transfer', 'Knowledge transfer do zespołu',
         'Notatki, dokumentacja projektów, handoff spotkania.',
         'employee', p_termination_date - INTERVAL '7 days', 2),
        (p_user_id, 'final_settlement', 'Finalne rozliczenie faktur',
         'Sprawdź czy wszystkie faktury zaakceptowane, ostatni timesheet zamknięty.',
         'finanse', p_termination_date + INTERVAL '14 days', 3),
        (p_user_id, 'docs_archive', 'Archiwizacja dokumentów + zamknięcie exit interview',
         'Po wypełnieniu ankiety przez pracownika TCM oznacza jako reviewed + archiwizuje folder.',
         'tcm', p_termination_date + INTERVAL '7 days', 4);

    -- Audit timeline
    INSERT INTO lifecycle_events (user_id, event_type, metadata, created_by)
    VALUES (
        p_user_id,
        'offboarding_started',
        jsonb_build_object(
            'interview_id', v_interview_id,
            'termination_date', p_termination_date,
            'scheduled_for', v_scheduled_for,
            'tenure_months', v_tenure_months
        ),
        p_actor_id
    );

    RETURN v_interview_id;
END;
$$;

COMMENT ON FUNCTION start_offboarding_for_user IS
    'Phase 22. Bootstraps offboarding: sets employment_status=offboarding + termination_date, creates exit_interview(scheduled), seeds default offboarding tasks, logs event. Returns interview_id.';

REVOKE EXECUTE ON FUNCTION start_offboarding_for_user(UUID, DATE, DATE, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION start_offboarding_for_user(UUID, DATE, DATE, UUID) TO authenticated, service_role;

-- ─── 3. Seed: Default templates ───────────────────────────────────────────
-- Idempotent: only inserts if no default exists for the role.

-- 3a. Consultant IT (B2B contractor) — Standard
DO $$
DECLARE v_id UUID;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM onboarding_templates
         WHERE target_role = 'consultant' AND is_default = TRUE AND is_archived = FALSE
    ) THEN
        INSERT INTO onboarding_templates (name, target_role, description, is_default)
        VALUES (
            'Konsultant IT — Standard',
            'consultant',
            'Domyślna ścieżka onboardingu dla konsultantów IT (B2B). Pokrywa kontrakt, dostępy, kursy Akademii i pierwsze meetingi.',
            TRUE
        ) RETURNING id INTO v_id;

        INSERT INTO onboarding_template_items
            (template_id, position, category, title, description, due_offset_days, requires_file, course_slug, responsible_role, is_required)
        VALUES
            (v_id, 0, 'docs', 'Podpisz kontrakt B2B', 'Wgraj skan podpisanego kontraktu w PDF.', 3, TRUE, NULL, 'employee', TRUE),
            (v_id, 1, 'docs', 'Wgraj NDA / klauzulę poufności', 'NDA podpisany w PDF.', 3, TRUE, NULL, 'employee', TRUE),
            (v_id, 2, 'access', 'Setup Microsoft 365 + Azure SSO', 'Manager tworzy konto w Azure AD (b2bnetwork.pl), nadaje licencje.', 1, FALSE, NULL, 'admin', TRUE),
            (v_id, 3, 'access', 'Setup dostępu do Compass', 'Aktywne konto, rola=consultant w profiles.', 1, FALSE, NULL, 'admin', TRUE),
            (v_id, 4, 'training', 'Kurs: Onboarding B2B Network', 'Wstępny kurs o firmie, procesach, narzędziach.', 14, FALSE, 'onboarding-b2b-network', 'employee', TRUE),
            (v_id, 5, 'training', 'Kurs: Praca z klientem (compliance)', 'Standardy komunikacji i compliance.', 14, FALSE, 'praca-z-klientem-compliance', 'employee', TRUE),
            (v_id, 6, 'meeting', 'Intro meeting z managerem', '30-min spotkanie powitalne z managerem zespołu.', 3, FALSE, NULL, 'manager', TRUE),
            (v_id, 7, 'meeting', 'Pierwsze spotkanie z buddy', 'Nieformalne spotkanie z buddy (1h, kawa/lunch).', 7, FALSE, NULL, 'buddy', FALSE),
            (v_id, 8, 'other', 'Uzupełnij profil w Compass', 'Zdjęcie, telefon, adres rozliczeniowy.', 5, FALSE, NULL, 'employee', TRUE),
            (v_id, 9, 'other', 'Pierwszy timesheet wypełniony', 'Wypełnij timesheet za pierwszy tydzień pracy.', 14, FALSE, NULL, 'employee', TRUE);
    END IF;
END $$;

-- 3b. Konsultant wewnętrzny — Standard
DO $$
DECLARE v_id UUID;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM onboarding_templates
         WHERE target_role = 'internal' AND is_default = TRUE AND is_archived = FALSE
    ) THEN
        INSERT INTO onboarding_templates (name, target_role, description, is_default)
        VALUES (
            'Konsultant wewnętrzny — Standard',
            'internal',
            'Domyślna ścieżka onboardingu dla pracowników wewnętrznych (HR-zone: timesheet + faktura + work clock).',
            TRUE
        ) RETURNING id INTO v_id;

        INSERT INTO onboarding_template_items
            (template_id, position, category, title, description, due_offset_days, requires_file, course_slug, responsible_role, is_required)
        VALUES
            (v_id, 0, 'docs', 'Podpisz umowę o pracę / B2B', 'Wgraj skan podpisanej umowy.', 3, TRUE, NULL, 'employee', TRUE),
            (v_id, 1, 'docs', 'Wgraj NDA / klauzulę poufności', 'NDA podpisany.', 3, TRUE, NULL, 'employee', TRUE),
            (v_id, 2, 'access', 'Setup Microsoft 365 + Azure SSO', 'Konto w Azure AD + licencje M365.', 1, FALSE, NULL, 'admin', TRUE),
            (v_id, 3, 'access', 'Setup dostępu do Compass + uprawnień HR-zone', 'Aktywacja konta + nadanie roli internal.', 1, FALSE, NULL, 'admin', TRUE),
            (v_id, 4, 'training', 'Kurs: Onboarding B2B Network', 'Wstępny kurs o firmie.', 14, FALSE, 'onboarding-b2b-network', 'employee', TRUE),
            (v_id, 5, 'training', 'Kurs: Procesy HR w Compass', 'Timesheet, urlopy, faktury, work clock.', 14, FALSE, 'procesy-hr-compass', 'employee', TRUE),
            (v_id, 6, 'meeting', 'Intro meeting z managerem', '30-min spotkanie powitalne.', 3, FALSE, NULL, 'manager', TRUE),
            (v_id, 7, 'meeting', 'Tour po /internal — timesheet/faktura/clock', 'TCM/manager pokazuje narzędzia HR krok po kroku.', 5, FALSE, NULL, 'tcm', TRUE),
            (v_id, 8, 'meeting', 'Spotkanie z buddy', 'Nieformalne spotkanie 1:1.', 7, FALSE, NULL, 'buddy', FALSE),
            (v_id, 9, 'other', 'Uzupełnij profil w Compass', 'Zdjęcie, telefon, adres rozliczeniowy.', 5, FALSE, NULL, 'employee', TRUE),
            (v_id, 10, 'other', 'Pierwszy timesheet + work clock test', 'Wypełnij timesheet i przetestuj work clock.', 14, FALSE, NULL, 'employee', TRUE);
    END IF;
END $$;

-- 3c. Manager — Standard
DO $$
DECLARE v_id UUID;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM onboarding_templates
         WHERE target_role = 'manager' AND is_default = TRUE AND is_archived = FALSE
    ) THEN
        INSERT INTO onboarding_templates (name, target_role, description, is_default)
        VALUES (
            'Manager — Standard',
            'manager',
            'Rozszerzona ścieżka dla nowych managerów — uwzględnia szkolenia z akceptacji timesheetów/faktur etap 1 i 1:1 z zespołem.',
            TRUE
        ) RETURNING id INTO v_id;

        INSERT INTO onboarding_template_items
            (template_id, position, category, title, description, due_offset_days, requires_file, course_slug, responsible_role, is_required)
        VALUES
            (v_id, 0, 'docs', 'Podpisz umowę', 'Wgraj skan podpisanej umowy.', 3, TRUE, NULL, 'employee', TRUE),
            (v_id, 1, 'docs', 'Wgraj NDA', 'NDA podpisany.', 3, TRUE, NULL, 'employee', TRUE),
            (v_id, 2, 'access', 'Setup Microsoft 365 + Azure SSO + uprawnienia manager', 'Konto + rola manager w profiles + manager_id linki do zespołu.', 1, FALSE, NULL, 'admin', TRUE),
            (v_id, 3, 'training', 'Kurs: Onboarding B2B Network', 'Wstępny kurs.', 14, FALSE, 'onboarding-b2b-network', 'employee', TRUE),
            (v_id, 4, 'training', 'Kurs: Polityka akceptacji timesheet/faktura etap 1', 'Procedura merytorycznej akceptacji zgłoszeń zespołu.', 14, FALSE, 'manager-akceptacje', 'employee', TRUE),
            (v_id, 5, 'training', 'Kurs: Manager toolkit Compass', 'Funkcje managera: team view, akceptacje, zarządzanie.', 14, FALSE, 'manager-toolkit', 'employee', TRUE),
            (v_id, 6, 'meeting', 'Intro meeting z przełożonym', '30-min spotkanie powitalne.', 3, FALSE, NULL, 'manager', TRUE),
            (v_id, 7, 'meeting', 'Spotkania 1:1 z każdym członkiem zespołu', 'Zaplanuj 1:1 z każdą osobą w team (manager_id).', 14, FALSE, NULL, 'employee', TRUE),
            (v_id, 8, 'meeting', 'Spotkanie z buddy (inny manager)', 'Konsultacja praktyk managera z bardziej doświadczonym kolegą.', 7, FALSE, NULL, 'buddy', FALSE),
            (v_id, 9, 'other', 'Uzupełnij profil + zdjęcie', 'Pełne dane w Compass.', 5, FALSE, NULL, 'employee', TRUE),
            (v_id, 10, 'other', 'Pierwsza akceptacja timesheet zespołu', 'Wykonaj pierwsze rozliczenie zespołu (etap 1).', 30, FALSE, NULL, 'employee', TRUE);
    END IF;
END $$;

COMMIT;
