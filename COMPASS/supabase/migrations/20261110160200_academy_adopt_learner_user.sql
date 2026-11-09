-- Przegląd bezpieczeństwa: publiczna rejestracja na adres z listy kont nauki przechodzi bramkę,
-- a Admin API odpowiada potem „adres zajęty”, więc przepustka tej osoby przestaje działać.
-- Funkcja przejmuje takie konto, ale tylko gdy nikt nigdy się na nie nie zalogował.
--
-- Rejestrujący zna hasło, które sam ustawił, i wpisał własne metadane, dlatego przejęcie kasuje
-- hasło i tokeny, a imię bierze z listy. Puste napisy zamiast NULL w kolumnach tokenów, bo GoTrue
-- nie czyta w nich NULL (`compass_auth_rawinsert_pitfall`). Hasło NULL jest stanem normalnym.
--
-- Warunek: po 20261110090000_academy_b1_2_learner_accounts.sql.
-- Cofnięcie: supabase/rollbacks/20261110160200_academy_adopt_learner_user.sql
BEGIN;

CREATE OR REPLACE FUNCTION public.academy_adopt_learner_user(p_account_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
    v_account public.academy_learner_accounts%ROWTYPE;
    v_user auth.users%ROWTYPE;
BEGIN
    SELECT * INTO v_account FROM public.academy_learner_accounts WHERE id=p_account_id FOR UPDATE;
    IF NOT FOUND OR v_account.user_id IS NOT NULL OR v_account.ended_at IS NOT NULL
        OR (v_account.access_until IS NOT NULL AND v_account.access_until<=now()) THEN
        RETURN NULL;
    END IF;

    SELECT * INTO v_user FROM auth.users u WHERE lower(u.email)=v_account.email AND NOT COALESCE(u.is_sso_user,false) FOR UPDATE;
    IF NOT FOUND OR v_user.last_sign_in_at IS NOT NULL OR v_user.deleted_at IS NOT NULL THEN
        RETURN NULL;
    END IF;
    -- Tylko konto z samego e-maila i bez roli biurowej: inne nie powstało z publicznej rejestracji.
    IF EXISTS(SELECT 1 FROM auth.identities i WHERE i.user_id=v_user.id AND i.provider<>'email')
        OR EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=v_user.id AND p.role::text<>'consultant') THEN
        RETURN NULL;
    END IF;

    UPDATE auth.users SET
        encrypted_password=NULL,
        email_confirmed_at=COALESCE(email_confirmed_at,now()),
        confirmation_token='', confirmation_sent_at=NULL,
        recovery_token='', recovery_sent_at=NULL,
        email_change='', email_change_token_new='', email_change_token_current='', email_change_sent_at=NULL,
        reauthentication_token='', reauthentication_sent_at=NULL,
        raw_app_meta_data=COALESCE(raw_app_meta_data,'{}'::jsonb)||'{"academy_only":true}'::jsonb,
        raw_user_meta_data=CASE WHEN v_account.full_name IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('full_name',v_account.full_name) END,
        updated_at=now()
    WHERE id=v_user.id;

    UPDATE public.profiles SET academy_only=true, full_name=v_account.full_name, avatar_url=NULL WHERE id=v_user.id;
    UPDATE public.academy_learner_accounts SET user_id=v_user.id WHERE id=p_account_id;
    RETURN v_user.id;
END $$;

REVOKE ALL ON FUNCTION public.academy_adopt_learner_user(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.academy_adopt_learner_user(uuid) TO service_role;

NOTIFY pgrst,'reload schema';

DO $$
DECLARE v_def text:=pg_get_functiondef('public.academy_adopt_learner_user(uuid)'::regprocedure);
BEGIN
    IF position('last_sign_in_at IS NOT NULL' IN v_def)=0 OR position('encrypted_password=NULL' IN v_def)=0 THEN
        RAISE EXCEPTION 'adoption must refuse used accounts and clear the password';
    END IF;
    IF has_function_privilege('authenticated','public.academy_adopt_learner_user(uuid)','EXECUTE')
        OR has_function_privilege('anon','public.academy_adopt_learner_user(uuid)','EXECUTE')
        OR NOT has_function_privilege('service_role','public.academy_adopt_learner_user(uuid)','EXECUTE') THEN
        RAISE EXCEPTION 'adoption must be service_role only';
    END IF;
END $$;

COMMIT;
