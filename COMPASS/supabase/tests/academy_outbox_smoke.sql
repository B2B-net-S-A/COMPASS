-- Smoke test migracji 20261109021500_academy_outbox.sql. Uruchamiać w całości, po migracji:
-- wszystko dzieje się w transakcji zakończonej ROLLBACK. Lokalnie razem z
-- supabase/tests/academy_outbox_stub.sql na czystym postgres:17.
BEGIN;

DO $$
DECLARE
 v_id uuid;
 v_rejected boolean;
 v_batch uuid := gen_random_uuid();
 v_failure text;
BEGIN
 INSERT INTO public.academy_outbox(kind, recipient, subject, html, expires_at, dedupe_key, batch_id)
 VALUES ('smoke', 'osoba@example.test', 'Temat', '<p>Treść</p>', now() + interval '1 day', 'smoke:1', v_batch) RETURNING id INTO v_id;
 IF (SELECT status FROM public.academy_outbox WHERE id = v_id) <> 'held' THEN RAISE EXCEPTION 'SMOKE: domyślny status inny niż held'; END IF;

 -- Klucz deduplikacji.
 v_rejected := false;
 BEGIN
  INSERT INTO public.academy_outbox(kind, recipient, subject, html, expires_at, dedupe_key)
  VALUES ('smoke', 'osoba@example.test', 'Temat', '<p>Treść</p>', now() + interval '1 day', 'smoke:1');
 EXCEPTION WHEN unique_violation THEN v_rejected := true;
 END;
 IF NOT v_rejected THEN RAISE EXCEPTION 'SMOKE: duplikat dedupe_key przeszedł'; END IF;

 -- Token w treści, wielkie litery w adresie, termin poza oknem.
 FOREACH v_failure IN ARRAY ARRAY[
  'token', 'wejdz', 'upper', 'past', 'far'
 ] LOOP
  v_rejected := false;
  BEGIN
   INSERT INTO public.academy_outbox(kind, recipient, subject, html, expires_at, dedupe_key) VALUES (
    'smoke',
    CASE WHEN v_failure = 'upper' THEN 'Osoba@Example.test' ELSE 'osoba@example.test' END,
    'Temat',
    CASE v_failure WHEN 'token' THEN '<a href="https://x.test/a?token=abc">x</a>'
                   WHEN 'wejdz' THEN '<a href="https://x.test/wejdz/abcdefghijkl">x</a>'
                   ELSE '<p>ok</p>' END,
    CASE v_failure WHEN 'past' THEN now() - interval '1 minute'
                   WHEN 'far' THEN now() + interval '91 days'
                   ELSE now() + interval '1 day' END,
    'smoke:bad:' || v_failure);
  EXCEPTION WHEN check_violation THEN v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'SMOKE: wiersz % przeszedł mimo CHECK', v_failure; END IF;
 END LOOP;

 -- Bez zapisu zatwierdzenia nie ma statusu approved.
 v_rejected := false;
 BEGIN
  UPDATE public.academy_outbox SET status = 'approved' WHERE id = v_id;
 EXCEPTION WHEN check_violation THEN v_rejected := true;
 END;
 IF NOT v_rejected THEN RAISE EXCEPTION 'SMOKE: approved bez zapisu zatwierdzenia'; END IF;

 -- held nie przechodzi od razu w sent: tylko przez zatwierdzoną paczkę.
 v_rejected := false;
 BEGIN
  UPDATE public.academy_outbox SET status = 'sent' WHERE id = v_id;
 EXCEPTION WHEN raise_exception THEN v_rejected := SQLERRM = 'academy_outbox_invalid_transition';
 END;
 IF NOT v_rejected THEN RAISE EXCEPTION 'SMOKE: held przeszedł w sent z pominięciem zatwierdzenia'; END IF;

 -- Treść jest niezmienna.
 v_rejected := false;
 BEGIN
  UPDATE public.academy_outbox SET html = '<p>inna</p>' WHERE id = v_id;
 EXCEPTION WHEN raise_exception THEN v_rejected := SQLERRM = 'academy_outbox_content_immutable';
 END;
 IF NOT v_rejected THEN RAISE EXCEPTION 'SMOKE: podmiana treści przeszła'; END IF;

 -- Ścieżka zgodna z bramką, a stan końcowy jest zamknięty.
 UPDATE public.academy_outbox SET status = 'approved', approved_at = now() WHERE id = v_id;
 v_rejected := false;
 BEGIN
  UPDATE public.academy_outbox SET status = 'sent' WHERE id = v_id;
 EXCEPTION WHEN raise_exception THEN v_rejected := SQLERRM = 'academy_outbox_invalid_transition';
 END;
 IF NOT v_rejected THEN RAISE EXCEPTION 'SMOKE: sent bez przejęcia wiersza'; END IF;
 UPDATE public.academy_outbox SET claimed_at = now() WHERE id = v_id;
 UPDATE public.academy_outbox SET status = 'sent', sent_at = now() WHERE id = v_id;
 v_rejected := false;
 BEGIN
  UPDATE public.academy_outbox SET status = 'held' WHERE id = v_id;
 EXCEPTION WHEN raise_exception THEN v_rejected := SQLERRM = 'academy_outbox_invalid_transition';
 END;
 IF NOT v_rejected THEN RAISE EXCEPTION 'SMOKE: stan końcowy dał się cofnąć'; END IF;

 -- Po terminie: held wygasa, ale nie da się go zatwierdzić ani wysłać testowo.
 INSERT INTO public.academy_outbox(kind, recipient, subject, html, expires_at, dedupe_key, batch_id, created_at)
 VALUES ('smoke', 'osoba@example.test', 'Temat', '<p>ok</p>', now() - interval '1 hour', 'smoke:past', v_batch, now() - interval '2 hours') RETURNING id INTO v_id;
 v_rejected := false;
 BEGIN
  UPDATE public.academy_outbox SET status = 'approved', approved_at = now() WHERE id = v_id;
 EXCEPTION WHEN raise_exception THEN v_rejected := SQLERRM = 'academy_outbox_expired';
 END;
 IF NOT v_rejected THEN RAISE EXCEPTION 'SMOKE: zatwierdzono wiersz po terminie'; END IF;
 v_rejected := false;
 BEGIN
  UPDATE public.academy_outbox SET claimed_at = now() WHERE id = v_id;
 EXCEPTION WHEN raise_exception THEN v_rejected := SQLERRM = 'academy_outbox_expired';
 END;
 IF NOT v_rejected THEN RAISE EXCEPTION 'SMOKE: przejęto do wysyłki wiersz po terminie'; END IF;
 UPDATE public.academy_outbox SET status = 'expired' WHERE id = v_id;
 IF (SELECT status FROM public.academy_outbox WHERE id = v_id) <> 'expired' THEN RAISE EXCEPTION 'SMOKE: held po terminie nie wygasł'; END IF;
END $$;

-- Odczyt redakcji i odmowy zapisu przez rolę authenticated.
INSERT INTO public.academy_outbox(kind, recipient, subject, html, expires_at, dedupe_key)
VALUES ('smoke', 'osoba@example.test', 'Temat', '<p>ok</p>', now() + interval '1 day', 'smoke:rls');

SELECT set_config('app.smoke_editor', 'true', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_rejected boolean; v_rows integer;
BEGIN
 IF (SELECT count(*) FROM public.academy_outbox WHERE dedupe_key = 'smoke:rls') <> 1 THEN RAISE EXCEPTION 'SMOKE: redakcja nie widzi kolejki'; END IF;
 v_rejected := false;
 BEGIN
  INSERT INTO public.academy_outbox(kind, recipient, subject, html, expires_at, dedupe_key)
  VALUES ('smoke', 'osoba@example.test', 'Temat', '<p>ok</p>', now() + interval '1 day', 'smoke:authn');
 EXCEPTION WHEN insufficient_privilege THEN v_rejected := true;
 END;
 IF NOT v_rejected THEN RAISE EXCEPTION 'SMOKE: authenticated dopisał wiersz'; END IF;
 v_rejected := false;
 BEGIN
  UPDATE public.academy_outbox SET batch_id = gen_random_uuid() WHERE dedupe_key = 'smoke:rls';
 EXCEPTION WHEN insufficient_privilege THEN v_rejected := true;
 END;
 IF NOT v_rejected THEN RAISE EXCEPTION 'SMOKE: authenticated zmienił wiersz'; END IF;
 PERFORM set_config('app.smoke_editor', 'false', true);
 SELECT count(*) INTO v_rows FROM public.academy_outbox;
 IF v_rows <> 0 THEN RAISE EXCEPTION 'SMOKE: osoba spoza redakcji widzi kolejkę'; END IF;
END $$;
RESET ROLE;

ROLLBACK;
