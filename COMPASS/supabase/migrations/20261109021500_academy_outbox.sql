-- B0.2: kolejka wstrzymanych wiadomości Akademii, jedyna droga poczty (lib/academy/outbound.ts).
-- Wiadomość powstaje jako wiersz `held`. Przełącznik nie opróżnia kolejki: wysyłka wymaga
-- zatwierdzenia paczki przez człowieka, a wiersz po terminie zdarzenia wygasa.
-- Zapis wyłącznie service role, odczyt (podgląd treści) dla redakcji.
BEGIN;

CREATE TABLE public.academy_outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 kind text NOT NULL CHECK (kind ~ '^[a-z0-9_.-]{1,64}$'),
 recipient text NOT NULL CHECK (length(recipient) <= 320 AND recipient = lower(btrim(recipient)) AND recipient ~ '^[^@[:space:]]+@[^@[:space:]]+$'),
 subject text NOT NULL CHECK (length(btrim(subject)) BETWEEN 1 AND 500),
 html text NOT NULL CHECK (length(html) BETWEEN 1 AND 200000),
 run_id uuid REFERENCES public.course_runs(id) ON DELETE SET NULL,
 batch_id uuid,
 status text NOT NULL DEFAULT 'held' CHECK (status IN ('held','approved','sent_test','sent','expired','failed')),
 expires_at timestamptz NOT NULL,
 dedupe_key text NOT NULL UNIQUE CHECK (length(dedupe_key) BETWEEN 1 AND 200),
 approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
 approved_at timestamptz,
 claimed_at timestamptz,
 sent_at timestamptz,
 last_error text CHECK (last_error IS NULL OR length(last_error) <= 64),
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT academy_outbox_expiry_window CHECK (expires_at > created_at AND expires_at <= created_at + interval '90 days'),
 -- Osobisty link powstaje w chwili wysyłki; wiersz w kolejce nie może nieść tokenu.
 CONSTRAINT academy_outbox_no_token CHECK (
  (subject || ' ' || html) !~* '[?&](token|access_token|otp)=' AND (subject || ' ' || html) !~* '/wejdz/[^/"''[:space:]<]{8,}'
 ),
 CONSTRAINT academy_outbox_approval_recorded CHECK (status <> 'approved' OR (batch_id IS NOT NULL AND approved_at IS NOT NULL))
);
CREATE INDEX academy_outbox_status_expires_idx ON public.academy_outbox(status, expires_at);
CREATE INDEX academy_outbox_batch_idx ON public.academy_outbox(batch_id) WHERE batch_id IS NOT NULL;

ALTER TABLE public.academy_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.academy_outbox FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.academy_outbox TO authenticated;
GRANT ALL ON public.academy_outbox TO service_role;
CREATE POLICY academy_outbox_editor_read ON public.academy_outbox FOR SELECT TO authenticated
 USING (public.academy_can_access() AND public.academy_is_global_editor());

-- Reguły przejść także dla service role: błąd w kodzie bramki nie może wysłać po terminie
-- ani podmienić treści już zatwierdzonej wiadomości.
CREATE FUNCTION academy_private.outbox_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF (NEW.kind, NEW.recipient, NEW.subject, NEW.html, NEW.expires_at, NEW.dedupe_key, NEW.created_at)
  IS DISTINCT FROM (OLD.kind, OLD.recipient, OLD.subject, OLD.html, OLD.expires_at, OLD.dedupe_key, OLD.created_at) THEN
  RAISE EXCEPTION 'academy_outbox_content_immutable';
 END IF;
 -- Przejęcie poprzedza wysyłkę, więc to tu baza zatrzymuje wiadomość po terminie.
 -- Zapis wyniku już wysłanej wiadomości musi przejść także po terminie.
 IF OLD.claimed_at IS NULL AND NEW.claimed_at IS NOT NULL AND (OLD.expires_at <= now() OR OLD.status NOT IN ('held','approved')) THEN
  RAISE EXCEPTION 'academy_outbox_expired';
 END IF;
 IF NEW.status = OLD.status THEN RETURN NEW; END IF;
 IF NOT ((OLD.status = 'held' AND NEW.status IN ('approved','sent_test','expired','failed'))
      OR (OLD.status = 'approved' AND NEW.status IN ('sent','failed','expired'))) THEN
  RAISE EXCEPTION 'academy_outbox_invalid_transition';
 END IF;
 IF NEW.status IN ('sent','sent_test') AND NEW.claimed_at IS NULL THEN
  RAISE EXCEPTION 'academy_outbox_invalid_transition';
 END IF;
 IF NEW.status = 'approved' AND OLD.expires_at <= now() THEN
  RAISE EXCEPTION 'academy_outbox_expired';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION academy_private.outbox_guard() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER academy_outbox_guard BEFORE UPDATE ON public.academy_outbox
 FOR EACH ROW EXECUTE FUNCTION academy_private.outbox_guard();

-- Samosprawdzenie: migracja, która przeszła, ale niczego nie zamknęła, ma paść.
DO $$
BEGIN
 IF to_regclass('public.academy_outbox') IS NULL THEN RAISE EXCEPTION 'academy_outbox: brak tabeli'; END IF;
 IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.academy_outbox'::regclass) THEN
  RAISE EXCEPTION 'academy_outbox: RLS wyłączone';
 END IF;
 IF has_table_privilege('authenticated', 'public.academy_outbox', 'INSERT,UPDATE,DELETE')
  OR has_table_privilege('anon', 'public.academy_outbox', 'SELECT,INSERT,UPDATE,DELETE') THEN
  RAISE EXCEPTION 'academy_outbox: zapis poza service role';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'academy_outbox' AND policyname = 'academy_outbox_editor_read' AND cmd = 'SELECT') THEN
  RAISE EXCEPTION 'academy_outbox: brak polityki odczytu redakcji';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.academy_outbox'::regclass AND tgname = 'academy_outbox_guard' AND tgenabled = 'O') THEN
  RAISE EXCEPTION 'academy_outbox: brak strażnika przejść';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.academy_outbox'::regclass AND contype = 'u'
  AND conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'public.academy_outbox'::regclass AND attname = 'dedupe_key')]) THEN
  RAISE EXCEPTION 'academy_outbox: brak unikalnego klucza deduplikacji';
 END IF;
END $$;

COMMIT;
