-- Audyt 2026-08-25 · KROK C2 — domknięcie Fazy 37: koniec podwójnej prawdy
--
-- Faza 37 wprowadziła „read-model": legacy tabele zostały źródłem prawdy, a obok
-- powstał mirror (onboarding_cases / exit_cases / support_contractor_meta oraz lustro
-- rozmów i zadań kontraktorskich w support_tickets) utrzymywany 6 triggerami.
-- Kontrakt zakładał, że kolejnym krokiem będzie przepięcie backendu NA mirror
-- i skasowanie legacy („contract step" w CLAUDE.md). To nigdy nie nastąpiło.
--
-- Stan zweryfikowany na produkcji 2026-08-25 (wyłącznie SELECT):
--   * mirror nie ma ANI JEDNEGO czytelnika w kodzie — `onboarding_cases`, `exit_cases`
--     i `support_contractor_meta` występują wyłącznie w wygenerowanym
--     lib/supabase/database.types.ts, w żadnym zapytaniu aplikacji;
--   * liczby zgadzają się 1:1 (onboarding 2/2, exit 4/4, rozmowy 147/147), a mirror
--     NIE MA ani jednego wiersza bez odpowiednika w legacy — nigdzie nie zdążył się
--     stać źródłem prawdy, więc usunięcie go niczego nie kasuje;
--   * lustro rozmów w support_tickets (147 wierszy kategorii `contractor_%`) nie ma
--     własnej treści: 0 komentarzy, 0 wierszy support_inbox_meta, 0 zadań wskazujących
--     na nie przez source_ticket_id.
--
-- Dlaczego usuwamy, a nie „dokańczamy w drugą stronę": utrzymywanie dwóch prawd przy
-- tej skali (46 osób, 153 sprawy) kosztuje więcej, niż daje. Każdy zapis do rozmowy,
-- onboardingu i exitu przechodzi dodatkowo przez trigger SECURITY DEFINER, a rozjazd
-- kopii z oryginałem nie miałby kto zauważyć — funkcje sync łykają każdy wyjątek
-- i kończą na RAISE WARNING, którego nikt nie czyta.
--
-- Lustro rozmów usuwamy RAZEM z triggerami, nie zostawiamy go „na wszelki wypadek".
-- Zamrożona, nieodświeżana kopia 147 rozmów jest gorsza niż jej brak: czytałaby ją
-- analityka zgłoszeń (getTicketTypeAnalytics agreguje całą tabelę) i pokazywała
-- nieaktualne statusy sprzed zamrożenia jako bieżący obraz spraw.

-- ── Migawka „przed" — samosprawdzenie na końcu porówna z nią stan legacy.
-- Chodzi o wyłapanie sytuacji, w której czyszczenie lustra pociągnęłoby za sobą
-- oryginał (np. gdyby jakiś trigger przetrwał DROP i zadziałał kaskadowo).
-- (bez ON COMMIT DROP — migracja bywa odpalana w autocommit, gdzie tabela zniknęłaby
--  natychmiast po CREATE; tymczasowa i tak umiera z końcem sesji)
DROP TABLE IF EXISTS c2_before;
CREATE TEMP TABLE c2_before AS
SELECT
    (SELECT count(*) FROM public.contractor_conversations)          AS conversations,
    (SELECT count(*) FROM public.contractor_tasks)                  AS tasks,
    (SELECT count(*) FROM public.onboarding_progress)               AS onboarding_progress,
    (SELECT count(*) FROM public.exit_interviews)                   AS exit_interviews,
    (SELECT count(*) FROM public.contractor_onboarding_interviews)  AS ctr_onboarding,
    (SELECT count(*) FROM public.contractor_exit_interviews)        AS ctr_exit,
    (SELECT count(*) FROM public.support_tickets t
        JOIN public.support_categories c ON c.id = t.category_id
        WHERE c.slug NOT LIKE 'contractor_%')                       AS tickets_kept;

-- ── Bramka bezpieczeństwa: nie kasuj lustra, jeśli zdążyło urosnąć we własną treść.
DO $$
DECLARE
    v_orphan_onb   INT;
    v_orphan_exit  INT;
    v_orphan_meta  INT;
    v_comments     INT;
    v_inbox_meta   INT;
    v_task_links   INT;
BEGIN
    -- Mirror zachowuje id oryginału w OBU populacjach (pracownik → onboarding_progress,
    -- kontraktor → contractor_onboarding_interviews), więc sierotą jest wiersz bez
    -- odpowiednika w żadnej z nich. Bez filtra po person_type: gdyby kolumna kiedyś
    -- rozjechała się z rzeczywistością, bramka i tak zadziała.
    SELECT count(*) INTO v_orphan_onb
    FROM public.onboarding_cases oc
    WHERE NOT EXISTS (SELECT 1 FROM public.onboarding_progress p WHERE p.id = oc.id)
      AND NOT EXISTS (SELECT 1 FROM public.contractor_onboarding_interviews i WHERE i.id = oc.id);

    SELECT count(*) INTO v_orphan_exit
    FROM public.exit_cases ec
    WHERE NOT EXISTS (SELECT 1 FROM public.exit_interviews e WHERE e.id = ec.id)
      AND NOT EXISTS (SELECT 1 FROM public.contractor_exit_interviews i WHERE i.id = ec.id);

    SELECT count(*) INTO v_orphan_meta
    FROM public.support_contractor_meta m
    WHERE NOT EXISTS (SELECT 1 FROM public.contractor_conversations c WHERE c.id = m.ticket_id)
      AND NOT EXISTS (SELECT 1 FROM public.contractor_tasks t WHERE t.id = m.ticket_id);

    IF v_orphan_onb > 0 OR v_orphan_exit > 0 OR v_orphan_meta > 0 THEN
        RAISE EXCEPTION
            'C2 przerwany: mirror ma wiersze bez odpowiednika w legacy (onboarding=%, exit=%, meta=%) — gdzieś stał się źródłem prawdy, potrzebna migracja danych, nie DROP',
            v_orphan_onb, v_orphan_exit, v_orphan_meta;
    END IF;

    SELECT count(*) INTO v_comments
    FROM public.support_ticket_comments k
    JOIN public.support_tickets t ON t.id = k.ticket_id
    JOIN public.support_categories c ON c.id = t.category_id
    WHERE c.slug LIKE 'contractor_%';

    SELECT count(*) INTO v_inbox_meta
    FROM public.support_inbox_meta m
    JOIN public.support_tickets t ON t.id = m.ticket_id
    JOIN public.support_categories c ON c.id = t.category_id
    WHERE c.slug LIKE 'contractor_%';

    SELECT count(*) INTO v_task_links
    FROM public.contractor_tasks ct
    JOIN public.support_tickets t ON t.id = ct.source_ticket_id
    JOIN public.support_categories c ON c.id = t.category_id
    WHERE c.slug LIKE 'contractor_%';

    IF v_comments > 0 OR v_inbox_meta > 0 OR v_task_links > 0 THEN
        RAISE EXCEPTION
            'C2 przerwany: lustro rozmów ma własną treść (komentarze=%, meta skrzynki=%, zadania wskazujące=%) — usunięcie ticketów skasowałoby dane, których nie ma w contractor_conversations',
            v_comments, v_inbox_meta, v_task_links;
    END IF;
END $$;

-- ── 1. Triggery synchronizujące (6 sztuk z migracji 20260608000003_phase37c).
DROP TRIGGER IF EXISTS trg_sync_onboarding_case_employee   ON public.onboarding_progress;
DROP TRIGGER IF EXISTS trg_sync_onboarding_case_contractor ON public.contractor_onboarding_interviews;
DROP TRIGGER IF EXISTS trg_sync_exit_case_employee         ON public.exit_interviews;
DROP TRIGGER IF EXISTS trg_sync_exit_case_contractor       ON public.contractor_exit_interviews;
DROP TRIGGER IF EXISTS trg_sync_conversation_ticket        ON public.contractor_conversations;
DROP TRIGGER IF EXISTS trg_sync_task_ticket                ON public.contractor_tasks;

DROP FUNCTION IF EXISTS public.sync_onboarding_case_employee();
DROP FUNCTION IF EXISTS public.sync_onboarding_case_contractor();
DROP FUNCTION IF EXISTS public.sync_exit_case_employee();
DROP FUNCTION IF EXISTS public.sync_exit_case_contractor();
DROP FUNCTION IF EXISTS public.sync_conversation_ticket();
DROP FUNCTION IF EXISTS public.sync_task_ticket();

-- ── 2. Lustro rozmów/zadań w support_tickets.
-- Kolejność jest istotna: triggery już nie żyją, więc kasowanie ticketów NIE cofnie
-- się kaskadą do contractor_conversations (sync_conversation_ticket miał gałąź DELETE
-- w drugą stronę, ale tu i tak działamy na support_tickets, nie na rozmowach).
DELETE FROM public.support_tickets t
USING public.support_categories c
WHERE c.id = t.category_id
  AND c.slug LIKE 'contractor_%';

DELETE FROM public.support_categories
WHERE slug LIKE 'contractor_%';

-- ── 3. RLS support_tickets wraca do dwóch populacji (skrzynka + helpdesk).
-- ALTER, a nie DROP+CREATE: zachowuje `TO authenticated` i tryb permissive bez
-- przepisywania ich z pamięci.
ALTER POLICY support_tickets_select_user_or_inbox ON public.support_tickets
    USING (
        CASE
            WHEN is_inbox_category(category_id) THEN is_inbox_handler()
            ELSE ((user_id = auth.uid()) OR (assignee_id = auth.uid()) OR is_admin())
        END
    );

ALTER POLICY support_tickets_insert_user_or_inbox ON public.support_tickets
    WITH CHECK (
        CASE
            WHEN is_inbox_category(category_id) THEN is_inbox_handler()
            ELSE (user_id = auth.uid())
        END
    );

ALTER POLICY support_tickets_update_user_or_inbox ON public.support_tickets
    USING (
        CASE
            WHEN is_inbox_category(category_id) THEN is_inbox_handler()
            ELSE ((assignee_id = auth.uid()) OR is_admin() OR (user_id = auth.uid()))
        END
    )
    WITH CHECK (
        CASE
            WHEN is_inbox_category(category_id) THEN is_inbox_handler()
            ELSE ((assignee_id = auth.uid()) OR is_admin() OR (user_id = auth.uid()))
        END
    );

-- Używana wyłącznie w powyższych trzech politykach (zweryfikowane po pg_proc.prosrc
-- i pg_get_expr wszystkich polityk) — po ich uproszczeniu zostaje bez wywołań.
DROP FUNCTION IF EXISTS public.is_contractor_category(uuid);

-- ── 4. Same tabele mirrora. Żadna nie jest celem klucza obcego (sprawdzone
-- w pg_constraint), więc CASCADE nie jest potrzebny — i celowo go nie ma,
-- żeby DROP wywalił się, gdyby ktoś w międzyczasie coś do nich podpiął.
DROP TABLE IF EXISTS public.support_contractor_meta;
DROP TABLE IF EXISTS public.exit_cases;
DROP TABLE IF EXISTS public.onboarding_cases;

-- ── Samosprawdzenie.
DO $$
DECLARE
    v_left        INT;
    v_names       TEXT;
    v_before      c2_before%ROWTYPE;
    v_now_conv    INT;
    v_now_tasks   INT;
    v_now_onb     INT;
    v_now_exit    INT;
    v_now_ctr_onb INT;
    v_now_ctr_ex  INT;
    v_now_tickets INT;
BEGIN
    -- 1. tabele mirrora
    SELECT count(*), string_agg(table_name, ', ') INTO v_left, v_names
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('onboarding_cases', 'exit_cases', 'support_contractor_meta');
    IF v_left > 0 THEN
        RAISE EXCEPTION 'C2 nie zadziałał: tabele mirrora nadal istnieją (%)', v_names;
    END IF;

    -- 2. funkcje i triggery synchronizujące
    SELECT count(*), string_agg(p.proname, ', ') INTO v_left, v_names
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('sync_onboarding_case_employee', 'sync_onboarding_case_contractor',
                        'sync_exit_case_employee', 'sync_exit_case_contractor',
                        'sync_conversation_ticket', 'sync_task_ticket', 'is_contractor_category');
    IF v_left > 0 THEN
        RAISE EXCEPTION 'C2 nie zadziałał: funkcje mirrora nadal istnieją (%)', v_names;
    END IF;

    SELECT count(*), string_agg(t.tgname, ', ') INTO v_left, v_names
    FROM pg_trigger t
    WHERE NOT t.tgisinternal
      AND (t.tgname LIKE 'trg_sync_%case%' OR t.tgname IN ('trg_sync_conversation_ticket', 'trg_sync_task_ticket'));
    IF v_left > 0 THEN
        RAISE EXCEPTION 'C2 nie zadziałał: triggery mirrora nadal istnieją (%)', v_names;
    END IF;

    -- 3. populacja contractor_% zniknęła z tabeli zgłoszeń
    SELECT count(*) INTO v_left FROM public.support_categories WHERE slug LIKE 'contractor_%';
    IF v_left > 0 THEN
        RAISE EXCEPTION 'C2 nie zadziałał: kategorie contractor_%% nadal istnieją (%)', v_left;
    END IF;

    -- 4. żadna polityka nie odwołuje się już do usuniętej funkcji
    SELECT count(*), string_agg(p.polname, ', ') INTO v_left, v_names
    FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
    WHERE c.relname = 'support_tickets'
      AND (COALESCE(pg_get_expr(p.polqual, p.polrelid), '') || COALESCE(pg_get_expr(p.polwithcheck, p.polrelid), ''))
          ILIKE '%is_contractor_category%';
    IF v_left > 0 THEN
        RAISE EXCEPTION 'C2 nie zadziałał: polityki nadal wołają is_contractor_category (%)', v_names;
    END IF;

    -- 5. legacy nietknięte — to jest właściwy dowód, że skasowaliśmy kopię, nie oryginał
    SELECT * INTO v_before FROM c2_before;
    SELECT count(*) INTO v_now_conv    FROM public.contractor_conversations;
    SELECT count(*) INTO v_now_tasks   FROM public.contractor_tasks;
    SELECT count(*) INTO v_now_onb     FROM public.onboarding_progress;
    SELECT count(*) INTO v_now_exit    FROM public.exit_interviews;
    SELECT count(*) INTO v_now_ctr_onb FROM public.contractor_onboarding_interviews;
    SELECT count(*) INTO v_now_ctr_ex  FROM public.contractor_exit_interviews;
    SELECT count(*) INTO v_now_tickets FROM public.support_tickets;

    IF v_now_conv <> v_before.conversations
        OR v_now_tasks <> v_before.tasks
        OR v_now_onb <> v_before.onboarding_progress
        OR v_now_exit <> v_before.exit_interviews
        OR v_now_ctr_onb <> v_before.ctr_onboarding
        OR v_now_ctr_ex <> v_before.ctr_exit
    THEN
        RAISE EXCEPTION
            'C2 ZATRZYMANY: ubyło danych źródłowych (rozmowy %→%, zadania %→%, onboarding %→%, exit %→%, wywiady kontraktorskie %→% / %→%)',
            v_before.conversations, v_now_conv, v_before.tasks, v_now_tasks,
            v_before.onboarding_progress, v_now_onb, v_before.exit_interviews, v_now_exit,
            v_before.ctr_onboarding, v_now_ctr_onb, v_before.ctr_exit, v_now_ctr_ex;
    END IF;

    IF v_now_tickets <> v_before.tickets_kept THEN
        RAISE EXCEPTION
            'C2 ZATRZYMANY: zgłoszeń miało zostać %, jest % — czyszczenie lustra zabrało coś spoza rodziny contractor_%%',
            v_before.tickets_kept, v_now_tickets;
    END IF;
END $$;
