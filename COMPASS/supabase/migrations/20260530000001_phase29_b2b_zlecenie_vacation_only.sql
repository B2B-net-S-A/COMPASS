-- ============================================================
-- Phase 29 — B2B / Zlecenie: jedyny dozwolony typ wniosku = 'vacation'
-- Date: 2026-05-25
--
-- Depends on:
--   - profiles.employment_type (Phase 11b, Phase 27h: 'uop' | 'b2b' | 'zlecenie')
--   - leave_requests.leave_type CHECK (Phase 27k + holiday_in_lieu)
--
-- Reguła biznesowa:
--   Pracownicy na umowie B2B i umowie zlecenie nie korzystają z polskiego
--   Kodeksu pracy — formalnie nie mają katalogu urlopów statutowych (L4,
--   urlop okolicznościowy, opiekuńczy, macierzyński itd.). W COMPASS wnioskują
--   wyłącznie o "urlop wypoczynkowy" (leave_type='vacation') — pozostałe typy
--   są zarezerwowane dla pracowników UoP.
--
-- Enforcement: BEFORE INSERT OR UPDATE OF leave_type trigger.
--   - INSERT: każdy nowy wniosek B2B/zlecenie z leave_type != 'vacation' → REJECT.
--   - UPDATE leave_type: tylko gdy się zmienia, blokujemy zmianę na inny typ.
--   - Inne UPDATE (status, daty, notatki) nie są dotykane.
--   - Istniejące rekordy historyczne (sprzed tej migracji) zostają jak są —
--     trigger ich nie rusza (nie ma RECHECK na constraint, nie ma backfill).
--     Decyzja: legacy = read-only audit trail.
--
-- UI / app layer:
--   - LeaveRequestForm / CreateLeaveOnBehalfForm pokazują tylko 'vacation'
--     gdy profile.employment_type != 'uop' (defense in depth).
--   - createLeaveRequest / createLeaveOnBehalf walidują w app layer
--     dla friendly error message (DB trigger to ostatnia linia obrony).
--
-- NOTE: Trigger NIE blokuje admina ani service-role — DB nie zna ról COMPASS.
--   Jeśli kiedyś trzeba będzie wyjątek (np. korekta dla pracownika
--   przechodzącego z UoP na B2B w trakcie roku), można dodać SET LOCAL
--   session variable lub przejść na funkcję RPC z security definer.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_b2b_zlecenie_vacation_only()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    target_employment_type TEXT;
BEGIN
    -- Tylko 'vacation' nigdy nie blokujemy — szybki bypass.
    IF NEW.leave_type = 'vacation' THEN
        RETURN NEW;
    END IF;

    -- UPDATE: jeśli typ się nie zmienia, nie ruszamy (legacy data zostaje).
    IF TG_OP = 'UPDATE' AND OLD.leave_type IS NOT DISTINCT FROM NEW.leave_type THEN
        RETURN NEW;
    END IF;

    -- Sprawdź employment_type właściciela wniosku.
    SELECT employment_type INTO target_employment_type
    FROM public.profiles
    WHERE id = NEW.user_id;

    -- UoP zachowuje pełen katalog 16 typów. NULL traktujemy jak UoP (bezpieczna
    -- strona — nie blokujemy gdy nie wiemy; admin powinien uzupełnić employment_type).
    IF target_employment_type IS NULL OR target_employment_type = 'uop' THEN
        RETURN NEW;
    END IF;

    -- B2B i zlecenie — odrzuć każdy typ inny niż 'vacation'.
    IF target_employment_type IN ('b2b', 'zlecenie') THEN
        RAISE EXCEPTION
            'Pracownicy na umowie % mogą wnioskować tylko o urlop wypoczynkowy (vacation). Typ % nie jest dozwolony.',
            target_employment_type, NEW.leave_type
            USING ERRCODE = 'check_violation',
                  HINT = 'Zmień employment_type pracownika na ''uop'' lub wybierz leave_type=''vacation''.';
    END IF;

    -- Każda inna wartość employment_type (przyszłe rozszerzenia) — pozwól, nie blokuj.
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_b2b_zlecenie_vacation_only IS
    'Phase 29. BEFORE INSERT OR UPDATE OF leave_type trigger function na leave_requests. '
    'Blokuje pracownikom B2B i zlecenie wnioskowanie o cokolwiek innego niż vacation. '
    'Legacy rekordy (sprzed migracji) zostają — trigger blokuje tylko nowe wpisy i zmiany leave_type.';

DROP TRIGGER IF EXISTS trg_enforce_b2b_zlecenie_vacation_only ON public.leave_requests;

CREATE TRIGGER trg_enforce_b2b_zlecenie_vacation_only
    BEFORE INSERT OR UPDATE OF leave_type ON public.leave_requests
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_b2b_zlecenie_vacation_only();

COMMIT;
