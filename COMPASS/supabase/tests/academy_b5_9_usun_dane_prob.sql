-- Test skryptu 20261109233000_academy_b5_9_usun_dane_prob.sql.
-- Wyłącznie na jednorazowym lokalnym postgres:17, nigdy na produkcji: tworzy schemat
-- zastępczy z prawdziwymi definicjami strażników historii ukończeń.
--   psql -v ON_ERROR_STOP=0 -f academy_b5_9_usun_dane_prob.sql
-- Każda asercja przy niespełnieniu kończy psql kodem 3.

\set QUIET on
\set script '/migrations/20261109233000_academy_b5_9_usun_dane_prob.sql'

CREATE SCHEMA auth; CREATE SCHEMA academy_private;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid';
CREATE FUNCTION public.academy_can_access() RETURNS boolean LANGUAGE sql AS 'SELECT false';
CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql AS 'SELECT false';
CREATE TABLE public.profiles(id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, academy_only boolean NOT NULL DEFAULT false);
CREATE TABLE public.academy_rollout_settings(mode text NOT NULL);
INSERT INTO public.academy_rollout_settings VALUES('closed');
CREATE TABLE public.courses(id uuid PRIMARY KEY, author_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE, is_rehearsal boolean NOT NULL DEFAULT false);
CREATE TABLE public.course_versions(id uuid PRIMARY KEY, course_id uuid NOT NULL REFERENCES public.courses(id));
CREATE TABLE public.course_lessons(id uuid PRIMARY KEY, version_id uuid NOT NULL REFERENCES public.course_versions(id));
CREATE TABLE public.course_quiz_questions(id uuid PRIMARY KEY, version_id uuid NOT NULL REFERENCES public.course_versions(id));
CREATE TABLE public.course_enrollments(id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, course_id uuid NOT NULL REFERENCES public.courses(id));
CREATE TABLE public.course_completions(id uuid PRIMARY KEY, enrollment_id uuid NOT NULL UNIQUE REFERENCES public.course_enrollments(id), user_id uuid NOT NULL REFERENCES public.profiles(id), revoked_at timestamptz, revoked_by uuid, revoked_reason text);
CREATE TABLE public.academy_completion_rewards(id uuid PRIMARY KEY, completion_id uuid NOT NULL REFERENCES public.course_completions(id));
CREATE TABLE public.academy_completion_revocations(id uuid PRIMARY KEY, completion_id uuid NOT NULL REFERENCES public.course_completions(id));
CREATE TABLE public.course_quiz_attempts(id uuid PRIMARY KEY, enrollment_id uuid NOT NULL REFERENCES public.course_enrollments(id) ON DELETE CASCADE, user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE);
CREATE TABLE public.academy_edition_survey_responses(id uuid PRIMARY KEY, enrollment_id uuid NOT NULL REFERENCES public.course_enrollments(id), user_id uuid NOT NULL REFERENCES public.profiles(id));
CREATE TABLE public.course_survey_responses(id uuid PRIMARY KEY, enrollment_id uuid NOT NULL REFERENCES public.course_enrollments(id) ON DELETE CASCADE, user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE);
CREATE TABLE public.course_questions(id uuid PRIMARY KEY, enrollment_id uuid REFERENCES public.course_enrollments(id), user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE);
CREATE TABLE public.course_answers(id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE);
CREATE TABLE public.course_ratings(id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE);
CREATE TABLE public.session_attendance(id uuid PRIMARY KEY, enrollment_id uuid NOT NULL REFERENCES public.course_enrollments(id));
CREATE TABLE public.academy_webinar_roster(id uuid PRIMARY KEY, user_id uuid REFERENCES public.profiles(id));
CREATE TABLE public.academy_webinar_attendance(roster_id uuid NOT NULL REFERENCES public.academy_webinar_roster(id));
CREATE TABLE public.course_run_registrations(id uuid PRIMARY KEY, enrollment_id uuid REFERENCES public.course_enrollments(id), user_id uuid NOT NULL REFERENCES public.profiles(id));
CREATE TABLE public.academy_reward_claims(id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES public.profiles(id));
CREATE TABLE public.academy_learning_streaks(user_id uuid PRIMARY KEY REFERENCES public.profiles(id));
CREATE TABLE public.academy_m365_identities(id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES public.profiles(id));
CREATE TABLE public.academy_user_capabilities(user_id uuid PRIMARY KEY REFERENCES public.profiles(id));
CREATE TABLE public.academy_audit_events(id uuid PRIMARY KEY, actor_id uuid REFERENCES public.profiles(id));
CREATE TABLE public.notifications(id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE);
CREATE TABLE public.audit_logs(id uuid PRIMARY KEY, user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL);
CREATE TABLE public.academy_learner_accounts(id uuid PRIMARY KEY, source text NOT NULL, user_id uuid REFERENCES public.profiles(id));
CREATE TABLE public.academy_outbox(id uuid PRIMARY KEY, status text NOT NULL);
CREATE TABLE public.academy_participation_documents(id uuid PRIMARY KEY, enrollment_id uuid NOT NULL UNIQUE REFERENCES public.course_enrollments(id), user_id uuid NOT NULL REFERENCES public.profiles(id));
CREATE FUNCTION academy_private.guard_participation_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'completion_history_is_immutable'; END $$;
CREATE TRIGGER academy_participation_history BEFORE UPDATE OR DELETE ON public.academy_participation_documents FOR EACH ROW EXECUTE FUNCTION academy_private.guard_participation_history();
CREATE TABLE public.academy_document_shares(id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, completion_id uuid UNIQUE REFERENCES public.course_completions(id), participation_id uuid UNIQUE REFERENCES public.academy_participation_documents(id));

-- Prawdziwa definicja z 20260922141946, razem z jej trzema triggerami.
CREATE FUNCTION academy_private.guard_completion_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP='DELETE' OR TG_TABLE_NAME='academy_completion_revocations' OR TG_TABLE_NAME='academy_completion_rewards' THEN
  RAISE EXCEPTION 'completion_history_is_immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER academy_completion_history BEFORE UPDATE OR DELETE ON public.course_completions FOR EACH ROW EXECUTE FUNCTION academy_private.guard_completion_history();
CREATE TRIGGER academy_revocation_history BEFORE UPDATE OR DELETE ON public.academy_completion_revocations FOR EACH ROW EXECUTE FUNCTION academy_private.guard_completion_history();
CREATE TRIGGER academy_reward_link_history BEFORE UPDATE OR DELETE ON public.academy_completion_rewards FOR EACH ROW EXECUTE FUNCTION academy_private.guard_completion_history();

-- Dwa konta prób (a, b), jedno prawdziwe (c). Kurs-atrapa i kurs właściwy.
INSERT INTO auth.users SELECT ('00000000-0000-0000-0000-00000000000'||x)::uuid FROM unnest(ARRAY['a','b','c']) x;
INSERT INTO public.profiles VALUES('00000000-0000-0000-0000-00000000000a',true),('00000000-0000-0000-0000-00000000000b',true),('00000000-0000-0000-0000-00000000000c',false);
INSERT INTO public.academy_learner_accounts VALUES('11111111-0000-0000-0000-00000000000a','proba','00000000-0000-0000-0000-00000000000a'),('11111111-0000-0000-0000-00000000000b','proba','00000000-0000-0000-0000-00000000000b'),('11111111-0000-0000-0000-00000000000c','nexus','00000000-0000-0000-0000-00000000000c'),('11111111-0000-0000-0000-00000000000d','proba',NULL);
INSERT INTO public.courses VALUES('22222222-0000-0000-0000-00000000000a',NULL,true),('22222222-0000-0000-0000-00000000000b',NULL,false);
INSERT INTO public.course_versions VALUES('33333333-0000-0000-0000-00000000000a','22222222-0000-0000-0000-00000000000a'),('33333333-0000-0000-0000-00000000000b','22222222-0000-0000-0000-00000000000b');
INSERT INTO public.course_lessons VALUES('44444444-0000-0000-0000-00000000000a','33333333-0000-0000-0000-00000000000a');
INSERT INTO public.course_quiz_questions VALUES('55555555-0000-0000-0000-00000000000a','33333333-0000-0000-0000-00000000000a');
-- Zapisy a oraz c: obie osoby także na kursie-atrapie; c musi zostać.
INSERT INTO public.course_enrollments VALUES('66666666-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000a','22222222-0000-0000-0000-00000000000a'),('66666666-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000b','22222222-0000-0000-0000-00000000000b'),('66666666-0000-0000-0000-00000000000c','00000000-0000-0000-0000-00000000000c','22222222-0000-0000-0000-00000000000a');
INSERT INTO public.course_completions(id,enrollment_id,user_id) VALUES('77777777-0000-0000-0000-00000000000a','66666666-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000a'),('77777777-0000-0000-0000-00000000000c','66666666-0000-0000-0000-00000000000c','00000000-0000-0000-0000-00000000000c');
ALTER TABLE public.academy_completion_rewards DISABLE TRIGGER USER;
INSERT INTO public.academy_completion_rewards VALUES('88888888-0000-0000-0000-00000000000a','77777777-0000-0000-0000-00000000000a');
ALTER TABLE public.academy_completion_rewards ENABLE TRIGGER USER;
INSERT INTO public.course_quiz_attempts VALUES('99999999-0000-0000-0000-00000000000a','66666666-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000a'),('99999999-0000-0000-0000-00000000000c','66666666-0000-0000-0000-00000000000c','00000000-0000-0000-0000-00000000000c');
INSERT INTO public.session_attendance VALUES('aaaaaaaa-0000-0000-0000-00000000000a','66666666-0000-0000-0000-00000000000a');
INSERT INTO public.academy_edition_survey_responses VALUES('aaaaaaaa-0000-0000-0000-00000000000b','66666666-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000a');
INSERT INTO public.academy_webinar_roster VALUES('bbbbbbbb-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000a'),('bbbbbbbb-0000-0000-0000-00000000000c','00000000-0000-0000-0000-00000000000c');
INSERT INTO public.academy_webinar_attendance VALUES('bbbbbbbb-0000-0000-0000-00000000000a'),('bbbbbbbb-0000-0000-0000-00000000000c');
INSERT INTO public.course_run_registrations VALUES('cccccccc-0000-0000-0000-00000000000a','66666666-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000a');
INSERT INTO public.academy_reward_claims VALUES('cccccccc-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000a');
INSERT INTO public.academy_audit_events VALUES('dddddddd-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000a'),('dddddddd-0000-0000-0000-00000000000c','00000000-0000-0000-0000-00000000000c');
INSERT INTO public.notifications VALUES('eeeeeeee-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000a');
INSERT INTO public.audit_logs VALUES('ffffffff-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000a');
INSERT INTO public.academy_participation_documents VALUES('13131313-0000-0000-0000-00000000000b','66666666-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000b'),('13131313-0000-0000-0000-00000000000c','66666666-0000-0000-0000-00000000000c','00000000-0000-0000-0000-00000000000c');
INSERT INTO public.academy_document_shares VALUES('14141414-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000a','77777777-0000-0000-0000-00000000000a',NULL),('14141414-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000b',NULL,'13131313-0000-0000-0000-00000000000b'),('14141414-0000-0000-0000-00000000000c','00000000-0000-0000-0000-00000000000c','77777777-0000-0000-0000-00000000000c',NULL);
INSERT INTO public.academy_outbox VALUES('12121212-0000-0000-0000-00000000000a','held'),('12121212-0000-0000-0000-00000000000b','approved'),('12121212-0000-0000-0000-00000000000c','sent_test'),('12121212-0000-0000-0000-00000000000d','failed');

CREATE FUNCTION pg_temp.state() RETURNS text LANGUAGE sql AS $$
 SELECT (SELECT count(*) FROM auth.users)||'/'||(SELECT count(*) FROM public.profiles)||'/'||(SELECT count(*) FROM public.academy_learner_accounts)||'/'||(SELECT count(*) FROM public.course_enrollments)||'/'||(SELECT count(*) FROM public.course_completions)||'/'||(SELECT count(*) FROM public.academy_outbox WHERE status='expired')
$$;
\set unchanged '''3/3/4/3/2/0'''

\echo '[1] bez potwierdzenia nic się nie zmienia'
\i :script
SELECT pg_temp.state() = :unchanged AS ok \gset
\if :ok \else \echo 'FAIL 1' \q 3 \endif

\echo '[2] złe potwierdzenie nic nie zmienia'
SELECT set_config('academy.usun_dane_prob','tak',false) \gset
\i :script
SELECT pg_temp.state() = :unchanged AS ok \gset
\if :ok \else \echo 'FAIL 2' \q 3 \endif

SELECT set_config('academy.usun_dane_prob','TAK-USUN-DANE-PROB',false) \gset

\echo '[3] konto proba niebędące kontem Akademii zatrzymuje całość'
UPDATE public.profiles SET academy_only=false WHERE id='00000000-0000-0000-0000-00000000000b';
\i :script
SELECT pg_temp.state() = :unchanged AND :'LAST_ERROR_MESSAGE' LIKE '%nie jest kontem wyłącznie Akademii%' AS ok \gset
\if :ok \else \echo 'FAIL 3' :LAST_ERROR_MESSAGE \q 3 \endif
UPDATE public.profiles SET academy_only=true WHERE id='00000000-0000-0000-0000-00000000000b';

\echo '[4] konto proba będące autorem kursu zatrzymuje całość'
UPDATE public.courses SET author_id='00000000-0000-0000-0000-00000000000b' WHERE id='22222222-0000-0000-0000-00000000000b';
\i :script
SELECT pg_temp.state() = :unchanged AND :'LAST_ERROR_MESSAGE' LIKE '%jest autorem kursu%' AS ok \gset
\if :ok \else \echo 'FAIL 4' \q 3 \endif
UPDATE public.courses SET author_id=NULL;

\echo '[5] tryb open zatrzymuje całość'
UPDATE public.academy_rollout_settings SET mode='open';
\i :script
SELECT pg_temp.state() = :unchanged AND :'LAST_ERROR_MESSAGE' LIKE '%trybie open%' AS ok \gset
\if :ok \else \echo 'FAIL 5' \q 3 \endif
UPDATE public.academy_rollout_settings SET mode='pilot';

\echo '[6] limit kont zatrzymuje całość'
INSERT INTO public.academy_learner_accounts SELECT gen_random_uuid(),'proba',NULL FROM generate_series(1,50);
\i :script
SELECT pg_temp.state() = '3/3/54/3/2/0' AND :'LAST_ERROR_MESSAGE' LIKE '%limit%' AS ok \gset
\if :ok \else \echo 'FAIL 6' \q 3 \endif
DELETE FROM public.academy_learner_accounts WHERE user_id IS NULL AND id::text NOT LIKE '11111111%';

\echo '[7] nieznana tabela zależna zatrzymuje całość'
CREATE TABLE public.nowa_tabela(enrollment_id uuid REFERENCES public.course_enrollments(id));
\i :script
SELECT pg_temp.state() = :unchanged AND :'LAST_ERROR_MESSAGE' LIKE '%nieznana tabela zależna%nowa_tabela%' AS ok \gset
\if :ok \else \echo 'FAIL 7' \q 3 \endif
DROP TABLE public.nowa_tabela;

\echo '[8] błąd w połowie cofa także wyłączenie triggerów'
CREATE TABLE public.blokada(user_id uuid REFERENCES public.profiles(id));
INSERT INTO public.blokada VALUES('00000000-0000-0000-0000-00000000000a');
\i :script
SELECT pg_temp.state() = :unchanged
   AND NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname LIKE 'academy_%history' AND tgenabled<>'O') AS ok \gset
\if :ok \else \echo 'FAIL 8' \q 3 \endif
DROP TABLE public.blokada;

\echo '[9] właściwy przebieg'
\i :script
SELECT :'LAST_ERROR_MESSAGE' IS NOT NULL AND pg_temp.state()='1/1/1/1/1/2' AS ok \gset
\if :ok \else \echo 'FAIL 9 stan:' \q 3 \endif

\echo '[10] dane konta spoza listy i treść kursów zostają'
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.course_completions WHERE user_id='00000000-0000-0000-0000-00000000000c') THEN RAISE EXCEPTION 'ukończenie c'; END IF;
 IF (SELECT count(*) FROM public.academy_participation_documents)<>1 OR NOT EXISTS(SELECT 1 FROM public.academy_participation_documents WHERE user_id='00000000-0000-0000-0000-00000000000c') THEN RAISE EXCEPTION 'zaświadczenia'; END IF;
 IF (SELECT count(*) FROM public.academy_document_shares)<>1 OR NOT EXISTS(SELECT 1 FROM public.academy_document_shares WHERE user_id='00000000-0000-0000-0000-00000000000c') THEN RAISE EXCEPTION 'linki weryfikacji'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.course_quiz_attempts WHERE user_id='00000000-0000-0000-0000-00000000000c') THEN RAISE EXCEPTION 'próba c'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.academy_webinar_attendance WHERE roster_id='bbbbbbbb-0000-0000-0000-00000000000c') THEN RAISE EXCEPTION 'obecność c'; END IF;
 IF (SELECT actor_id FROM public.academy_audit_events WHERE id='dddddddd-0000-0000-0000-00000000000c') IS NULL THEN RAISE EXCEPTION 'audyt c'; END IF;
 IF (SELECT actor_id FROM public.academy_audit_events WHERE id='dddddddd-0000-0000-0000-00000000000a') IS NOT NULL THEN RAISE EXCEPTION 'audyt a nie wyzerowany'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.audit_logs WHERE id='ffffffff-0000-0000-0000-00000000000a' AND user_id IS NULL) THEN RAISE EXCEPTION 'audit_logs'; END IF;
 IF EXISTS(SELECT 1 FROM public.notifications) THEN RAISE EXCEPTION 'powiadomienia a'; END IF;
 IF (SELECT count(*) FROM public.courses)<>2 OR (SELECT count(*) FROM public.course_versions)<>2 OR (SELECT count(*) FROM public.course_lessons)<>1 OR (SELECT count(*) FROM public.course_quiz_questions)<>1 THEN RAISE EXCEPTION 'treść'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.courses WHERE is_rehearsal) THEN RAISE EXCEPTION 'kurs-atrapa'; END IF;
 IF (SELECT status FROM public.academy_outbox WHERE id='12121212-0000-0000-0000-00000000000c')<>'sent_test' OR (SELECT status FROM public.academy_outbox WHERE id='12121212-0000-0000-0000-00000000000d')<>'failed' THEN RAISE EXCEPTION 'historia kolejki'; END IF;
 IF (SELECT count(*) FROM public.academy_outbox WHERE status='expired')<>2 THEN RAISE EXCEPTION 'wygaszenie'; END IF;
END $$;
\if :ERROR \echo 'FAIL 10' :LAST_ERROR_MESSAGE \q 3 \endif

\echo '[11] strażnik historii ukończeń i zaświadczeń działa po przebiegu'
DELETE FROM public.course_completions;
SELECT :'LAST_ERROR_MESSAGE' LIKE '%completion_history_is_immutable%' AS ok \gset
\if :ok \else \echo 'FAIL 11' \q 3 \endif
\unset LAST_ERROR_MESSAGE
SELECT NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='academy_participation_history' AND tgenabled<>'O') AS ok \gset
\if :ok \else \echo 'FAIL 11b' \q 3 \endif

\echo 'WSZYSTKIE ASERCJE OK'
