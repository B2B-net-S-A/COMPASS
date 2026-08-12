-- Phase 51 — jedno przypomnienie o timesheecie na miesiąc.
--
-- Kto nie złożył timesheetu, dostawał ~8 maili miesięcznie: dwa zadania Coolify
-- (`timesheet-mon-nudge` co poniedziałek, `timesheet-wed-warning` co środę) plus cron
-- GH Actions 25-go. Wszystkie za miesiąc BIEŻĄCY, więc treść była nieprawdziwa —
-- termin to 5. dzień miesiąca KOLEJNEGO.
--
-- Trasa `/api/cron/timesheet-reminder` przypomina teraz o miesiącu zamkniętym i tylko
-- w oknie 1.–5. Okno, a nie jeden konkretny dzień, bo scheduler bywa zawodny (crony
-- Coolify potrafiły nie odpalać tygodniami — Phase 41b). Za to, żeby z pięciu przebiegów
-- wyszedł DOKŁADNIE jeden mail na osobę, odpowiada ta tabela: cron najpierw „rezerwuje"
-- wysyłkę wstawką z ON CONFLICT DO NOTHING, a maila wysyła tylko dla wierszy, które
-- realnie powstały. Dedup jest więc atomowy — dwa równoległe przebiegi (dwa schedulery,
-- ponowione zadanie) nie wyślą duplikatu, bo o kolejności rozstrzyga UNIQUE w bazie,
-- a nie odczyt-potem-zapis w aplikacji.
--
-- Nieudana wysyłka kasuje rezerwację, żeby jutrzejszy przebieg w oknie ją ponowił.

CREATE TABLE IF NOT EXISTS public.timesheet_reminder_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    year SMALLINT NOT NULL,
    month SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT timesheet_reminder_log_once_per_period UNIQUE (user_id, year, month)
);

COMMENT ON TABLE public.timesheet_reminder_log IS
    'Phase 51: ślad wysłanego przypomnienia o timesheecie. UNIQUE (user_id, year, month) = gwarancja jednego maila na osobę na rozliczany miesiąc, niezależnie od tego ile razy cron zawoła trasę.';
COMMENT ON COLUMN public.timesheet_reminder_log.year IS 'Rok rozliczanego (zamkniętego) miesiąca, nie rok wysyłki.';
COMMENT ON COLUMN public.timesheet_reminder_log.month IS 'Miesiąc rozliczany (1-12), nie miesiąc wysyłki.';

-- Szukanie „kto już dostał przypomnienie za ten okres" idzie po (year, month).
CREATE INDEX IF NOT EXISTS idx_timesheet_reminder_log_period
    ON public.timesheet_reminder_log (year, month);

-- RLS włączone, ZERO polityk — celowo. Tabelę zapisuje i czyta wyłącznie cron przez
-- service_role (omija RLS). Polityka INSERT dla `authenticated` pozwoliłaby komukolwiek
-- zablokować sobie przypomnienie podrobioną rezerwacją.
ALTER TABLE public.timesheet_reminder_log ENABLE ROW LEVEL SECURITY;
