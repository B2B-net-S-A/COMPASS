-- Cofnięcie wersji prostej, krok 2. Stosuje wyłącznie właściciel. Zapisany postęp nagrań edycji
-- zostaje w academy_video_progress (ten sam klucz co nagrania lekcji), znika tylko zapis i agregat.
BEGIN;

DROP FUNCTION public.academy_recording_durations(uuid[]);
DROP FUNCTION public.academy_save_recording_progress(uuid,numeric,numeric,jsonb);

DO $check$
BEGIN
    IF to_regprocedure('public.academy_save_recording_progress(uuid,numeric,numeric,jsonb)') IS NOT NULL
        OR to_regprocedure('public.academy_recording_durations(uuid[])') IS NOT NULL THEN
        RAISE EXCEPTION 'prosta_2_down: funkcje nadal istnieją';
    END IF;
END $check$;

NOTIFY pgrst, 'reload schema';
COMMIT;
