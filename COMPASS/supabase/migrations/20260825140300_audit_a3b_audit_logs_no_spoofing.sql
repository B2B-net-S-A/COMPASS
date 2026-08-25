-- Audyt 2026-08-25 · KROK A3.2 — dziennik audytu przestaje być podrabialny.
--
-- Polityka "Authenticated users can insert audit logs" ma WITH CHECK:
--     (auth.uid() = user_id) OR (auth.uid() IS NOT NULL)
-- Pierwszy człon jest MARTWY — drugi pochłania go w całości, więc warunek sprowadza
-- się do „ktokolwiek zalogowany". Każdy pracownik mógł przez PostgREST dopisać wpis
-- audytowy z CUDZYM user_id i dowolną akcją.
--
-- Skutek jest podwójny:
--   (a) fałszywa atrybucja decyzji HR — dziennik przestaje być dowodem, kto co zrobił,
--       a ofiara podrzutu tego nie zobaczy (SELECT jest tylko dla is_admin());
--   (b) audit_logs jest też SYGNAŁEM STERUJĄCYM — throttle samoleczenia reguł
--       przekierowania poczty (lib/oof/forward-self-heal.ts:48-56) czyta wpis
--       FORWARD_RECONCILE_RUN, więc podrzucanie go co godzinę trwale wyłączało
--       kasowanie osieroconych forwardów ze skrzynek.
--
-- Heartbeaty cronów (user_id IS NULL) idą service-rolą (lib/actions/audit.ts:288),
-- która omija RLS — ta zmiana ich nie dotyczy.
-- Istniejące 2315 wierszy pozostaje nietknięte: tabela nie ma polityk UPDATE ani DELETE.

ALTER POLICY "Authenticated users can insert audit logs"
    ON public.audit_logs
    WITH CHECK (auth.uid() = user_id);

DO $$
DECLARE v_check text;
BEGIN
    SELECT pg_get_expr(p.polwithcheck, p.polrelid) INTO v_check
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'audit_logs'
      AND p.polname = 'Authenticated users can insert audit logs';

    IF v_check IS NULL THEN
        RAISE EXCEPTION 'A3.2: nie znaleziono polityki INSERT na audit_logs';
    END IF;
    -- Martwy człon `OR auth.uid() IS NOT NULL` musi zniknąć — to on sprowadzał
    -- warunek do „ktokolwiek zalogowany".
    IF v_check ILIKE '%IS NOT NULL%' THEN
        RAISE EXCEPTION 'A3.2 nie zadziałał — WITH CHECK nadal przepuszcza cudzy user_id: %', v_check;
    END IF;
END $$;
