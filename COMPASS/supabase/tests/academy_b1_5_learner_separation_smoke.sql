-- Smoke B1.5 na lokalnym postgres:17, po stubach i migracjach B1.1, B1.2 i B1.5.
DO $$
DECLARE
    v_learner uuid := '30000000-0000-0000-0000-000000000001';
    v_staff uuid := '30000000-0000-0000-0000-000000000002';
    v_status text;
BEGIN
    INSERT INTO auth.users(id, email, raw_app_meta_data) VALUES (v_learner, 'nauka15@example.test', '{"academy_only":true}');
    INSERT INTO auth.users(id, email) VALUES (v_staff, 'pracownik@b2bnetwork.pl');
    SELECT employment_status INTO v_status FROM public.profiles WHERE id = v_learner;
    IF v_status <> 'learning' THEN RAISE EXCEPTION 'learner status %', v_status; END IF;
    SELECT employment_status INTO v_status FROM public.profiles WHERE id = v_staff;
    IF v_status <> 'active' THEN RAISE EXCEPTION 'staff status %', v_status; END IF;

    IF EXISTS (SELECT 1 FROM public.nexus_roster_export() WHERE email = 'nauka15@example.test') THEN
        RAISE EXCEPTION 'learner exported to NEXUS';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.nexus_roster_export() WHERE email = 'pracownik@b2bnetwork.pl') THEN
        RAISE EXCEPTION 'staff missing from export';
    END IF;

    BEGIN
        UPDATE public.profiles SET employment_status = 'dowolny' WHERE id = v_staff;
        RAISE EXCEPTION 'unknown status accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
END $$;
SELECT 'b1_5_smoke_ok' AS result;
