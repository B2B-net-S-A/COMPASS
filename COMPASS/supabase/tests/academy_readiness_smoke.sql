-- Smoke B0.5. Lokalnie: academy_local_stub.sql, migracja, potem ten plik (kończy się ROLLBACK).
BEGIN;
INSERT INTO auth.users(id) VALUES('00000000-0000-4000-8000-00000000000a'),('00000000-0000-4000-8000-00000000000b');
INSERT INTO public.profiles(id,role) VALUES('00000000-0000-4000-8000-00000000000a','admin'),('00000000-0000-4000-8000-00000000000b','talent_community');
DO $$
DECLARE caught boolean; n int;
BEGIN
 PERFORM set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000000b',true);
 caught:=false; BEGIN PERFORM public.academy_record_readiness_result('G04','abc1234','failed',NULL,NULL); EXCEPTION WHEN insufficient_privilege THEN caught:=true; END;
 IF NOT caught THEN RAISE EXCEPTION 'TCM zapisał wynik'; END IF;
 caught:=false; BEGIN PERFORM public.academy_update_launch_condition('Zastępstwo recenzenta','ready','x y z'); EXCEPTION WHEN insufficient_privilege THEN caught:=true; END;
 IF NOT caught THEN RAISE EXCEPTION 'TCM zmienił warunek'; END IF;

 PERFORM set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000000a',true);
 caught:=false; BEGIN PERFORM public.academy_record_readiness_result('G04','abc1234','passed',NULL,NULL); EXCEPTION WHEN raise_exception THEN caught:=SQLERRM='readiness_evidence_required'; END;
 IF NOT caught THEN RAISE EXCEPTION 'wynik pozytywny bez zrzutu'; END IF;
 caught:=false; BEGIN PERFORM public.academy_record_readiness_result('G04','abc1234','stale',NULL,NULL); EXCEPTION WHEN raise_exception THEN caught:=SQLERRM='invalid_readiness_status'; END;
 IF NOT caught THEN RAISE EXCEPTION 'człowiek ustawił stale'; END IF;
 caught:=false; BEGIN PERFORM public.academy_record_readiness_result('X1','abc1234','failed',NULL,NULL); EXCEPTION WHEN check_violation THEN caught:=true; END;
 IF NOT caught THEN RAISE EXCEPTION 'nieznany scenariusz'; END IF;
 caught:=false; BEGIN PERFORM public.academy_record_readiness_result('G04','abc1234','passed','../inny-bucket/plik.png',NULL); EXCEPTION WHEN check_violation THEN caught:=true; END;
 IF NOT caught THEN RAISE EXCEPTION 'ścieżka spoza wzorca'; END IF;

 PERFORM public.academy_record_readiness_result('G04','abc1234','passed','G04/11111111-1111-4111-8111-111111111111.png','ok');
 SELECT count(*) INTO n FROM public.academy_readiness_results WHERE kind='ręczny' AND valid_until BETWEEN now()+interval '29 days' AND now()+interval '31 days';
 IF n<>1 THEN RAISE EXCEPTION 'brak ważności 30 dni'; END IF;

 caught:=false; BEGIN PERFORM public.academy_update_launch_condition('Zastępstwo recenzenta','ready',''); EXCEPTION WHEN raise_exception THEN caught:=SQLERRM='launch_condition_evidence_required'; END;
 IF NOT caught THEN RAISE EXCEPTION 'gotowe bez dowodu'; END IF;
 PERFORM public.academy_update_launch_condition('Zastępstwo recenzenta','ready','Umowa zastępstwa z 10.11');
 IF (SELECT decided_at FROM public.academy_launch_conditions WHERE item='Zastępstwo recenzenta') IS NULL THEN RAISE EXCEPTION 'brak daty decyzji'; END IF;
 RAISE NOTICE 'B0.5 smoke OK';
END $$;
ROLLBACK;
